import type { SagaState, SagaStatus, StepState } from './types.js';

/**
 * Interface for saga state persistence
 *
 * Implementations must be able to:
 * - Create and retrieve saga state
 * - Update saga and step status atomically
 * - List pending sagas for recovery
 *
 * @example
 * ```typescript
 * class RedisStore implements StateStore {
 *   async create(state: SagaState): Promise<void> {
 *     await redis.set(`saga:${state.id}`, JSON.stringify(state));
 *   }
 *   // ... other methods
 * }
 * ```
 */
export interface StateStore {
  /**
   * Create a new saga state record
   * @throws if saga with this ID already exists
   */
  create(state: SagaState): Promise<void>;

  /**
   * Get saga state by ID
   * @returns saga state or undefined if not found
   */
  get(sagaId: string): Promise<SagaState | undefined>;

  /**
   * Update the overall saga status
   */
  updateStatus(sagaId: string, status: SagaStatus, completedAt?: Date): Promise<void>;

  /**
   * Update a specific step's state
   */
  updateStep(sagaId: string, stepName: string, stepState: Partial<StepState>): Promise<void>;

  /**
   * Get all sagas that need recovery (running or compensating)
   * Used on startup to resume incomplete sagas
   */
  getPendingSagas(): Promise<SagaState[]>;

  /**
   * Delete a saga state record
   * Optional - useful for cleanup after successful completion
   */
  delete?(sagaId: string): Promise<void>;

  /**
   * Close any connections
   * Optional - for stores that maintain connections
   */
  close?(): Promise<void>;
}

/**
 * Options for creating a state store
 */
export interface StateStoreOptions {
  /** Prefix for keys (useful for namespacing in shared stores) */
  keyPrefix?: string;
  /** TTL in seconds for completed saga records (0 = no expiry) */
  ttlSeconds?: number;
}
