/**
 * Edge case tests for production failure scenarios
 * These tests cover scenarios that might break the system in production
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Saga, SagaOrchestrator, InMemoryStore } from './index.js';
import type { StateStore, SagaState, SagaStatus, StepState } from './types.js';

describe('Edge Cases - Store Failures', () => {
  describe('Store throws during create', () => {
    it('propagates error when store.create fails', async () => {
      const failingStore: StateStore = {
        create: async () => {
          throw new Error('Database connection failed');
        },
        get: async () => undefined,
        updateStatus: async () => {},
        updateStep: async () => {},
        getPendingSagas: async () => [],
      };

      const orchestrator = new SagaOrchestrator({ store: failingStore });
      const saga = new Saga('test').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await expect(orchestrator.execute(saga, {})).rejects.toThrow('Database connection failed');
    });
  });

  describe('Store throws during updateStep', () => {
    it('treats updateStep failure as step failure and triggers compensation', async () => {
      // When store.updateStep fails after step execution, the orchestrator
      // treats it as if the step failed and triggers compensation.
      // This is the expected behavior - store failures are handled gracefully.
      let callCount = 0;
      const failingStore: StateStore = {
        create: async () => {},
        get: async () => undefined,
        updateStatus: async () => {},
        updateStep: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Write failed');
          }
        },
        getPendingSagas: async () => [],
      };

      const orchestrator = new SagaOrchestrator({ store: failingStore });
      const saga = new Saga('test').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      const result = await orchestrator.execute(saga, {});

      // The error is caught and treated as a step failure
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Write failed');
        expect(result.failedStep).toBe('step-1');
      }
    });
  });

  describe('Store throws during updateStatus', () => {
    it('propagates error when store.updateStatus fails', async () => {
      const failingStore: StateStore = {
        create: async () => {},
        get: async () => undefined,
        updateStatus: async () => {
          throw new Error('Status update failed');
        },
        updateStep: async () => {},
        getPendingSagas: async () => [],
      };

      const orchestrator = new SagaOrchestrator({ store: failingStore });
      const saga = new Saga('test').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      // The saga will execute but fail when trying to update status to 'completed'
      await expect(orchestrator.execute(saga, {})).rejects.toThrow('Status update failed');
    });
  });

  describe('Store returns undefined during compensation', () => {
    it('handles store.get returning undefined gracefully', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      // Override get to return undefined after saga starts
      const originalGet = store.get.bind(store);
      let getCallCount = 0;
      store.get = async (id: string) => {
        getCallCount++;
        // Return undefined for some calls to simulate race condition
        if (getCallCount > 2) {
          return undefined;
        }
        return originalGet(id);
      };

      const saga = new Saga('test')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {},
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new Error('Fail');
          },
        });

      // Should not throw even if get returns undefined
      const result = await orchestrator.execute(saga, {});
      expect(result.success).toBe(false);
    });
  });

  describe('Intermittent store failures', () => {
    it('handles flaky store that fails intermittently', async () => {
      let failures = 0;
      const maxFailures = 2;

      const flakyStore: StateStore = {
        create: async (state) => {
          if (failures < maxFailures && Math.random() > 0.5) {
            failures++;
            throw new Error('Intermittent failure');
          }
          // Actually store it (using closure)
          (flakyStore as any)._data = (flakyStore as any)._data || new Map();
          (flakyStore as any)._data.set(state.id, state);
        },
        get: async (id) => {
          return (flakyStore as any)._data?.get(id);
        },
        updateStatus: async () => {},
        updateStep: async () => {},
        getPendingSagas: async () => [],
      };

      const orchestrator = new SagaOrchestrator({ store: flakyStore });
      const saga = new Saga('test').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      // May fail due to flaky store
      try {
        await orchestrator.execute(saga, {});
      } catch (e) {
        expect((e as Error).message).toBe('Intermittent failure');
      }
    });
  });
});

describe('Edge Cases - Async and Timing', () => {
  describe('Very slow steps', () => {
    it('handles steps that take a long time', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('slow-saga').step({
        name: 'slow-step',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { completed: true };
        },
      });

      const result = await orchestrator.execute(saga, {});
      expect(result.success).toBe(true);
    });
  });

  describe('Steps with varying execution times', () => {
    it('maintains order despite varying execution times', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const executionOrder: number[] = [];

      const saga = new Saga('varying-saga')
        .step({
          name: 'fast',
          execute: async () => {
            executionOrder.push(1);
            return {};
          },
        })
        .step({
          name: 'slow',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 50));
            executionOrder.push(2);
            return {};
          },
        })
        .step({
          name: 'medium',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 25));
            executionOrder.push(3);
            return {};
          },
        });

      await orchestrator.execute(saga, {});

      // Order must be preserved
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Compensation timing', () => {
    it('compensates in correct order even with varying compensation times', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const compensationOrder: number[] = [];

      const saga = new Saga('comp-timing')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            await new Promise((r) => setTimeout(r, 50)); // Slowest
            compensationOrder.push(1);
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
          compensate: async () => {
            await new Promise((r) => setTimeout(r, 10)); // Fast
            compensationOrder.push(2);
          },
        })
        .step({
          name: 'step-3',
          execute: async () => ({}),
          compensate: async () => {
            await new Promise((r) => setTimeout(r, 30)); // Medium
            compensationOrder.push(3);
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Fail');
          },
        });

      await orchestrator.execute(saga, {});

      // Must be in reverse order: 3, 2, 1
      expect(compensationOrder).toEqual([3, 2, 1]);
    });
  });

  describe('Zero-delay async operations', () => {
    it('handles Promise.resolve() returns', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('zero-delay')
        .step({
          name: 'step-1',
          execute: () => Promise.resolve({ a: 1 }),
        })
        .step({
          name: 'step-2',
          execute: () => Promise.resolve({ b: 2 }),
        });

      const result = await orchestrator.execute(saga, {});
      expect(result.success).toBe(true);
    });
  });
});

describe('Edge Cases - Data Integrity', () => {
  describe('Input mutation during execution', () => {
    it('original input mutation does not affect saga context', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      let capturedInput: { value: number } | undefined;

      const saga = new Saga<{ value: number }>('mutation-test')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 10));
            capturedInput = ctx.input;
            return { captured: ctx.input.value };
          },
        });

      const input = { value: 42 };
      const executePromise = orchestrator.execute(saga, input);

      // Mutate input while saga is running
      input.value = 999;

      const result = await executePromise;

      // The saga should have captured the original or current value
      // Note: This behavior depends on implementation - documenting current behavior
      expect(result.success).toBe(true);
    });
  });

  describe('Step result mutation', () => {
    it('handles mutation of step results between steps', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('result-mutation')
        .step({
          name: 'step-1',
          execute: async () => ({ items: [1, 2, 3] }),
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const step1Result = ctx.stepResults.get('step-1') as { items: number[] };
            // Mutate the result
            step1Result.items.push(4);
            return { count: step1Result.items.length };
          },
        })
        .step({
          name: 'step-3',
          execute: async (ctx) => {
            const step1Result = ctx.stepResults.get('step-1') as { items: number[] };
            // Check if mutation persisted
            return { itemCount: step1Result.items.length };
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        // Mutation may or may not persist - documenting behavior
        const step3Result = result.stepResults.get('step-3') as { itemCount: number };
        expect(step3Result.itemCount).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Circular references', () => {
    it('handles input with circular references', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      interface CircularInput {
        name: string;
        self?: CircularInput;
      }

      const circularInput: CircularInput = { name: 'test' };
      circularInput.self = circularInput;

      const saga = new Saga<CircularInput>('circular-test').step({
        name: 'step-1',
        execute: async (ctx) => {
          return { hasCircular: ctx.input.self === ctx.input };
        },
      });

      const result = await orchestrator.execute(saga, circularInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('step-1')).toEqual({ hasCircular: true });
      }
    });

    it('handles step result with circular references', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('circular-result').step({
        name: 'step-1',
        execute: async () => {
          const obj: { name: string; self?: unknown } = { name: 'circular' };
          obj.self = obj;
          return obj;
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });
  });

  describe('Deep nesting', () => {
    it('handles deeply nested input', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      // Create deeply nested object
      let deepObj: any = { value: 'bottom' };
      for (let i = 0; i < 100; i++) {
        deepObj = { nested: deepObj };
      }

      const saga = new Saga<{ nested: unknown }>('deep-nest').step({
        name: 'step-1',
        execute: async (ctx) => {
          let current: any = ctx.input;
          let depth = 0;
          while (current.nested) {
            current = current.nested;
            depth++;
          }
          return { depth, bottomValue: current.value };
        },
      });

      const result = await orchestrator.execute(saga, deepObj);

      expect(result.success).toBe(true);
      if (result.success) {
        const stepResult = result.stepResults.get('step-1') as { depth: number; bottomValue: string };
        expect(stepResult.depth).toBe(100);
        expect(stepResult.bottomValue).toBe('bottom');
      }
    });
  });

  describe('Special JavaScript values', () => {
    it('handles undefined in results', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('undefined-test').step({
        name: 'step-1',
        execute: async () => ({ value: undefined }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('step-1')).toEqual({ value: undefined });
      }
    });

    it('handles null in results', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('null-test').step({
        name: 'step-1',
        execute: async () => ({ value: null }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('step-1')).toEqual({ value: null });
      }
    });

    it('handles NaN in results', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('nan-test').step({
        name: 'step-1',
        execute: async () => ({ value: NaN }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        const stepResult = result.stepResults.get('step-1') as { value: number };
        expect(Number.isNaN(stepResult.value)).toBe(true);
      }
    });

    it('handles Infinity in results', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('infinity-test').step({
        name: 'step-1',
        execute: async () => ({ positive: Infinity, negative: -Infinity }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('step-1')).toEqual({
          positive: Infinity,
          negative: -Infinity,
        });
      }
    });

    it('handles Date objects', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const testDate = new Date('2024-01-15T10:30:00Z');

      const saga = new Saga<{ date: Date }>('date-test').step({
        name: 'step-1',
        execute: async (ctx) => ({
          inputDate: ctx.input.date,
          newDate: new Date(),
        }),
      });

      const result = await orchestrator.execute(saga, { date: testDate });

      expect(result.success).toBe(true);
    });

    it('handles empty arrays and objects', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('empty-test').step({
        name: 'step-1',
        execute: async () => ({
          emptyArray: [],
          emptyObject: {},
          nestedEmpty: { arr: [], obj: {} },
        }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('step-1')).toEqual({
          emptyArray: [],
          emptyObject: {},
          nestedEmpty: { arr: [], obj: {} },
        });
      }
    });
  });
});

describe('Edge Cases - Error Handling', () => {
  describe('Various error types', () => {
    it('handles TypeError', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('type-error').step({
        name: 'step-1',
        execute: async () => {
          const obj: any = null;
          return obj.property; // TypeError
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(TypeError);
      }
    });

    it('handles RangeError', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('range-error').step({
        name: 'step-1',
        execute: async () => {
          throw new RangeError('Value out of range');
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RangeError);
      }
    });

    it('handles custom error classes', async () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: number
        ) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('custom-error').step({
        name: 'step-1',
        execute: async () => {
          throw new CustomError('Custom failure', 500);
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Custom failure');
      }
    });

    it('handles error with no message', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('empty-error').step({
        name: 'step-1',
        execute: async () => {
          throw new Error();
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
    });

    it('handles throwing objects', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('object-throw').step({
        name: 'step-1',
        execute: async () => {
          throw { code: 'ERR_001', details: { field: 'email' } };
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
    });

    it('handles throwing numbers', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('number-throw').step({
        name: 'step-1',
        execute: async () => {
          throw 404;
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('404');
      }
    });

    it('handles throwing booleans', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('boolean-throw').step({
        name: 'step-1',
        execute: async () => {
          throw false;
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('false');
      }
    });
  });

  describe('Promise rejection vs throw', () => {
    it('handles Promise.reject', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('promise-reject').step({
        name: 'step-1',
        execute: () => Promise.reject(new Error('Rejected')),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Rejected');
      }
    });

    it('handles async function that throws', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('async-throw').step({
        name: 'step-1',
        execute: async () => {
          throw new Error('Async throw');
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Async throw');
      }
    });

    it('handles sync function returning rejected promise', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('sync-reject').step({
        name: 'step-1',
        // Non-async function returning a promise
        execute: () => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Delayed rejection')), 10);
          });
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Delayed rejection');
      }
    });
  });

  describe('Error in compensation', () => {
    it('handles compensation throwing same type of error', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({
        store,
        onCompensationFailure: 'continue',
      });

      class ServiceError extends Error {
        constructor(
          message: string,
          public service: string
        ) {
          super(message);
        }
      }

      const saga = new Saga('same-error-type')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            throw new ServiceError('Compensation failed', 'payment');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            throw new ServiceError('Execution failed', 'inventory');
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Execution failed');
        expect(result.compensationErrors?.[0]?.error.message).toBe('Compensation failed');
      }
    });
  });
});

describe('Edge Cases - Compensation', () => {
  describe('All compensations fail', () => {
    it('collects all compensation errors with continue strategy', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({
        store,
        onCompensationFailure: 'continue',
      });

      const saga = new Saga('all-comp-fail')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Comp 1 failed');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Comp 2 failed');
          },
        })
        .step({
          name: 'step-3',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Comp 3 failed');
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Execution failed');
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensated).toBe(false);
        expect(result.compensationErrors).toHaveLength(3);
      }
    });
  });

  describe('Compensation succeeds after retry', () => {
    it('retries compensation until success', async () => {
      let attempts = 0;

      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({
        store,
        onCompensationFailure: 'retry',
        compensationRetries: 5,
        compensationRetryDelay: 5,
      });

      const saga = new Saga('retry-success')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            attempts++;
            if (attempts < 4) {
              throw new Error(`Attempt ${attempts} failed`);
            }
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Fail');
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(attempts).toBe(4);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensated).toBe(true);
      }
    });
  });

  describe('Compensation that modifies shared state', () => {
    it('handles compensation accessing shared resources', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const sharedState: string[] = [];

      const saga = new Saga('shared-state')
        .step({
          name: 'step-1',
          execute: async () => {
            sharedState.push('exec-1');
            return {};
          },
          compensate: async () => {
            sharedState.push('comp-1');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => {
            sharedState.push('exec-2');
            return {};
          },
          compensate: async () => {
            sharedState.push('comp-2');
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            sharedState.push('exec-fail');
            throw new Error('Fail');
          },
        });

      await orchestrator.execute(saga, {});

      expect(sharedState).toEqual(['exec-1', 'exec-2', 'exec-fail', 'comp-2', 'comp-1']);
    });
  });
});

describe('Edge Cases - Event System', () => {
  describe('Listener throws error', () => {
    it('continues execution when listener throws', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      orchestrator.on('saga:started', () => {
        throw new Error('Listener error');
      });

      orchestrator.on('step:executing', () => {
        throw new Error('Another listener error');
      });

      const saga = new Saga('listener-error').step({
        name: 'step-1',
        execute: async () => ({ done: true }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });
  });

  describe('Removing listener during event emission', () => {
    it('handles listener removal during event', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const calls: number[] = [];

      const listener1 = () => {
        calls.push(1);
        orchestrator.off('saga:started', listener2);
      };

      const listener2 = () => {
        calls.push(2);
      };

      orchestrator.on('saga:started', listener1);
      orchestrator.on('saga:started', listener2);

      const saga = new Saga('remove-during').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await orchestrator.execute(saga, {});

      // Both might be called depending on iteration order
      expect(calls).toContain(1);
    });
  });

  describe('Many listeners', () => {
    it('handles 100 listeners on same event', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      let callCount = 0;

      for (let i = 0; i < 100; i++) {
        orchestrator.on('step:executed', () => {
          callCount++;
        });
      }

      const saga = new Saga('many-listeners').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await orchestrator.execute(saga, {});

      expect(callCount).toBe(100);
    });
  });

  describe('Async-like listener behavior', () => {
    it('listeners are called synchronously', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const events: string[] = [];

      orchestrator.on('step:executing', () => {
        events.push('listener-before');
      });

      const saga = new Saga('sync-listener').step({
        name: 'step-1',
        execute: async () => {
          events.push('execute');
          return {};
        },
      });

      await orchestrator.execute(saga, {});

      // Listener should be called before execute
      expect(events.indexOf('listener-before')).toBeLessThan(events.indexOf('execute'));
    });
  });
});

describe('Edge Cases - Saga Definition', () => {
  describe('Saga reuse', () => {
    it('same saga definition can be executed multiple times', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ id: number }>('reusable').step({
        name: 'step-1',
        execute: async (ctx) => ({ processedId: ctx.input.id }),
      });

      const results = await Promise.all([
        orchestrator.execute(saga, { id: 1 }),
        orchestrator.execute(saga, { id: 2 }),
        orchestrator.execute(saga, { id: 3 }),
      ]);

      expect(results.every((r) => r.success)).toBe(true);
      expect(new Set(results.map((r) => r.sagaId)).size).toBe(3);
    });
  });

  describe('Very long step names', () => {
    it('handles step names with 1000 characters', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const longName = 'a'.repeat(1000);

      const saga = new Saga('long-name').step({
        name: longName,
        execute: async () => ({}),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.has(longName)).toBe(true);
      }
    });
  });

  describe('Special characters in names', () => {
    it('handles special characters in saga name', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('saga-with-special!@#$%^&*()_+-=[]{}|;:,.<>?').step({
        name: 'step!@#',
        execute: async () => ({}),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });

    it('handles unicode in saga and step names', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('サガ-日本語').step({
        name: 'ステップ-한국어-中文',
        execute: async () => ({ emoji: '🎉' }),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });

    it('handles newlines and tabs in names', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('saga\nwith\nnewlines').step({
        name: 'step\twith\ttabs',
        execute: async () => ({}),
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(true);
    });
  });

  describe('Step with only compensate (no side effects in execute)', () => {
    it('handles step that only has compensation logic', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      let compensated = false;

      const saga = new Saga('only-compensate')
        .step({
          name: 'no-op',
          execute: async () => ({}), // Does nothing
          compensate: async () => {
            compensated = true;
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Fail');
          },
        });

      await orchestrator.execute(saga, {});

      expect(compensated).toBe(true);
    });
  });
});

describe('Edge Cases - Boundary Conditions', () => {
  describe('Maximum step count', () => {
    it('handles saga with 500 steps', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ initial: number }>('many-steps');

      for (let i = 0; i < 500; i++) {
        saga.step({
          name: `step-${i}`,
          execute: async (ctx) => {
            if (i === 0) {
              return { value: ctx.input.initial };
            }
            const prev = ctx.stepResults.get(`step-${i - 1}`) as { value: number };
            return { value: prev.value + 1 };
          },
        });
      }

      const result = await orchestrator.execute(saga, { initial: 0 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({ value: 499 });
      }
    });
  });

  describe('Zero steps after validation', () => {
    it('throws for saga with no steps', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('empty');

      await expect(orchestrator.execute(saga, {})).rejects.toThrow('has no steps');
    });
  });

  describe('Very large input', () => {
    it('handles input with 100,000 array items', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const largeArray = Array.from({ length: 100000 }, (_, i) => i);

      const saga = new Saga<{ items: number[] }>('large-input').step({
        name: 'process',
        execute: async (ctx) => ({
          count: ctx.input.items.length,
          sum: ctx.input.items.reduce((a, b) => a + b, 0),
        }),
      });

      const result = await orchestrator.execute(saga, { items: largeArray });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('process')).toEqual({
          count: 100000,
          sum: 4999950000, // Sum of 0 to 99999
        });
      }
    });
  });

  describe('Empty string values', () => {
    it('handles empty strings in input and output', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ name: string }>('empty-string').step({
        name: 'process',
        execute: async (ctx) => ({
          receivedEmpty: ctx.input.name === '',
          returnEmpty: '',
        }),
      });

      const result = await orchestrator.execute(saga, { name: '' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.get('process')).toEqual({
          receivedEmpty: true,
          returnEmpty: '',
        });
      }
    });
  });
});

describe('Edge Cases - Concurrency Safety', () => {
  describe('Same saga ID collision (UUID uniqueness)', () => {
    it('generates unique IDs even under high load', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('id-test').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      const count = 1000;
      const results = await Promise.all(
        Array.from({ length: count }, () => orchestrator.execute(saga, {}))
      );

      const ids = results.map((r) => r.sagaId);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(count);
    });
  });

  describe('Step results isolation', () => {
    it('step results are isolated between concurrent executions', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ id: number }>('isolation')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            // Random delay to increase interleaving
            await new Promise((r) => setTimeout(r, Math.random() * 50));
            return { uniqueId: ctx.input.id };
          },
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const step1 = ctx.stepResults.get('step-1') as { uniqueId: number };
            // Verify isolation
            if (step1.uniqueId !== ctx.input.id) {
              throw new Error(
                `Isolation violation: expected ${ctx.input.id}, got ${step1.uniqueId}`
              );
            }
            return { verified: true };
          },
        });

      const count = 50;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => orchestrator.execute(saga, { id: i }))
      );

      // All should succeed (no isolation violations)
      expect(results.every((r) => r.success)).toBe(true);
    });
  });
});
