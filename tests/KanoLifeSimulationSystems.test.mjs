import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoLifeSimulationSystems } from '../js/KanoLifeSimulationSystems.js';

test('world clock rhythm feeds passenger fare quote factors', () => {
  const systems = new KanoLifeSimulationSystems({ fuel: { stockLiters: 100 } });
  const world = systems.updateWorld({ weekday: 1, time: '10:00', location: 'road', demand: 0.5 });
  assert.equal(world.ok, true);
  assert.equal(world.marketDay, true);
  const quote = systems.quotePassengerFare({ distanceKm: 2 });
  assert.ok(quote.factors.marketDay > 1);
  assert.ok(quote.factors.demand > 0);
});

test('invalid game time does not overwrite the last valid world state', () => {
  const systems = new KanoLifeSimulationSystems();
  systems.updateWorld({ weekday: 2, time: '09:00' });
  const before = systems.snapshot().world;
  assert.equal(systems.updateWorld({ weekday: 2, time: '99:88' }).ok, false);
  assert.deepEqual(systems.snapshot().world, before);
});

test('fuel queue wrappers preserve FIFO and emit observable events', () => {
  const systems = new KanoLifeSimulationSystems({ fuel: { pumpCount: 1, stockLiters: 30, litersPerMinute: 10 } });
  const events = [];
  systems.onChange(event => events.push(event.type));
  assert.equal(systems.joinFuelQueue({ vehicleId: 'player-keke', requestedLiters: 10 }).ok, true);
  assert.equal(systems.joinFuelQueue({ vehicleId: 'taxi-2', requestedLiters: 10 }).ok, true);
  assert.equal(systems.startFuelService().service.vehicleId, 'player-keke');
  assert.ok(events.includes('fuel_queue_joined'));
  assert.ok(events.includes('fuel_service_started'));
});

test('fare settlement requires wallet confirmation before paid status', async () => {
  const systems = new KanoLifeSimulationSystems();
  const start = systems.startPassengerNegotiation({ passengerId: 'p1', distanceKm: 2, suggestedFare: 200 });
  assert.equal(start.ok, true);
  systems.fares.acceptPassengerOffer('p1');
  const failed = await systems.settlePassengerFare('p1', async () => false);
  assert.equal(failed.ok, false);
  assert.equal(systems.fares.snapshot('p1').status, 'accepted');
  const paid = await systems.settlePassengerFare('p1', async () => ({ ok: true }));
  assert.equal(paid.ok, true);
  assert.equal(systems.fares.snapshot('p1').status, 'paid');
});

test('fuel settlement only succeeds when payment callback confirms', async () => {
  const systems = new KanoLifeSimulationSystems({ fuel: { pumpCount: 1, stockLiters: 20, litersPerMinute: 10, pricePerLiter: 10 } });
  systems.joinFuelQueue({ vehicleId: 'keke', requestedLiters: 5 });
  systems.startFuelService();
  systems.tickFuelStation(1);
  const failed = await systems.settleFuel('keke', async () => false);
  assert.equal(failed.ok, false);
  const paid = await systems.settleFuel('keke', async () => true);
  assert.equal(paid.ok, true);
  assert.equal(systems.fuel.getReceipt('keke').state, 'paid');
});

test('event listeners can unsubscribe and destroy removes internal forwarding', () => {
  const systems = new KanoLifeSimulationSystems();
  let count = 0;
  const off = systems.onChange(() => count++);
  systems.updateWorld({ weekday: 0, time: '08:00' });
  off();
  systems.updateWorld({ weekday: 0, time: '09:00' });
  assert.equal(count, 1);
  systems.destroy();
  assert.equal(systems.listeners.size, 0);
});
