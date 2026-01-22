/**
 * Failure and compensation example for @saga-engine/core
 *
 * This demonstrates how the saga engine automatically rolls back
 * completed steps when a later step fails.
 */

import { Saga, SagaOrchestrator, InMemoryStore } from '@saga-engine/core';

// Simulated API clients (same as basic example)
const flightAPI = {
  async book(details: { from: string; to: string }) {
    console.log(`  ✈️  Booking flight from ${details.from} to ${details.to}...`);
    await delay(100);
    const id = `FL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    console.log(`  ✅ Flight booked: ${id}`);
    return { id, ...details };
  },
  async cancel(flightId: string) {
    console.log(`  🔄 Cancelling flight ${flightId}...`);
    await delay(50);
    console.log(`  ✅ Flight ${flightId} cancelled`);
  },
};

const hotelAPI = {
  async reserve(details: { city: string; nights: number }) {
    console.log(`  🏨 Reserving hotel in ${details.city} for ${details.nights} nights...`);
    await delay(100);
    const id = `HT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    console.log(`  ✅ Hotel reserved: ${id}`);
    return { id, ...details };
  },
  async cancel(hotelId: string) {
    console.log(`  🔄 Cancelling hotel reservation ${hotelId}...`);
    await delay(50);
    console.log(`  ✅ Hotel reservation ${hotelId} cancelled`);
  },
};

const carRentalAPI = {
  async reserve(details: { city: string; days: number }) {
    console.log(`  🚗 Reserving car in ${details.city} for ${details.days} days...`);
    await delay(100);
    // Simulate a failure - no cars available!
    throw new Error('No cars available at this location');
  },
  async cancel(reservationId: string) {
    console.log(`  🔄 Cancelling car reservation ${reservationId}...`);
    await delay(50);
    console.log(`  ✅ Car reservation ${reservationId} cancelled`);
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TripInput {
  flight: { from: string; to: string };
  hotel: { city: string; nights: number };
  car: { city: string; days: number };
}

// Define a saga that will fail on the third step
const bookTripWithCarSaga = new Saga<TripInput>('book-trip-with-car')
  .step({
    name: 'book-flight',
    execute: async (ctx) => {
      const booking = await flightAPI.book(ctx.input.flight);
      return { flightId: booking.id };
    },
    compensate: async (ctx, result) => {
      await flightAPI.cancel(result.flightId);
    },
  })
  .step({
    name: 'reserve-hotel',
    execute: async (ctx) => {
      const reservation = await hotelAPI.reserve(ctx.input.hotel);
      return { hotelId: reservation.id };
    },
    compensate: async (ctx, result) => {
      await hotelAPI.cancel(result.hotelId);
    },
  })
  .step({
    name: 'reserve-car',
    execute: async (ctx) => {
      // This step will fail!
      const reservation = await carRentalAPI.reserve(ctx.input.car);
      return { carId: reservation };
    },
    compensate: async (_, result) => {
      // This won't be called since execute failed
      await carRentalAPI.cancel(result.carId);
    },
  });

// Create the orchestrator
const orchestrator = new SagaOrchestrator({
  store: new InMemoryStore(),
});

// Add event listeners
orchestrator.on('saga:started', (state) => {
  console.log(`\n🚀 Saga "${state.sagaName}" started (ID: ${state.id})`);
});

orchestrator.on('step:executed', (_, stepName, result) => {
  console.log(`  ✓ Step "${stepName}" completed:`, result);
});

orchestrator.on('step:failed', (_, stepName, error) => {
  console.log(`\n  ❌ Step "${stepName}" FAILED: ${error.message}`);
});

orchestrator.on('compensation:started', () => {
  console.log('\n⏪ Starting compensation (rollback)...');
});

orchestrator.on('compensation:step', (_, stepName) => {
  console.log(`  ↩️  Compensating step "${stepName}"...`);
});

orchestrator.on('compensation:completed', () => {
  console.log('\n✅ Compensation completed - all changes rolled back\n');
});

// Run the saga
async function main() {
  console.log('='.repeat(60));
  console.log('Saga Engine - Failure & Compensation Example');
  console.log('='.repeat(60));
  console.log('\nThis example shows automatic rollback when a step fails.');
  console.log('The car rental step will fail, triggering compensation.\n');

  const result = await orchestrator.execute(bookTripWithCarSaga, {
    flight: { from: 'NYC', to: 'LAX' },
    hotel: { city: 'Los Angeles', nights: 3 },
    car: { city: 'Los Angeles', days: 3 },
  });

  console.log('-'.repeat(60));
  console.log('RESULT:');
  console.log('-'.repeat(60));

  if (result.success) {
    console.log('Trip booked successfully!');
  } else {
    console.log(`Failed: ${result.error.message}`);
    console.log(`Failed step: ${result.failedStep}`);
    console.log(`Compensated: ${result.compensated}`);

    if (result.compensationErrors && result.compensationErrors.length > 0) {
      console.log('Compensation errors:');
      for (const err of result.compensationErrors) {
        console.log(`  - ${err.step}: ${err.error.message}`);
      }
    }
  }
}

main().catch(console.error);
