import { Saga } from '@saga-engine/core';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------------------------------------------------------
// 1. Travel Booking Saga
// -------------------------------------------------------------------------
export interface TravelBookingInput {
  from: string;
  to: string;
  hotelCity: string;
  nights: number;
  carLocation: string;
  days: number;
}

export function buildTravelSaga(simulateFailureStep?: string): Saga<TravelBookingInput> {
  return new Saga<TravelBookingInput>('travel-booking')
    .step({
      name: 'book-flight',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'book-flight') {
          throw new Error('Simulated failure: Flight unavailable for requested route.');
        }
        const flightId = `FL-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { flightId, route: `${ctx.input.from} -> ${ctx.input.to}`, price: '$450.00' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    })
    .step({
      name: 'reserve-hotel',
      execute: async (ctx) => {
        await delay(450);
        if (simulateFailureStep === 'reserve-hotel') {
          throw new Error(`Simulated failure: Hotel in ${ctx.input.hotelCity} fully booked.`);
        }
        const reservationId = `HT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { reservationId, city: ctx.input.hotelCity, nights: ctx.input.nights, price: '$320.00' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    })
    .step({
      name: 'rent-car',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'rent-car') {
          throw new Error(`Simulated failure: No rental vehicles available at ${ctx.input.carLocation}.`);
        }
        const rentalId = `CR-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { rentalId, location: ctx.input.carLocation, days: ctx.input.days, price: '$180.00' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    });
}

// -------------------------------------------------------------------------
// 2. E-Commerce Order Saga
// -------------------------------------------------------------------------
export interface ECommerceInput {
  orderId: string;
  customerId: string;
  itemsCount: number;
  amount: number;
  shippingAddress: string;
}

export function buildECommerceSaga(simulateFailureStep?: string): Saga<ECommerceInput> {
  return new Saga<ECommerceInput>('ecommerce-order')
    .step({
      name: 'validate-cart',
      execute: async (ctx) => {
        await delay(300);
        if (simulateFailureStep === 'validate-cart') {
          throw new Error('Simulated failure: Items in cart are out of stock / invalid prices.');
        }
        return { orderId: ctx.input.orderId, itemsCount: ctx.input.itemsCount, validated: true };
      },
      compensate: async () => {
        await delay(200);
      },
    })
    .step({
      name: 'reserve-inventory',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'reserve-inventory') {
          throw new Error('Simulated failure: Inventory allocation lock timeout.');
        }
        const lockId = `INV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { lockId, reservedItems: ctx.input.itemsCount };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    })
    .step({
      name: 'process-payment',
      execute: async (ctx) => {
        await delay(450);
        if (simulateFailureStep === 'process-payment') {
          throw new Error(`Simulated failure: Payment transaction declined for Customer ${ctx.input.customerId}.`);
        }
        const transactionId = `TX-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { transactionId, amount: `$${ctx.input.amount.toFixed(2)}`, status: 'CHARGED' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(350);
      },
    })
    .step({
      name: 'create-shipment',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'create-shipment') {
          throw new Error(`Simulated failure: Logistics API down for destination ${ctx.input.shippingAddress}.`);
        }
        const trackingNumber = `TRK-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        return { trackingNumber, carrier: 'SagaExpress', destination: ctx.input.shippingAddress };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    });
}

// -------------------------------------------------------------------------
// 3. AI Agent Task Saga
// -------------------------------------------------------------------------
export interface AIAgentInput {
  agentId: string;
  taskType: string;
  targetResource: string;
  payload: string;
}

export function buildAIAgentSaga(simulateFailureStep?: string): Saga<AIAgentInput> {
  return new Saga<AIAgentInput>('ai-agent-task')
    .step({
      name: 'acquire-resources',
      execute: async (ctx) => {
        await delay(350);
        if (simulateFailureStep === 'acquire-resources') {
          throw new Error(`Simulated failure: Insufficient GPU/Context memory allocated for ${ctx.input.targetResource}.`);
        }
        const lockToken = `MEM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { lockToken, resource: ctx.input.targetResource, allocatedVRAM: '16GB' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(250);
      },
    })
    .step({
      name: 'execute-action',
      execute: async (ctx) => {
        await delay(500);
        if (simulateFailureStep === 'execute-action') {
          throw new Error(`Simulated failure: Agent execution thrown exception during tool invocation "${ctx.input.taskType}".`);
        }
        const executionId = `EXEC-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        return { executionId, agentId: ctx.input.agentId, task: ctx.input.taskType, status: 'COMPLETED_RAW' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    })
    .step({
      name: 'commit-changes',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'commit-changes') {
          throw new Error('Simulated failure: Vector index lock contention during commit.');
        }
        const commitHash = `GIT-${Math.random().toString(36).substring(2, 9)}`;
        return { commitHash, persistedRecords: 142, status: 'SUCCESS' };
      },
      compensate: async (_ctx, _result: any) => {
        await delay(300);
      },
    });
}

// -------------------------------------------------------------------------
// 4. Revocation Saga (P28 Requirement)
// -------------------------------------------------------------------------
export interface RevocationInput {
  targetUser: string;
  systems: string[];
}

export function buildRevocationSaga(simulateFailureStep?: string): Saga<RevocationInput> {
  return new Saga<RevocationInput>('revocation-workflow')
    .step({
      name: 'revoke-system-a',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'revoke-system-a') {
          throw new Error(`Simulated failure: IAM API connection timeout for System A (${ctx.input.targetUser}).`);
        }
        return { system: 'System A', targetUser: ctx.input.targetUser, status: 'REVOKED', revokedAt: new Date().toISOString() };
      },
      compensate: async (ctx) => {
        await delay(300);
        // Compensation re-grants access!
        return;
      },
    })
    .step({
      name: 'revoke-system-b',
      execute: async (ctx) => {
        await delay(450);
        if (simulateFailureStep === 'revoke-system-b') {
          throw new Error(`Simulated failure: Database role lock conflict on System B for ${ctx.input.targetUser}.`);
        }
        return { system: 'System B', targetUser: ctx.input.targetUser, status: 'REVOKED', revokedAt: new Date().toISOString() };
      },
      compensate: async (ctx) => {
        await delay(300);
        return;
      },
    })
    .step({
      name: 'revoke-system-c',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'revoke-system-c') {
          throw new Error(`Simulated failure: API Gateway rate limit exceeded on System C for ${ctx.input.targetUser}.`);
        }
        return { system: 'System C', targetUser: ctx.input.targetUser, status: 'REVOKED', revokedAt: new Date().toISOString() };
      },
      compensate: async (ctx) => {
        await delay(300);
        return;
      },
    })
    .step({
      name: 'revoke-system-d',
      execute: async (ctx) => {
        await delay(400);
        if (simulateFailureStep === 'revoke-system-d') {
          throw new Error(`Simulated failure: VPN Certificate Authority unreachable for System D.`);
        }
        return { system: 'System D', targetUser: ctx.input.targetUser, status: 'REVOKED', revokedAt: new Date().toISOString() };
      },
      compensate: async (ctx) => {
        await delay(300);
        return;
      },
    });
}

// -------------------------------------------------------------------------
// Helper to get defined steps for failure options selector
// -------------------------------------------------------------------------
export function getScenarioSteps(scenario: string): string[] {
  switch (scenario) {
    case 'travel':
      return ['book-flight', 'reserve-hotel', 'rent-car'];
    case 'ecommerce':
      return ['validate-cart', 'reserve-inventory', 'process-payment', 'create-shipment'];
    case 'ai-agent':
      return ['acquire-resources', 'execute-action', 'commit-changes'];
    case 'revocation':
      return ['revoke-system-a', 'revoke-system-b', 'revoke-system-c', 'revoke-system-d'];
    default:
      return [];
  }
}
