/**
 * Tests for saga recovery functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Saga, SagaOrchestrator, InMemoryStore } from './index.js';
import type { SagaState } from './types.js';

describe('Recovery Tests', () => {
  let store: InMemoryStore;
  let orchestrator: SagaOrchestrator;

  beforeEach(() => {
    store = new InMemoryStore();
    orchestrator = new SagaOrchestrator({ store });
  });

  describe('recover()', () => {
    it('marks running sagas as failed on recovery', async () => {
      // Manually create a "crashed" saga state
      const crashedState: SagaState = {
        id: 'crashed-saga-1',
        sagaName: 'test-saga',
        status: 'running',
        input: { data: 'test' },
        steps: [
          { name: 'step-1', status: 'executed', result: { a: 1 }, executedAt: new Date() },
          { name: 'step-2', status: 'pending' },
        ],
        startedAt: new Date(),
      };

      await store.create(crashedState);

      // Recover
      await orchestrator.recover();

      // Verify state was updated
      const state = await store.get('crashed-saga-1');
      expect(state?.status).toBe('failed');
      expect(state?.completedAt).toBeInstanceOf(Date);
    });

    it('marks compensating sagas as failed on recovery', async () => {
      const compensatingState: SagaState = {
        id: 'compensating-saga-1',
        sagaName: 'test-saga',
        status: 'compensating',
        input: {},
        steps: [
          { name: 'step-1', status: 'executed', result: {}, executedAt: new Date() },
          { name: 'step-2', status: 'compensated', compensatedAt: new Date() },
          { name: 'step-3', status: 'failed', error: 'Original failure' },
        ],
        startedAt: new Date(),
      };

      await store.create(compensatingState);

      await orchestrator.recover();

      const state = await store.get('compensating-saga-1');
      expect(state?.status).toBe('failed');
    });

    it('does not affect completed sagas', async () => {
      const completedState: SagaState = {
        id: 'completed-saga-1',
        sagaName: 'test-saga',
        status: 'completed',
        input: {},
        steps: [
          { name: 'step-1', status: 'executed', result: {}, executedAt: new Date() },
        ],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      await store.create(completedState);

      await orchestrator.recover();

      const state = await store.get('completed-saga-1');
      expect(state?.status).toBe('completed');
    });

    it('does not affect already failed sagas', async () => {
      const failedState: SagaState = {
        id: 'failed-saga-1',
        sagaName: 'test-saga',
        status: 'failed',
        input: {},
        steps: [
          { name: 'step-1', status: 'failed', error: 'Failed' },
        ],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      await store.create(failedState);

      await orchestrator.recover();

      const state = await store.get('failed-saga-1');
      expect(state?.status).toBe('failed');
    });

    it('recovers multiple pending sagas', async () => {
      const saga1: SagaState = {
        id: 'saga-1',
        sagaName: 'test-saga',
        status: 'running',
        input: {},
        steps: [{ name: 'step-1', status: 'executed', result: {} }],
        startedAt: new Date(),
      };

      const saga2: SagaState = {
        id: 'saga-2',
        sagaName: 'test-saga',
        status: 'compensating',
        input: {},
        steps: [{ name: 'step-1', status: 'executed', result: {} }],
        startedAt: new Date(),
      };

      const saga3: SagaState = {
        id: 'saga-3',
        sagaName: 'test-saga',
        status: 'running',
        input: {},
        steps: [{ name: 'step-1', status: 'pending' }],
        startedAt: new Date(),
      };

      await store.create(saga1);
      await store.create(saga2);
      await store.create(saga3);

      await orchestrator.recover();

      expect((await store.get('saga-1'))?.status).toBe('failed');
      expect((await store.get('saga-2'))?.status).toBe('failed');
      expect((await store.get('saga-3'))?.status).toBe('failed');
    });

    it('handles empty store gracefully', async () => {
      // No sagas in store
      await expect(orchestrator.recover()).resolves.not.toThrow();
    });

    it('handles store with only completed/failed sagas', async () => {
      const completed: SagaState = {
        id: 'completed-1',
        sagaName: 'test-saga',
        status: 'completed',
        input: {},
        steps: [],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      const failed: SagaState = {
        id: 'failed-1',
        sagaName: 'test-saga',
        status: 'failed',
        input: {},
        steps: [],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      await store.create(completed);
      await store.create(failed);

      // Should not throw and should not modify existing states
      await expect(orchestrator.recover()).resolves.not.toThrow();

      expect((await store.get('completed-1'))?.status).toBe('completed');
      expect((await store.get('failed-1'))?.status).toBe('failed');
    });
  });

  describe('getPendingSagas()', () => {
    it('returns only running and compensating sagas', async () => {
      const states: SagaState[] = [
        {
          id: 'running-1',
          sagaName: 'saga',
          status: 'running',
          input: {},
          steps: [],
          startedAt: new Date(),
        },
        {
          id: 'compensating-1',
          sagaName: 'saga',
          status: 'compensating',
          input: {},
          steps: [],
          startedAt: new Date(),
        },
        {
          id: 'completed-1',
          sagaName: 'saga',
          status: 'completed',
          input: {},
          steps: [],
          startedAt: new Date(),
        },
        {
          id: 'failed-1',
          sagaName: 'saga',
          status: 'failed',
          input: {},
          steps: [],
          startedAt: new Date(),
        },
      ];

      for (const state of states) {
        await store.create(state);
      }

      const pending = await store.getPendingSagas();

      expect(pending).toHaveLength(2);
      expect(pending.map((s) => s.id).sort()).toEqual(['compensating-1', 'running-1']);
    });
  });

  describe('Simulated crash recovery', () => {
    it('simulates process crash mid-execution and recovery', async () => {
      // Start a saga that will "crash" (we'll simulate by manually creating state)
      const crashedMidExecution: SagaState = {
        id: 'crash-mid-exec',
        sagaName: 'payment-saga',
        status: 'running',
        input: { amount: 100, userId: 'user-123' },
        steps: [
          {
            name: 'debit-account',
            status: 'executed',
            result: { transactionId: 'TXN-001' },
            executedAt: new Date(),
          },
          {
            name: 'credit-merchant',
            status: 'pending',
          },
          {
            name: 'send-receipt',
            status: 'pending',
          },
        ],
        startedAt: new Date(Date.now() - 60000), // Started 1 minute ago
      };

      await store.create(crashedMidExecution);

      // New orchestrator instance (simulating process restart)
      const newOrchestrator = new SagaOrchestrator({ store });

      // Recover pending sagas
      await newOrchestrator.recover();

      // Verify the saga is now marked as failed
      const state = await store.get('crash-mid-exec');
      expect(state?.status).toBe('failed');

      // The debit-account step should still show as executed
      // (in a real system, this would need manual reconciliation)
      expect(state?.steps[0]?.status).toBe('executed');
    });

    it('simulates crash during compensation', async () => {
      const crashedDuringCompensation: SagaState = {
        id: 'crash-during-comp',
        sagaName: 'order-saga',
        status: 'compensating',
        input: { orderId: 'ORD-123' },
        steps: [
          {
            name: 'reserve-inventory',
            status: 'compensated',
            result: { items: ['SKU-1', 'SKU-2'] },
            executedAt: new Date(),
            compensatedAt: new Date(),
          },
          {
            name: 'charge-payment',
            status: 'executed', // Not yet compensated when crash occurred
            result: { chargeId: 'CHG-001' },
            executedAt: new Date(),
          },
          {
            name: 'create-shipment',
            status: 'failed',
            error: 'Shipping API unavailable',
          },
        ],
        startedAt: new Date(Date.now() - 120000),
      };

      await store.create(crashedDuringCompensation);

      const newOrchestrator = new SagaOrchestrator({ store });
      await newOrchestrator.recover();

      const state = await store.get('crash-during-comp');
      expect(state?.status).toBe('failed');

      // Note: charge-payment remains in 'executed' state
      // This represents a potential inconsistency that would need
      // manual reconciliation in a production system
      expect(state?.steps[1]?.status).toBe('executed');
    });
  });

  describe('State consistency after operations', () => {
    it('maintains consistent state through full lifecycle', async () => {
      const saga = new Saga<{ value: number }>('lifecycle-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => ({ doubled: ctx.input.value * 2 }),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const prev = ctx.stepResults.get('step-1') as { doubled: number };
            return { tripled: prev.doubled * 3 };
          },
          compensate: async () => {},
        });

      const result = await orchestrator.execute(saga, { value: 5 });

      const state = await store.get(result.sagaId);

      // Verify complete state structure
      expect(state).toBeDefined();
      expect(state?.id).toBe(result.sagaId);
      expect(state?.sagaName).toBe('lifecycle-saga');
      expect(state?.status).toBe('completed');
      expect(state?.input).toEqual({ value: 5 });

      // Verify step states
      expect(state?.steps).toHaveLength(2);
      expect(state?.steps[0]?.name).toBe('step-1');
      expect(state?.steps[0]?.status).toBe('executed');
      expect(state?.steps[0]?.result).toEqual({ doubled: 10 });
      expect(state?.steps[0]?.executedAt).toBeInstanceOf(Date);

      expect(state?.steps[1]?.name).toBe('step-2');
      expect(state?.steps[1]?.status).toBe('executed');
      expect(state?.steps[1]?.result).toEqual({ tripled: 30 });
      expect(state?.steps[1]?.executedAt).toBeInstanceOf(Date);

      // Verify timestamps
      expect(state?.startedAt).toBeInstanceOf(Date);
      expect(state?.completedAt).toBeInstanceOf(Date);
      expect(state?.completedAt!.getTime()).toBeGreaterThanOrEqual(state?.startedAt.getTime() ?? 0);
    });

    it('maintains consistent state after failure and compensation', async () => {
      const saga = new Saga('fail-lifecycle')
        .step({
          name: 'step-1',
          execute: async () => ({ result: 'a' }),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async () => ({ result: 'b' }),
          compensate: async () => {},
        })
        .step({
          name: 'step-3',
          execute: async () => {
            throw new Error('Intentional failure');
          },
        });

      const result = await orchestrator.execute(saga, {});

      const state = await store.get(result.sagaId);

      expect(state?.status).toBe('completed'); // Compensation completed
      expect(state?.steps[0]?.status).toBe('compensated');
      expect(state?.steps[0]?.compensatedAt).toBeInstanceOf(Date);
      expect(state?.steps[1]?.status).toBe('compensated');
      expect(state?.steps[1]?.compensatedAt).toBeInstanceOf(Date);
      expect(state?.steps[2]?.status).toBe('failed');
      expect(state?.steps[2]?.error).toBe('Intentional failure');
    });
  });
});
