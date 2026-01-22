/**
 * Production scenario tests
 * These tests simulate real-world production failure scenarios
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Saga, SagaOrchestrator, InMemoryStore } from './index.js';
import type { StateStore, SagaState, SagaStatus, StepState } from './types.js';

describe('Production Scenarios - Network Failures', () => {
  describe('Simulated API timeouts', () => {
    it('handles step that times out (using AbortController pattern)', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('timeout-saga').step({
        name: 'api-call',
        execute: async () => {
          // Simulate a timeout pattern
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 50);

          try {
            await new Promise((resolve, reject) => {
              const apiCall = new Promise((r) => setTimeout(r, 200)); // Takes 200ms
              controller.signal.addEventListener('abort', () => {
                reject(new Error('Request timeout'));
              });
              apiCall.then(resolve);
            });
            return { success: true };
          } finally {
            clearTimeout(timeoutId);
          }
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Request timeout');
      }
    });
  });

  describe('Simulated connection drops', () => {
    it('handles step that fails mid-execution', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      let resourcesAllocated = false;
      let resourcesReleased = false;

      const saga = new Saga('connection-drop')
        .step({
          name: 'allocate-resources',
          execute: async () => {
            resourcesAllocated = true;
            return { connectionId: 'conn-123' };
          },
          compensate: async () => {
            resourcesReleased = true;
          },
        })
        .step({
          name: 'use-connection',
          execute: async () => {
            // Simulate connection drop
            throw new Error('Connection reset by peer');
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      expect(resourcesAllocated).toBe(true);
      expect(resourcesReleased).toBe(true);
    });
  });

  describe('Partial success scenarios', () => {
    it('handles batch operation where some items fail', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      interface BatchInput {
        items: Array<{ id: string; shouldFail?: boolean }>;
      }

      const saga = new Saga<BatchInput>('batch-operation').step({
        name: 'process-batch',
        execute: async (ctx) => {
          const results: Array<{ id: string; status: 'success' | 'failed' }> = [];

          for (const item of ctx.input.items) {
            if (item.shouldFail) {
              throw new Error(`Item ${item.id} failed processing`);
            }
            results.push({ id: item.id, status: 'success' });
          }

          return { processed: results };
        },
      });

      const result = await orchestrator.execute(saga, {
        items: [
          { id: '1' },
          { id: '2' },
          { id: '3', shouldFail: true },
          { id: '4' },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Item 3');
      }
    });
  });
});

describe('Production Scenarios - Resource Management', () => {
  describe('Database transaction patterns', () => {
    it('simulates database transaction with rollback', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      // Simulated database state
      const database: Map<string, unknown> = new Map();
      const transactionLog: string[] = [];

      const saga = new Saga<{ userId: string; data: unknown }>('db-transaction')
        .step({
          name: 'begin-transaction',
          execute: async () => {
            transactionLog.push('BEGIN');
            return { txId: `tx-${Date.now()}` };
          },
          compensate: async (ctx, result) => {
            transactionLog.push(`ROLLBACK ${result.txId}`);
          },
        })
        .step({
          name: 'insert-record',
          execute: async (ctx) => {
            database.set(ctx.input.userId, ctx.input.data);
            transactionLog.push(`INSERT ${ctx.input.userId}`);
            return { inserted: true };
          },
          compensate: async (ctx) => {
            database.delete(ctx.input.userId);
            transactionLog.push(`DELETE ${ctx.input.userId}`);
          },
        })
        .step({
          name: 'commit-transaction',
          execute: async () => {
            // Simulate commit failure
            throw new Error('Commit failed: disk full');
          },
        });

      const result = await orchestrator.execute(saga, {
        userId: 'user-123',
        data: { name: 'John' },
      });

      expect(result.success).toBe(false);
      expect(database.has('user-123')).toBe(false); // Rolled back
      expect(transactionLog).toContain('DELETE user-123');
      expect(transactionLog.some((log) => log.startsWith('ROLLBACK'))).toBe(true);
    });
  });

  describe('File system operations', () => {
    it('simulates file operations with cleanup', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const fileSystem: Set<string> = new Set();
      const operations: string[] = [];

      const saga = new Saga<{ filename: string; content: string }>('file-ops')
        .step({
          name: 'create-temp-file',
          execute: async (ctx) => {
            const tempPath = `/tmp/${ctx.input.filename}.tmp`;
            fileSystem.add(tempPath);
            operations.push(`CREATE ${tempPath}`);
            return { tempPath };
          },
          compensate: async (_, result) => {
            fileSystem.delete(result.tempPath);
            operations.push(`DELETE ${result.tempPath}`);
          },
        })
        .step({
          name: 'write-content',
          execute: async () => {
            operations.push('WRITE content');
            return { bytesWritten: 1024 };
          },
        })
        .step({
          name: 'rename-to-final',
          execute: async () => {
            // Simulate permission error
            throw new Error('Permission denied');
          },
        });

      await orchestrator.execute(saga, { filename: 'test', content: 'data' });

      expect(fileSystem.size).toBe(0); // Temp file cleaned up
      expect(operations).toContain('DELETE /tmp/test.tmp');
    });
  });

  describe('External service integration', () => {
    it('handles multiple external service calls with rollback', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const serviceState = {
        paymentService: { charges: new Map<string, number>() },
        inventoryService: { reservations: new Map<string, number>() },
        notificationService: { sent: new Map<string, string>() },
      };

      const saga = new Saga<{ orderId: string; amount: number; itemId: string }>('multi-service')
        .step({
          name: 'charge-payment',
          execute: async (ctx) => {
            const chargeId = `chg-${ctx.input.orderId}`;
            serviceState.paymentService.charges.set(chargeId, ctx.input.amount);
            return { chargeId };
          },
          compensate: async (_, result) => {
            serviceState.paymentService.charges.delete(result.chargeId);
          },
        })
        .step({
          name: 'reserve-inventory',
          execute: async (ctx) => {
            const reservationId = `res-${ctx.input.orderId}`;
            serviceState.inventoryService.reservations.set(reservationId, 1);
            return { reservationId };
          },
          compensate: async (_, result) => {
            serviceState.inventoryService.reservations.delete(result.reservationId);
          },
        })
        .step({
          name: 'send-notification',
          execute: async () => {
            // Notification service is down
            throw new Error('Notification service unavailable');
          },
          compensate: async (ctx) => {
            // Send cancellation notification (might also fail)
            serviceState.notificationService.sent.set(
              ctx.input.orderId,
              'Order cancelled'
            );
          },
        });

      const result = await orchestrator.execute(saga, {
        orderId: 'ORD-001',
        amount: 99.99,
        itemId: 'ITEM-001',
      });

      expect(result.success).toBe(false);
      // All services should be rolled back
      expect(serviceState.paymentService.charges.size).toBe(0);
      expect(serviceState.inventoryService.reservations.size).toBe(0);
    });
  });
});

describe('Production Scenarios - Data Consistency', () => {
  describe('Idempotency patterns', () => {
    it('handles idempotent operations in compensation', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({
        store,
        onCompensationFailure: 'retry',
        compensationRetries: 3,
        compensationRetryDelay: 10,
      });

      let compensationAttempts = 0;
      const idempotencyKeys = new Set<string>();

      const saga = new Saga<{ operationId: string }>('idempotent')
        .step({
          name: 'do-work',
          execute: async (ctx) => {
            return { workId: `work-${ctx.input.operationId}` };
          },
          compensate: async (ctx, result) => {
            compensationAttempts++;

            // Idempotent compensation
            const key = `undo-${result.workId}`;
            if (idempotencyKeys.has(key)) {
              // Already compensated, idempotent success
              return;
            }

            if (compensationAttempts < 2) {
              // Fail first attempt to test retry
              throw new Error('Temporary failure');
            }

            idempotencyKeys.add(key);
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Intentional failure');
          },
        });

      const result = await orchestrator.execute(saga, { operationId: 'op-123' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.compensated).toBe(true);
      }
      expect(compensationAttempts).toBe(2);
      expect(idempotencyKeys.has('undo-work-op-123')).toBe(true);
    });
  });

  describe('Eventual consistency', () => {
    it('tracks state for eventual reconciliation', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      interface ReconciliationRecord {
        sagaId: string;
        step: string;
        action: 'execute' | 'compensate';
        data: unknown;
        timestamp: Date;
      }

      const reconciliationLog: ReconciliationRecord[] = [];

      const saga = new Saga<{ entityId: string }>('eventual-consistency')
        .step({
          name: 'update-primary',
          execute: async (ctx) => {
            const record = {
              sagaId: ctx.sagaId,
              step: 'update-primary',
              action: 'execute' as const,
              data: { entityId: ctx.input.entityId, version: 1 },
              timestamp: new Date(),
            };
            reconciliationLog.push(record);
            return { version: 1 };
          },
          compensate: async (ctx, result) => {
            reconciliationLog.push({
              sagaId: ctx.sagaId,
              step: 'update-primary',
              action: 'compensate',
              data: { entityId: ctx.input.entityId, version: result.version },
              timestamp: new Date(),
            });
          },
        })
        .step({
          name: 'update-replica',
          execute: async (ctx) => {
            reconciliationLog.push({
              sagaId: ctx.sagaId,
              step: 'update-replica',
              action: 'execute',
              data: { entityId: ctx.input.entityId },
              timestamp: new Date(),
            });
            // Replica update fails
            throw new Error('Replica sync failed');
          },
        });

      const result = await orchestrator.execute(saga, { entityId: 'entity-123' });

      expect(result.success).toBe(false);

      // Reconciliation log can be used for manual recovery
      const executeRecords = reconciliationLog.filter((r) => r.action === 'execute');
      const compensateRecords = reconciliationLog.filter((r) => r.action === 'compensate');

      expect(executeRecords).toHaveLength(2);
      expect(compensateRecords).toHaveLength(1);
    });
  });
});

describe('Production Scenarios - Error Propagation', () => {
  describe('Error context preservation', () => {
    it('preserves error stack trace', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga('stack-trace').step({
        name: 'nested-call',
        execute: async () => {
          const innerFunction = () => {
            throw new Error('Deep error');
          };
          const middleFunction = () => innerFunction();
          const outerFunction = () => middleFunction();
          outerFunction();
          return {};
        },
      });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.stack).toBeDefined();
        expect(result.error.stack).toContain('innerFunction');
      }
    });
  });

  describe('Aggregate errors from multiple steps', () => {
    it('collects errors from multiple compensation failures', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({
        store,
        onCompensationFailure: 'continue',
      });

      const saga = new Saga('aggregate-errors')
        .step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensation error A');
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensation error B');
          },
        })
        .step({
          name: 'step-3',
          execute: async () => ({}),
          compensate: async () => {
            throw new Error('Compensation error C');
          },
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Execution error');
          },
        });

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Execution error');
        expect(result.compensationErrors).toHaveLength(3);

        const errorMessages = result.compensationErrors?.map((e) => e.error.message);
        expect(errorMessages).toContain('Compensation error A');
        expect(errorMessages).toContain('Compensation error B');
        expect(errorMessages).toContain('Compensation error C');
      }
    });
  });
});

describe('Production Scenarios - Monitoring & Observability', () => {
  describe('Event-based monitoring', () => {
    it('provides enough events for comprehensive monitoring', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      interface MonitoringEvent {
        type: string;
        timestamp: Date;
        sagaId?: string;
        sagaName?: string;
        stepName?: string;
        duration?: number;
        error?: string;
      }

      const events: MonitoringEvent[] = [];
      let stepStartTime: number | undefined;

      orchestrator.on('saga:started', (state) => {
        events.push({
          type: 'saga:started',
          timestamp: new Date(),
          sagaId: state.id,
          sagaName: state.sagaName,
        });
      });

      orchestrator.on('step:executing', (state, stepName) => {
        stepStartTime = Date.now();
        events.push({
          type: 'step:executing',
          timestamp: new Date(),
          sagaId: state.id,
          stepName,
        });
      });

      orchestrator.on('step:executed', (state, stepName) => {
        events.push({
          type: 'step:executed',
          timestamp: new Date(),
          sagaId: state.id,
          stepName,
          duration: stepStartTime ? Date.now() - stepStartTime : undefined,
        });
      });

      orchestrator.on('step:failed', (state, stepName, error) => {
        events.push({
          type: 'step:failed',
          timestamp: new Date(),
          sagaId: state.id,
          stepName,
          error: error.message,
        });
      });

      orchestrator.on('saga:completed', (state) => {
        events.push({
          type: 'saga:completed',
          timestamp: new Date(),
          sagaId: state.id,
        });
      });

      orchestrator.on('saga:failed', (state, error) => {
        events.push({
          type: 'saga:failed',
          timestamp: new Date(),
          sagaId: state.id,
          error: error.message,
        });
      });

      const saga = new Saga('monitored-saga')
        .step({
          name: 'step-1',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return {};
          },
        })
        .step({
          name: 'step-2',
          execute: async () => ({}),
        });

      await orchestrator.execute(saga, {});

      // Should have: started, executing x2, executed x2, completed
      expect(events.length).toBeGreaterThanOrEqual(6);
      expect(events[0]?.type).toBe('saga:started');
      expect(events[events.length - 1]?.type).toBe('saga:completed');

      // All events should have timestamps
      expect(events.every((e) => e.timestamp instanceof Date)).toBe(true);

      // Executed steps should have duration
      const executedEvents = events.filter((e) => e.type === 'step:executed');
      expect(executedEvents.some((e) => e.duration !== undefined)).toBe(true);
    });
  });

  describe('Audit trail', () => {
    it('creates complete audit trail for compliance', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      interface AuditEntry {
        timestamp: Date;
        action: string;
        sagaId: string;
        details: unknown;
      }

      const auditTrail: AuditEntry[] = [];

      orchestrator.on('saga:started', (state) => {
        auditTrail.push({
          timestamp: new Date(),
          action: 'SAGA_STARTED',
          sagaId: state.id,
          details: { name: state.sagaName, input: state.input },
        });
      });

      orchestrator.on('step:executed', (state, stepName, result) => {
        auditTrail.push({
          timestamp: new Date(),
          action: 'STEP_EXECUTED',
          sagaId: state.id,
          details: { step: stepName, result },
        });
      });

      orchestrator.on('compensation:step', (state, stepName) => {
        auditTrail.push({
          timestamp: new Date(),
          action: 'COMPENSATION_EXECUTED',
          sagaId: state.id,
          details: { step: stepName },
        });
      });

      const saga = new Saga<{ userId: string; action: string }>('audited-saga')
        .step({
          name: 'sensitive-operation',
          execute: async (ctx) => ({
            operatedOn: ctx.input.userId,
            action: ctx.input.action,
          }),
          compensate: async () => {},
        })
        .step({
          name: 'fail',
          execute: async () => {
            throw new Error('Audit test failure');
          },
        });

      await orchestrator.execute(saga, { userId: 'user-123', action: 'delete' });

      // Verify audit trail contains all necessary information
      const startEntry = auditTrail.find((e) => e.action === 'SAGA_STARTED');
      expect(startEntry).toBeDefined();
      expect((startEntry?.details as any).input.userId).toBe('user-123');

      const execEntry = auditTrail.find((e) => e.action === 'STEP_EXECUTED');
      expect(execEntry).toBeDefined();

      const compEntry = auditTrail.find((e) => e.action === 'COMPENSATION_EXECUTED');
      expect(compEntry).toBeDefined();
    });
  });
});

describe('Production Scenarios - Rate Limiting & Throttling', () => {
  describe('Simulated rate limiting', () => {
    it('handles rate limited API responses', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      let callCount = 0;
      const maxCallsPerSecond = 2;

      const saga = new Saga('rate-limited').step({
        name: 'api-call',
        execute: async () => {
          callCount++;
          if (callCount > maxCallsPerSecond) {
            throw new Error('Rate limit exceeded (429)');
          }
          return { success: true };
        },
      });

      // First calls should succeed
      const result1 = await orchestrator.execute(saga, {});
      const result2 = await orchestrator.execute(saga, {});
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Third call should fail
      const result3 = await orchestrator.execute(saga, {});
      expect(result3.success).toBe(false);
      if (!result3.success) {
        expect(result3.error.message).toContain('Rate limit');
      }
    });
  });
});

describe('Production Scenarios - Memory Safety', () => {
  describe('No memory leaks with event listeners', () => {
    it('properly removes listeners', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const listener = vi.fn();

      // Add and remove listener multiple times
      for (let i = 0; i < 100; i++) {
        orchestrator.on('saga:started', listener);
        orchestrator.off('saga:started', listener);
      }

      const saga = new Saga('memory-test').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      await orchestrator.execute(saga, {});

      // Listener should not have been called (was removed)
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Handles large number of steps without stack overflow', () => {
    it('executes 1000 steps without stack overflow', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const saga = new Saga<{ count: number }>('deep-saga');

      for (let i = 0; i < 1000; i++) {
        saga.step({
          name: `step-${i}`,
          execute: async () => ({ step: i }),
        });
      }

      const result = await orchestrator.execute(saga, { count: 1000 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stepResults.size).toBe(1000);
      }
    });
  });
});

describe('Production Scenarios - Graceful Degradation', () => {
  describe('Partial functionality on store degradation', () => {
    it('saga execution succeeds even if some store ops fail non-critically', async () => {
      let getCallCount = 0;

      const degradedStore: StateStore = {
        create: async () => {},
        get: async (id) => {
          getCallCount++;
          // Occasionally return undefined to simulate cache miss
          if (getCallCount % 2 === 0) {
            return undefined;
          }
          return {
            id,
            sagaName: 'test',
            status: 'running' as const,
            input: {},
            steps: [{ name: 'step-1', status: 'pending' as const }],
            startedAt: new Date(),
          };
        },
        updateStatus: async () => {},
        updateStep: async () => {},
        getPendingSagas: async () => [],
      };

      const orchestrator = new SagaOrchestrator({ store: degradedStore });

      const saga = new Saga('degraded-store').step({
        name: 'step-1',
        execute: async () => ({ done: true }),
      });

      // Should still complete successfully
      const result = await orchestrator.execute(saga, {});
      expect(result.success).toBe(true);
    });
  });
});
