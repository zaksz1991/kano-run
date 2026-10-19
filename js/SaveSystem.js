/** Kano Life local-first progression persistence. Safe to use without Supabase. */
const KEY = 'kano-life-save-v1';
const DEFAULTS = { version: 1, bank: 0, lifetimeEarnings: 0, unlockedDrivers: ['Bello'], selectedDriver: 'Bello', unlockedVehicles: ['TVS Green'], selectedVehicle: 'TVS Green', completedRoutes: [], bestScores: {}, maintenance: { tyre: 100, engineOil: 100, fanBelt: 100 }, settings: { quality: 'auto', audio: true }, updatedAt: null };
const clone = x => JSON.parse(JSON.stringify(x));
export class SaveSystem {
  constructor({ storage = globalThis.localStorage, key = KEY, onError = () => {} } = {}) { this.storage = storage; this.key = key; this.onError = onError; this.data = this.load(); }
  load() { try { const raw = this.storage?.getItem(this.key); return raw ? { ...clone(DEFAULTS), ...JSON.parse(raw) } : clone(DEFAULTS); } catch (e) { this.onError(e); return clone(DEFAULTS); } }
  snapshot() { return clone(this.data); }
  update(patch) { this.data = { ...this.data, ...patch, updatedAt: new Date().toISOString() }; this.persist(); return this.snapshot(); }
  persist() { try { this.storage?.setItem(this.key, JSON.stringify(this.data)); return true; } catch (e) { this.onError(e); return false; } }
  bankFare(amount) { const n = Math.max(0, Number(amount) || 0); return this.update({ bank: this.data.bank + n, lifetimeEarnings: this.data.lifetimeEarnings + n }); }
  spend(amount, reason = 'expense') { const n = Math.max(0, Number(amount) || 0); if (n > this.data.bank) return { ok: false, balance: this.data.bank, reason }; this.update({ bank: this.data.bank - n }); return { ok: true, balance: this.data.bank }; }
  unlock(type, id) { const field = type === 'driver' ? 'unlockedDrivers' : 'unlockedVehicles'; if (!['driver','vehicle'].includes(type) || !id) return false; if (!this.data[field].includes(id)) this.update({ [field]: [...this.data[field], id] }); return true; }
  select(type, id) { const list = type === 'driver' ? this.data.unlockedDrivers : this.data.unlockedVehicles; if (!list?.includes(id)) return false; this.update({ [type === 'driver' ? 'selectedDriver' : 'selectedVehicle']: id }); return true; }
  completeRoute(id, score = 0) { if (!id) return; this.update({ completedRoutes: [...new Set([...this.data.completedRoutes, id])], bestScores: { ...this.data.bestScores, [id]: Math.max(Number(this.data.bestScores[id]) || 0, Number(score) || 0) } }); }
  reset() { this.data = clone(DEFAULTS); this.persist(); }
  async syncToSupabase(client, userId) { if (!client || !userId) return { ok: false, reason: 'Supabase client and authenticated user ID are required.' }; const { error } = await client.from('player_profiles').upsert({ user_id: userId, save_data: this.snapshot(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); if (error) return { ok: false, reason: error.message }; return { ok: true }; }
  async loadFromSupabase(client, userId) { if (!client || !userId) return { ok: false, reason: 'Supabase client and authenticated user ID are required.' }; const { data, error } = await client.from('player_profiles').select('save_data').eq('user_id', userId).maybeSingle(); if (error) return { ok: false, reason: error.message }; if (data?.save_data) { this.data = { ...clone(DEFAULTS), ...data.save_data }; this.persist(); } return { ok: true, found: !!data?.save_data }; }
}
export default SaveSystem;
