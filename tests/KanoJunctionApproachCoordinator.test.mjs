import test from 'node:test';
import assert from 'node:assert/strict';
import { registerKanoJunctionApproach, updateKanoJunctionApproach, cancelKanoJunctionApproach } from '../js/KanoJunctionApproachCoordinator.js';
function vehicle(x=0,z=0){return {position:{x,y:0,z,set(nx,ny,nz){this.x=nx;this.y=ny;this.z=nz;}}};}
test('rejects missing vehicle',()=>assert.equal(registerKanoJunctionApproach({}).reason,'vehicle-invalid'));
test('requires junction ID',()=>assert.equal(registerKanoJunctionApproach({vehicle:vehicle(),trigger:{x:0,z:0},start:{x:0,z:0},end:{x:1,z:1},turn:'left'}).reason,'junction-id-required'));
test('requires explicit scene coordinates',()=>assert.equal(registerKanoJunctionApproach({vehicle:vehicle(),junctionId:'kofar-mata',turn:'left'}).reason,'scene-coordinates-required'));
test('rejects invalid turn',()=>assert.equal(registerKanoJunctionApproach({vehicle:vehicle(),junctionId:'j1',trigger:{x:0,z:0},start:{x:0,z:0},end:{x:1,z:1},turn:'u-turn'}).reason,'turn-invalid'));
test('rejects too-short path',()=>assert.equal(registerKanoJunctionApproach({vehicle:vehicle(),junctionId:'j1',trigger:{x:0,z:0},start:{x:0,z:0},end:{x:0.1,z:0.1},turn:'left'}).reason,'turn-path-too-short'));
test('does not dispatch before trigger radius',()=>{const v=vehicle(10,10);registerKanoJunctionApproach({vehicle:v,junctionId:'j1',trigger:{x:0,z:0},start:{x:0,z:0},end:{x:4,z:4},turn:'right'});assert.equal(updateKanoJunctionApproach(v).reason,'approaching')});
test('rejects unregistered vehicle update',()=>assert.equal(updateKanoJunctionApproach(vehicle()).reason,'approach-not-registered'));
test('validates trigger radius',()=>{const v=vehicle();registerKanoJunctionApproach({vehicle:v,junctionId:'j1',trigger:{x:0,z:0},start:{x:0,z:0},end:{x:4,z:4},turn:'right'});assert.equal(updateKanoJunctionApproach(v,{triggerRadius:100}).reason,'trigger-radius-invalid')});
test('cancels registration',()=>{const v=vehicle();registerKanoJunctionApproach({vehicle:v,junctionId:'j1',trigger:{x:0,z:0},start:{x:0,z:0},end:{x:4,z:4},turn:'right'});const r=cancelKanoJunctionApproach(v);assert.equal(r.ok,false);assert.equal(updateKanoJunctionApproach(v).reason,'approach-not-registered')});
