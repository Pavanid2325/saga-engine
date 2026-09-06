import React from 'react';
import { Plane, ShoppingBag, Cpu, ShieldOff, ArrowRight } from 'lucide-react';
import { ScenarioType } from '../types';

interface ScenarioSelectorProps {
  selectedScenario: ScenarioType;
  onSelect: (scenario: ScenarioType) => void;
  disabled?: boolean;
}

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  selectedScenario,
  onSelect,
  disabled = false,
}) => {
  const scenarios = [
    {
      id: 'travel' as ScenarioType,
      title: 'Travel Booking',
      subtitle: 'Multi-service travel reservation',
      icon: Plane,
      color: 'blue',
      steps: ['Book Flight', 'Reserve Hotel', 'Rent Car'],
    },
    {
      id: 'ecommerce' as ScenarioType,
      title: 'E-Commerce Order',
      subtitle: 'Checkout & fulfillment pipeline',
      icon: ShoppingBag,
      color: 'emerald',
      steps: ['Validate Cart', 'Reserve Inventory', 'Process Payment', 'Create Shipment'],
    },
    {
      id: 'ai-agent' as ScenarioType,
      title: 'AI Agent Task',
      subtitle: 'Autonomous agent action execution',
      icon: Cpu,
      color: 'purple',
      steps: ['Acquire Resources', 'Execute Action', 'Commit Changes'],
    },
    {
      id: 'revocation' as ScenarioType,
      title: 'Revocation Workflow',
      subtitle: 'P28 Multi-System Access Revocation',
      icon: ShieldOff,
      color: 'rose',
      steps: ['System A', 'System B', 'System C', 'System D'],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {scenarios.map((s) => {
        const Icon = s.icon;
        const isSelected = selectedScenario === s.id;

        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            disabled={disabled}
            className={`relative group text-left p-5 rounded-2xl border transition-all duration-300 ${
              isSelected
                ? s.id === 'revocation'
                  ? 'bg-slate-900/90 border-rose-500/80 shadow-lg shadow-rose-500/10 ring-1 ring-rose-500/40'
                  : 'bg-slate-900/90 border-blue-500/80 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Top Row: Icon & Status */}
            <div className="flex items-center justify-between mb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  isSelected
                    ? s.id === 'revocation'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30'
                      : 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                    : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              {isSelected && (
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    s.id === 'revocation'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}
                >
                  Active Demo
                </span>
              )}
            </div>

            {/* Title & Subtitle */}
            <h3 className="font-bold text-base text-white group-hover:text-blue-300 transition-colors">
              {s.title}
            </h3>
            <p className="text-xs text-slate-400 mb-4">{s.subtitle}</p>

            {/* Workflow Step Preview Chips */}
            <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-mono text-slate-400">
              {s.steps.map((step, idx) => (
                <React.Fragment key={step}>
                  <span className="px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700/50 text-slate-300">
                    {step}
                  </span>
                  {idx < s.steps.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
};
