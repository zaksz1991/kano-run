/**
 * Sunken road section, as on Kano's underpass roads (see the reference photos):
 * tall grey retaining walls on both sides with a green and white zigzag top and a pale heartbeat line.
 * A 140 m stretch appears every 2.5 km along the drive, placed by distance so it also works when reversing.
 */
import * as THREE from 'three';

const PERIOD_KM = 2.5;
const OFFSET_KM = 1.25;
const LENGTH_KM = 0.14;
const UNITS_PER_KM = 1008;
const WALL_H = 2.5;
let sets = null;

function wallTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7f858c'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 60; i += 1) { g.fillStyle = `rgba(${90 + (i * 7) % 30},${95 + (i * 11) % 25},${100 + (i * 5) % 25},.25)`; g.fillRect((i * 83) % 512, (i * 37) % 256, 40 + (i % 5) * 20, 3); }
  // heartbeat line
  g.strokeStyle = '#e9eef0'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath();
  g.moveTo(0, 170); g.lineTo(150, 170); g.lineTo(175, 120); g.lineTo(205, 215); g.lineTo(230, 85); g.lineTo(255, 170); g.lineTo(512, 170); g.stroke();
  // green and white zigzag band along the top
  g.fillStyle = '#f2f4ee'; g.fillRect(0, 0, 512, 46);
  g.fillStyle = '#2f8f4e';
  for (let x = 0; x < 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, 46); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(LENGTH_KM * UNITS_PER_KM / 12, 1);
  t.anisotropy = 4;
  return t;
}

function build(world) {
  const lengthU = LENGTH_KM * UNITS_PER_KM;
  const tex = wallTexture();
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xcfd2cf });
  const make = () => {
    const group = new THREE.Group();
    group.name = 'KANO_SUNKEN_ROAD_WALLS';
    for (const x of [-5.7, 6.3]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, WALL_H, lengthU), [capMat, mat, capMat, capMat, capMat, capMat]);
      wall.position.set(x, WALL_H / 2, -lengthU / 2);
      group.add(wall);
    }
    group.visible = false;
    world.add(group);
    return group;
  };
  return [make(), make()];
}

function frame() {
  try {
    const R = window.kanoRenderer; const g = window.kanoGame;
    if (R?.world && g?.s && g.state === 'PLAY') {
      if (!sets) sets = build(R.world);
      const dist = Number(g.s.distance) || 0;
      const first = Math.floor((dist - OFFSET_KM - LENGTH_KM) / PERIOD_KM) + 1;
      sets.forEach((group, i) => {
        const startKm = (first + i) * PERIOD_KM + OFFSET_KM;
        const ahead = startKm - dist; // km in front of the keke where this stretch begins
        const z = 2 - ahead * UNITS_PER_KM;
        group.position.z = z;
        let clear = true;
        const mid = z - (LENGTH_KM * UNITS_PER_KM) / 2;
        for (const f of R.flyovers || []) {
          if (f && f.visible !== false && Math.abs(f.position.z - mid) < 230) { clear = false; break; } // never cut through a flyover
        }
        group.visible = (clear || window.__kanoSunkenForce) && ahead < 0.45 && ahead > -(LENGTH_KM + 0.02) && startKm > 0.5;
      });
    } else if (sets) sets.forEach((s) => { s.visible = false; });
  } catch (_) { /* optional */ }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && !window.__kanoSunkenRoad) {
  window.__kanoSunkenRoad = true;
  requestAnimationFrame(frame);
}
