import { describe, it, expect } from 'vitest';
import { Saga } from './saga.js';

describe('Saga', () => {
  describe('constructor', () => {
    it('creates a saga with a name', () => {
      const saga = new Saga('test-saga');
      expect(saga.name).toBe('test-saga');
    });

    it('throws if name is empty', () => {
      expect(() => new Saga('')).toThrow('Saga name must be a non-empty string');
    });

    it('starts with no steps', () => {
      const saga = new Saga('test-saga');
      expect(saga.steps).toHaveLength(0);
      expect(saga.hasSteps()).toBe(false);
    });
  });

  describe('step()', () => {
    it('adds a step with execute function', () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({ id: '123' }),
      });

      expect(saga.steps).toHaveLength(1);
      expect(saga.steps[0]?.name).toBe('step-1');
      expect(saga.hasSteps()).toBe(true);
    });

    it('adds a step with execute and compensate functions', () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({ id: '123' }),
        compensate: async () => {},
      });

      expect(saga.steps[0]?.compensate).toBeDefined();
    });

    it('returns this for chaining', () => {
      const saga = new Saga('test-saga');
      const result = saga.step({
        name: 'step-1',
        execute: async () => ({}),
      });

      expect(result).toBe(saga);
    });

    it('throws if step name is empty', () => {
      const saga = new Saga('test-saga');
      expect(() =>
        saga.step({
          name: '',
          execute: async () => ({}),
        })
      ).toThrow('Step name must be a non-empty string');
    });

    it('throws if execute is not a function', () => {
      const saga = new Saga('test-saga');
      expect(() =>
        saga.step({
          name: 'step-1',
          execute: 'not a function' as unknown as () => Promise<unknown>,
        })
      ).toThrow('Step "step-1" must have an execute function');
    });

    it('throws if duplicate step name', () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      expect(() =>
        saga.step({
          name: 'step-1',
          execute: async () => ({}),
        })
      ).toThrow('Step with name "step-1" already exists');
    });
  });

  describe('addSteps()', () => {
    it('adds multiple steps at once', () => {
      const saga = new Saga('test-saga').addSteps([
        { name: 'step-1', execute: async () => ({}) },
        { name: 'step-2', execute: async () => ({}) },
        { name: 'step-3', execute: async () => ({}) },
      ]);

      expect(saga.stepCount).toBe(3);
    });
  });

  describe('getStep()', () => {
    it('returns a step by name', () => {
      const saga = new Saga('test-saga')
        .step({ name: 'step-1', execute: async () => ({}) })
        .step({ name: 'step-2', execute: async () => ({}) });

      const step = saga.getStep('step-2');
      expect(step?.name).toBe('step-2');
    });

    it('returns undefined for non-existent step', () => {
      const saga = new Saga('test-saga');
      expect(saga.getStep('non-existent')).toBeUndefined();
    });
  });

  describe('steps immutability', () => {
    it('returns a copy of steps array', () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
      });

      const steps1 = saga.steps;
      const steps2 = saga.steps;

      expect(steps1).not.toBe(steps2);
      expect(steps1).toEqual(steps2);
    });
  });

  describe('edge cases', () => {
    it('throws if name is null', () => {
      expect(() => new Saga(null as unknown as string)).toThrow('Saga name must be a non-empty string');
    });

    it('throws if name is undefined', () => {
      expect(() => new Saga(undefined as unknown as string)).toThrow('Saga name must be a non-empty string');
    });

    it('throws if name is a number', () => {
      expect(() => new Saga(123 as unknown as string)).toThrow('Saga name must be a non-empty string');
    });

    it('allows names with special characters', () => {
      const saga = new Saga('my-saga_v2.0');
      expect(saga.name).toBe('my-saga_v2.0');
    });

    it('allows names with unicode characters', () => {
      const saga = new Saga('サガ-テスト');
      expect(saga.name).toBe('サガ-テスト');
    });

    it('throws if step name is null', () => {
      const saga = new Saga('test-saga');
      expect(() =>
        saga.step({
          name: null as unknown as string,
          execute: async () => ({}),
        })
      ).toThrow('Step name must be a non-empty string');
    });

    it('throws if compensate is not a function when provided', () => {
      const saga = new Saga('test-saga');
      expect(() =>
        saga.step({
          name: 'step-1',
          execute: async () => ({}),
          compensate: 'not a function' as unknown as () => Promise<void>,
        })
      ).toThrow('Step "step-1" compensate must be a function if provided');
    });

    it('allows undefined compensate', () => {
      const saga = new Saga('test-saga').step({
        name: 'step-1',
        execute: async () => ({}),
        compensate: undefined,
      });
      expect(saga.steps[0]?.compensate).toBeUndefined();
    });

    it('handles empty addSteps array', () => {
      const saga = new Saga('test-saga').addSteps([]);
      expect(saga.stepCount).toBe(0);
    });

    it('throws on duplicate in addSteps', () => {
      const saga = new Saga('test-saga');
      expect(() =>
        saga.addSteps([
          { name: 'step-1', execute: async () => ({}) },
          { name: 'step-1', execute: async () => ({}) },
        ])
      ).toThrow('Step with name "step-1" already exists');
    });

    it('preserves step order', () => {
      const saga = new Saga('test-saga')
        .step({ name: 'first', execute: async () => ({}) })
        .step({ name: 'second', execute: async () => ({}) })
        .step({ name: 'third', execute: async () => ({}) });

      expect(saga.steps[0]?.name).toBe('first');
      expect(saga.steps[1]?.name).toBe('second');
      expect(saga.steps[2]?.name).toBe('third');
    });

    it('handles many steps', () => {
      const saga = new Saga('test-saga');
      for (let i = 0; i < 100; i++) {
        saga.step({ name: `step-${i}`, execute: async () => ({}) });
      }
      expect(saga.stepCount).toBe(100);
      expect(saga.getStep('step-50')?.name).toBe('step-50');
    });
  });

  describe('type safety', () => {
    it('preserves input type through context', async () => {
      interface MyInput {
        userId: string;
        amount: number;
      }

      const saga = new Saga<MyInput>('typed-saga').step({
        name: 'process',
        execute: async (ctx) => {
          // TypeScript should infer ctx.input as MyInput
          return { processed: ctx.input.userId, value: ctx.input.amount * 2 };
        },
      });

      expect(saga.name).toBe('typed-saga');
    });
  });
});
