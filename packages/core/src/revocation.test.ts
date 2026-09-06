import { describe, it, expect, vi } from 'vitest';
import { Saga } from './saga.js';
import { SagaOrchestrator } from './orchestrator.js';
import { InMemoryStore } from './stores/memory.js';

describe('P28 Revocation Workflow & Failure Policy Tests', () => {
  const setupRevocationSaga = (failAtStep?: string) => {
    const compensatedSteps: string[] = [];
    const executedSteps: string[] = [];

    const saga = new Saga<{ userId: string }>('revoke-access-saga')
      .step({
        name: 'revoke-system-a',
        execute: async () => {
          if (failAtStep === 'revoke-system-a') throw new Error('Failed to revoke System A');
          executedSteps.push('revoke-system-a');
          return { system: 'System A', revoked: true };
        },
        compensate: async () => {
          compensatedSteps.push('revoke-system-a');
        },
      })
      .step({
        name: 'revoke-system-b',
        execute: async () => {
          if (failAtStep === 'revoke-system-b') throw new Error('Failed to revoke System B');
          executedSteps.push('revoke-system-b');
          return { system: 'System B', revoked: true };
        },
        compensate: async () => {
          compensatedSteps.push('revoke-system-b');
        },
      })
      .step({
        name: 'revoke-system-c',
        execute: async () => {
          if (failAtStep === 'revoke-system-c') throw new Error('Failed to revoke System C');
          executedSteps.push('revoke-system-c');
          return { system: 'System C', revoked: true };
        },
        compensate: async () => {
          compensatedSteps.push('revoke-system-c');
        },
      })
      .step({
        name: 'revoke-system-d',
        execute: async () => {
          if (failAtStep === 'revoke-system-d') throw new Error('Failed to revoke System D');
          executedSteps.push('revoke-system-d');
          return { system: 'System D', revoked: true };
        },
        compensate: async () => {
          compensatedSteps.push('revoke-system-d');
        },
      });

    return { saga, executedSteps, compensatedSteps };
  };

  it('Test 1 — Complete Revocation Success (A ✓, B ✓, C ✓, D ✓)', async () => {
    const { saga, executedSteps, compensatedSteps } = setupRevocationSaga();
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    const result = await orchestrator.execute(saga, { userId: 'user@example.com' }, {
      workflowType: 'revocation',
      failurePolicy: 'PARTIAL_COMPLETION',
    });

    expect(result.success).toBe(true);
    expect(executedSteps).toEqual(['revoke-system-a', 'revoke-system-b', 'revoke-system-c', 'revoke-system-d']);
    expect(compensatedSteps).toEqual([]);
  });

  it('Test 2 — PARTIAL_COMPLETION (System C fails, A & B remain revoked, C active, D not executed, 0 compensations)', async () => {
    const { saga, executedSteps, compensatedSteps } = setupRevocationSaga('revoke-system-c');
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    const skippedListener = vi.fn();
    orchestrator.on('compensation:skipped', skippedListener);

    const result = await orchestrator.execute(saga, { userId: 'user@example.com' }, {
      workflowType: 'revocation',
      failurePolicy: 'PARTIAL_COMPLETION',
    });

    expect(result.success).toBe(false);
    if (!result.success && result.status === 'PARTIAL_COMPLETION') {
      expect(result.status).toBe('PARTIAL_COMPLETION');
      expect(result.failedStep).toBe('revoke-system-c');
      expect(result.completedSteps).toEqual(['revoke-system-a', 'revoke-system-b']);
      expect(result.compensated).toBe(false);
      expect(result.residualArtifacts.length).toBeGreaterThan(0);
      expect(result.residualArtifacts[0]!.system).toContain('SYSTEM C');
      expect(result.residualArtifacts[0]!.state).toBe('still_active');
    }

    expect(executedSteps).toEqual(['revoke-system-a', 'revoke-system-b']);
    expect(compensatedSteps).toEqual([]); // No compensators ran!
    expect(skippedListener).toHaveBeenCalled();
  });

  it('Test 3 — ROLLBACK (System C fails, B then A compensated)', async () => {
    const { saga, executedSteps, compensatedSteps } = setupRevocationSaga('revoke-system-c');
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    const result = await orchestrator.execute(saga, { userId: 'user@example.com' }, {
      workflowType: 'revocation',
      failurePolicy: 'ROLLBACK',
      confirmRollback: true,
    });

    expect(result.success).toBe(false);
    if (!result.success && result.status !== 'PARTIAL_COMPLETION') {
      expect(result.failedStep).toBe('revoke-system-c');
      expect(result.compensated).toBe(true);
    }

    expect(executedSteps).toEqual(['revoke-system-a', 'revoke-system-b']);
    expect(compensatedSteps).toEqual(['revoke-system-b', 'revoke-system-a']); // Reverse order compensation!
  });

  it('Test 4 — Explicit Policy (revocation defaults to PARTIAL_COMPLETION if unspecified)', async () => {
    const { saga } = setupRevocationSaga('revoke-system-c');
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    const result = await orchestrator.execute(saga, { userId: 'user@example.com' }, {
      workflowType: 'revocation',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failurePolicy).toBe('PARTIAL_COMPLETION');
      expect(result.compensated).toBe(false);
    }
  });

  it('Test 5 — Rollback Confirmation (ROLLBACK on revocation requires confirmRollback)', async () => {
    const { saga } = setupRevocationSaga('revoke-system-c');
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    await expect(
      orchestrator.execute(saga, { userId: 'user@example.com' }, {
        workflowType: 'revocation',
        failurePolicy: 'ROLLBACK',
        confirmRollback: false, // Not confirmed!
      })
    ).rejects.toThrow('Rollback confirmation required for revocation policy ROLLBACK');
  });

  it('Test 6 — Residual Artifact (failed System C is explicitly identified)', async () => {
    const { saga } = setupRevocationSaga('revoke-system-c');
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    const result = await orchestrator.execute(saga, { userId: 'user@example.com' }, {
      workflowType: 'revocation',
      failurePolicy: 'PARTIAL_COMPLETION',
    });

    expect(result.success).toBe(false);
    if (!result.success && result.status === 'PARTIAL_COMPLETION') {
      expect(result.residualArtifacts).toEqual([
        {
          system: 'SYSTEM C',
          resource: 'user-access',
          state: 'still_active',
          reason: 'Revocation step "revoke-system-c" failed: Failed to revoke System C',
        },
      ]);
    }
  });

  it('Test 7 — Result Metadata (includes workflow, failurePolicy, status, failedStep)', async () => {
    const { saga } = setupRevocationSaga('revoke-system-b');
    const orchestrator = new SagaOrchestrator({ store: new InMemoryStore() });

    const result = await orchestrator.execute(saga, { userId: 'user@example.com' }, {
      workflowType: 'revocation',
      failurePolicy: 'PARTIAL_COMPLETION',
    });

    expect(result.success).toBe(false);
    if (!result.success && result.status === 'PARTIAL_COMPLETION') {
      expect(result.workflow).toBe('revocation');
      expect(result.failurePolicy).toBe('PARTIAL_COMPLETION');
      expect(result.status).toBe('PARTIAL_COMPLETION');
      expect(result.failedStep).toBe('revoke-system-b');
    }
  });
});
