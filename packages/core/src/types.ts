/**
 * Failure policy for a saga execution
 * - PARTIAL_COMPLETION: Keep successful steps, skip rollback/compensation, and report residual state
 * - ROLLBACK: Undo completed steps in reverse order (reusing compensation mechanism)
 */
export type FailurePolicy = 'PARTIAL_COMPLETION' | 'ROLLBACK';

/**
 * Residual artifact/access state when compensation is skipped or partial completion occurs
 */
export interface ResidualArtifact {
  system: string;
  resource: string;
  state: string;
  reason: string;
}

/**
 * Options provided when executing a saga instance
 */
export interface ExecutionOptions {
  /** Workflow type identifier, e.g. 'provisioning' or 'revocation' */
  workflowType?: string;
  /** Workflow failure policy override */
  failurePolicy?: FailurePolicy;
  /** Explicit user confirmation when selecting ROLLBACK policy for revocation workflows */
  confirmRollback?: boolean;
}

/**
 * Status of a saga execution
 */
export type SagaStatus = 'running' | 'completed' | 'compensating' | 'failed' | 'partial_completion';

/**
 * Status of an individual step within a saga
 */
export type StepStatus = 'pending' | 'executed' | 'compensated' | 'failed';

/**
 * Context passed to step execute and compensate functions
 */
export interface SagaContext<TInput = unknown> {
  /** Unique ID of this saga execution */
  sagaId: string;
  /** The input provided when starting the saga */
  input: TInput;
  /** Results from previously executed steps, keyed by step name */
  stepResults: Map<string, unknown>;
}

/**
 * Definition of a saga step
 */
export interface StepDefinition<TInput = unknown, TResult = unknown> {
  /** Unique name for this step within the saga */
  name: string;
  /** Function to execute the step's action */
  execute: (ctx: SagaContext<TInput>) => Promise<TResult>;
  /** Function to compensate/rollback the step's action */
  compensate?: (ctx: SagaContext<TInput>, result: TResult) => Promise<void>;
}

/**
 * State of an individual step during execution
 */
export interface StepState {
  /** Step name */
  name: string;
  /** Current status */
  status: StepStatus;
  /** Result from execute function (if executed) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** When the step was executed */
  executedAt?: Date;
  /** When the step was compensated */
  compensatedAt?: Date;
}

/**
 * Persisted state of a saga execution
 */
export interface SagaState {
  /** Unique execution ID */
  id: string;
  /** Name of the saga definition */
  sagaName: string;
  /** Current status */
  status: SagaStatus;
  /** Input provided when starting the saga */
  input: unknown;
  /** State of each step */
  steps: StepState[];
  /** When the saga started */
  startedAt: Date;
  /** When the saga completed (success or failure) */
  completedAt?: Date;
}

/**
 * Result of a successful saga execution
 */
export interface SagaSuccess<TResult = unknown> {
  success: true;
  sagaId: string;
  workflow?: string;
  failurePolicy?: FailurePolicy;
  /** Final result from the last step */
  result: TResult;
  /** Results from all steps, keyed by step name */
  stepResults: Map<string, unknown>;
}

/**
 * Result of a saga execution with partial completion policy (rollback skipped)
 */
export interface SagaPartialCompletion {
  success: false;
  sagaId: string;
  workflow: string;
  status: 'PARTIAL_COMPLETION';
  failurePolicy: 'PARTIAL_COMPLETION';
  /** Error that caused the step failure */
  error: Error;
  /** Name of the step that failed */
  failedStep: string;
  /** Steps that completed successfully before failure */
  completedSteps: string[];
  /** Residual artifacts/resources that remain active */
  residualArtifacts: ResidualArtifact[];
  /** Always false for partial completion */
  compensated: false;
  /** Explanation of why rollback was skipped */
  rollbackSkippedReason: string;
  /** Recommended next action for operator/agent */
  recommendedNextAction: string;
}

/**
 * Result of a failed saga execution (with optional rollback)
 */
export interface SagaFailure {
  success: false;
  sagaId: string;
  workflow?: string;
  failurePolicy?: FailurePolicy;
  status?: string;
  /** Error that caused the failure */
  error: Error;
  /** Name of the step that failed */
  failedStep: string;
  /** Whether compensation completed successfully */
  compensated: boolean;
  /** Any errors that occurred during compensation */
  compensationErrors?: Array<{ step: string; error: Error }>;
  /** Residual artifacts if any */
  residualArtifacts?: ResidualArtifact[];
}

/**
 * Result of saga execution
 */
export type SagaResult<TResult = unknown> =
  | SagaSuccess<TResult>
  | SagaPartialCompletion
  | SagaFailure;

/**
 * How to handle failures during compensation
 */
export type CompensationFailureStrategy = 'retry' | 'continue' | 'halt';

/**
 * Configuration options for the SagaOrchestrator
 */
export interface OrchestratorOptions {
  /** Strategy for handling compensation failures */
  onCompensationFailure?: CompensationFailureStrategy;
  /** Number of retry attempts for compensation (if strategy is 'retry') */
  compensationRetries?: number;
  /** Delay between retry attempts in milliseconds */
  compensationRetryDelay?: number;
}

/**
 * Events emitted by the orchestrator
 */
export interface SagaEvents {
  'saga:started': (state: SagaState) => void;
  'saga:completed': (state: SagaState) => void;
  'saga:failed': (state: SagaState, error: Error) => void;
  'step:executing': (state: SagaState, stepName: string) => void;
  'step:executed': (state: SagaState, stepName: string, result: unknown) => void;
  'step:failed': (state: SagaState, stepName: string, error: Error) => void;
  'compensation:started': (state: SagaState) => void;
  'compensation:step': (state: SagaState, stepName: string) => void;
  'compensation:completed': (state: SagaState) => void;
  'compensation:failed': (state: SagaState, stepName: string, error: Error) => void;
  'compensation:skipped': (state: SagaState, reason: string) => void;
}
