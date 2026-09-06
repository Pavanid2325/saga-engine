import React from 'react';
import { Activity, ShieldCheck, Zap, Code2 } from 'lucide-react';

interface HeaderProps {
  engineReady?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ engineReady = true }) => {
  return (
    <header className="border-b border-slate-800 bg-[#0E1420]/80 backdrop-blur-md px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
            <Activity className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xl tracking-tight text-white">SAGA ENGINE</h1>
              <span className="text-[10px] uppercase tracking-widest font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                v0.1.1
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Transactional workflows for AI agents — Automatic Rollback & Compensation
            </p>
          </div>
        </div>

        {/* Right Status & Badges */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>● Engine Ready</span>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono">
              <Code2 className="w-3.5 h-3.5 text-blue-400" /> TypeScript
            </span>
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Auto-Rollback
            </span>
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Observable
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
