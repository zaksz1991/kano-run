/** Route-aware service hotspots. Coordinates are supplied by your route/world adapter. */
export const KANO_HOTSPOT_TYPES = Object.freeze({ fuel:{label:'Filling Station',actions:['refuel']}, mechanic:{label:'Garajin Keke',actions:['repair','service']}, mosque:{label:'Mosque / Prayer Stop',actions:['prayer-break']}, vulcanizer:{label:'Vulcanizer',actions:['repair-tyre']}, spareParts:{label:'Spare Parts Shop',actions:['buy-parts','engine-oil']} });
export class SpatialHotspotManager {
 constructor({ hotspots=[], radius=18, onEnter=()=>{}, onExit=()=>{} }={}) { this.hotspots=hotspots.map((h,i)=>({...h,id:h.id||`hotspot-${i}`,type:h.type||'mechanic'})); this.radius=radius; this.onEnter=onEnter; this.onExit=onExit; this.nearby=new Set(); }
 setHotspots(hotspots) { this.hotspots=hotspots.map((h,i)=>({...h,id:h.id||`hotspot-${i}`,type:h.type||'mechanic'})); }
 update(position) { if (!position) return []; const now=new Set(), found=[]; for (const h of this.hotspots) { const dx=(h.x||0)-position.x, dz=(h.z||0)-position.z, d=Math.hypot(dx,dz); if (d<=this.radius) { now.add(h.id); found.push({...h,distance:d,definition:KANO_HOTSPOT_TYPES[h.type]||{label:h.type,actions:[]}}); if (!this.nearby.has(h.id)) this.onEnter(h,d); } else if (this.nearby.has(h.id)) this.onExit(h); } this.nearby=now; return found.sort((a,b)=>a.distance-b.distance); }
 nearest(position, type) { return this.update(position).find(h=>!type||h.type===type)||null; }
 action(hotspotId, action, context={}) { const h=this.hotspots.find(x=>x.id===hotspotId); if (!h) return {ok:false,reason:'Hotspot not found'}; const allowed=(KANO_HOTSPOT_TYPES[h.type]?.actions||[]).includes(action); if (!allowed) return {ok:false,reason:'Action is not available at this hotspot'}; return {ok:true,hotspot:h,action,context}; }
}
export default SpatialHotspotManager;
