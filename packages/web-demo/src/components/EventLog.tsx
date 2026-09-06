import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { EventLogItem } from '../types';

interface EventLogProps {
  logs: EventLogItem[];
  onClearLogs: () => void;
}

export const EventLog: React.FC<EventLogProps> = ({ logs, onClearLogs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-[#0B0E14] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full font-mono text-xs">
      {/* Terminal Window Top Bar */}
      <div className="bg-[#121824] px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <span className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            ENGINE EVENT STREAM LOG
          </span>
        </div>

        <button
          onClick={onClearLogs}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-md transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
      </div>

      {/* Log Output Console */}
      <div className="p-4 space-y-2 overflow-y-auto max-h-[320px] min-h-[220px]">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic py-8 text-center">
            No saga execution events logged yet. Select input parameters and click "RUN TRANSACTION".
          </div>
        ) : (
          logs.map((log) => {
            let textColor = 'text-slate-300';
            let badgeBg = 'bg-slate-800 text-slate-400';

            if (log.level === 'success') {
              textColor = 'text-emerald-400';
              badgeBg = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            } else if (log.level === 'error') {
              textColor = 'text-rose-400';
              badgeBg = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
            } else if (log.level === 'warn' || log.level === 'compensation') {
              textColor = 'text-amber-400';
              badgeBg = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            } else if (log.type === 'step:executing') {
              textColor = 'text-cyan-300';
              badgeBg = 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
            } else if (log.type === 'compensation:skipped') {
              textColor = 'text-emerald-300 font-semibold';
              badgeBg = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
            }

            return (
              <div key={log.id} className="flex items-start gap-3 hover:bg-slate-900/40 p-1 rounded">
                <span className="text-slate-500 shrink-0 text-[11px] font-mono select-none">
                  {log.timestamp}
                </span>

                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 ${badgeBg}`}>
                  {log.type}
                </span>

                <span className={`break-all ${textColor}`}>{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
