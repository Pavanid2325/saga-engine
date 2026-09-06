import React, { useState } from 'react';
import { Copy, Check, Code } from 'lucide-react';

interface JsonOutputProps {
  data: any;
}

export const JsonOutput: React.FC<JsonOutputProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  const jsonString = data ? JSON.stringify(data, null, 2) : '// No saga execution output yet';

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#0B0E14] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full font-mono text-xs">
      {/* Top Header */}
      <div className="bg-[#121824] px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
          <Code className="w-3.5 h-3.5 text-cyan-400" />
          FINAL RESULT (SagaResult JSON)
        </span>

        <button
          onClick={handleCopy}
          disabled={!data}
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all ${
            copied
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          } ${!data ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" /> Copied!
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-400" /> Copy JSON
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <div className="p-4 overflow-y-auto max-h-[320px] min-h-[220px]">
        <pre className="text-slate-300 leading-relaxed font-mono whitespace-pre-wrap break-words">
          {jsonString}
        </pre>
      </div>
    </div>
  );
};
