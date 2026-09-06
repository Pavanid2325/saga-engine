import React from 'react';
import { History, CheckCircle2, RotateCcw, XCircle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { HistoryRecord } from '../types';

interface ExecutionHistoryProps {
  history: HistoryRecord[];
  onSelectRecord: (record: HistoryRecord) => void;
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  history,
  onSelectRecord,
}) => {
  if (history.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-5 shadow-xl mt-6">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <History className="w-4 h-4 text-purple-400" />
          EXECUTION HISTORY LOG
        </h3>
        <span className="text-xs text-slate-400 font-mono">{history.length} Recent Runs</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="pb-2 font-semibold">SAGA ID</th>
              <th className="pb-2 font-semibold">WORKFLOW</th>
              <th className="pb-2 font-semibold">FAILURE POLICY</th>
              <th className="pb-2 font-semibold">STATUS</th>
              <th className="pb-2 font-semibold">FAILED STEP</th>
              <th className="pb-2 font-semibold">RESIDUAL</th>
              <th className="pb-2 font-semibold">COMPENSATED</th>
              <th className="pb-2 font-semibold">DURATION</th>
              <th className="pb-2 text-right font-semibold">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {history.map((item) => (
              <tr key={item.sagaId + item.timestamp} className="hover:bg-slate-900/60 transition-colors">
                <td className="py-3 font-mono font-bold text-slate-200">{item.sagaId.substring(0, 10)}...</td>
                <td className="py-3 text-slate-300 capitalize">{item.scenarioTitle}</td>
                <td className="py-3 font-mono text-[11px]">
                  {item.failurePolicy === 'PARTIAL_COMPLETION' ? (
                    <span className="text-emerald-400">PARTIAL_COMPLETION</span>
                  ) : item.failurePolicy === 'ROLLBACK' ? (
                    <span className="text-amber-400">ROLLBACK</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="py-3">
                  {item.status === 'COMPLETED' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Completed
                    </span>
                  )}
                  {item.status === 'PARTIAL_COMPLETION' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold inline-flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" /> Partial Completion
                    </span>
                  )}
                  {item.status === 'ROLLED_BACK' && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold inline-flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Rolled Back
                    </span>
                  )}
                  {item.status === 'FAILED' && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-semibold inline-flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </td>
                <td className="py-3 text-rose-300 font-mono">{item.failedStep || '—'}</td>
                <td className="py-3 text-slate-300">{item.residualCount || 0}</td>
                <td className="py-3">
                  {item.compensated ? (
                    <span className="text-amber-400 font-bold">Yes</span>
                  ) : (
                    <span className="text-slate-500">No</span>
                  )}
                </td>
                <td className="py-3 text-cyan-400">{item.durationMs} ms</td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => onSelectRecord(item)}
                    className="text-blue-400 hover:text-blue-300 font-sans font-medium hover:underline inline-flex items-center gap-0.5"
                  >
                    View <ArrowUpRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
