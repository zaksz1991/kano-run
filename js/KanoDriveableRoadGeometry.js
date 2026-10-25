/**
 * Kano Life Task 32 — driveable road-path geometry primitives.
 * Pure geometry: no guessed world coordinates, renderer hooks, or second game loop.
 * The owning road/vehicle systems supply scene-space control points and consume poses.
 */
const finite = n => Number.isFinite(Number(n));
const point = p => !!p && finite(p.x) && finite(p.y ?? 0) && finite(p.z ?? 0);
const vec = p => ({ x:Number(p.x), y:Number(p.y ?? 0), z:Number(p.z ?? 0) });
const lerp = (a,b,t) => a + (b-a)*t;
const mix = (a,b,t) => ({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)});
const distance = (a,b) => Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);

function bezier(seg,t) {
  const u=1-t, a=u*u*u, b=3*u*u*t, c=3*u*t*t, d=t*t*t;
  return {x:a*seg.p0.x+b*seg.p1.x+c*seg.p2.x+d*seg.p3.x,
    y:a*seg.p0.y+b*seg.p1.y+c*seg.p2.y+d*seg.p3.y,
    z:a*seg.p0.z+b*seg.p1.z+c*seg.p2.z+d*seg.p3.z};
}
function derivative(seg,t) {
  const u=1-t;
  return {x:3*u*u*(seg.p1.x-seg.p0.x)+6*u*t*(seg.p2.x-seg.p1.x)+3*t*t*(seg.p3.x-seg.p2.x),
    y:3*u*u*(seg.p1.y-seg.p0.y)+6*u*t*(seg.p2.y-seg.p1.y)+3*t*t*(seg.p3.y-seg.p2.y),
    z:3*u*u*(seg.p1.z-seg.p0.z)+6*u*t*(seg.p2.z-seg.p1.z)+3*t*t*(seg.p3.z-seg.p2.z)};
}

export function createKanoRoadPath({id,segments,samplesPerSegment=24,metadata={}}={}) {
  if(typeof id!=='string'||!id.trim()) return {ok:false,reason:'path-id-required'};
  if(!Array.isArray(segments)||!segments.length) return {ok:false,reason:'segments-required'};
  if(!Number.isInteger(samplesPerSegment)||samplesPerSegment<8||samplesPerSegment>128) return {ok:false,reason:'sample-count-invalid'};
  const cooked=[];
  for(let i=0;i<segments.length;i++){
    const s=segments[i];
    if(!s||![s.p0,s.p1,s.p2,s.p3].every(point)) return {ok:false,reason:'segment-control-point-invalid',segment:i};
    const seg={p0:vec(s.p0),p1:vec(s.p1),p2:vec(s.p2),p3:vec(s.p3),kind:String(s.kind||'road')};
    if(i && distance(cooked[i-1].p3,seg.p0)>0.05) return {ok:false,reason:'segments-disconnected',segment:i};
    cooked.push(seg);
  }
  const table=[]; let total=0, previous=null;
  cooked.forEach((seg,si)=>{
    for(let j=0;j<=samplesPerSegment;j++){
      if(si>0&&j===0) continue;
      const t=j/samplesPerSegment, p=bezier(seg,t);
      if(previous) total+=distance(previous,p);
      table.push({distance:total,segment:si,t,position:p}); previous=p;
    }
  });
  if(!(total>0.25)) return {ok:false,reason:'path-too-short'};
  return {ok:true,path:{id:id.trim(),segments:cooked,table,length:total,metadata:{...metadata},samplesPerSegment}};
}

export function sampleKanoRoadPath(path,progress) {
  if(!path||!Array.isArray(path.table)||!(path.length>0)) return {ok:false,reason:'path-invalid'};
  const d=Math.max(0,Math.min(path.length,Number(progress)*path.length));
  let lo=0,hi=path.table.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(path.table[mid].distance<d)lo=mid+1;else hi=mid;}
  const b=path.table[lo],a=path.table[Math.max(0,lo-1)];
  const span=b.distance-a.distance, f=span>1e-9?(d-a.distance)/span:0;
  const pos=mix(a.position,b.position,f), seg=path.segments[b.segment];
  const t=lerp(a.segment===b.segment?a.t:0,b.t,f), tangent=derivative(seg,Math.max(0,Math.min(1,t)));
  const horizontal=Math.hypot(tangent.x,tangent.z);
  return {ok:true,pathId:path.id,distance:d,progress:path.length?d/path.length:0,position:pos,tangent,
    yaw:Math.atan2(tangent.x,tangent.z),grade:horizontal>1e-9?Math.atan2(tangent.y,horizontal):0,kind:seg.kind};
}

/** Build a smooth flyover from explicitly supplied endpoints and deck height. */
export function createKanoFlyoverPath({id='kwankwasiyya-flyover',start,end,deckHeight,rampFraction=0.25,deckFraction=0.5,metadata={}}={}) {
  if(!point(start)||!point(end)||!finite(deckHeight)) return {ok:false,reason:'flyover-coordinates-required'};
  const a=vec(start),b=vec(end), f=Number(rampFraction), deck=Number(deckFraction);
  if(!(f>=0.1&&f<=0.4)||!(deck>=0.2&&deck<=0.8)||2*f+deck<0.99||2*f+deck>1.01) return {ok:false,reason:'flyover-profile-invalid'};
  if(Math.hypot(b.x-a.x,b.z-a.z)<5) return {ok:false,reason:'flyover-span-too-short'};
  const h=Number(deckHeight), p=(t,y)=>({x:lerp(a.x,b.x,t),y,z:lerp(a.z,b.z,t)});
  const t1=f,t2=f+deck;
  const q0=p(0,a.y),q1=p(t1,h),q2=p(t2,h),q3=p(1,b.y);
  const c=(left,right,kind)=>({p0:left,p1:mix(left,right,1/3),p2:mix(left,right,2/3),p3:right,kind});
  const seg1={...c(q0,q1,'flyover-ramp-up'),p1:{...mix(q0,q1,0.32),y:a.y+(h-a.y)*0.04},p2:{...mix(q0,q1,0.72),y:h-(h-a.y)*0.08}};
  const seg2=c(q1,q2,'flyover-deck');
  const seg3={...c(q2,q3,'flyover-ramp-down'),p1:{...mix(q2,q3,0.28),y:h-(h-b.y)*0.08},p2:{...mix(q2,q3,0.68),y:b.y+(h-b.y)*0.04}};
  return createKanoRoadPath({id,segments:[seg1,seg2,seg3],metadata:{...metadata,kind:'flyover',deckHeight:h}});
}

/** Construct a turn from explicit scene-space entry/exit points and tangents. */
export function createKanoJunctionPath({id,junctionId,turn,start,end,startTangent,endTangent,handleLength=4,metadata={}}={}) {
  if(typeof junctionId!=='string'||!junctionId.trim()) return {ok:false,reason:'junction-id-required'};
  if(!['left','straight','right'].includes(turn)) return {ok:false,reason:'turn-invalid'};
  if(!point(start)||!point(end)||!point(startTangent)||!point(endTangent)) return {ok:false,reason:'junction-coordinates-required'};
  const a=vec(start),b=vec(end),st=vec(startTangent),et=vec(endTangent),h=Number(handleLength);
  if(!Number.isFinite(h)||h<0.5||h>30) return {ok:false,reason:'handle-length-invalid'};
  const norm=v=>{const n=Math.hypot(v.x,v.y,v.z);return n>1e-9?{x:v.x/n,y:v.y/n,z:v.z/n}:null;};
  const sn=norm(st),en=norm(et);if(!sn||!en)return {ok:false,reason:'junction-tangent-invalid'};
  return createKanoRoadPath({id:id||`${junctionId}-${turn}`,segments:[{p0:a,p1:{x:a.x+sn.x*h,y:a.y+sn.y*h,z:a.z+sn.z*h},p2:{x:b.x-en.x*h,y:b.y-en.y*h,z:b.z-en.z*h},p3:b,kind:`junction-${turn}`}],metadata:{...metadata,junctionId,turn}});
}

export function applyKanoRoadPose(vehicle,path,progress,{yawOffset=0}={}) {
  if(!vehicle||typeof vehicle.position?.set!=='function') return {ok:false,reason:'vehicle-invalid'};
  const pose=sampleKanoRoadPath(path,progress);if(!pose.ok)return pose;
  vehicle.position.set(pose.position.x,pose.position.y,pose.position.z);
  if(vehicle.rotation&&finite(vehicle.rotation.y)) vehicle.rotation.y=pose.yaw+Number(yawOffset||0);
  vehicle.userData ||= {};vehicle.userData.kanoRoadPose={pathId:path.id,progress:pose.progress,distance:pose.distance,kind:pose.kind,grade:pose.grade};
  return {...pose,applied:true};
}
