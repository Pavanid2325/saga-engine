export type ScenarioType = 'travel' | 'ecommerce' | 'ai-agent' | 'revocation';

export type FailurePolicy = 'PARTIAL_COMPLETION' | 'ROLLBACK';

export type StepVisualStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'revoked'
  | 'not_executed'
  | 'restored';

export interface WorkflowStepState {
  name: string;
  label: string;
  description: string;
  status: StepVisualStatus;
  result?: any;
  error?: string;
  executedAt?: string;
  compensatedAt?: string;
}

export interface EventLogItem {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  details?: any;
  level: 'info' | 'success' | 'warn' | 'error' | 'compensation';
}

export interface ResidualArtifact {
  system: string;
  resource: string;
  state: string;
  reason: string;
}

export interface ExecutionSummaryData {
  sagaId: string;
  workflow?: string;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ROLLED_BACK' | 'FAILED' | 'PARTIAL_COMPLETION';
  failurePolicy?: FailurePolicy;
  totalSteps: number;
  completedSteps: number;
  compensatedSteps: number;
  residualCount?: number;
  accessRestoredCount?: number;
  durationMs?: number;
  failedStep?: string;
  error?: string;
  rollbackSkippedReason?: string;
  recommendedNextAction?: string;
  residualArtifacts?: ResidualArtifact[];
}

export interface HistoryRecord {
  sagaId: string;
  scenario: ScenarioType;
  scenarioTitle: string;
  status: 'COMPLETED' | 'ROLLED_BACK' | 'FAILED' | 'PARTIAL_COMPLETION';
  failurePolicy?: FailurePolicy;
  durationMs: number;
  timestamp: string;
  failedStep?: string;
  residualCount?: number;
  compensated: boolean;
  resultJson: any;
}
