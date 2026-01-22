import type { StepDefinition, SagaContext } from './types.js';

/**
 * Internal representation of a step with its definition
 */
export interface SagaStep<TInput = unknown, TResult = unknown> {
  name: string;
  execute: (ctx: SagaContext<TInput>) => Promise<TResult>;
  compensate?: (ctx: SagaContext<TInput>, result: TResult) => Promise<void>;
}

/**
 * Saga definition with fluent builder API
 *
 * @example
 * ```typescript
 * const bookTripSaga = new Saga('book-trip')
 *   .step({
 *     name: 'book-flight',
 *     execute: async (ctx) => {
 *       const booking = await flightAPI.book(ctx.input.flight);
 *       return { flightId: booking.id };
 *     },
 *     compensate: async (ctx, result) => {
 *       await flightAPI.cancel(result.flightId);
 *     }
 *   })
 *   .step({
 *     name: 'reserve-hotel',
 *     execute: async (ctx) => {
 *       const reservation = await hotelAPI.reserve(ctx.input.hotel);
 *       return { hotelId: reservation.id };
 *     },
 *     compensate: async (ctx, result) => {
 *       await hotelAPI.cancel(result.hotelId);
 *     }
 *   });
 * ```
 */
export class Saga<TInput = unknown> {
  private readonly _name: string;
  private readonly _steps: SagaStep<TInput, unknown>[] = [];

  constructor(name: string) {
    if (!name || typeof name !== 'string') {
      throw new Error('Saga name must be a non-empty string');
    }
    this._name = name;
  }

  /**
   * Get the saga name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Get all defined steps (immutable copy)
   */
  get steps(): ReadonlyArray<SagaStep<TInput, unknown>> {
    return [...this._steps];
  }

  /**
   * Add a step to the saga
   *
   * @param definition - Step definition with name, execute, and optional compensate functions
   * @returns this - for method chaining
   */
  step<TResult>(definition: StepDefinition<TInput, TResult>): Saga<TInput> {
    this.validateStepDefinition(definition);

    this._steps.push({
      name: definition.name,
      execute: definition.execute as (ctx: SagaContext<TInput>) => Promise<unknown>,
      compensate: definition.compensate as
        | ((ctx: SagaContext<TInput>, result: unknown) => Promise<void>)
        | undefined,
    });

    return this;
  }

  /**
   * Add multiple steps at once
   *
   * @param definitions - Array of step definitions
   * @returns this - for method chaining
   */
  addSteps(definitions: StepDefinition<TInput, unknown>[]): Saga<TInput> {
    for (const definition of definitions) {
      this.step(definition);
    }
    return this;
  }

  /**
   * Validate a step definition
   */
  private validateStepDefinition<TResult>(definition: StepDefinition<TInput, TResult>): void {
    if (!definition.name || typeof definition.name !== 'string') {
      throw new Error('Step name must be a non-empty string');
    }

    if (typeof definition.execute !== 'function') {
      throw new Error(`Step "${definition.name}" must have an execute function`);
    }

    if (definition.compensate !== undefined && typeof definition.compensate !== 'function') {
      throw new Error(`Step "${definition.name}" compensate must be a function if provided`);
    }

    // Check for duplicate step names
    if (this._steps.some((s) => s.name === definition.name)) {
      throw new Error(`Step with name "${definition.name}" already exists in saga "${this._name}"`);
    }
  }

  /**
   * Get a step by name
   */
  getStep(name: string): SagaStep<TInput, unknown> | undefined {
    return this._steps.find((s) => s.name === name);
  }

  /**
   * Check if the saga has any steps
   */
  hasSteps(): boolean {
    return this._steps.length > 0;
  }

  /**
   * Get the number of steps
   */
  get stepCount(): number {
    return this._steps.length;
  }
}
