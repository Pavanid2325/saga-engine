import React, { useState } from 'react';
import { Play, AlertTriangle, RefreshCw, ShieldAlert, ShieldCheck, AlertOctagon, X } from 'lucide-react';
import { ScenarioType, FailurePolicy } from '../types';

interface InputPanelProps {
  scenario: ScenarioType;
  inputValues: Record<string, any>;
  onInputChange: (key: string, value: any) => void;
  availableSteps: string[];
  simulateFailureStep: string;
  onFailureStepChange: (stepName: string) => void;
  failurePolicy: FailurePolicy;
  onFailurePolicyChange: (policy: FailurePolicy) => void;
  onRunSaga: (confirmedRollback?: boolean) => void;
  isRunning: boolean;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  scenario,
  inputValues,
  onInputChange,
  availableSteps,
  simulateFailureStep,
  onFailureStepChange,
  failurePolicy,
  onFailurePolicyChange,
  onRunSaga,
  isRunning,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleRunClick = () => {
    if (scenario === 'revocation' && failurePolicy === 'ROLLBACK') {
      setShowConfirmModal(true);
    } else {
      onRunSaga(false);
    }
  };

  const handleConfirmRollback = () => {
    setShowConfirmModal(false);
    onRunSaga(true);
  };

  return (
    <>
      <div className="bg-[#0E1420] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-full relative">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div>
              <h2 className="font-bold text-base text-white flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${scenario === 'revocation' ? 'bg-rose-500' : 'bg-blue-500'}`}></span>
                INPUT CONFIGURATION
              </h2>
              <p className="text-xs text-slate-400">Configure parameters & failure points</p>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
              {scenario.toUpperCase()}
            </span>
          </div>

          {/* Dynamic Form Fields */}
          <div className="space-y-4 mb-6">
            {scenario === 'travel' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Flight Origin (From)
                    </label>
                    <input
                      type="text"
                      value={inputValues.from || ''}
                      onChange={(e) => onInputChange('from', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Destination (To)
                    </label>
                    <input
                      type="text"
                      value={inputValues.to || ''}
                      onChange={(e) => onInputChange('to', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Hotel City
                    </label>
                    <input
                      type="text"
                      value={inputValues.hotelCity || ''}
                      onChange={(e) => onInputChange('hotelCity', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nights
                    </label>
                    <input
                      type="number"
                      value={inputValues.nights || 1}
                      onChange={(e) => onInputChange('nights', parseInt(e.target.value, 10))}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Car Location
                    </label>
                    <input
                      type="text"
                      value={inputValues.carLocation || ''}
                      onChange={(e) => onInputChange('carLocation', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Rental Days
                    </label>
                    <input
                      type="number"
                      value={inputValues.days || 1}
                      onChange={(e) => onInputChange('days', parseInt(e.target.value, 10))}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </>
            )}

            {scenario === 'ecommerce' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Order ID
                    </label>
                    <input
                      type="text"
                      value={inputValues.orderId || ''}
                      onChange={(e) => onInputChange('orderId', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Customer ID
                    </label>
                    <input
                      type="text"
                      value={inputValues.customerId || ''}
                      onChange={(e) => onInputChange('customerId', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Items Count
                    </label>
                    <input
                      type="number"
                      value={inputValues.itemsCount || 1}
                      onChange={(e) => onInputChange('itemsCount', parseInt(e.target.value, 10))}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Total Amount ($)
                    </label>
                    <input
                      type="number"
                      value={inputValues.amount || 0}
                      onChange={(e) => onInputChange('amount', parseFloat(e.target.value))}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Shipping Address
                  </label>
                  <input
                    type="text"
                    value={inputValues.shippingAddress || ''}
                    onChange={(e) => onInputChange('shippingAddress', e.target.value)}
                    disabled={isRunning}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              </>
            )}

            {scenario === 'ai-agent' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Agent ID
                    </label>
                    <input
                      type="text"
                      value={inputValues.agentId || ''}
                      onChange={(e) => onInputChange('agentId', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Task Type
                    </label>
                    <input
                      type="text"
                      value={inputValues.taskType || ''}
                      onChange={(e) => onInputChange('taskType', e.target.value)}
                      disabled={isRunning}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Target Resource
                  </label>
                  <input
                    type="text"
                    value={inputValues.targetResource || ''}
                    onChange={(e) => onInputChange('targetResource', e.target.value)}
                    disabled={isRunning}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Task Payload
                  </label>
                  <textarea
                    rows={2}
                    value={inputValues.payload || ''}
                    onChange={(e) => onInputChange('payload', e.target.value)}
                    disabled={isRunning}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono resize-none"
                  />
                </div>
              </>
            )}

            {scenario === 'revocation' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Target User / Principal
                  </label>
                  <input
                    type="text"
                    value={inputValues.targetUser || ''}
                    onChange={(e) => onInputChange('targetUser', e.target.value)}
                    disabled={isRunning}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Target Systems List
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['System A (IAM)', 'System B (DB)', 'System C (API)', 'System D (VPN)'].map((sys) => (
                      <span
                        key={sys}
                        className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]"
                      >
                        {sys}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Failure Policy Selector */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-200 mb-2 uppercase tracking-wider">
                    Workflow Failure Policy
                  </label>

                  <div className="grid grid-cols-1 gap-2">
                    {/* PARTIAL_COMPLETION Card */}
                    <div
                      onClick={() => !isRunning && onFailurePolicyChange('PARTIAL_COMPLETION')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        failurePolicy === 'PARTIAL_COMPLETION'
                          ? 'bg-emerald-950/30 border-emerald-500/80 ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" /> PARTIAL COMPLETION
                        </span>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Keep successful revocations. Do not restore access. Stop at failed system and report active residual access.
                      </p>
                    </div>

                    {/* ROLLBACK Card */}
                    <div
                      onClick={() => !isRunning && onFailurePolicyChange('ROLLBACK')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        failurePolicy === 'ROLLBACK'
                          ? 'bg-amber-950/30 border-amber-500/80 ring-1 ring-amber-500/30'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4" /> ROLLBACK
                        </span>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Caution
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Undo successful revocations if a later step fails. May re-grant previously revoked access.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Failure Simulation Section */}
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-6">
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Simulate Failure</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Select a step to intentionally trigger a failure and observe how the engine enforces the selected policy.
            </p>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors">
                <input
                  type="radio"
                  name="failureStep"
                  value=""
                  checked={simulateFailureStep === ''}
                  onChange={() => onFailureStepChange('')}
                  disabled={isRunning}
                  className="text-blue-500 focus:ring-blue-500 bg-slate-900 border-slate-700"
                />
                <span className="font-medium text-emerald-400">○ No Failure (Happy Path)</span>
              </label>

              {availableSteps.map((step) => (
                <label
                  key={step}
                  className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
                >
                  <input
                    type="radio"
                    name="failureStep"
                    value={step}
                    checked={simulateFailureStep === step}
                    onChange={() => onFailureStepChange(step)}
                    disabled={isRunning}
                    className="text-rose-500 focus:ring-rose-500 bg-slate-900 border-slate-700"
                  />
                  <span>
                    Fail at <strong className="text-rose-400 font-mono">{step}</strong>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleRunClick}
          disabled={isRunning}
          className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
            isRunning
              ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed shadow-none'
              : scenario === 'revocation'
              ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-rose-500/25 hover:shadow-rose-500/40 active:scale-[0.99]'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.99]'
          }`}
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-blue-300" />
              <span>Executing Saga Engine...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>RUN {scenario.toUpperCase()} TRANSACTION</span>
            </>
          )}
        </button>
      </div>

      {/* Rollback Confirmation Warning Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E1420] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-pulse-glow">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">CONFIRM ROLLBACK POLICY</h3>
                <p className="text-xs text-amber-400/90 font-mono uppercase tracking-wider">Potentially Dangerous Action</p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 text-xs text-slate-200 space-y-2">
              <p className="font-bold text-amber-300">
                WARNING: Rolling back a revocation may restore or re-grant access that has already been successfully revoked.
              </p>
              <p className="text-slate-300">
                If System A and System B are revoked successfully and System C fails, rollback will restore access to Systems A and B.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmRollback}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white shadow-lg shadow-amber-500/20 transition-all"
              >
                I Understand — Run With Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
