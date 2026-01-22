/**
 * Basic usage example for @saga-engine/core
 *
 * This demonstrates a trip booking saga with automatic compensation on failure.
 */

import { Saga, SagaOrchestrator, InMemoryStore } from '@saga-engine/core';

// Simulated API clients
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

const emailAPI = {
  async send(to: string, subject: string) {
    console.log(`  📧 Sending email to ${to}: "${subject}"...`);
    await delay(50);
    console.log(`  ✅ Email sent`);
  },
};

// Helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Define the input type for our saga
interface TripInput {
  flight: { from: string; to: string };
  hotel: { city: string; nights: number };
  email: string;
}

// Define the saga
const bookTripSaga = new Saga<TripInput>('book-trip')
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
    name: 'send-confirmation',
    execute: async (ctx) => {
      await emailAPI.send(ctx.input.email, 'Your trip is booked!');
      return { sent: true };
    },
    compensate: async (ctx) => {
      await emailAPI.send(ctx.input.email, 'Sorry, your booking was cancelled.');
    },
  });

// Create the orchestrator
const orchestrator = new SagaOrchestrator({
  store: new InMemoryStore(),
});

// Add event listeners for visibility
orchestrator.on('saga:started', (state) => {
  console.log(`\n🚀 Saga "${state.sagaName}" started (ID: ${state.id})`);
});

orchestrator.on('step:executed', (_, stepName, result) => {
  console.log(`  ✓ Step "${stepName}" completed:`, result);
});

orchestrator.on('saga:completed', (state) => {
  console.log(`\n🎉 Saga "${state.sagaName}" completed successfully!\n`);
});

// Run the saga
async function main() {
  console.log('='.repeat(60));
  console.log('Saga Engine - Basic Usage Example');
  console.log('='.repeat(60));

  const result = await orchestrator.execute(bookTripSaga, {
    flight: { from: 'NYC', to: 'LAX' },
    hotel: { city: 'Los Angeles', nights: 3 },
    email: 'traveler@example.com',
  });

  if (result.success) {
    console.log('Trip booked successfully!');
    console.log('Step results:', Object.fromEntries(result.stepResults));
  } else {
    console.log('Trip booking failed:', result.error.message);
    console.log('Failed step:', result.failedStep);
    console.log('Compensated:', result.compensated);
  }
}

main().catch(console.error);
