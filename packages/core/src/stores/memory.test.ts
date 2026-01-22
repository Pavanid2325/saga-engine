import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from './memory.js';
import type { SagaState } from '../types.js';

describe('InMemoryStore', () => {
  let store: InMemoryStore;

  const createTestState = (overrides?: Partial<SagaState>): SagaState => ({
    id: 'saga-123',
    sagaName: 'test-saga',
    status: 'running',
    input: { foo: 'bar' },
    steps: [
      { name: 'step-1', status: 'pending' },
      { name: 'step-2', status: 'pending' },
    ],
    startedAt: new Date('2024-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe('create()', () => {
    it('stores a new saga state', async () => {
      const state = createTestState();
      await store.create(state);

      const retrieved = await store.get('saga-123');
      expect(retrieved).toEqual(state);
    });

    it('throws if saga already exists', async () => {
      const state = createTestState();
      await store.create(state);

      await expect(store.create(state)).rejects.toThrow('already exists');
    });

    it('stores a deep copy (original mutation does not affect store)', async () => {
      const state = createTestState();
      await store.create(state);

      state.status = 'completed';
      state.steps[0]!.status = 'executed';

      const retrieved = await store.get('saga-123');
      expect(retrieved?.status).toBe('running');
      expect(retrieved?.steps[0]?.status).toBe('pending');
    });
  });

  describe('get()', () => {
    it('returns undefined for non-existent saga', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('returns a deep copy (retrieved mutation does not affect store)', async () => {
      await store.create(createTestState());

      const retrieved1 = await store.get('saga-123');
      retrieved1!.status = 'completed';

      const retrieved2 = await store.get('saga-123');
      expect(retrieved2?.status).toBe('running');
    });
  });

  describe('updateStatus()', () => {
    it('updates saga status', async () => {
      await store.create(createTestState());
      await store.updateStatus('saga-123', 'completed');

      const retrieved = await store.get('saga-123');
      expect(retrieved?.status).toBe('completed');
    });

    it('updates saga status with completedAt', async () => {
      await store.create(createTestState());
      const completedAt = new Date();
      await store.updateStatus('saga-123', 'completed', completedAt);

      const retrieved = await store.get('saga-123');
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.completedAt).toEqual(completedAt);
    });

    it('throws if saga not found', async () => {
      await expect(store.updateStatus('non-existent', 'completed')).rejects.toThrow('not found');
    });
  });

  describe('updateStep()', () => {
    it('updates step state', async () => {
      await store.create(createTestState());
      await store.updateStep('saga-123', 'step-1', {
        status: 'executed',
        result: { id: 'result-1' },
        executedAt: new Date(),
      });

      const retrieved = await store.get('saga-123');
      expect(retrieved?.steps[0]?.status).toBe('executed');
      expect(retrieved?.steps[0]?.result).toEqual({ id: 'result-1' });
    });

    it('throws if saga not found', async () => {
      await expect(
        store.updateStep('non-existent', 'step-1', { status: 'executed' })
      ).rejects.toThrow('Saga with ID "non-existent" not found');
    });

    it('throws if step not found', async () => {
      await store.create(createTestState());
      await expect(
        store.updateStep('saga-123', 'non-existent', { status: 'executed' })
      ).rejects.toThrow('Step "non-existent" not found');
    });
  });

  describe('getPendingSagas()', () => {
    it('returns empty array when no sagas', async () => {
      const result = await store.getPendingSagas();
      expect(result).toEqual([]);
    });

    it('returns running sagas', async () => {
      await store.create(createTestState({ id: 'saga-1', status: 'running' }));
      await store.create(createTestState({ id: 'saga-2', status: 'completed' }));
      await store.create(createTestState({ id: 'saga-3', status: 'running' }));

      const pending = await store.getPendingSagas();
      expect(pending).toHaveLength(2);
      expect(pending.map((s) => s.id).sort()).toEqual(['saga-1', 'saga-3']);
    });

    it('returns compensating sagas', async () => {
      await store.create(createTestState({ id: 'saga-1', status: 'compensating' }));
      await store.create(createTestState({ id: 'saga-2', status: 'failed' }));

      const pending = await store.getPendingSagas();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe('saga-1');
    });
  });

  describe('delete()', () => {
    it('removes a saga', async () => {
      await store.create(createTestState());
      await store.delete('saga-123');

      const retrieved = await store.get('saga-123');
      expect(retrieved).toBeUndefined();
    });

    it('does not throw for non-existent saga', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear()', () => {
    it('removes all sagas', async () => {
      await store.create(createTestState({ id: 'saga-1' }));
      await store.create(createTestState({ id: 'saga-2' }));
      await store.clear();

      expect(store.size).toBe(0);
    });
  });

  describe('size', () => {
    it('returns the number of stored sagas', async () => {
      expect(store.size).toBe(0);

      await store.create(createTestState({ id: 'saga-1' }));
      expect(store.size).toBe(1);

      await store.create(createTestState({ id: 'saga-2' }));
      expect(store.size).toBe(2);
    });
  });
});
