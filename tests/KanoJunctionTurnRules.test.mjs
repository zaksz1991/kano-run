import test from 'node:test';
import assert from 'node:assert/strict';
import { KANO_JUNCTIONS, cubicBezierPoint, cubicBezierTangent, createTurnPath, resolveKanoJunction } from '../js/KanoJunctionTurnRules.js';

test('catalog contains named Kano junctions without invented coordinates',()=>{ assert.ok(KANO_JUNCTIONS.length >= 8); assert.equal(resolveKanoJunction('Kofar Mata').id,'kofar-mata'); assert.equal(resolveKanoJunction('sabongari').name,'Sabon Gari'); });
test('straight path starts and ends exactly at supplied points',()=>{ const p=createTurnPath({start:{x:0,y:0,z:0},end:{x:9,y:0,z:0}}); assert.deepEqual(cubicBezierPoint(p.p0,p.p1,p.p2,p.p3,0),{x:0,y:0,z:0}); assert.deepEqual(cubicBezierPoint(p.p0,p.p1,p.p2,p.p3,1),{x:9,y:0,z:0}); });
test('left and right turns return valid curved paths',()=>{ const args={start:{x:0,y:0,z:0},end:{x:0,y:0,z:10}}; const l=createTurnPath({...args,turn:'left'}), r=createTurnPath({...args,turn:'right'}); assert.ok(l && r); assert.notDeepEqual(l.p2,r.p2); });
test('invalid turn and missing endpoints are rejected',()=>{ assert.equal(createTurnPath({start:{x:0},end:{x:1},turn:'u-turn'}),null); assert.equal(createTurnPath({end:{x:1},turn:'left'}),null); });
test('progress is clamped and tangent stays normalized',()=>{ const p=createTurnPath({start:{x:0,y:0,z:0},end:{x:10,y:0,z:0},turn:'right'}); const point=cubicBezierPoint(p.p0,p.p1,p.p2,p.p3,3); assert.equal(point.x,10); const t=cubicBezierTangent(p.p0,p.p1,p.p2,p.p3,.5); assert.ok(Math.abs(Math.hypot(t.x,t.y,t.z)-1)<1e-8); });
