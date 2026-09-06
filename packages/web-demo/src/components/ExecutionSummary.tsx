import React from 'react';
import { CheckCircle2, RotateCcw, Clock, Layers, Hash, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { ExecutionSummaryData } from '../types';

interface ExecutionSummaryProps {
  summary: ExecutionSummaryData;
}

export const ExecutionSummary: React.FC<ExecutionSummaryProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
      {/* 1. Status Card */}
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          STATUS
        </span>
        <div className="mt-2 flex items-center gap-2">
          {summary.status === 'COMPLETED' && (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-sm text-emerald-400">Completed</span>
            </>
          )}
          {summary.status === 'PARTIAL_COMPLETION' && (
            <>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-xs text-emerald-400">Partial Completion</span>
            </>
          )}
          {summary.status === 'ROLLED_BACK' && (
            <>
              <RotateCcw className="w-5 h-5 text-amber-400" />
              <span className="font-bold text-sm text-amber-400">Rolled Back</span>
            </>
          )}
          {summary.status === 'FAILED' && (
            <>
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <span className="font-bold text-sm text-rose-400">Failed</span>
            </>
          )}
          {summary.status === 'RUNNING' && (
            <span className="font-bold text-sm text-blue-400 animate-pulse">Running...</span>
          )}
          {summary.status === 'IDLE' && (
            <span className="font-bold text-sm text-slate-500">Idle</span>
          )}
        </div>
      </div>

      {/* 2. Failure Policy Card */}
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          POLICY
        </span>
        <div className="mt-2">
          {summary.failurePolicy === 'PARTIAL_COMPLETION' ? (
            <span className="font-bold text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              PARTIAL COMPLETION
            </span>
          ) : summary.failurePolicy === 'ROLLBACK' ? (
            <span className="font-bold text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              ROLLBACK
            </span>
          ) : (
            <span className="text-slate-500 font-mono text-xs">Standard</span>
          )}
        </div>
      </div>

      {/* 3. Steps Card */}
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Layers className="w-3.5 h-3.5" /> STEPS
        </span>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="font-bold text-xl text-white">{summary.completedSteps}</span>
          <span className="text-xs text-slate-400 font-mono">/ {summary.totalSteps}</span>
        </div>
      </div>

      {/* 4. Residual / Rollbacks Card */}
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        {summary.status === 'PARTIAL_COMPLETION' ? (
          <>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              RESIDUAL ACCESS
            </span>
            <div className="mt-2">
              <span className="font-bold text-xl text-rose-400 font-mono">
                {summary.residualArtifacts ? summary.residualArtifacts.length : summary.residualCount || 0} ACTIVE
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> ROLLBACKS
            </span>
            <div className="mt-2">
              <span className="font-bold text-xl text-amber-400">{summary.compensatedSteps}</span>
            </div>
          </>
        )}
      </div>

      {/* 5. Compensated Status */}
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          COMPENSATED
        </span>
        <div className="mt-2">
          {summary.status === 'PARTIAL_COMPLETION' ? (
            <span className="font-bold text-sm text-emerald-400 font-mono">NO (SKIPPED)</span>
          ) : summary.compensatedSteps > 0 ? (
            <span className="font-bold text-sm text-amber-400 font-mono">YES ({summary.compensatedSteps})</span>
          ) : (
            <span className="font-bold text-sm text-slate-500 font-mono">NO</span>
          )}
        </div>
      </div>

      {/* 6. Duration Card */}
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> DURATION
        </span>
        <div className="mt-2">
          <span className="font-bold text-xl text-cyan-400 font-mono">
            {summary.durationMs !== undefined ? `${(summary.durationMs / 1000).toFixed(2)} s` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
