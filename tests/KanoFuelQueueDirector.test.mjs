import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoFuelQueueDirector } from '../js/KanoFuelQueueDirector.js';

test('vehicles join in arrival order and duplicate joins are rejected', () => {
  const station = new KanoFuelQueueDirector();
  assert.equal(station.joinQueue({ vehicleId: 'keke-1' }).position, 1);
  assert.equal(station.joinQueue({ vehicleId: 'keke-2' }).position, 2);
  assert.equal(station.joinQueue({ vehicleId: 'keke-1' }).reason, 'vehicle_already_at_station');
  assert.equal(station.snapshot().queue[0].vehicleId, 'keke-1');
});

test('pump capacity is enforced', () => {
  const station = new KanoFuelQueueDirector({ pumpCount: 1, litersPerMinute: 10 });
  station.joinQueue({ vehicleId: 'a', requestedLiters: 10 });
  station.joinQueue({ vehicleId: 'b', requestedLiters: 10 });
  assert.equal(station.startNext().ok, true);
  assert.equal(station.startNext().reason, 'all_pumps_busy');
});

test('station reserves stock and caps service to available fuel', () => {
  const station = new KanoFuelQueueDirector({ stockLiters: 3, pumpCount: 1 });
  station.joinQueue({ vehicleId: 'keke', requestedLiters: 10 });
  const started = station.startNext();
  assert.equal(started.service.liters, 3);
  assert.equal(station.snapshot().stockLiters, 0);
  assert.equal(station.joinQueue({ vehicleId: 'bike' }).reason, 'station_out_of_fuel');
});

test('tick reports completed refuelling without adding fuel to vehicle state', () => {
  const station = new KanoFuelQueueDirector({ litersPerMinute: 10, stockLiters: 20 });
  station.joinQueue({ vehicleId: 'keke', requestedLiters: 5 });
  station.startNext();
  assert.equal(station.tick(0.4).completed.length, 0);
  const result = station.tick(0.1);
  assert.equal(result.completed[0].state, 'awaiting_payment');
  assert.equal(result.completed[0].liters, 5);
});

test('payment failure leaves receipt unsettled; successful callback creates receipt once', async () => {
  const station = new KanoFuelQueueDirector({ litersPerMinute: 10 });
  station.joinQueue({ vehicleId: 'keke', requestedLiters: 2 });
  station.startNext();
  station.tick(1);
  assert.equal((await station.settle('keke', async () => false)).reason, 'payment_failed');
  assert.equal((await station.settle('keke', async () => ({ ok: true }))).ok, true);
  assert.equal(station.getReceipt('keke').state, 'paid');
  assert.equal((await station.settle('keke', async () => true)).reason, 'service_not_ready');
});

test('queue cancellation and price validation are safe', () => {
  const station = new KanoFuelQueueDirector();
  station.joinQueue({ vehicleId: 'keke' });
  assert.equal(station.leaveQueue('keke').ok, true);
  assert.equal(station.leaveQueue('keke').reason, 'vehicle_not_waiting');
  assert.equal(station.setPrice(-2).reason, 'invalid_price');
  assert.equal(station.setPrice(1100).ok, true);
});
