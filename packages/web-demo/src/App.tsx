import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ScenarioSelector } from './components/ScenarioSelector';
import { InputPanel } from './components/InputPanel';
import { ExecutionFlow } from './components/ExecutionFlow';
import { ExecutionSummary } from './components/ExecutionSummary';
import { EventLog } from './components/EventLog';
import { JsonOutput } from './components/JsonOutput';
import { ExecutionHistory } from './components/ExecutionHistory';
import {
  ScenarioType,
  FailurePolicy,
  WorkflowStepState,
  EventLogItem,
  ExecutionSummaryData,
  HistoryRecord,
  ResidualArtifact,
} from './types';

const SCENARIO_STEPS_MAP: Record<ScenarioType, { name: string; label: string; description: string }[]> = {
  travel: [
    { name: 'book-flight', label: 'Book Flight', description: 'Reserves airline seat' },
    { name: 'reserve-hotel', label: 'Reserve Hotel', description: 'Reserves hotel room' },
    { name: 'rent-car', label: 'Rent Car', description: 'Reserves rental vehicle' },
  ],
  ecommerce: [
    { name: 'validate-cart', label: 'Validate Cart', description: 'Checks item availability' },
    { name: 'reserve-inventory', label: 'Reserve Inventory', description: 'Locks warehouse inventory' },
    { name: 'process-payment', label: 'Process Payment', description: 'Charges customer payment' },
    { name: 'create-shipment', label: 'Create Shipment', description: 'Generates shipping label' },
  ],
  'ai-agent': [
    { name: 'acquire-resources', label: 'Acquire Resources', description: 'Allocates GPU & memory' },
    { name: 'execute-action', label: 'Execute Action', description: 'Runs LLM tool action' },
    { name: 'commit-changes', label: 'Commit Changes', description: 'Persists tool execution state' },
  ],
  revocation: [
    { name: 'revoke-system-a', label: 'System A (IAM)', description: 'Revokes IAM User permissions' },
    { name: 'revoke-system-b', label: 'System B (DB)', description: 'Revokes Database role access' },
    { name: 'revoke-system-c', label: 'System C (API)', description: 'Revokes API Gateway key' },
    { name: 'revoke-system-d', label: 'System D (VPN)', description: 'Revokes VPN Certificate' },
  ],
};

const DEFAULT_INPUTS: Record<ScenarioType, Record<string, any>> = {
  travel: {
    from: 'NYC',
    to: 'LAX',
    hotelCity: 'Los Angeles',
    nights: 3,
    carLocation: 'LAX Airport',
    days: 3,
  },
  ecommerce: {
    orderId: 'ORD-8942',
    customerId: 'CUST-302',
    itemsCount: 4,
    amount: 249.99,
    shippingAddress: '742 Evergreen Terrace',
  },
  'ai-agent': {
    agentId: 'AGENT-DELTA-09',
    taskType: 'multi-file-refactor',
    targetResource: 'repo-context-mem',
    payload: 'Reorganize utility imports across modules',
  },
  revocation: {
    targetUser: 'user@example.com',
    systems: ['System A', 'System B', 'System C', 'System D'],
  },
};

export default function App() {
  const [scenario, setScenario] = useState<ScenarioType>('travel');
  const [inputs, setInputs] = useState<Record<ScenarioType, Record<string, any>>>(DEFAULT_INPUTS);
  const [simulateFailureStep, setSimulateFailureStep] = useState<string>('rent-car');
  const [failurePolicy, setFailurePolicy] = useState<FailurePolicy>('PARTIAL_COMPLETION');
  const [isRunning, setIsRunning] = useState(false);
  const [isCompensating, setIsCompensating] = useState(false);
  const [sagaStatus, setSagaStatus] = useState<string>('IDLE');
  const [activeTab, setActiveTab] = useState<'visual' | 'logs' | 'json'>('visual');

  // Residual & explanation state
  const [residualArtifacts, setResidualArtifacts] = useState<ResidualArtifact[]>([]);
  const [rollbackSkippedReason, setRollbackSkippedReason] = useState<string>('');
  const [recommendedNextAction, setRecommendedNextAction] = useState<string>('');

  // Steps state for centerpiece flow graph
  const [steps, setSteps] = useState<WorkflowStepState[]>([]);

  // Logs & Result state
  const [logs, setLogs] = useState<EventLogItem[]>([]);
  const [jsonResult, setJsonResult] = useState<any>(null);
  const [summary, setSummary] = useState<ExecutionSummaryData>({
    sagaId: '',
    status: 'IDLE',
    totalSteps: 3,
    completedSteps: 0,
    compensatedSteps: 0,
  });

  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // Reset steps state whenever scenario changes
  useEffect(() => {
    const rawSteps = SCENARIO_STEPS_MAP[scenario];
    setSteps(
      rawSteps.map((s) => ({
        name: s.name,
        label: s.label,
        description: s.description,
        status: 'pending',
      }))
    );
    if (scenario === 'revocation') {
      setSimulateFailureStep('revoke-system-c');
      setFailurePolicy('PARTIAL_COMPLETION');
    } else {
      setSimulateFailureStep('');
      setFailurePolicy('ROLLBACK');
    }
    setSagaStatus('IDLE');
    setIsCompensating(false);
    setResidualArtifacts([]);
    setRollbackSkippedReason('');
    setRecommendedNextAction('');
    setSummary({
      sagaId: '',
      status: 'IDLE',
      totalSteps: rawSteps.length,
      completedSteps: 0,
      compensatedSteps: 0,
    });
  }, [scenario]);

  const handleInputChange = (key: string, value: any) => {
    setInputs((prev) => ({
      ...prev,
      [scenario]: {
        ...prev[scenario],
        [key]: value,
      },
    }));
  };

  const addLog = (type: string, message: string, level: EventLogItem['level'] = 'info', details?: any) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: time,
        type,
        message,
        details,
        level,
      },
    ]);
  };

  const handleRunSaga = async (confirmedRollback: boolean = false) => {
    setIsRunning(true);
    setIsCompensating(false);
    setSagaStatus('RUNNING');
    setJsonResult(null);
    setResidualArtifacts([]);
    setRollbackSkippedReason('');
    setRecommendedNextAction('');

    // Reset steps to pending
    const rawSteps = SCENARIO_STEPS_MAP[scenario];
    setSteps(
      rawSteps.map((s) => ({
        name: s.name,
        label: s.label,
        description: s.description,
        status: 'pending',
      }))
    );

    const effectivePolicy = scenario === 'revocation' ? failurePolicy : 'ROLLBACK';

    addLog('saga:starting', `Initiating Saga transaction execution for scenario "${scenario.toUpperCase()}" (Policy: ${effectivePolicy})...`, 'info');
    if (scenario === 'revocation' && effectivePolicy === 'ROLLBACK' && confirmedRollback) {
      addLog('policy:confirmed', `Rollback explicitly confirmed by user for revocation workflow`, 'warn');
    }

    let completedCount = 0;

    try {
      const response = await fetch('/api/saga/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          input: inputs[scenario],
          failurePolicy: effectivePolicy,
          confirmRollback: confirmedRollback,
          simulateFailureStep,
        }),
      });

      if (!response.body) {
        throw new Error('Server SSE stream body unavailable');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '').trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              const { type, data } = event;

              if (type === 'saga:started') {
                setSummary((prev) => ({
                  ...prev,
                  sagaId: data.sagaId,
                  status: 'RUNNING',
                  workflow: scenario,
                  failurePolicy: effectivePolicy,
                  totalSteps: rawSteps.length,
                  completedSteps: 0,
                  compensatedSteps: 0,
                }));
                addLog('saga:started', `Saga started with ID: ${data.sagaId} (Policy: ${effectivePolicy})`, 'info');
              } else if (type === 'step:executing') {
                setSteps((prev) =>
                  prev.map((s) => (s.name === data.stepName ? { ...s, status: 'running' } : s))
                );
                addLog('step:executing', `Executing step "${data.stepName}"...`, 'info');
              } else if (type === 'step:executed') {
                completedCount++;
                const newStatus = scenario === 'revocation' ? 'revoked' : 'completed';
                setSteps((prev) =>
                  prev.map((s) =>
                    s.name === data.stepName ? { ...s, status: newStatus, result: data.result } : s
                  )
                );
                setSummary((prev) => ({ ...prev, completedSteps: completedCount }));
                addLog('step:executed', `✓ Step "${data.stepName}" completed successfully`, 'success', data.result);
              } else if (type === 'step:failed') {
                setSteps((prev) =>
                  prev.map((s) =>
                    s.name === data.stepName ? { ...s, status: 'failed', error: data.error } : s
                  )
                );
                addLog('step:failed', `✕ Step "${data.stepName}" FAILED: ${data.error}`, 'error');
              } else if (type === 'compensation:started') {
                setIsCompensating(true);
                addLog('compensation:started', `⏪ Saga failure detected — starting reverse compensation (rollback)...`, 'compensation');
              } else if (type === 'compensation:step') {
                setSteps((prev) =>
                  prev.map((s) => (s.name === data.stepName ? { ...s, status: 'compensating' } : s))
                );
                addLog('compensation:step', `↶ Compensating step "${data.stepName}"...`, 'compensation');
              } else if (type === 'compensation:skipped') {
                setIsCompensating(false);
                addLog('compensation:skipped', `🛡️ Compensation skipped by policy: ${data.reason}`, 'warn');
              } else if (type === 'compensation:completed') {
                setIsCompensating(false);
                addLog('compensation:completed', `✅ Compensation finished — all prior steps rolled back cleanly`, 'success');
              } else if (type === 'saga:completed') {
                setSagaStatus('COMPLETED');
                setSummary((prev) => ({ ...prev, status: 'COMPLETED' }));
                addLog('saga:completed', `🎉 Saga execution completed successfully!`, 'success');
              } else if (type === 'saga:failed') {
                addLog('saga:failed', `Saga transaction finished with failure. Error: ${data.error}`, 'warn');
              } else if (type === 'result') {
                setJsonResult(data);

                let finalStatus: ExecutionSummaryData['status'] = 'COMPLETED';
                if (data.success) {
                  finalStatus = 'COMPLETED';
                } else if (data.status === 'PARTIAL_COMPLETION' || data.failurePolicy === 'PARTIAL_COMPLETION') {
                  finalStatus = 'PARTIAL_COMPLETION';
                } else {
                  finalStatus = 'ROLLED_BACK';
                }

                setSagaStatus(finalStatus);

                // Update unexecuted steps if partial completion
                if (finalStatus === 'PARTIAL_COMPLETION') {
                  setSteps((prev) => {
                    let failedFound = false;
                    return prev.map((s) => {
                      if (s.status === 'failed') {
                        failedFound = true;
                        return s;
                      }
                      if (failedFound && s.status === 'pending') {
                        return { ...s, status: 'not_executed' };
                      }
                      return s;
                    });
                  });
                  if (data.residualArtifacts) {
                    setResidualArtifacts(data.residualArtifacts);
                    addLog('residual:detected', `Residual access detected on ${data.residualArtifacts.length} system(s)`, 'warn', data.residualArtifacts);
                  }
                  if (data.rollbackSkippedReason) setRollbackSkippedReason(data.rollbackSkippedReason);
                  if (data.recommendedNextAction) setRecommendedNextAction(data.recommendedNextAction);
                } else if (finalStatus === 'ROLLED_BACK') {
                  setSteps((prev) =>
                    prev.map((s) => (s.status === 'compensating' ? { ...s, status: scenario === 'revocation' ? 'restored' : 'compensated' } : s))
                  );
                }

                const compStepsCount = data.success ? 0 : data.status === 'PARTIAL_COMPLETION' ? 0 : completedCount;

                setSummary({
                  sagaId: data.sagaId,
                  status: finalStatus,
                  workflow: scenario,
                  failurePolicy: data.failurePolicy || effectivePolicy,
                  totalSteps: rawSteps.length,
                  completedSteps: completedCount,
                  compensatedSteps: compStepsCount,
                  durationMs: data.durationMs,
                  failedStep: data.failedStep,
                  error: data.error,
                  residualArtifacts: data.residualArtifacts,
                  rollbackSkippedReason: data.rollbackSkippedReason,
                  recommendedNextAction: data.recommendedNextAction,
                });

                // Add to History
                const titles: Record<ScenarioType, string> = {
                  travel: 'Travel Booking',
                  ecommerce: 'E-Commerce Order',
                  'ai-agent': 'AI Agent Task',
                  revocation: 'Revocation Workflow',
                };
                setHistory((prev) => [
                  {
                    sagaId: data.sagaId,
                    scenario,
                    scenarioTitle: titles[scenario],
                    status: finalStatus,
                    failurePolicy: data.failurePolicy || effectivePolicy,
                    durationMs: data.durationMs,
                    timestamp: new Date().toISOString(),
                    failedStep: data.failedStep,
                    residualCount: data.residualArtifacts ? data.residualArtifacts.length : 0,
                    compensated: Boolean(data.compensated),
                    resultJson: data,
                  },
                  ...prev.slice(0, 9),
                ]);
              }
            } catch (err) {
              console.error('Error parsing SSE event line:', err);
            }
          }
        }
      }
    } catch (error: any) {
      addLog('error', `Execution request error: ${error.message}`, 'error');
      setSagaStatus('FAILED');
    } finally {
      setIsRunning(false);
      setIsCompensating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] bg-grid-pattern text-slate-100 flex flex-col justify-between">
      {/* Header */}
      <Header />

      {/* Main Dashboard Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-grow">
        {/* 1. Scenario Selector Tabs/Cards */}
        <ScenarioSelector
          selectedScenario={scenario}
          onSelect={setScenario}
          disabled={isRunning}
        />

        {/* 2. Primary Split View: Left Input Panel | Right Execution Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-stretch">
          <div className="lg:col-span-4">
            <InputPanel
              scenario={scenario}
              inputValues={inputs[scenario]}
              onInputChange={handleInputChange}
              availableSteps={SCENARIO_STEPS_MAP[scenario].map((s) => s.name)}
              simulateFailureStep={simulateFailureStep}
              onFailureStepChange={setSimulateFailureStep}
              failurePolicy={failurePolicy}
              onFailurePolicyChange={setFailurePolicy}
              onRunSaga={handleRunSaga}
              isRunning={isRunning}
            />
          </div>

          <div className="lg:col-span-8">
            <ExecutionFlow
              steps={steps}
              isCompensating={isCompensating}
              sagaStatus={sagaStatus}
              scenario={scenario}
              failurePolicy={failurePolicy}
              rollbackSkippedReason={rollbackSkippedReason}
              recommendedNextAction={recommendedNextAction}
              residualArtifacts={residualArtifacts}
            />
          </div>
        </div>

        {/* 3. Execution Summary Metrics */}
        <ExecutionSummary summary={summary} />

        {/* 4. Tabbed Lower Section: Event Log & JSON Output */}
        <div className="mb-6">
          <div className="flex items-center gap-2 border-b border-slate-800 mb-4 pb-2">
            <button
              onClick={() => setActiveTab('visual')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'visual'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Event Stream Log ({logs.length})
            </button>

            <button
              onClick={() => setActiveTab('json')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'json'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              JSON Output {jsonResult ? '✓' : ''}
            </button>
          </div>

          {activeTab === 'visual' && (
            <EventLog logs={logs} onClearLogs={() => setLogs([])} />
          )}

          {activeTab === 'json' && <JsonOutput data={jsonResult} />}
        </div>

        {/* 5. Execution History Log Table */}
        <ExecutionHistory
          history={history}
          onSelectRecord={(rec) => {
            setJsonResult(rec.resultJson);
            setActiveTab('json');
          }}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0E1420]/80 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        Saga Engine Visual Debugger &bull; P28 Revocation Workflow & Failure Policy Supported &bull; Powered by @saga-engine/core
      </footer>
    </div>
  );
}
