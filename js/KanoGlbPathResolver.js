/**
 * Resolves requested GLB paths to files that actually exist. Code historically
 * asked for snake_case / differently-spelled names while the files on disk are
 * kebab-case copies (e.g. women_in_hijab.glb vs women-in-hijab.glb). A request
 * whose exact path is missing is matched by normalised file name, preferring
 * the same folder. Missing models therefore load instead of silently falling
 * back to primitive shapes.
 */
export const KANO_GLB_FILES = [
 "characters/passengers/Man in Suit.glb",
 "characters/passengers/Man.glb",
 "characters/passengers/female.glb",
 "characters/passengers/hijab-muslim-woman-2.glb",
 "characters/passengers/hijab-muslim-woman.glb",
 "characters/passengers/hijab_muslim_woman 2.glb",
 "characters/passengers/hijab_muslim_woman.glb",
 "characters/passengers/man-2.glb",
 "characters/passengers/man-in-suit.glb",
 "characters/passengers/woman with her arms crossed.glb",
 "characters/passengers/woman-arms-crossed.glb",
 "characters/pedestrians/Man in Long Sleeves.glb",
 "characters/pedestrians/Man-Long-Sleeves.glb",
 "characters/pedestrians/dancing-man.glb",
 "characters/pedestrians/keke female.glb",
 "characters/pedestrians/keke-female.glb",
 "characters/pedestrians/muslim-girl.glb",
 "characters/pedestrians/muslim_girl.glb",
 "characters/pedestrians/pedestrian.glb",
 "characters/pedestrians/police-man.glb",
 "characters/pedestrians/police_man.glb",
 "environment/ground/manhole_cover_on_broken_asphalt_road.glb",
 "environment/ground/photoscan_-_pothole_1.glb",
 "vehicles/cars/1979_chevrolet_impala.glb",
 "vehicles/cars/2002-dodge.glb",
 "vehicles/cars/2002_dodge_ram_2500.glb",
 "vehicles/cars/2005-chrysler.glb",
 "vehicles/cars/2005_chrysler_300.glb",
 "vehicles/cars/2006-kia.glb",
 "vehicles/cars/2006_kia_ceed.glb",
 "vehicles/cars/asphalt_6_can-am_spyder.glb",
 "vehicles/cars/asphalt_6_ktm_rc8.glb",
 "vehicles/cars/bmw.glb",
 "vehicles/cars/car-1190.glb",
 "vehicles/cars/chevrolet-impala.glb",
 "vehicles/cars/ktm-rc8.glb",
 "vehicles/cars/motorcycle.glb",
 "vehicles/cars/peterbilt.glb",
 "vehicles/cars/peterbilt_352.glb",
 "vehicles/cars/quaternius_cc0-normal-car-1190.glb",
 "vehicles/cars/quaternius_cc0-suv-1402.glb",
 "vehicles/cars/quaternius_cc0-truck-1449.glb",
 "vehicles/cars/spyder.glb",
 "vehicles/cars/super-car.glb",
 "vehicles/cars/suv-1402.glb",
 "vehicles/cars/truck-1449.glb",
 "vehicles/keke/keke-1.glb",
 "vehicles/keke/keke-2.glb",
 "vehicles/keke/keke-3.glb",
 "vehicles/keke/keke-4.glb",
 "vehicles/keke/keke-5.glb",
 "vehicles/special/ambulance.glb",
 "vehicles/special/bus.glb",
 "vehicles/special/karota.glb",
 "vehicles/special/okada.glb",
 "vehicles/special/police.glb",
 "vehicles/wheels/turbine-wheel.glb",
 "vehicles/wheels/wheel-model.glb",
 "world/buildings-industrial/building-a.glb",
 "world/buildings-industrial/building-b.glb",
 "world/buildings-industrial/building-c.glb",
 "world/buildings-industrial/building-d.glb",
 "world/buildings-industrial/building-e.glb",
 "world/buildings-industrial/building-f.glb",
 "world/buildings-industrial/building-g.glb",
 "world/buildings-industrial/building-h.glb",
 "world/buildings-industrial/building-i.glb",
 "world/buildings-industrial/building-j.glb",
 "world/buildings-industrial/building-k.glb",
 "world/buildings-industrial/building-l.glb",
 "world/buildings-industrial/building-m.glb",
 "world/buildings-industrial/building-n.glb",
 "world/buildings-industrial/building-o.glb",
 "world/buildings-industrial/building-p.glb",
 "world/buildings-industrial/building-q.glb",
 "world/buildings-industrial/building-r.glb",
 "world/buildings-industrial/building-s.glb",
 "world/buildings-industrial/building-t.glb",
 "world/buildings-suburban/building-type-d.glb",
 "world/buildings-suburban/building-type-e.glb",
 "world/buildings-suburban/building-type-f.glb",
 "world/buildings-suburban/building-type-g.glb",
 "world/buildings-suburban/building-type-h.glb",
 "world/buildings-suburban/building-type-i.glb",
 "world/buildings-suburban/building-type-j.glb",
 "world/buildings-suburban/building-type-k.glb",
 "world/buildings-suburban/building-type-l.glb",
 "world/buildings-suburban/building-type-m.glb",
 "world/buildings-suburban/building-type-n.glb",
 "world/buildings-suburban/building-type-o.glb",
 "world/buildings-suburban/building-type-p.glb",
 "world/buildings-suburban/building-type-q.glb",
 "world/buildings-suburban/building-type-r.glb",
 "world/buildings-suburban/building-type-s.glb",
 "world/buildings-suburban/building-type-t.glb",
 "world/buildings-suburban/building-type-u.glb",
 "world/props/Bench.glb",
 "world/props/Cone.glb",
 "world/props/Man.glb",
 "world/props/Police-Car.glb",
 "world/props/SUV.glb",
 "world/props/Stop-sign.glb",
 "world/props/Traffic-Light.glb",
 "world/props/Tree.glb",
 "world/roads/construction-cone.glb",
 "world/roads/kano_urban_flyover.glb",
 "world/roads/light-square.glb",
 "world/roads/roadside_building.glb"
];

const norm = (name) => String(name).toLowerCase().replace(/\.glb$/, '').replace(/[^a-z0-9]+/g, '');
const EXACT = new Set(KANO_GLB_FILES);
const BY_NAME = new Map();
for (const file of KANO_GLB_FILES) {
  const key = norm(file.split('/').pop());
  if (!BY_NAME.has(key)) BY_NAME.set(key, []);
  BY_NAME.get(key).push(file);
}

// Requested models whose files were never added to the project, mapped to the
// closest model that exists. Entries without a stand-in (ground photo tiles,
// electricity poles) are left alone so their procedural versions stay in use.
export const KANO_GLB_STAND_INS = {
  'characters/passengers/Man-fjHyMd5Wxw.glb': 'characters/passengers/Man.glb',
  'characters/passengers/free_download_attractive_african_woman_236.glb': 'characters/passengers/female.glb',
  'characters/passengers/handsome_man_in_casual_clothes_in_a-pose_86.glb': 'characters/passengers/man-2.glb',
  'characters/passengers/tekamist_mens.glb': 'characters/passengers/man-2.glb',
  'characters/passengers/women_in_hijab.glb': 'characters/passengers/hijab-muslim-woman-2.glb',
  'characters/pedestrians/hi_guys.glb': 'characters/pedestrians/dancing-man.glb',
  'characters/pedestrians/low_poly_people_free_sample_pack.glb': 'characters/pedestrians/Man-Long-Sleeves.glb',
  'characters/pedestrians/passenger.glb': 'characters/pedestrians/pedestrian.glb',
  'vehicles/cars/asphalt_8_-_nissan_juke_nismo.glb': 'vehicles/cars/2006_kia_ceed.glb',
  'vehicles/cars/lowpoly_bmw_e36_m3.glb': 'vehicles/cars/bmw.glb',
  'vehicles/cars/volvo_fh.glb': 'vehicles/cars/truck-1449.glb',
  'vehicles/cars/volvo_fh_cement_truck.glb': 'vehicles/cars/peterbilt.glb',
  'vehicles/keke/keke-6.glb': 'vehicles/keke/keke-4.glb',
  'vehicles/keke/keke-7.glb': 'vehicles/keke/keke-5.glb',
  'vehicles/keke/keke-8.glb': 'vehicles/keke/keke-2.glb',
  'world/roads/construction-barrier.glb': 'world/roads/construction-cone.glb',
  'world/roads/kai_tak_flyovers.glb': 'world/roads/kano_urban_flyover.glb',
  'world/roads/kowloon_bay_flyovers.glb': 'world/roads/kano_urban_flyover.glb',
  'world/roads/light-curved.glb': 'world/roads/light-square.glb',
  'world/roads/light-curved-double.glb': 'world/roads/light-square.glb',
  'world/roads/light-square-double.glb': 'world/roads/light-square.glb',
  'world/roads/road-sign-stop.glb': 'world/props/Stop-sign.glb',
  'world/roads/traffic-light.glb': 'world/props/Traffic-Light.glb',
};

export function resolveKanoGlbPath(relativePath) {
  const path = String(relativePath || '');
  if (EXACT.has(path)) return path;
  const standIn = KANO_GLB_STAND_INS[path];
  if (standIn && EXACT.has(standIn)) return standIn;
  const parts = path.split('/');
  const candidates = BY_NAME.get(norm(parts.pop() || ''));
  if (!candidates || !candidates.length) return path;
  const folder = parts.join('/');
  return candidates.find((file) => file.startsWith(folder + '/')) || candidates[0];
}
