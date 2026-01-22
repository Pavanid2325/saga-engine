/**
 * Stress and concurrency tests for the Saga Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Saga, SagaOrchestrator, InMemoryStore } from './index.js';

describe('Stress and Concurrency Tests', () => {
  describe('High volume execution', () => {
    it('handles 100 concurrent saga executions', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ id: number }>('high-volume-saga')
        .step({
          name: 'process',
          execute: async (ctx) => {
            // Simulate some work
            await new Promise((r) => setTimeout(r, Math.random() * 10));
            return { processedId: ctx.input.id };
          },
        });

      const count = 100;
      const promises = Array.from({ length: count }, (_, i) =>
        orchestrator.execute(saga, { id: i })
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // All should have unique IDs
      const sagaIds = results.map((r) => r.sagaId);
      expect(new Set(sagaIds).size).toBe(count);

      // Verify store has all sagas
      expect(store.size).toBe(count);

      // Verify each saga has correct result
      for (let i = 0; i < count; i++) {
        const result = results[i];
        if (result?.success) {
          expect(result.stepResults.get('process')).toEqual({ processedId: i });
        }
      }
    });

    it('handles 50 concurrent sagas with multiple steps', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ id: number }>('multi-step-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, Math.random() * 5));
            return { value: ctx.input.id * 2 };
          },
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const prev = ctx.stepResults.get('step-1') as { value: number };
            await new Promise((r) => setTimeout(r, Math.random() * 5));
            return { value: prev.value + 10 };
          },
        })
        .step({
          name: 'step-3',
          execute: async (ctx) => {
            const prev = ctx.stepResults.get('step-2') as { value: number };
            await new Promise((r) => setTimeout(r, Math.random() * 5));
            return { value: prev.value * 3 };
          },
        });

      const count = 50;
      const promises = Array.from({ length: count }, (_, i) =>
        orchestrator.execute(saga, { id: i })
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Verify calculations are correct for each
      for (let i = 0; i < count; i++) {
        const result = results[i];
        if (result?.success) {
          const expected = (i * 2 + 10) * 3;
          expect(result.result).toEqual({ value: expected });
        }
      }
    });

    it('handles mixed success and failure scenarios concurrently', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const compensated: number[] = [];

      const saga = new Saga<{ id: number; shouldFail: boolean }>('mixed-saga')
        .step({
          name: 'setup',
          execute: async (ctx) => ({ setupId: ctx.input.id }),
          compensate: async (ctx) => {
            compensated.push(ctx.input.id);
          },
        })
        .step({
          name: 'process',
          execute: async (ctx) => {
            if (ctx.input.shouldFail) {
              throw new Error(`Saga ${ctx.input.id} failed`);
            }
            return { processed: true };
          },
        });

      const inputs = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        shouldFail: i % 3 === 0, // Every 3rd saga fails
      }));

      const results = await Promise.all(
        inputs.map((input) => orchestrator.execute(saga, input))
      );

      // Count successes and failures
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // 10 should fail (ids 0, 3, 6, 9, 12, 15, 18, 21, 24, 27)
      expect(failures).toHaveLength(10);
      // 20 should succeed
      expect(successes).toHaveLength(20);

      // All failed sagas should have triggered compensation
      expect(compensated.sort((a, b) => a - b)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27]);
    });
  });

  describe('Rapid sequential execution', () => {
    it('handles rapid sequential saga execution', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ iteration: number }>('rapid-saga')
        .step({
          name: 'quick-step',
          execute: async (ctx) => ({ done: ctx.input.iteration }),
        });

      const count = 200;
      const results: Array<{ success: boolean; sagaId: string }> = [];

      for (let i = 0; i < count; i++) {
        const result = await orchestrator.execute(saga, { iteration: i });
        results.push({ success: result.success, sagaId: result.sagaId });
      }

      expect(results).toHaveLength(count);
      expect(results.every((r) => r.success)).toBe(true);
      expect(new Set(results.map((r) => r.sagaId)).size).toBe(count);
    });
  });

  describe('Memory and state isolation', () => {
    it('maintains isolation between concurrent executions', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const stepResultsCapture: Map<number, Map<string, unknown>> = new Map();

      const saga = new Saga<{ id: number }>('isolation-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            // Add delay to increase chance of race conditions
            await new Promise((r) => setTimeout(r, Math.random() * 20));
            return { data: `data-${ctx.input.id}` };
          },
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, Math.random() * 20));
            // Capture the step results to verify isolation
            stepResultsCapture.set(ctx.input.id, new Map(ctx.stepResults));
            return { final: `final-${ctx.input.id}` };
          },
        });

      const count = 20;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => orchestrator.execute(saga, { id: i }))
      );

      // Verify all succeeded
      expect(results.every((r) => r.success)).toBe(true);

      // Verify each execution had isolated context
      for (let i = 0; i < count; i++) {
        const captured = stepResultsCapture.get(i);
        expect(captured).toBeDefined();
        expect(captured?.get('step-1')).toEqual({ data: `data-${i}` });
      }
    });

    it('events are isolated per execution', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const executedSteps: Array<{ sagaId: string; step: string }> = [];

      orchestrator.on('step:executed', (state, stepName) => {
        executedSteps.push({ sagaId: state.id, step: stepName });
      });

      const saga = new Saga<{ id: number }>('event-isolation-saga')
        .step({
          name: 'step-a',
          execute: async () => ({}),
        })
        .step({
          name: 'step-b',
          execute: async () => ({}),
        });

      const count = 10;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => orchestrator.execute(saga, { id: i }))
      );

      // Should have 2 events per saga (2 steps each)
      expect(executedSteps).toHaveLength(count * 2);

      // Verify each saga has its own events
      for (const result of results) {
        const events = executedSteps.filter((e) => e.sagaId === result.sagaId);
        expect(events).toHaveLength(2);
        expect(events.map((e) => e.step).sort()).toEqual(['step-a', 'step-b']);
      }
    });
  });

  describe('Compensation under load', () => {
    it('handles many concurrent compensation operations', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const compensationCounts = new Map<number, number>();

      const saga = new Saga<{ id: number }>('comp-load-saga')
        .step({
          name: 'step-1',
          execute: async () => ({ done: true }),
          compensate: async (ctx) => {
            const current = compensationCounts.get(ctx.input.id) ?? 0;
            compensationCounts.set(ctx.input.id, current + 1);
            await new Promise((r) => setTimeout(r, Math.random() * 10));
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({ done: true }),
          compensate: async (ctx) => {
            const current = compensationCounts.get(ctx.input.id) ?? 0;
            compensationCounts.set(ctx.input.id, current + 1);
            await new Promise((r) => setTimeout(r, Math.random() * 10));
          },
        })
        .step({
          name: 'failing-step',
          execute: async () => {
            throw new Error('Always fails');
          },
        });

      const count = 30;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => orchestrator.execute(saga, { id: i }))
      );

      // All should fail
      expect(results.every((r) => !r.success)).toBe(true);

      // All should be compensated
      for (const result of results) {
        if (!result.success) {
          expect(result.compensated).toBe(true);
        }
      }

      // Each saga should have 2 compensations (step-1 and step-2)
      for (let i = 0; i < count; i++) {
        expect(compensationCounts.get(i)).toBe(2);
      }
    });
  });

  describe('Store performance', () => {
    it('handles rapid state updates', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ id: number }>('rapid-update-saga');

      // Add many steps to stress state updates
      for (let i = 0; i < 20; i++) {
        saga.step({
          name: `step-${i}`,
          execute: async () => ({ step: i }),
        });
      }

      const count = 10;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => orchestrator.execute(saga, { id: i }))
      );

      expect(results.every((r) => r.success)).toBe(true);

      // Verify final state for each saga
      for (const result of results) {
        const state = await store.get(result.sagaId);
        expect(state?.steps).toHaveLength(20);
        expect(state?.steps.every((s) => s.status === 'executed')).toBe(true);
      }
    });

    it('handles concurrent reads and writes', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ id: number }>('rw-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            // Read state during execution
            const state = await store.get(ctx.sagaId);
            return { readStatus: state?.status };
          },
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const state = await store.get(ctx.sagaId);
            return { stepCount: state?.steps.filter((s) => s.status === 'executed').length };
          },
        });

      const count = 20;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => orchestrator.execute(saga, { id: i }))
      );

      expect(results.every((r) => r.success)).toBe(true);

      // Each read during step-1 should have seen 'running' status
      for (const result of results) {
        if (result.success) {
          expect(result.stepResults.get('step-1')).toEqual({ readStatus: 'running' });
          // step-2 should have seen step-1 as executed
          expect(result.stepResults.get('step-2')).toEqual({ stepCount: 1 });
        }
      }
    });
  });

  describe('Edge cases under load', () => {
    it('handles empty input in many sagas', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('empty-input-saga').step({
        name: 'process',
        execute: async () => ({ done: true }),
      });

      const count = 50;
      const results = await Promise.all(
        Array.from({ length: count }, () => orchestrator.execute(saga, {}))
      );

      expect(results.every((r) => r.success)).toBe(true);
    });

    it('handles large input objects', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      interface LargeInput {
        data: Array<{ id: number; values: number[] }>;
      }

      const saga = new Saga<LargeInput>('large-input-saga').step({
        name: 'process',
        execute: async (ctx) => ({
          count: ctx.input.data.length,
          total: ctx.input.data.reduce((sum, d) => sum + d.values.length, 0),
        }),
      });

      // Create large input with 1000 items, each with 100 values
      const largeInput: LargeInput = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          values: Array.from({ length: 100 }, (_, j) => i * 100 + j),
        })),
      };

      const count = 5;
      const results = await Promise.all(
        Array.from({ length: count }, () => orchestrator.execute(saga, largeInput))
      );

      expect(results.every((r) => r.success)).toBe(true);

      for (const result of results) {
        if (result.success) {
          expect(result.stepResults.get('process')).toEqual({
            count: 1000,
            total: 100000,
          });
        }
      }
    });

    it('handles steps returning large results', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('large-result-saga').step({
        name: 'generate',
        execute: async () => ({
          // Generate array with 10000 items
          items: Array.from({ length: 10000 }, (_, i) => ({
            id: i,
            name: `Item ${i}`,
            data: { nested: { value: i * 2 } },
          })),
        }),
      });

      const count = 5;
      const results = await Promise.all(
        Array.from({ length: count }, () => orchestrator.execute(saga, {}))
      );

      expect(results.every((r) => r.success)).toBe(true);

      for (const result of results) {
        if (result.success) {
          const generated = result.stepResults.get('generate') as { items: unknown[] };
          expect(generated.items).toHaveLength(10000);
        }

        // Verify state was persisted correctly
        const state = await store.get(result.sagaId);
        const storedResult = state?.steps[0]?.result as { items: unknown[] } | undefined;
        expect(storedResult?.items).toHaveLength(10000);
      }
    });
  });
});
