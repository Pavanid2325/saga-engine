import { randomUUID } from 'crypto';
import type { Saga, SagaStep } from './saga.js';
import type { StateStore } from './store.js';
import type {
  SagaState,
  SagaContext,
  SagaResult,
  SagaSuccess,
  SagaFailure,
  OrchestratorOptions,
  SagaEvents,
  CompensationFailureStrategy,
  StepState,
} from './types.js';

type EventCallback<K extends keyof SagaEvents> = SagaEvents[K];

/**
 * Orchestrator for executing sagas with automatic compensation on failure
 *
 * @example
 * ```typescript
 * const orchestrator = new SagaOrchestrator({
 *   store: new InMemoryStore(),
 *   onCompensationFailure: 'retry',
 *   compensationRetries: 3
 * });
 *
 * const result = await orchestrator.execute(bookTripSaga, {
 *   flight: { from: 'NYC', to: 'LAX' },
 *   hotel: { city: 'LAX', nights: 3 }
 * });
 *
 * if (result.success) {
 *   console.log('Trip booked!', result.stepResults);
 * } else {
 *   console.log('Booking failed:', result.error);
 * }
 * ```
 */
export class SagaOrchestrator {
  private readonly store: StateStore;
  private readonly compensationStrategy: CompensationFailureStrategy;
  private readonly compensationRetries: number;
  private readonly compensationRetryDelay: number;
  private readonly eventListeners: Map<keyof SagaEvents, Set<EventCallback<keyof SagaEvents>>> =
    new Map();

  constructor(options: OrchestratorOptions & { store: StateStore }) {
    this.store = options.store;
    this.compensationStrategy = options.onCompensationFailure ?? 'continue';
    this.compensationRetries = options.compensationRetries ?? 3;
    this.compensationRetryDelay = options.compensationRetryDelay ?? 1000;
  }

  /**
   * Execute a saga with the given input
   *
   * @param saga - The saga definition to execute
   * @param input - Input data passed to all steps
   * @returns Result indicating success or failure with compensation status
   */
  async execute<TInput, TResult>(
    saga: Saga<TInput>,
    input: TInput
  ): Promise<SagaResult<TResult>> {
    if (!saga.hasSteps()) {
      throw new Error(`Saga "${saga.name}" has no steps defined`);
    }

    const sagaId = randomUUID();
    const stepResults = new Map<string, unknown>();

    // Initialize saga state
    const state: SagaState = {
      id: sagaId,
      sagaName: saga.name,
      status: 'running',
      input,
      steps: saga.steps.map((step) => ({
        name: step.name,
        status: 'pending',
      })),
      startedAt: new Date(),
    };

    await this.store.create(state);
    this.emit('saga:started', state);

    const context: SagaContext<TInput> = {
      sagaId,
      input,
      stepResults,
    };

    // Execute steps in order
    const executedSteps: Array<{ step: SagaStep<TInput, unknown>; result: unknown }> = [];

    for (const step of saga.steps) {
      this.emit('step:executing', state, step.name);

      try {
        const result = await step.execute(context);
        stepResults.set(step.name, result);
        executedSteps.push({ step, result });

        await this.store.updateStep(sagaId, step.name, {
          status: 'executed',
          result,
          executedAt: new Date(),
        });

        this.emit('step:executed', state, step.name, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        await this.store.updateStep(sagaId, step.name, {
          status: 'failed',
          error: err.message,
        });

        this.emit('step:failed', state, step.name, err);

        // Trigger compensation
        return this.compensate(sagaId, saga, context, executedSteps, step.name, err);
      }
    }

    // All steps succeeded
    await this.store.updateStatus(sagaId, 'completed', new Date());

    const updatedState = await this.store.get(sagaId);
    if (updatedState) {
      this.emit('saga:completed', updatedState);
    }

    const lastStep = saga.steps[saga.steps.length - 1];
    const finalResult = lastStep ? stepResults.get(lastStep.name) : undefined;

    return {
      success: true,
      sagaId,
      result: finalResult as TResult,
      stepResults,
    } satisfies SagaSuccess<TResult>;
  }

  /**
   * Execute compensation for failed saga
   */
  private async compensate<TInput>(
    sagaId: string,
    saga: Saga<TInput>,
    context: SagaContext<TInput>,
    executedSteps: Array<{ step: SagaStep<TInput, unknown>; result: unknown }>,
    failedStepName: string,
    originalError: Error
  ): Promise<SagaFailure> {
    await this.store.updateStatus(sagaId, 'compensating');

    const state = await this.store.get(sagaId);
    if (state) {
      this.emit('compensation:started', state);
    }

    const compensationErrors: Array<{ step: string; error: Error }> = [];

    // Compensate in reverse order
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const { step, result } = executedSteps[i]!;

      if (!step.compensate) {
        continue;
      }

      const currentState = await this.store.get(sagaId);
      if (currentState) {
        this.emit('compensation:step', currentState, step.name);
      }

      try {
        await this.executeCompensation(step, context, result);

        await this.store.updateStep(sagaId, step.name, {
          status: 'compensated',
          compensatedAt: new Date(),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        compensationErrors.push({ step: step.name, error: err });

        const errState = await this.store.get(sagaId);
        if (errState) {
          this.emit('compensation:failed', errState, step.name, err);
        }

        if (this.compensationStrategy === 'halt') {
          break;
        }
        // 'continue' strategy: keep going with other compensations
      }
    }

    const finalStatus = compensationErrors.length > 0 ? 'failed' : 'completed';
    await this.store.updateStatus(sagaId, finalStatus, new Date());

    const finalState = await this.store.get(sagaId);
    if (finalState) {
      if (compensationErrors.length === 0) {
        this.emit('compensation:completed', finalState);
      }
      // Always emit saga:failed since we're in the compensation path (saga failed)
      this.emit('saga:failed', finalState, originalError);
    }

    return {
      success: false,
      sagaId,
      error: originalError,
      failedStep: failedStepName,
      compensated: compensationErrors.length === 0,
      compensationErrors: compensationErrors.length > 0 ? compensationErrors : undefined,
    };
  }

  /**
   * Execute a single compensation with retry logic
   */
  private async executeCompensation<TInput>(
    step: SagaStep<TInput, unknown>,
    context: SagaContext<TInput>,
    result: unknown
  ): Promise<void> {
    if (!step.compensate) {
      return;
    }

    let lastError: Error | undefined;
    const maxAttempts = this.compensationStrategy === 'retry' ? this.compensationRetries : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await step.compensate(context, result);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          await this.delay(this.compensationRetryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Recover and resume pending sagas from the store
   * Call this on application startup to handle crash recovery
   */
  async recover(): Promise<void> {
    const pendingSagas = await this.store.getPendingSagas();

    for (const state of pendingSagas) {
      if (state.status === 'compensating') {
        // Resume compensation from where it left off
        await this.resumeCompensation(state);
      } else if (state.status === 'running') {
        // Mark as failed and trigger compensation
        await this.store.updateStatus(state.id, 'compensating');
        await this.resumeCompensation(state);
      }
    }
  }

  /**
   * Resume compensation for a saga from stored state
   */
  private async resumeCompensation(state: SagaState): Promise<void> {
    const executedSteps = state.steps
      .filter((s) => s.status === 'executed')
      .map((s) => ({
        name: s.name,
        result: s.result,
      }));

    // We don't have the saga definition here, so we can only mark as failed
    // Full recovery would require re-registering sagas
    await this.store.updateStatus(state.id, 'failed', new Date());
  }

  /**
   * Register an event listener
   */
  on<K extends keyof SagaEvents>(event: K, callback: SagaEvents[K]): void {
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.eventListeners.set(event, listeners);
    }
    listeners.add(callback as EventCallback<keyof SagaEvents>);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof SagaEvents>(event: K, callback: SagaEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback as EventCallback<keyof SagaEvents>);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private emit<K extends keyof SagaEvents>(
    event: K,
    ...args: Parameters<SagaEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          (callback as (...args: Parameters<SagaEvents[K]>) => void)(...args);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
