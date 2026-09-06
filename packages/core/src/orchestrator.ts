import { randomUUID } from 'crypto';
import type { Saga, SagaStep } from './saga.js';
import type { StateStore } from './store.js';
import type {
  SagaState,
  SagaContext,
  SagaResult,
  SagaSuccess,
  SagaFailure,
  SagaPartialCompletion,
  ExecutionOptions,
  ResidualArtifact,
  OrchestratorOptions,
  SagaEvents,
  CompensationFailureStrategy,
} from './types.js';

type EventCallback<K extends keyof SagaEvents> = SagaEvents[K];

/**
 * Orchestrator for executing sagas with automatic compensation on failure or partial completion policies
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
   * Execute a saga with the given input and execution options
   *
   * @param saga - The saga definition to execute
   * @param input - Input data passed to all steps
   * @param options - Execution options (e.g. failurePolicy, workflowType, confirmRollback)
   * @returns Result indicating success, partial completion, or failure with compensation status
   */
  async execute<TInput, TResult>(
    saga: Saga<TInput>,
    input: TInput,
    options?: ExecutionOptions
  ): Promise<SagaResult<TResult>> {
    if (!saga.hasSteps()) {
      throw new Error(`Saga "${saga.name}" has no steps defined`);
    }

    const workflowType = options?.workflowType || (saga.name.includes('revocat') ? 'revocation' : 'provisioning');
    const failurePolicy = options?.failurePolicy || (workflowType === 'revocation' ? 'PARTIAL_COMPLETION' : 'ROLLBACK');

    // Rule: Rollback confirmation required when ROLLBACK policy is chosen for revocation workflows
    if (workflowType === 'revocation' && failurePolicy === 'ROLLBACK' && !options?.confirmRollback) {
      throw new Error('Rollback confirmation required for revocation policy ROLLBACK');
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

        // Branching based on Failure Policy
        if (failurePolicy === 'PARTIAL_COMPLETION') {
          return this.handlePartialCompletion(
            sagaId,
            saga,
            workflowType,
            executedSteps,
            step.name,
            err
          );
        } else {
          return this.compensate(
            sagaId,
            saga,
            context,
            executedSteps,
            step.name,
            err,
            workflowType,
            failurePolicy
          );
        }
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
      workflow: workflowType,
      failurePolicy,
      result: finalResult as TResult,
      stepResults,
    } satisfies SagaSuccess<TResult>;
  }

  /**
   * Handle step failure under PARTIAL_COMPLETION policy (no compensation)
   */
  private async handlePartialCompletion<TInput>(
    sagaId: string,
    saga: Saga<TInput>,
    workflowType: string,
    executedSteps: Array<{ step: SagaStep<TInput, unknown>; result: unknown }>,
    failedStepName: string,
    originalError: Error
  ): Promise<SagaPartialCompletion> {
    await this.store.updateStatus(sagaId, 'failed', new Date());

    const state = await this.store.get(sagaId);
    const reason = 'Compensation could restore previously revoked access';
    if (state) {
      this.emit('compensation:skipped', state, reason);
      this.emit('saga:failed', state, originalError);
    }

    // Create residual artifacts for failed step
    const systemName = failedStepName.replace(/^revoke-/, '').replace(/-/g, ' ').toUpperCase();
    const residualArtifacts: ResidualArtifact[] = [
      {
        system: systemName.startsWith('SYSTEM') ? systemName : `System ${systemName}`,
        resource: 'user-access',
        state: 'still_active',
        reason: `Revocation step "${failedStepName}" failed: ${originalError.message}`,
      },
    ];

    return {
      success: false,
      sagaId,
      workflow: workflowType,
      status: 'PARTIAL_COMPLETION',
      failurePolicy: 'PARTIAL_COMPLETION',
      error: originalError,
      failedStep: failedStepName,
      completedSteps: executedSteps.map((s) => s.step.name),
      residualArtifacts,
      compensated: false,
      rollbackSkippedReason: reason,
      recommendedNextAction: `Retry revocation for ${failedStepName}`,
    };
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
    originalError: Error,
    workflowType: string = 'provisioning',
    failurePolicy: 'ROLLBACK' | 'PARTIAL_COMPLETION' = 'ROLLBACK'
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
      }
    }

    const finalStatus = compensationErrors.length > 0 ? 'failed' : 'completed';
    await this.store.updateStatus(sagaId, finalStatus, new Date());

    const finalState = await this.store.get(sagaId);
    if (finalState) {
      if (compensationErrors.length === 0) {
        this.emit('compensation:completed', finalState);
      }
      this.emit('saga:failed', finalState, originalError);
    }

    return {
      success: false,
      sagaId,
      workflow: workflowType,
      failurePolicy,
      status: 'ROLLED_BACK',
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
   */
  async recover(): Promise<void> {
    const pendingSagas = await this.store.getPendingSagas();

    for (const state of pendingSagas) {
      if (state.status === 'compensating') {
        await this.resumeCompensation(state);
      } else if (state.status === 'running') {
        await this.store.updateStatus(state.id, 'compensating');
        await this.resumeCompensation(state);
      }
    }
  }

  /**
   * Resume compensation for a saga from stored state
   */
  private async resumeCompensation(state: SagaState): Promise<void> {
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
