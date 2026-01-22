import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Saga } from './saga.js';
import { SagaOrchestrator } from './orchestrator.js';
import { InMemoryStore } from './stores/memory.js';

describe('SagaOrchestrator', () => {
  let store: InMemoryStore;
  let orchestrator: SagaOrchestrator;

  beforeEach(() => {
    store = new InMemoryStore();
    orchestrator = new SagaOrchestrator({ store });
  });

  describe('execute()', () => {
    it('executes all steps in order', async () => {
      const executionOrder: string[] = [];

      const saga = new Saga<{ value: number }>('test-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            executionOrder.push('step-1');
            return { doubled: ctx.input.value * 2 };
          },
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            executionOrder.push('step-2');
            const prev = ctx.stepResults.get('step-1') as { doubled: number };
            return { tripled: prev.doubled * 3 };
          },
        });

      const result = await orchestrator.execute(saga, { value: 5 });

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual(['step-1', 'step-2']);

      if (result.success) {
        expect(result.result).toEqual({ tripled: 30 });
        expect(result.stepResults.get('step-1')).toEqual({ doubled: 10 });
        expect(result.stepResults.get('step-2')).toEqual({ tripled: 30 });
      }
    });

    it('persists saga state', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({ id: '123' }),
      });

      const result = await orchestrator.execute(saga, {});

      const state = await store.get(result.sagaId);
      expect(state?.status).toBe('completed');
      expect(state?.steps[0]?.status).toBe('executed');
    });

    it('throws if saga has no steps', async () => {
      const saga = new Saga('empty-saga');

      await expect(orchestrator.execute(saga, {})).rejects.toThrow('has no steps defined');
    });

    it('returns sagaId on success', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.sagaId).toBeDefined();
      expect(typeof result.sagaId).toBe('string');
    });
  });

  describe('compensation', () => {
    it('compensates executed steps on failure (reverse order)', async () => {
      const compensationOrder: string[] = [];

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({ id: '1' }),
          compensate: async () => {
            compensationOrder.push('compensate-1');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({ id: '2' }),
          compensate: async () => {
            compensationOrder.push('compensate-2');
          },
        })
        .step({
          name: 'step-3',
          execute: async () => {
            throw new Error('Step 3 failed');
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe('step-3');
        expect(result.compensated).toBe(true);
        expect(compensationOrder).toEqual(['compensate-2', 'compensate-1']);
      }
    });

    it('passes step result to compensate function', async () => {
      let compensateArg: unknown;

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({ bookingId: 'B123' }),
          compensate: async (_, result) => {
            compensateArg = result;
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestrator.execute(saga, {});

      expect(compensateArg).toEqual({ bookingId: 'B123' });
    });

    it('updates state to failed on step failure', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw new Error('Boom');
        },
      });

      const result = await orchestrator.execute(saga, {});

      const state = await store.get(result.sagaId);
      expect(state?.steps[0]?.status).toBe('failed');
      expect(state?.steps[0]?.error).toBe('Boom');
    });

    it('returns compensation errors when compensation fails', async () => {
      const orchestratorContinue = new SagaOrchestrator({
        store,
        onCompensationFailure: 'continue',
      });

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensate 1 failed');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Step 2 failed');
          },
        });

      const result = await orchestratorContinue.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensated).toBe(false);
        expect(result.compensationErrors).toHaveLength(1);
        expect(result.compensationErrors?.[0]?.step).toBe('step-1');
      }
    });

    it('skips steps without compensate function', async () => {
      const compensated: string[] = [];

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            compensated.push('step-1');
          },
        })
        .step({
          name: 'step-2-no-compensate',
          execute: async () => ({}),
          // No compensate function
        })
        .step({
          name: 'step-3',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestrator.execute(saga, {});

      expect(compensated).toEqual(['step-1']);
    });
  });

  describe('events', () => {
    it('emits saga:started event', async () => {
      const listener = vi.fn();
      orchestrator.on('saga:started', listener);

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await orchestrator.execute(saga, { foo: 'bar' });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[0]?.sagaName).toBe('test-saga');
    });

    it('emits step:executed event', async () => {
      const listener = vi.fn();
      orchestrator.on('step:executed', listener);

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({ result: 'ok' }),
      });

      await orchestrator.execute(saga, {});

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[1]).toBe('step-1');
      expect(listener.mock.calls[0]?.[2]).toEqual({ result: 'ok' });
    });

    it('emits step:failed event', async () => {
      const listener = vi.fn();
      orchestrator.on('step:failed', listener);

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw new Error('Boom');
        },
      });

      await orchestrator.execute(saga, {});

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[1]).toBe('step-1');
      expect(listener.mock.calls[0]?.[2]?.message).toBe('Boom');
    });

    it('emits compensation:started event', async () => {
      const listener = vi.fn();
      orchestrator.on('compensation:started', listener);

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestrator.execute(saga, {});

      expect(listener).toHaveBeenCalledOnce();
    });

    it('can remove event listeners with off()', async () => {
      const listener = vi.fn();
      orchestrator.on('saga:started', listener);
      orchestrator.off('saga:started', listener);

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await orchestrator.execute(saga, {});

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('compensation strategies', () => {
    it('halt strategy stops on first compensation failure', async () => {
      const orchestratorHalt = new SagaOrchestrator({
        store: new InMemoryStore(),
        onCompensationFailure: 'halt',
      });

      const compensated: string[] = [];

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            compensated.push('step-1');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensate 2 failed');
          },
        })
        .step({
          name: 'step-3',
          execute: async () => {
            throw new Error('Step 3 failed');
          },
        });

      await orchestratorHalt.execute(saga, {});

      // Step 1 compensation should not have run (halt after step 2 compensation failure)
      expect(compensated).toEqual([]);
    });

    it('continue strategy proceeds despite compensation failure', async () => {
      const orchestratorContinue = new SagaOrchestrator({
        store: new InMemoryStore(),
        onCompensationFailure: 'continue',
      });

      const compensated: string[] = [];

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            compensated.push('step-1');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensate 2 failed');
          },
        })
        .step({
          name: 'step-3',
          execute: async () => {
            throw new Error('Step 3 failed');
          },
        });

      await orchestratorContinue.execute(saga, {});

      // Step 1 compensation should have run despite step 2 compensation failure
      expect(compensated).toEqual(['step-1']);
    });

    it('retry strategy retries failed compensation', async () => {
      let attempts = 0;

      const orchestratorRetry = new SagaOrchestrator({
        store: new InMemoryStore(),
        onCompensationFailure: 'retry',
        compensationRetries: 3,
        compensationRetryDelay: 10, // Short delay for tests
      });

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error('Temporary failure');
            }
            // Succeeds on 3rd attempt
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Step 2 failed');
          },
        });

      const result = await orchestratorRetry.execute(saga, {});

      expect(attempts).toBe(3);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensated).toBe(true);
      }
    });

    it('retry strategy gives up after max retries', async () => {
      let attempts = 0;

      const orchestratorRetry = new SagaOrchestrator({
        store: new InMemoryStore(),
        onCompensationFailure: 'retry',
        compensationRetries: 2,
        compensationRetryDelay: 10,
      });

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            attempts++;
            throw new Error('Permanent failure');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Step 2 failed');
          },
        });

      const result = await orchestratorRetry.execute(saga, {});

      expect(attempts).toBe(2);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensated).toBe(false);
        expect(result.compensationErrors).toHaveLength(1);
      }
    });
  });

  describe('context sharing', () => {
    it('shares stepResults between steps', async () => {
      const saga = new Saga<{ initial: number }>('test-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => ({ value: ctx.input.initial * 2 }),
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const step1Result = ctx.stepResults.get('step-1') as { value: number };
            return { value: step1Result.value + 10 };
          },
        })
        .step({
          name: 'step-3',
          execute: async (ctx) => {
            const step1Result = ctx.stepResults.get('step-1') as { value: number };
            const step2Result = ctx.stepResults.get('step-2') as { value: number };
            return { total: step1Result.value + step2Result.value };
          },
        });

      const result = await orchestrator.execute(saga, { initial: 5 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('step-1')).toEqual({ value: 10 });
        expect(result.stepResults.get('step-2')).toEqual({ value: 20 });
        expect(result.stepResults.get('step-3')).toEqual({ total: 30 });
      }
    });

    it('provides sagaId in context', async () => {
      let capturedSagaId: string | undefined;

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async (ctx) => {
          capturedSagaId = ctx.sagaId;
          return {};
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(capturedSagaId).toBe(result.sagaId);
    });

    it('provides input in context', async () => {
      let capturedInput: unknown;

      const saga = new Saga<{ test: string }>('test-saga').step({
        name: 'step-1',
        execute: async (ctx) => {
          capturedInput = ctx.input;
          return {};
        },
      });

      await orchestrator.execute(saga, { test: 'hello' });

      expect(capturedInput).toEqual({ test: 'hello' });
    });

    it('provides context to compensate function', async () => {
      let compensateContext: { sagaId?: string; input?: unknown } = {};

      const saga = new Saga<{ data: string }>('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({ id: '123' }),
          compensate: async (ctx) => {
            compensateContext = { sagaId: ctx.sagaId, input: ctx.input };
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      const result = await orchestrator.execute(saga, { data: 'test' });

      expect(compensateContext.sagaId).toBe(result.sagaId);
      expect(compensateContext.input).toEqual({ data: 'test' });
    });
  });

  describe('error handling', () => {
    it('handles non-Error throws in execute', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw 'string error';
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('string error');
      }
    });

    it('handles non-Error throws in compensate', async () => {
      const orchestratorContinue = new SagaOrchestrator({
        store: new InMemoryStore(),
        onCompensationFailure: 'continue',
      });

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            throw 'string compensation error';
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Step 2 failed');
          },
        });

      const result = await orchestratorContinue.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensationErrors?.[0]?.error.message).toBe('string compensation error');
      }
    });

    it('handles null throws', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw null;
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('null');
      }
    });

    it('handles undefined throws', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw undefined;
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('undefined');
      }
    });

    it('stores error message in step state', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw new Error('Detailed error message');
        },
      });

      const result = await orchestrator.execute(saga, {});
      const state = await store.get(result.sagaId);

      expect(state?.steps[0]?.error).toBe('Detailed error message');
    });
  });

  describe('state persistence', () => {
    it('stores saga state with correct structure', async () => {
      const saga = new Saga('test-saga')
        .step({ name: 'step-1', execute: async () => ({ a: 1 }) })
        .step({ name: 'step-2', execute: async () => ({ b: 2 }) });

      const result = await orchestrator.execute(saga, { input: 'data' });
      const state = await store.get(result.sagaId);

      expect(state).toBeDefined();
      expect(state?.id).toBe(result.sagaId);
      expect(state?.sagaName).toBe('test-saga');
      expect(state?.status).toBe('completed');
      expect(state?.input).toEqual({ input: 'data' });
      expect(state?.steps).toHaveLength(2);
      expect(state?.startedAt).toBeInstanceOf(Date);
      expect(state?.completedAt).toBeInstanceOf(Date);
    });

    it('stores step results in state', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({ result: 'value', nested: { data: [1, 2, 3] } }),
      });

      const result = await orchestrator.execute(saga, {});
      const state = await store.get(result.sagaId);

      expect(state?.steps[0]?.result).toEqual({
        result: 'value',
        nested: { data: [1, 2, 3] },
      });
    });

    it('stores executedAt timestamp for each step', async () => {
      const saga = new Saga('test-saga')
        .step({ name: 'step-1', execute: async () => ({}) })
        .step({ name: 'step-2', execute: async () => ({}) });

      const result = await orchestrator.execute(saga, {});
      const state = await store.get(result.sagaId);

      expect(state?.steps[0]?.executedAt).toBeInstanceOf(Date);
      expect(state?.steps[1]?.executedAt).toBeInstanceOf(Date);
    });

    it('stores compensatedAt timestamp for compensated steps', async () => {
      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      const result = await orchestrator.execute(saga, {});
      const state = await store.get(result.sagaId);

      expect(state?.steps[0]?.compensatedAt).toBeInstanceOf(Date);
    });

    it('tracks compensating status during compensation', async () => {
      let statusDuringCompensation: string | undefined;

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async (ctx) => {
            const state = await store.get(ctx.sagaId);
            statusDuringCompensation = state?.status;
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestrator.execute(saga, {});

      expect(statusDuringCompensation).toBe('compensating');
    });
  });

  describe('edge cases', () => {
    it('handles saga with single step that succeeds', async () => {
      const saga = new Saga('single-step').step({
        name: 'only-step',
        execute: async () => ({ done: true }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({ done: true });
      }
    });

    it('handles saga with single step that fails', async () => {
      const saga = new Saga('single-step').step({
        name: 'only-step',
        execute: async () => {
          throw new Error('Single step failed');
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe('only-step');
        expect(result.compensated).toBe(true); // No compensation needed
      }
    });

    it('handles first step failure (no compensation needed)', async () => {
      const compensated: string[] = [];

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => {
            throw new Error('First step failed');
          },
          compensate: async () => {
            compensated.push('step-1');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      expect(compensated).toEqual([]); // No compensation for first step failure
    });

    it('handles async step execution', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const saga = new Saga('async-saga')
        .step({
          name: 'step-1',
          execute: async () => {
            await delay(10);
            return { step: 1 };
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            await delay(10);
            return { step: 2 };
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });

    it('handles steps returning undefined', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => undefined as unknown as object,
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeUndefined();
      }
    });

    it('handles steps returning null', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => null as unknown as object,
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBeNull();
      }
    });

    it('handles complex input types', async () => {
      interface ComplexInput {
        users: Array<{ id: number; name: string }>;
        config: { nested: { deep: { value: string } } };
        date: Date;
      }

      let capturedInput: ComplexInput | undefined;

      const saga = new Saga<ComplexInput>('complex-saga').step({
        name: 'step-1',
        execute: async (ctx) => {
          capturedInput = ctx.input;
          return { processed: true };
        },
      });

      const input: ComplexInput = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        config: { nested: { deep: { value: 'test' } } },
        date: new Date('2024-01-01'),
      };

      await orchestrator.execute(saga, input);

      expect(capturedInput).toEqual(input);
    });
  });

  describe('multiple saga executions', () => {
    it('each execution gets unique sagaId', async () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      const result1 = await orchestrator.execute(saga, {});
      const result2 = await orchestrator.execute(saga, {});
      const result3 = await orchestrator.execute(saga, {});

      expect(result1.sagaId).not.toBe(result2.sagaId);
      expect(result2.sagaId).not.toBe(result3.sagaId);
      expect(result1.sagaId).not.toBe(result3.sagaId);
    });

    it('concurrent executions do not interfere', async () => {
      const saga = new Saga<{ id: number }>('test-saga').step({
        name: 'step-1',
        execute: async (ctx) => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          return { inputId: ctx.input.id };
        },
      });

      const results = await Promise.all([
        orchestrator.execute(saga, { id: 1 }),
        orchestrator.execute(saga, { id: 2 }),
        orchestrator.execute(saga, { id: 3 }),
        orchestrator.execute(saga, { id: 4 }),
        orchestrator.execute(saga, { id: 5 }),
      ]);

      for (let i = 0; i < 5; i++) {
        const result = results[i];
        expect(result?.success).toBe(true);
        if (result?.success) {
          expect(result.stepResults.get('step-1')).toEqual({ inputId: i + 1 });
        }
      }
    });
  });

  describe('more event tests', () => {
    it('emits step:executing before step runs', async () => {
      const events: string[] = [];

      orchestrator.on('step:executing', (_, stepName) => {
        events.push(`executing:${stepName}`);
      });

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => {
            events.push('running:step-1');
            return {};
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            events.push('running:step-2');
            return {};
          },
        });

      await orchestrator.execute(saga, {});

      expect(events).toEqual([
        'executing:step-1',
        'running:step-1',
        'executing:step-2',
        'running:step-2',
      ]);
    });

    it('emits compensation:step for each compensated step', async () => {
      const compensationSteps: string[] = [];

      orchestrator.on('compensation:step', (_, stepName) => {
        compensationSteps.push(stepName);
      });

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
          compensate: async () => {},
        })
        .step({
          name: 'step-3',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestrator.execute(saga, {});

      expect(compensationSteps).toEqual(['step-2', 'step-1']);
    });

    it('emits saga:failed when saga fails', async () => {
      const listener = vi.fn();
      orchestrator.on('saga:failed', listener);

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => {
          throw new Error('Test error');
        },
      });

      await orchestrator.execute(saga, {});

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[1]?.message).toBe('Test error');
    });

    it('emits compensation:completed when compensation succeeds', async () => {
      const listener = vi.fn();
      orchestrator.on('compensation:completed', listener);

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestrator.execute(saga, {});

      expect(listener).toHaveBeenCalledOnce();
    });

    it('does not emit compensation:completed when compensation fails', async () => {
      const listener = vi.fn();
      const orchestratorContinue = new SagaOrchestrator({
        store: new InMemoryStore(),
        onCompensationFailure: 'continue',
      });
      orchestratorContinue.on('compensation:completed', listener);

      const saga = new Saga('test-saga')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensation failed');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Failed');
          },
        });

      await orchestratorContinue.execute(saga, {});

      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores errors in event listeners', async () => {
      orchestrator.on('saga:started', () => {
        throw new Error('Listener error');
      });

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({ success: true }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });

    it('supports multiple listeners for same event', async () => {
      const calls: number[] = [];

      orchestrator.on('saga:started', () => calls.push(1));
      orchestrator.on('saga:started', () => calls.push(2));
      orchestrator.on('saga:started', () => calls.push(3));

      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await orchestrator.execute(saga, {});

      expect(calls).toEqual([1, 2, 3]);
    });
  });
});
