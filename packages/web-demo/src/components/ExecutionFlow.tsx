import React from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Activity,
  Check,
  AlertCircle,
  ShieldCheck,
  AlertOctagon,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { WorkflowStepState, FailurePolicy, ResidualArtifact } from '../types';

interface ExecutionFlowProps {
  steps: WorkflowStepState[];
  isCompensating: boolean;
  sagaStatus: string;
  scenario: string;
  failurePolicy?: FailurePolicy;
  rollbackSkippedReason?: string;
  recommendedNextAction?: string;
  residualArtifacts?: ResidualArtifact[];
}

export const ExecutionFlow: React.FC<ExecutionFlowProps> = ({
  steps,
  isCompensating,
  sagaStatus,
  scenario,
  failurePolicy,
  rollbackSkippedReason,
  recommendedNextAction,
  residualArtifacts,
}) => {
  const isRevocation = scenario === 'revocation';

  return (
    <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between h-full relative overflow-hidden">
      {/* Background glow when running */}
      {sagaStatus === 'RUNNING' && (
        <div className="absolute inset-0 bg-blue-500/5 pointer-events-none animate-pulse-glow" />
      )}
      {isCompensating && (
        <div className="absolute inset-0 bg-amber-500/5 pointer-events-none animate-pulse-glow" />
      )}
      {sagaStatus === 'PARTIAL_COMPLETION' && (
        <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800 relative z-10">
        <div>
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            LIVE SAGA EXECUTION VISUALIZER
          </h2>
          <p className="text-xs text-slate-400">Real-time step state machine & compensation graph</p>
        </div>

        {/* Global Saga Status Banner */}
        <div className="flex items-center gap-2">
          {sagaStatus === 'COMPLETED' && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-emerald-500/10">
              <CheckCircle2 className="w-3.5 h-3.5" /> SAGA COMPLETED
            </span>
          )}
          {sagaStatus === 'PARTIAL_COMPLETION' && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> PARTIAL COMPLETION
            </span>
          )}
          {sagaStatus === 'ROLLED_BACK' && (
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-amber-500/10">
              <RotateCcw className="w-3.5 h-3.5" /> SAGA ROLLED BACK
            </span>
          )}
          {sagaStatus === 'FAILED' && (
            <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-rose-500/10">
              <XCircle className="w-3.5 h-3.5" /> SAGA FAILED
            </span>
          )}
          {sagaStatus === 'RUNNING' && (
            <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> EXECUTING...
            </span>
          )}
          {sagaStatus === 'IDLE' && (
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-medium">
              READY TO EXECUTE
            </span>
          )}
        </div>
      </div>

      {/* Main Connected Workflow Diagram */}
      <div className="my-auto py-2 relative z-10">
        {/* Rollback direction banner when compensating */}
        {isCompensating && (
          <div className="mb-4 py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium flex items-center justify-center gap-2 animate-pulse">
            <RotateCcw className="w-4 h-4 animate-spin text-amber-400" />
            <span>
              {isRevocation
                ? 'FAILURE DETECTED — RECOVERING ACCESS (ROLLBACK RE-GRANTS ACCESS)'
                : 'FAILURE DETECTED — REVERSE COMPENSATION IN PROGRESS (UNDOING ACTION STEPS)'}
            </span>
          </div>
        )}

        {/* Partial Completion Explanation Box */}
        {sagaStatus === 'PARTIAL_COMPLETION' && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-medium flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-emerald-300 text-xs uppercase tracking-wider mb-1">
                Rollback Intentionally Skipped (Safety Policy Enforced)
              </h4>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Previously successful revocations were preserved because compensation could re-grant access that had already been removed.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;

            return (
              <React.Fragment key={step.name}>
                <div className="relative group flex flex-col justify-between">
                  {/* Step Card Node */}
                  <div
                    className={`p-4 rounded-2xl border transition-all duration-500 flex flex-col justify-between min-h-[140px] relative ${
                      step.status === 'completed' || step.status === 'revoked'
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-100 shadow-lg shadow-emerald-500/5'
                        : step.status === 'running'
                        ? 'bg-blue-950/40 border-blue-400 text-white shadow-xl shadow-blue-500/20 ring-2 ring-blue-400/30'
                        : step.status === 'failed'
                        ? 'bg-rose-950/30 border-rose-500/60 text-rose-100 shadow-lg shadow-rose-500/10'
                        : step.status === 'compensating'
                        ? 'bg-amber-950/30 border-amber-400 text-amber-100 shadow-xl shadow-amber-500/20 ring-2 ring-amber-400/30'
                        : step.status === 'compensated' || step.status === 'restored'
                        ? 'bg-slate-900/60 border-amber-500/30 border-dashed text-slate-400'
                        : 'bg-slate-900/30 border-slate-800 text-slate-500 border-dashed'
                    }`}
                  >
                    {/* Top Row: Step Index & Status Badge */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                        STEP 0{idx + 1}
                      </span>

                      {(step.status === 'completed' || step.status === 'revoked') && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <Check className="w-3 h-3" /> {isRevocation ? 'REVOKED' : 'Done'}
                        </span>
                      )}
                      {step.status === 'running' && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" /> Running
                        </span>
                      )}
                      {step.status === 'failed' && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                      {step.status === 'compensating' && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
                          <RotateCcw className="w-3 h-3 animate-spin" /> Undoing
                        </span>
                      )}
                      {(step.status === 'compensated' || step.status === 'restored') && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <RotateCcw className="w-3 h-3" /> {isRevocation ? 'RESTORED' : 'Compensated'}
                        </span>
                      )}
                      {(step.status === 'pending' || step.status === 'not_executed') && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded-full border border-slate-700/40">
                          <Clock className="w-3 h-3" /> {step.status === 'not_executed' ? 'NOT EXECUTED' : 'Pending'}
                        </span>
                      )}
                    </div>

                    {/* Step Title & Code Name */}
                    <div>
                      <h4 className="font-bold text-sm text-slate-100 mb-0.5">{step.label}</h4>
                      <code className="text-[11px] text-slate-400 font-mono tracking-tight">
                        {step.name}
                      </code>
                    </div>

                    {/* Result or Error Info Box */}
                    {step.status === 'failed' && step.error && (
                      <div className="mt-2 p-2 rounded-lg bg-rose-900/30 border border-rose-800/50 text-[11px] font-mono text-rose-300 leading-tight">
                        ✕ {step.error}
                      </div>
                    )}
                    {(step.status === 'completed' || step.status === 'revoked') && step.result && (
                      <div className="mt-2 p-1.5 rounded-lg bg-emerald-900/20 border border-emerald-800/40 text-[10px] font-mono text-emerald-300 truncate">
                        ✓ {JSON.stringify(step.result)}
                      </div>
                    )}
                    {(step.status === 'compensated' || step.status === 'restored') && (
                      <div className="mt-2 p-1.5 rounded-lg bg-amber-900/20 border border-amber-800/40 text-[10px] font-mono text-amber-300">
                        ↶ Access re-granted
                      </div>
                    )}
                  </div>

                  {/* Flow Arrow Connector between nodes (desktop view) */}
                  {!isLast && (
                    <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 items-center justify-center">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center border shadow-md transition-colors ${
                          isCompensating
                            ? 'bg-amber-900/80 text-amber-300 border-amber-600 animate-pulse'
                            : (step.status === 'completed' || step.status === 'revoked')
                            ? 'bg-emerald-900/80 text-emerald-300 border-emerald-600'
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                        }`}
                      >
                        {isCompensating ? (
                          <ArrowLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Residual Access Panel */}
        {residualArtifacts && residualArtifacts.length > 0 && (
          <div className="mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/30">
            <div className="flex items-center gap-2 mb-3 text-amber-400">
              <AlertOctagon className="w-4 h-4" />
              <h3 className="font-bold text-xs uppercase tracking-wider">RESIDUAL ACCESS / ACTIVE RESOURCES</h3>
            </div>

            <div className="space-y-2">
              {residualArtifacts.map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-rose-400">{item.system}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-300">{item.resource}</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] uppercase font-bold">
                      {item.state}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Reason: <span className="text-slate-300">{item.reason}</span>
                  </div>
                </div>
              ))}
            </div>

            {recommendedNextAction && (
              <div className="mt-3 text-xs font-mono text-emerald-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-400" /> Recommended Action: {recommendedNextAction}
              </div>
            )}
          </div>
        )}

        {/* Educational Comparison Banner */}
        {isRevocation && (
          <div className="mt-6 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Info className="w-4 h-4 text-blue-400" />
              <span>Why does Failure Policy matter for Revocation?</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="text-slate-400">
                <strong className="text-slate-200">Provisioning:</strong> Failure → Rollback is safer
              </span>
              <span className="text-slate-400">
                <strong className="text-emerald-400">Revocation:</strong> Failure → Partial Completion is safer
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
        <span>MODE: REAL SAGA ENGINE ORCHESTRATION</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span> Event-Driven Reactive Architecture
        </span>
      </div>
    </div>
  );
};
