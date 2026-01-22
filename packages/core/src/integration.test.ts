/**
 * Integration tests for the full Saga Engine workflow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Saga, SagaOrchestrator, InMemoryStore } from './index.js';

describe('Integration Tests', () => {
  describe('Real-world booking scenario', () => {
    interface BookingInput {
      userId: string;
      flight: { from: string; to: string; date: string };
      hotel: { city: string; nights: number };
      email: string;
    }

    interface FlightBooking {
      confirmationNumber: string;
      flight: { from: string; to: string };
    }

    interface HotelReservation {
      reservationId: string;
      hotel: { city: string; nights: number };
    }

    // Simulated external services
    const createMockServices = () => {
      const bookings: Map<string, FlightBooking> = new Map();
      const reservations: Map<string, HotelReservation> = new Map();
      const emails: Array<{ to: string; subject: string; body: string }> = [];
      const logs: string[] = [];

      return {
        flightService: {
          book: async (flight: { from: string; to: string }): Promise<FlightBooking> => {
            const confirmationNumber = `FL-${Date.now()}`;
            const booking = { confirmationNumber, flight };
            bookings.set(confirmationNumber, booking);
            logs.push(`Flight booked: ${confirmationNumber}`);
            return booking;
          },
          cancel: async (confirmationNumber: string): Promise<void> => {
            if (!bookings.has(confirmationNumber)) {
              throw new Error(`Flight ${confirmationNumber} not found`);
            }
            bookings.delete(confirmationNumber);
            logs.push(`Flight cancelled: ${confirmationNumber}`);
          },
        },
        hotelService: {
          reserve: async (hotel: { city: string; nights: number }): Promise<HotelReservation> => {
            const reservationId = `HT-${Date.now()}`;
            const reservation = { reservationId, hotel };
            reservations.set(reservationId, reservation);
            logs.push(`Hotel reserved: ${reservationId}`);
            return reservation;
          },
          cancel: async (reservationId: string): Promise<void> => {
            if (!reservations.has(reservationId)) {
              throw new Error(`Hotel ${reservationId} not found`);
            }
            reservations.delete(reservationId);
            logs.push(`Hotel cancelled: ${reservationId}`);
          },
        },
        emailService: {
          send: async (to: string, subject: string, body: string): Promise<void> => {
            emails.push({ to, subject, body });
            logs.push(`Email sent to: ${to}`);
          },
        },
        getState: () => ({
          bookings: Array.from(bookings.values()),
          reservations: Array.from(reservations.values()),
          emails,
          logs,
        }),
      };
    };

    it('completes full booking successfully', async () => {
      const services = createMockServices();
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const bookTripSaga = new Saga<BookingInput>('book-trip')
        .step({
          name: 'book-flight',
          execute: async (ctx) => {
            const booking = await services.flightService.book(ctx.input.flight);
            return { confirmationNumber: booking.confirmationNumber };
          },
          compensate: async (_, result) => {
            await services.flightService.cancel(result.confirmationNumber);
          },
        })
        .step({
          name: 'reserve-hotel',
          execute: async (ctx) => {
            const reservation = await services.hotelService.reserve(ctx.input.hotel);
            return { reservationId: reservation.reservationId };
          },
          compensate: async (_, result) => {
            await services.hotelService.cancel(result.reservationId);
          },
        })
        .step({
          name: 'send-confirmation',
          execute: async (ctx) => {
            const flightResult = ctx.stepResults.get('book-flight') as { confirmationNumber: string };
            const hotelResult = ctx.stepResults.get('reserve-hotel') as { reservationId: string };

            await services.emailService.send(
              ctx.input.email,
              'Trip Confirmed!',
              `Flight: ${flightResult.confirmationNumber}, Hotel: ${hotelResult.reservationId}`
            );
            return { sent: true };
          },
        });

      const result = await orchestrator.execute(bookTripSaga, {
        userId: 'user-123',
        flight: { from: 'NYC', to: 'LAX', date: '2024-06-01' },
        hotel: { city: 'Los Angeles', nights: 3 },
        email: 'user@example.com',
      });

      expect(result.success).toBe(true);

      const state = services.getState();
      expect(state.bookings).toHaveLength(1);
      expect(state.reservations).toHaveLength(1);
      expect(state.emails).toHaveLength(1);
      expect(state.emails[0]?.to).toBe('user@example.com');
    });

    it('rolls back all bookings when email fails', async () => {
      const services = createMockServices();
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      // Override email service to fail
      services.emailService.send = async () => {
        throw new Error('Email service unavailable');
      };

      const bookTripSaga = new Saga<BookingInput>('book-trip')
        .step({
          name: 'book-flight',
          execute: async (ctx) => {
            const booking = await services.flightService.book(ctx.input.flight);
            return { confirmationNumber: booking.confirmationNumber };
          },
          compensate: async (_, result) => {
            await services.flightService.cancel(result.confirmationNumber);
          },
        })
        .step({
          name: 'reserve-hotel',
          execute: async (ctx) => {
            const reservation = await services.hotelService.reserve(ctx.input.hotel);
            return { reservationId: reservation.reservationId };
          },
          compensate: async (_, result) => {
            await services.hotelService.cancel(result.reservationId);
          },
        })
        .step({
          name: 'send-confirmation',
          execute: async (ctx) => {
            await services.emailService.send(ctx.input.email, 'Test', 'Test');
            return { sent: true };
          },
          compensate: async (ctx) => {
            await services.emailService.send(ctx.input.email, 'Booking Cancelled', 'Sorry');
          },
        });

      const result = await orchestrator.execute(bookTripSaga, {
        userId: 'user-123',
        flight: { from: 'NYC', to: 'LAX', date: '2024-06-01' },
        hotel: { city: 'Los Angeles', nights: 3 },
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe('send-confirmation');
        expect(result.compensated).toBe(true);
      }

      // Verify rollback
      const state = services.getState();
      expect(state.bookings).toHaveLength(0); // Flight cancelled
      expect(state.reservations).toHaveLength(0); // Hotel cancelled
      expect(state.logs.some((log) => log.includes('Flight cancelled'))).toBe(true);
      expect(state.logs.some((log) => log.includes('Hotel cancelled'))).toBe(true);
    });

    it('handles partial compensation failure', async () => {
      const services = createMockServices();
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({
        store,
        onCompensationFailure: 'continue',
      });

      // Make hotel cancellation fail
      const originalCancel = services.hotelService.cancel;
      services.hotelService.cancel = async () => {
        throw new Error('Hotel cancellation API is down');
      };

      const bookTripSaga = new Saga<BookingInput>('book-trip')
        .step({
          name: 'book-flight',
          execute: async (ctx) => {
            const booking = await services.flightService.book(ctx.input.flight);
            return { confirmationNumber: booking.confirmationNumber };
          },
          compensate: async (_, result) => {
            await services.flightService.cancel(result.confirmationNumber);
          },
        })
        .step({
          name: 'reserve-hotel',
          execute: async (ctx) => {
            const reservation = await services.hotelService.reserve(ctx.input.hotel);
            return { reservationId: reservation.reservationId };
          },
          compensate: async (_, result) => {
            await services.hotelService.cancel(result.reservationId);
          },
        })
        .step({
          name: 'charge-payment',
          execute: async () => {
            throw new Error('Payment declined');
          },
        });

      const result = await orchestrator.execute(bookTripSaga, {
        userId: 'user-123',
        flight: { from: 'NYC', to: 'LAX', date: '2024-06-01' },
        hotel: { city: 'Los Angeles', nights: 3 },
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe('charge-payment');
        expect(result.compensated).toBe(false);
        expect(result.compensationErrors).toHaveLength(1);
        expect(result.compensationErrors?.[0]?.step).toBe('reserve-hotel');
      }

      // Flight should still be cancelled
      const state = services.getState();
      expect(state.bookings).toHaveLength(0);
      // Hotel reservation remains (cancellation failed)
      expect(state.reservations).toHaveLength(1);
    });
  });

  describe('E-commerce order processing', () => {
    interface OrderInput {
      orderId: string;
      items: Array<{ sku: string; quantity: number }>;
      payment: { method: string; amount: number };
      shipping: { address: string };
    }

    const createOrderServices = () => {
      const inventory = new Map<string, number>([
        ['SKU-001', 100],
        ['SKU-002', 50],
        ['SKU-003', 0], // Out of stock
      ]);
      const reservations = new Map<string, Array<{ sku: string; quantity: number }>>();
      const charges = new Map<string, number>();
      const shipments = new Map<string, string>();

      return {
        inventory: {
          reserve: async (orderId: string, items: Array<{ sku: string; quantity: number }>) => {
            for (const item of items) {
              const available = inventory.get(item.sku) ?? 0;
              if (available < item.quantity) {
                throw new Error(`Insufficient stock for ${item.sku}`);
              }
            }
            // Reserve items
            for (const item of items) {
              inventory.set(item.sku, (inventory.get(item.sku) ?? 0) - item.quantity);
            }
            reservations.set(orderId, items);
            return { reserved: true };
          },
          release: async (orderId: string) => {
            const items = reservations.get(orderId);
            if (items) {
              for (const item of items) {
                inventory.set(item.sku, (inventory.get(item.sku) ?? 0) + item.quantity);
              }
              reservations.delete(orderId);
            }
          },
        },
        payment: {
          charge: async (orderId: string, amount: number) => {
            if (amount > 1000) {
              throw new Error('Amount exceeds limit');
            }
            charges.set(orderId, amount);
            return { transactionId: `TXN-${orderId}` };
          },
          refund: async (orderId: string) => {
            charges.delete(orderId);
          },
        },
        shipping: {
          createLabel: async (orderId: string, address: string) => {
            shipments.set(orderId, address);
            return { trackingNumber: `TRACK-${orderId}` };
          },
          cancelLabel: async (orderId: string) => {
            shipments.delete(orderId);
          },
        },
        getState: () => ({
          inventory: Object.fromEntries(inventory),
          reservations: Object.fromEntries(reservations),
          charges: Object.fromEntries(charges),
          shipments: Object.fromEntries(shipments),
        }),
      };
    };

    it('processes order successfully', async () => {
      const services = createOrderServices();
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const processOrderSaga = new Saga<OrderInput>('process-order')
        .step({
          name: 'reserve-inventory',
          execute: async (ctx) => services.inventory.reserve(ctx.input.orderId, ctx.input.items),
          compensate: async (ctx) => services.inventory.release(ctx.input.orderId),
        })
        .step({
          name: 'charge-payment',
          execute: async (ctx) => services.payment.charge(ctx.input.orderId, ctx.input.payment.amount),
          compensate: async (ctx) => services.payment.refund(ctx.input.orderId),
        })
        .step({
          name: 'create-shipment',
          execute: async (ctx) =>
            services.shipping.createLabel(ctx.input.orderId, ctx.input.shipping.address),
          compensate: async (ctx) => services.shipping.cancelLabel(ctx.input.orderId),
        });

      const result = await orchestrator.execute(processOrderSaga, {
        orderId: 'ORD-123',
        items: [
          { sku: 'SKU-001', quantity: 2 },
          { sku: 'SKU-002', quantity: 1 },
        ],
        payment: { method: 'card', amount: 150 },
        shipping: { address: '123 Main St' },
      });

      expect(result.success).toBe(true);

      const state = services.getState();
      expect(state.inventory['SKU-001']).toBe(98); // 100 - 2
      expect(state.inventory['SKU-002']).toBe(49); // 50 - 1
      expect(state.charges['ORD-123']).toBe(150);
      expect(state.shipments['ORD-123']).toBe('123 Main St');
    });

    it('rolls back on payment failure', async () => {
      const services = createOrderServices();
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const processOrderSaga = new Saga<OrderInput>('process-order')
        .step({
          name: 'reserve-inventory',
          execute: async (ctx) => services.inventory.reserve(ctx.input.orderId, ctx.input.items),
          compensate: async (ctx) => services.inventory.release(ctx.input.orderId),
        })
        .step({
          name: 'charge-payment',
          execute: async (ctx) => services.payment.charge(ctx.input.orderId, ctx.input.payment.amount),
          compensate: async (ctx) => services.payment.refund(ctx.input.orderId),
        });

      const result = await orchestrator.execute(processOrderSaga, {
        orderId: 'ORD-456',
        items: [{ sku: 'SKU-001', quantity: 5 }],
        payment: { method: 'card', amount: 2000 }, // Exceeds limit
        shipping: { address: '456 Oak Ave' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe('charge-payment');
      }

      // Inventory should be restored
      const state = services.getState();
      expect(state.inventory['SKU-001']).toBe(100); // Restored
      expect(Object.keys(state.charges)).toHaveLength(0);
    });

    it('fails fast on out-of-stock items', async () => {
      const services = createOrderServices();
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      const processOrderSaga = new Saga<OrderInput>('process-order')
        .step({
          name: 'reserve-inventory',
          execute: async (ctx) => services.inventory.reserve(ctx.input.orderId, ctx.input.items),
          compensate: async (ctx) => services.inventory.release(ctx.input.orderId),
        })
        .step({
          name: 'charge-payment',
          execute: async (ctx) => services.payment.charge(ctx.input.orderId, ctx.input.payment.amount),
        });

      const result = await orchestrator.execute(processOrderSaga, {
        orderId: 'ORD-789',
        items: [{ sku: 'SKU-003', quantity: 1 }], // Out of stock
        payment: { method: 'card', amount: 50 },
        shipping: { address: '789 Pine St' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe('reserve-inventory');
        expect(result.error.message).toContain('Insufficient stock');
      }

      // No compensation needed (first step failed)
      const state = services.getState();
      expect(Object.keys(state.charges)).toHaveLength(0);
    });
  });

  describe('Event-driven workflow', () => {
    it('tracks all events throughout saga lifecycle', async () => {
      const events: Array<{ type: string; data: unknown }> = [];
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      orchestrator.on('saga:started', (state) => {
        events.push({ type: 'saga:started', data: { sagaId: state.id, name: state.sagaName } });
      });
      orchestrator.on('step:executing', (state, stepName) => {
        events.push({ type: 'step:executing', data: { sagaId: state.id, step: stepName } });
      });
      orchestrator.on('step:executed', (state, stepName, result) => {
        events.push({ type: 'step:executed', data: { sagaId: state.id, step: stepName, result } });
      });
      orchestrator.on('saga:completed', (state) => {
        events.push({ type: 'saga:completed', data: { sagaId: state.id } });
      });

      const saga = new Saga('event-saga')
        .step({
          name: 'step-1',
          execute: async () => ({ a: 1 }),
        })
        .step({
          name: 'step-2',
          execute: async () => ({ b: 2 }),
        });

      const result = await orchestrator.execute(saga, {});

      expect(events).toHaveLength(6);
      expect(events[0]?.type).toBe('saga:started');
      expect(events[1]?.type).toBe('step:executing');
      expect(events[2]?.type).toBe('step:executed');
      expect(events[3]?.type).toBe('step:executing');
      expect(events[4]?.type).toBe('step:executed');
      expect(events[5]?.type).toBe('saga:completed');

      // Verify saga ID is consistent
      const sagaIds = events.map((e) => (e.data as { sagaId: string }).sagaId);
      expect(new Set(sagaIds).size).toBe(1);
      expect(sagaIds[0]).toBe(result.sagaId);
    });

    it('tracks failure and compensation events', async () => {
      const events: string[] = [];
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });

      orchestrator.on('saga:started', () => events.push('saga:started'));
      orchestrator.on('step:executing', (_, step) => events.push(`step:executing:${step}`));
      orchestrator.on('step:executed', (_, step) => events.push(`step:executed:${step}`));
      orchestrator.on('step:failed', (_, step) => events.push(`step:failed:${step}`));
      orchestrator.on('compensation:started', () => events.push('compensation:started'));
      orchestrator.on('compensation:step', (_, step) => events.push(`compensation:step:${step}`));
      orchestrator.on('compensation:completed', () => events.push('compensation:completed'));

      const saga = new Saga('fail-saga')
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

      expect(events).toEqual([
        'saga:started',
        'step:executing:step-1',
        'step:executed:step-1',
        'step:executing:step-2',
        'step:executed:step-2',
        'step:executing:step-3',
        'step:failed:step-3',
        'compensation:started',
        'compensation:step:step-2',
        'compensation:step:step-1',
        'compensation:completed',
      ]);
    });
  });

  describe('State inspection during execution', () => {
    it('allows reading state during step execution', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const statesObserved: Array<{ step: string; status: string }> = [];

      const saga = new Saga('inspect-saga')
        .step({
          name: 'step-1',
          execute: async (ctx) => {
            const state = await store.get(ctx.sagaId);
            statesObserved.push({ step: 'step-1', status: state?.status ?? 'unknown' });
            return {};
          },
        })
        .step({
          name: 'step-2',
          execute: async (ctx) => {
            const state = await store.get(ctx.sagaId);
            statesObserved.push({ step: 'step-2', status: state?.status ?? 'unknown' });
            return {};
          },
        });

      await orchestrator.execute(saga, {});

      expect(statesObserved[0]).toEqual({ step: 'step-1', status: 'running' });
      expect(statesObserved[1]).toEqual({ step: 'step-2', status: 'running' });
    });
  });

  describe('Long-running saga simulation', () => {
    it('handles many steps efficiently', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const stepCount = 50;
      const executedSteps: number[] = [];

      const saga = new Saga<{ startValue: number }>('long-saga');

      for (let i = 0; i < stepCount; i++) {
        saga.step({
          name: `step-${i}`,
          execute: async (ctx) => {
            executedSteps.push(i);
            const prevResult =
              i === 0
                ? ctx.input.startValue
                : (ctx.stepResults.get(`step-${i - 1}`) as { value: number }).value;
            return { value: prevResult + 1 };
          },
        });
      }

      const result = await orchestrator.execute(saga, { startValue: 0 });

      expect(result.success).toBe(true);
      expect(executedSteps).toHaveLength(stepCount);
      if (result.success) {
        expect(result.result).toEqual({ value: stepCount });
      }
    });

    it('compensates many steps on late failure', async () => {
      const store = new InMemoryStore();
      const orchestrator = new SagaOrchestrator({ store });
      const stepCount = 20;
      const compensatedSteps: number[] = [];

      const saga = new Saga('long-fail-saga');

      for (let i = 0; i < stepCount; i++) {
        if (i === stepCount - 1) {
          // Last step fails
          saga.step({
            name: `step-${i}`,
            execute: async () => {
              throw new Error('Final step failed');
            },
          });
        } else {
          saga.step({
            name: `step-${i}`,
            execute: async () => ({ completed: i }),
            compensate: async () => {
              compensatedSteps.push(i);
            },
          });
        }
      }

      const result = await orchestrator.execute(saga, {});

      expect(result.success).toBe(false);
      // All steps except the failed one should be compensated in reverse order
      expect(compensatedSteps).toHaveLength(stepCount - 1);
      expect(compensatedSteps).toEqual(
        Array.from({ length: stepCount - 1 }, (_, i) => stepCount - 2 - i)
      );
    });
  });
});
