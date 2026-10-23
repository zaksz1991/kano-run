import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = name => new URL(`../js/${name}`, import.meta.url);

test('fuel market loads after the existing maintenance and wallet layers', async () => {
  const household = await readFile(path('KanoNorthernDriverHouseholdBudgetUpgrade.js'), 'utf8');
  const maintenanceImport = household.indexOf("await import('./KanoNorthernDriverVehicleMaintenanceUpgrade.js')");
  const fuelImport = household.indexOf("await import('./KanoNorthernDriverFuelMarketUpgrade.js')");
  assert.ok(maintenanceImport >= 0, 'maintenance integration remains loaded');
  assert.ok(fuelImport > maintenanceImport, 'fuel layer loads after wallet and maintenance');
});

test('existing life wallet accepts only the whitelisted fuel purchase transaction in addition to maintenance', async () => {
  const source = await readFile(path('KanoNorthernDriverLifeSimulationUpgrade.js'), 'utf8');
  assert.match(source, /category === 'fuel' && normalizedServiceId === 'fuel_purchase'/);
  assert.match(source, /life\.state\.totals\[totalKey\] = money/);
  assert.match(source, /kano:life-fuel-expense/);
  assert.match(source, /if \(life\.state\.activeShift\).*reason: 'shift_active'/s);
});

test('shift fuel baseline accounts for purchased units and exposes real tank gauge separately', async () => {
  const source = await readFile(path('KanoNorthernDriverLifeSimulationUpgrade.js'), 'utf8');
  assert.match(source, /syncFuelMarketShiftStart:/);
  assert.match(source, /active\.fuel = clamp\(fuelBaseline, 0, 100\)/);
  assert.match(source, /active\.fuelGaugeAtShiftStart = clamp\(fuelGaugeAtShiftStart, 0, 100\)/);
  assert.match(source, /active\.prepaidFuelAtStart = clamp\(prepaidFuelAtStart, 0, 100\)/);
});

test('career settlement charges only uncredited fuel at the current day price multiplier', async () => {
  const model = await readFile(path('KanoNorthernDriverLifeSimulation.js'), 'utf8');
  assert.match(model, /const billableFuelUsed = Math\.max\(0, active\.fuel - fuelEnd\)/);
  assert.match(model, /const fuelDue = money\(billableFuelUsed \* 8 \* fuelPriceMultiplier\)/);
  assert.match(model, /prepaidFuelUnitsUsed: Number\(prepaidFuelUsed\.toFixed\(2\)\)/);
});

test('day-settlement entrypoint loads the household planner, which then loads maintenance and fuel market', async () => {
  const settlement = await readFile(path('KanoNorthernDriverDaySettlementUpgrade.js'), 'utf8');
  const household = await readFile(path('KanoNorthernDriverHouseholdBudgetUpgrade.js'), 'utf8');
  assert.match(settlement, /install\(\);[\s\S]*await import\('\.\/KanoNorthernDriverHouseholdBudgetUpgrade\.js'\)/);
  assert.match(household, /await import\('\.\/KanoNorthernDriverVehicleMaintenanceUpgrade\.js'\)[\s\S]*await import\('\.\/KanoNorthernDriverFuelMarketUpgrade\.js'\)/);
});
