import type { StateStore } from '../store.js';
import type { SagaState, SagaStatus, StepState } from '../types.js';

/**
 * In-memory state store for development and testing
 *
 * WARNING: State is lost on process restart. Use RedisStore or PostgresStore
 * for production deployments that require crash recovery.
 *
 * @example
 * ```typescript
 * const store = new InMemoryStore();
 * const orchestrator = new SagaOrchestrator({ store });
 * ```
 */
export class InMemoryStore implements StateStore {
  private readonly sagas: Map<string, SagaState> = new Map();

  /**
   * Create a new saga state record
   * @throws Error if saga with this ID already exists
   */
  async create(state: SagaState): Promise<void> {
    if (this.sagas.has(state.id)) {
      throw new Error(`Saga with ID "${state.id}" already exists`);
    }
    // Deep clone to prevent external mutations
    this.sagas.set(state.id, this.clone(state));
  }

  /**
   * Get saga state by ID
   * @returns saga state or undefined if not found
   */
  async get(sagaId: string): Promise<SagaState | undefined> {
    const state = this.sagas.get(sagaId);
    // Return a clone to prevent external mutations
    return state ? this.clone(state) : undefined;
  }

  /**
   * Update the overall saga status
   */
  async updateStatus(sagaId: string, status: SagaStatus, completedAt?: Date): Promise<void> {
    const state = this.sagas.get(sagaId);
    if (!state) {
      throw new Error(`Saga with ID "${sagaId}" not found`);
    }
    state.status = status;
    if (completedAt) {
      state.completedAt = completedAt;
    }
  }

  /**
   * Update a specific step's state
   */
  async updateStep(sagaId: string, stepName: string, stepState: Partial<StepState>): Promise<void> {
    const state = this.sagas.get(sagaId);
    if (!state) {
      throw new Error(`Saga with ID "${sagaId}" not found`);
    }

    const step = state.steps.find((s) => s.name === stepName);
    if (!step) {
      throw new Error(`Step "${stepName}" not found in saga "${sagaId}"`);
    }

    Object.assign(step, stepState);
  }

  /**
   * Get all sagas that need recovery (running or compensating)
   */
  async getPendingSagas(): Promise<SagaState[]> {
    const pending: SagaState[] = [];
    for (const state of this.sagas.values()) {
      if (state.status === 'running' || state.status === 'compensating') {
        pending.push(this.clone(state));
      }
    }
    return pending;
  }

  /**
   * Delete a saga state record
   */
  async delete(sagaId: string): Promise<void> {
    this.sagas.delete(sagaId);
  }

  /**
   * Clear all stored sagas (useful for testing)
   */
  async clear(): Promise<void> {
    this.sagas.clear();
  }

  /**
   * Get the number of stored sagas (useful for testing)
   */
  get size(): number {
    return this.sagas.size;
  }

  /**
   * Deep clone a saga state to prevent mutation
   */
  private clone(state: SagaState): SagaState {
    return {
      ...state,
      startedAt: new Date(state.startedAt),
      completedAt: state.completedAt ? new Date(state.completedAt) : undefined,
      steps: state.steps.map((step) => ({
        ...step,
        executedAt: step.executedAt ? new Date(step.executedAt) : undefined,
        compensatedAt: step.compensatedAt ? new Date(step.compensatedAt) : undefined,
      })),
    };
  }
}
