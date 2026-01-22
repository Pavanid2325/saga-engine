# Saga Engine

**Transactional middleware for AI agents — Ctrl+Z for the real world.**

[![npm version](https://img.shields.io/npm/v/@saga-engine/core.svg)](https://www.npmjs.com/package/@saga-engine/core)
[![CI](https://github.com/saga-engine/saga-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/saga-engine/saga-engine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

Saga Engine implements the [Saga pattern](https://microservices.io/patterns/data/saga.html) for AI agents and autonomous systems. When your agent books a flight, reserves a hotel, and then fails to rent a car — Saga Engine automatically cancels the hotel and flight in reverse order.

## Why Saga Engine?

AI agents are increasingly performing real-world actions: booking travel, processing payments, managing infrastructure. But what happens when step 5 of 7 fails?

**Without Saga Engine:** Manual cleanup, inconsistent state, frustrated users.

**With Saga Engine:** Automatic rollback, consistent state, reliable operations.

```typescript
const result = await orchestrator.execute(bookTripSaga, {
  flight: { from: 'NYC', to: 'LAX' },
  hotel: { city: 'Los Angeles', nights: 3 },
  car: { pickup: 'LAX' }
});

if (!result.success) {
  // Flight and hotel automatically cancelled
  console.log('Booking failed, all changes rolled back');
}
```

## Features

- **Automatic Compensation** — Define rollback logic once, executed automatically on failure
- **Type-Safe** — Full TypeScript support with generics for input/output types
- **Pluggable Storage** — In-memory for dev, Redis/Postgres for production
- **Observable** — Rich event system for monitoring and debugging
- **Crash Recovery** — Resume interrupted sagas after process restart
- **Battle-Tested** — 193+ tests covering edge cases and production scenarios

## Installation

```bash
npm install @saga-engine/core
# or
pnpm add @saga-engine/core
# or
yarn add @saga-engine/core
```

## Quick Start

```typescript
import { Saga, SagaOrchestrator, InMemoryStore } from '@saga-engine/core';

// 1. Define your saga with steps and compensations
const orderSaga = new Saga<{ orderId: string; amount: number }>('process-order')
  .step({
    name: 'reserve-inventory',
    execute: async (ctx) => {
      const reservation = await inventoryService.reserve(ctx.input.orderId);
      return { reservationId: reservation.id };
    },
    compensate: async (ctx, result) => {
      await inventoryService.release(result.reservationId);
    }
  })
  .step({
    name: 'charge-payment',
    execute: async (ctx) => {
      const charge = await paymentService.charge(ctx.input.amount);
      return { chargeId: charge.id };
    },
    compensate: async (ctx, result) => {
      await paymentService.refund(result.chargeId);
    }
  })
  .step({
    name: 'send-confirmation',
    execute: async (ctx) => {
      await emailService.send(ctx.input.orderId, 'Order confirmed!');
      return { sent: true };
    }
  });

// 2. Create orchestrator with storage
const orchestrator = new SagaOrchestrator({
  store: new InMemoryStore()
});

// 3. Execute the saga
const result = await orchestrator.execute(orderSaga, {
  orderId: 'ORD-123',
  amount: 99.99
});

if (result.success) {
  console.log('Order processed:', result.stepResults);
} else {
  console.log('Order failed:', result.error.message);
  console.log('Compensated:', result.compensated);
}
```

## Core Concepts

### Sagas

A saga is a sequence of steps that form a logical transaction. Each step can have:
- **execute** — The action to perform
- **compensate** — The rollback action (optional)

```typescript
const saga = new Saga<InputType>('saga-name')
  .step({ name: 'step-1', execute: async (ctx) => {...}, compensate: async (ctx, result) => {...} })
  .step({ name: 'step-2', execute: async (ctx) => {...} });
```

### Context

Each step receives a context with:
- `sagaId` — Unique execution ID
- `input` — The input provided when starting the saga
- `stepResults` — Results from previous steps (Map)

```typescript
execute: async (ctx) => {
  const previousResult = ctx.stepResults.get('previous-step');
  return { processed: ctx.input.data };
}
```

### Compensation

When a step fails, compensation runs in **reverse order** for all completed steps:

```
Step 1: reserve-inventory ✅
Step 2: charge-payment ✅
Step 3: send-email ❌ FAILED

Compensation:
  → charge-payment.compensate() // Refund
  → reserve-inventory.compensate() // Release
```

### Compensation Strategies

```typescript
const orchestrator = new SagaOrchestrator({
  store: new InMemoryStore(),
  onCompensationFailure: 'continue', // 'retry' | 'continue' | 'halt'
  compensationRetries: 3,            // For 'retry' strategy
  compensationRetryDelay: 1000       // Milliseconds between retries
});
```

## Events

Monitor saga execution with events:

```typescript
orchestrator.on('saga:started', (state) => {
  console.log(`Saga ${state.sagaName} started`);
});

orchestrator.on('step:executed', (state, stepName, result) => {
  console.log(`Step ${stepName} completed:`, result);
});

orchestrator.on('step:failed', (state, stepName, error) => {
  console.log(`Step ${stepName} failed:`, error.message);
});

orchestrator.on('compensation:started', (state) => {
  console.log('Starting rollback...');
});

orchestrator.on('compensation:completed', (state) => {
  console.log('Rollback complete');
});

orchestrator.on('saga:completed', (state) => {
  console.log('Saga completed successfully');
});

orchestrator.on('saga:failed', (state, error) => {
  console.log('Saga failed:', error.message);
});
```

## Storage Adapters

### InMemoryStore (Development)

```typescript
import { InMemoryStore } from '@saga-engine/core';

const store = new InMemoryStore();
```

### RedisStore (Production) — Coming Soon

```typescript
import { RedisStore } from '@saga-engine/redis';

const store = new RedisStore({
  url: 'redis://localhost:6379',
  keyPrefix: 'saga:'
});
```

### PostgresStore (Enterprise) — Coming Soon

```typescript
import { PostgresStore } from '@saga-engine/postgres';

const store = new PostgresStore({
  connectionString: process.env.DATABASE_URL
});
```

### Custom Store

Implement the `StateStore` interface:

```typescript
interface StateStore {
  create(state: SagaState): Promise<void>;
  get(sagaId: string): Promise<SagaState | undefined>;
  updateStatus(sagaId: string, status: SagaStatus, completedAt?: Date): Promise<void>;
  updateStep(sagaId: string, stepName: string, stepState: Partial<StepState>): Promise<void>;
  getPendingSagas(): Promise<SagaState[]>;
  delete?(sagaId: string): Promise<void>;
  close?(): Promise<void>;
}
```

## Crash Recovery

Recover interrupted sagas on startup:

```typescript
const orchestrator = new SagaOrchestrator({ store: redisStore });

// On application startup
await orchestrator.recover();
```

## Examples

### E-Commerce Order Processing

```typescript
const processOrderSaga = new Saga<OrderInput>('process-order')
  .step({
    name: 'validate-cart',
    execute: async (ctx) => {
      const valid = await cartService.validate(ctx.input.cartId);
      if (!valid) throw new Error('Invalid cart');
      return { validated: true };
    }
  })
  .step({
    name: 'reserve-inventory',
    execute: async (ctx) => {
      const items = await inventoryService.reserve(ctx.input.items);
      return { reservedItems: items };
    },
    compensate: async (ctx, result) => {
      await inventoryService.release(result.reservedItems);
    }
  })
  .step({
    name: 'process-payment',
    execute: async (ctx) => {
      const payment = await paymentService.charge({
        amount: ctx.input.total,
        customerId: ctx.input.customerId
      });
      return { paymentId: payment.id };
    },
    compensate: async (ctx, result) => {
      await paymentService.refund(result.paymentId);
    }
  })
  .step({
    name: 'create-shipment',
    execute: async (ctx) => {
      const shipment = await shippingService.create({
        address: ctx.input.shippingAddress,
        items: ctx.stepResults.get('reserve-inventory').reservedItems
      });
      return { trackingNumber: shipment.tracking };
    },
    compensate: async (ctx, result) => {
      await shippingService.cancel(result.trackingNumber);
    }
  });
```

### AI Agent Tool Execution

```typescript
const agentTaskSaga = new Saga<AgentTask>('agent-task')
  .step({
    name: 'acquire-resources',
    execute: async (ctx) => {
      const resources = await resourceManager.acquire(ctx.input.requirements);
      return { resourceIds: resources.map(r => r.id) };
    },
    compensate: async (ctx, result) => {
      await resourceManager.release(result.resourceIds);
    }
  })
  .step({
    name: 'execute-action',
    execute: async (ctx) => {
      const result = await actionExecutor.run(ctx.input.action);
      return { actionResult: result };
    },
    compensate: async (ctx, result) => {
      await actionExecutor.undo(result.actionResult);
    }
  })
  .step({
    name: 'commit-changes',
    execute: async (ctx) => {
      await changeTracker.commit(ctx.sagaId);
      return { committed: true };
    }
  });
```

## Integration with AI Frameworks

### LangChain

```typescript
import { Tool } from 'langchain/tools';

const bookingTool = new Tool({
  name: 'book-travel',
  description: 'Book flights and hotels with automatic rollback on failure',
  func: async (input: string) => {
    const params = JSON.parse(input);
    const result = await orchestrator.execute(bookTripSaga, params);
    return JSON.stringify(result);
  }
});
```

### Vercel AI SDK

```typescript
import { tool } from 'ai';

const processOrderTool = tool({
  description: 'Process an order with inventory, payment, and shipping',
  parameters: z.object({
    orderId: z.string(),
    items: z.array(z.object({ sku: z.string(), quantity: z.number() })),
    customerId: z.string()
  }),
  execute: async (params) => {
    return orchestrator.execute(orderSaga, params);
  }
});
```

## API Reference

### Saga

```typescript
new Saga<TInput>(name: string)
  .step<TResult>(definition: StepDefinition<TInput, TResult>): Saga<TInput>
  .addSteps(definitions: StepDefinition[]): Saga<TInput>
  .getStep(name: string): SagaStep | undefined
  .hasSteps(): boolean
  .steps: ReadonlyArray<SagaStep>
  .stepCount: number
  .name: string
```

### SagaOrchestrator

```typescript
new SagaOrchestrator(options: OrchestratorOptions & { store: StateStore })
  .execute<TInput, TResult>(saga: Saga<TInput>, input: TInput): Promise<SagaResult<TResult>>
  .recover(): Promise<void>
  .on<K extends keyof SagaEvents>(event: K, callback: SagaEvents[K]): void
  .off<K extends keyof SagaEvents>(event: K, callback: SagaEvents[K]): void
```

### Types

```typescript
interface SagaResult<TResult> {
  success: boolean;
  sagaId: string;
  result?: TResult;           // On success
  stepResults?: Map<string, unknown>;
  error?: Error;              // On failure
  failedStep?: string;
  compensated?: boolean;
  compensationErrors?: Array<{ step: string; error: Error }>;
}

interface SagaContext<TInput> {
  sagaId: string;
  input: TInput;
  stepResults: Map<string, unknown>;
}

interface StepDefinition<TInput, TResult> {
  name: string;
  execute: (ctx: SagaContext<TInput>) => Promise<TResult>;
  compensate?: (ctx: SagaContext<TInput>, result: TResult) => Promise<void>;
}
```

## Enterprise Features

Looking for advanced features? Check out [Saga Engine Cloud](https://saga-engine.dev):

- **Hosted State Management** — Durable storage with global replication
- **Observability Dashboard** — Real-time monitoring, tracing, and analytics
- **Team Collaboration** — Role-based access control and audit logs
- **SLA Guarantees** — 99.99% uptime with dedicated support

[Contact us for Enterprise pricing →](https://saga-engine.dev/enterprise)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Clone the repository
git clone https://github.com/saga-engine/saga-engine.git
cd saga-engine

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

## License

MIT © [Saga Engine Contributors](https://github.com/saga-engine/saga-engine/graphs/contributors)

---

<p align="center">
  <a href="https://saga-engine.dev">Website</a> •
  <a href="https://docs.saga-engine.dev">Documentation</a> •
  <a href="https://github.com/saga-engine/saga-engine/issues">Issues</a> •
  <a href="https://discord.gg/saga-engine">Discord</a>
</p>
