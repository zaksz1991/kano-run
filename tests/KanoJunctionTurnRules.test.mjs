import test from 'node:test';
import assert from 'node:assert/strict';
import { KANO_JUNCTIONS, cubicBezierPoint, cubicBezierTangent, createTurnPath, resolveKanoJunction } from '../js/KanoJunctionTurnRules.js';

test('catalog resolves Kano junction labels',()=>{ assert.ok(KANO_JUNCTIONS.length >= 8); assert.equal(resolveKanoJunction('Kofar Mata').id,'kofar-mata'); assert.equal(resolveKanoJunction('sabongari').name,'Sabon Gari'); });
test('straight path endpoints match supplied positions',()=>{ const p=createTurnPath({start:{x:0,y:0,z:0},end:{x:9,y:0,z:0}}); assert.deepEqual(cubicBezierPoint(p.p0,p.p1,p.p2,p.p3,0),{x:0,y:0,z:0}); assert.deepEqual(cubicBezierPoint(p.p0,p.p1,p.p2,p.p3,1),{x:9,y:0,z:0}); });
test('left and right paths are distinct',()=>{ const args={start:{x:0,y:0,z:0},end:{x:0,y:0,z:10}}; assert.notDeepEqual(createTurnPath({...args,turn:'left'}).p2,createTurnPath({...args,turn:'right'}).p2); });
test('invalid turn and missing endpoints are rejected',()=>{ assert.equal(createTurnPath({start:{x:0},end:{x:1},turn:'u-turn'}),null); assert.equal(createTurnPath({end:{x:1},turn:'left'}),null); });
test('progress is clamped and tangent normalized',()=>{ const p=createTurnPath({start:{x:0,y:0,z:0},end:{x:10,y:0,z:0},turn:'right'}); assert.equal(cubicBezierPoint(p.p0,p.p1,p.p2,p.p3,3).x,10); const t=cubicBezierTangent(p.p0,p.p1,p.p2,p.p3,.5); assert.ok(Math.abs(Math.hypot(t.x,t.y,t.z)-1)<1e-8); });
test('turn duration clamps unsafe values',()=>{ const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n)); assert.equal(clamp(10,250,10000),250); assert.equal(clamp(50000,250,10000),10000); assert.equal(clamp(1600,250,10000),1600); });
test('smoothstep easing preserves start and end progress',()=>{ const ease=t=>t*t*(3-2*t); assert.equal(ease(0),0); assert.equal(ease(1),1); assert.ok(ease(.5)>.49 && ease(.5)<.51); });
