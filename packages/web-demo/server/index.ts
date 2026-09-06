import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { SagaOrchestrator, InMemoryStore } from '@saga-engine/core';
import {
  buildTravelSaga,
  buildECommerceSaga,
  buildAIAgentSaga,
  buildRevocationSaga,
  getScenarioSteps,
} from './sagas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'Saga Engine v0.1.1',
      ready: true,
    });
  });

  // Get steps for failure simulation selector
  app.get('/api/scenarios/:scenario/steps', (req, res) => {
    const { scenario } = req.params;
    const steps = getScenarioSteps(scenario);
    res.json({ scenario, steps });
  });

  // Execute Saga with SSE streaming
  app.post('/api/saga/execute', async (req, res) => {
    const { scenario, input, failurePolicy, confirmRollback, simulateFailureStep } = req.body;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (type: string, data: any) => {
      const payload = JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        data,
      });
      res.write(`data: ${payload}\n\n`);
    };

    // Select Saga definition
    let saga: any;
    try {
      if (scenario === 'travel') {
        saga = buildTravelSaga(simulateFailureStep);
      } else if (scenario === 'ecommerce') {
        saga = buildECommerceSaga(simulateFailureStep);
      } else if (scenario === 'ai-agent') {
        saga = buildAIAgentSaga(simulateFailureStep);
      } else if (scenario === 'revocation') {
        saga = buildRevocationSaga(simulateFailureStep);
      } else {
        sendEvent('error', { message: `Unknown scenario: ${scenario}` });
        res.end();
        return;
      }
    } catch (err: any) {
      sendEvent('error', { message: err.message });
      res.end();
      return;
    }

    const store = new InMemoryStore();
    const orchestrator = new SagaOrchestrator({ store });

    // Register event handlers
    orchestrator.on('saga:started', (state) => {
      sendEvent('saga:started', {
        sagaId: state.id,
        sagaName: state.sagaName,
        input: state.input,
        steps: state.steps.map((s) => s.name),
      });
    });

    orchestrator.on('step:executing', (state, stepName) => {
      sendEvent('step:executing', { sagaId: state.id, stepName });
    });

    orchestrator.on('step:executed', (state, stepName, result) => {
      sendEvent('step:executed', { sagaId: state.id, stepName, result });
    });

    orchestrator.on('step:failed', (state, stepName, error) => {
      sendEvent('step:failed', {
        sagaId: state.id,
        stepName,
        error: error.message || String(error),
      });
    });

    orchestrator.on('compensation:started', (state) => {
      sendEvent('compensation:started', { sagaId: state.id });
    });

    orchestrator.on('compensation:step', (state, stepName) => {
      sendEvent('compensation:step', { sagaId: state.id, stepName });
    });

    orchestrator.on('compensation:completed', (state) => {
      sendEvent('compensation:completed', { sagaId: state.id });
    });

    orchestrator.on('compensation:skipped', (state, reason) => {
      sendEvent('compensation:skipped', { sagaId: state.id, reason });
    });

    orchestrator.on('compensation:failed', (state, stepName, error) => {
      sendEvent('compensation:failed', {
        sagaId: state.id,
        stepName,
        error: error.message || String(error),
      });
    });

    orchestrator.on('saga:completed', (state) => {
      sendEvent('saga:completed', { sagaId: state.id });
    });

    orchestrator.on('saga:failed', (state, error) => {
      sendEvent('saga:failed', {
        sagaId: state.id,
        error: error.message || String(error),
      });
    });

    try {
      const startTime = Date.now();
      const rawResult = await orchestrator.execute(saga, input, {
        workflowType: scenario,
        failurePolicy: failurePolicy || (scenario === 'revocation' ? 'PARTIAL_COMPLETION' : 'ROLLBACK'),
        confirmRollback: Boolean(confirmRollback),
      });
      const durationMs = Date.now() - startTime;

      let resultObj: any;

      if (rawResult.success) {
        resultObj = {
          success: true,
          sagaId: rawResult.sagaId,
          workflow: rawResult.workflow,
          failurePolicy: rawResult.failurePolicy,
          durationMs,
          result: rawResult.result,
          stepResults: Object.fromEntries(rawResult.stepResults.entries()),
        };
      } else if ('status' in rawResult && rawResult.status === 'PARTIAL_COMPLETION') {
        const partialRes = rawResult as any;
        resultObj = {
          success: false,
          sagaId: partialRes.sagaId,
          workflow: partialRes.workflow,
          status: 'PARTIAL_COMPLETION',
          failurePolicy: partialRes.failurePolicy,
          durationMs,
          error: partialRes.error?.message || String(partialRes.error),
          failedStep: partialRes.failedStep,
          completedSteps: partialRes.completedSteps,
          residualArtifacts: partialRes.residualArtifacts,
          compensated: false,
          rollbackSkippedReason: partialRes.rollbackSkippedReason,
          recommendedNextAction: partialRes.recommendedNextAction,
        };
      } else {
        const failRes = rawResult as any;
        resultObj = {
          success: false,
          sagaId: failRes.sagaId,
          workflow: failRes.workflow || scenario,
          status: failRes.status || 'ROLLED_BACK',
          failurePolicy: failRes.failurePolicy || failurePolicy || 'ROLLBACK',
          durationMs,
          error: failRes.error?.message || String(failRes.error),
          failedStep: failRes.failedStep,
          compensated: failRes.compensated,
          compensationErrors: failRes.compensationErrors?.map((e: any) => ({
            step: e.step,
            error: e.error?.message || String(e.error),
          })),
        };
      }

      sendEvent('result', resultObj);
    } catch (error: any) {
      sendEvent('error', { message: error.message || String(error) });
    } finally {
      res.end();
    }
  });

  // Setup Vite dev server middleware in non-production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: rootDir,
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    app.use(express.static(path.resolve(rootDir, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(rootDir, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Saga Engine Web UI running at http://localhost:${PORT}`);
    console.log(`● Engine API ready at http://localhost:${PORT}/api/health\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
