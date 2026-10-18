import { DRIVERS, PAINTS } from './config.js';
import { save, persist } from './storage.js';

function result(ok, message, extra = {}) {
  return { ok, message, ...extra };
}

export function selectDriver(id) {
  const driver = DRIVERS.find((item) => item.id === id);
  if (!driver) return result(false, 'Driver not found.');
  if (!save.unlocks.includes(id)) return result(false, `${driver.name} is locked. Unlock the driver first.`, { price: driver.price || 0 });
  save.driverId = id;
  persist();
  return result(true, `${driver.name} selected.`, { driver });
}

export function purchaseDriver(id) {
  const driver = DRIVERS.find((item) => item.id === id);
  if (!driver) return result(false, 'Driver not found.');
  if (save.unlocks.includes(id)) return selectDriver(id);
  const price = Math.max(0, Math.floor(driver.price || 0));
  if (save.money < price) return result(false, `You need ₦${price.toLocaleString()} to unlock ${driver.name}.`, { price });
  save.money -= price;
  save.unlocks.push(id);
  save.driverId = id;
  persist();
  return result(true, `${driver.name} unlocked and selected.`, { driver, price });
}

export function selectPaint(id) {
  const paint = PAINTS.find((item) => item.id === id);
  if (!paint) return result(false, 'Paint job not found.');
  if (!(save.unlockedPaints || ['gold']).includes(id)) {
    return result(false, `${paint.name} is locked. Unlock the paint first.`, { price: paint.price });
  }
  save.paint = paint.color;
  save.paintId = id;
  persist();
  return result(true, `${paint.name} selected.`, { paint });
}

export function purchasePaint(id) {
  const paint = PAINTS.find((item) => item.id === id);
  if (!paint) return result(false, 'Paint job not found.');
  save.unlockedPaints ||= ['gold'];
  if (save.unlockedPaints.includes(id)) return selectPaint(id);
  const price = Math.max(0, Math.floor(paint.price || 0));
  if (save.money < price) return result(false, `You need ₦${price.toLocaleString()} to unlock ${paint.name}.`, { price });
  save.money -= price;
  save.unlockedPaints.push(id);
  save.paint = paint.color;
  save.paintId = id;
  persist();
  return result(true, `${paint.name} unlocked and selected.`, { paint, price });
}
