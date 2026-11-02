// Every Kenney model Sunday Drive draws: key -> [zip, file]. Scales live with the placements in world.mjs.
const RD = ['kenney_city-kit-roads.zip', 'Models/GLB format/'], CM = ['kenney_city-kit-commercial_2.1.zip', 'Models/GLB format/'];
const SB = ['kenney_city-kit-suburban_20.zip', 'Models/GLB format/'], IN = ['kenney_city-kit-industrial_2.0.zip', 'Models/GLB format/'];
const NK = ['kenney_nature-kit.zip', 'Models/GLTF format/'], RK = ['kenney_racing-kit.zip', 'Models/GLTF format/'];
const CK = ['kenney_car-kit.zip', 'Models/GLB format/'], WC = ['kenney_watercraft-pack.zip', 'Models/GLB format/'];
const TK = ['kenney_train-kit.zip', 'Models/GLB format/'];

const m = (kit, file) => [kit[0], kit[1] + file + '.glb'];
export const CATALOG = {
  // roads
  rStraight: m(RD, 'road-straight'), rBend: m(RD, 'road-bend'), rT: m(RD, 'road-intersection'), rCross: m(RD, 'road-crossroad'),
  rEnd: m(RD, 'road-end'), light: m(RD, 'light-square'), lightDouble: m(RD, 'light-square-double'), pillar: m(RD, 'bridge-pillar-wide'),
  cone: m(RD, 'construction-cone'), guard: m(RD, 'construction-barrier'), barrier: m(RD, 'construction-barrier'), signal: m(RD, 'traffic-light'),
  // downtown
  ...Object.fromEntries('abcde'.split('').map(c => ['sky' + c.toUpperCase(), m(CM, 'building-skyscraper-' + c)])),
  ...Object.fromEntries('abcdefghijklmn'.split('').map(c => ['com' + c.toUpperCase(), m(CM, 'building-' + c)])),
  parasol: m(CM, 'detail-parasol-a'),
  // suburbs
  ...Object.fromEntries('abcdefghijklmnopqrstu'.split('').map(c => ['house' + c.toUpperCase(), m(SB, 'building-type-' + c)])),
  treeS: m(SB, 'tree-small'), treeL: m(SB, 'tree-large'), fence: m(SB, 'fence'),
  // industry and docks
  ...Object.fromEntries('abcdefghijklmnopqrst'.split('').map(c => ['ind' + c.toUpperCase(), m(IN, 'building-' + c)])),
  contA: m(IN, 'shipping-container-a'), contB: m(IN, 'shipping-container-b'), contC: m(IN, 'shipping-container-c'),
  tank: m(IN, 'detail-tank'), tankL: m(IN, 'detail-tank-large'), chimney: m(IN, 'chimney-large'), water: m(IN, 'water-tower'),
  windmill: m(IN, 'windmill'), shipCargo: m(WC, 'ship-cargo-a'), shipLarge: m(WC, 'ship-large'),
  // nature
  treeA: m(NK, 'tree_default'), treeB: m(NK, 'tree_oak'), treeC: m(NK, 'tree_cone'), treeD: m(NK, 'tree_fat'), treeE: m(NK, 'tree_detailed'),
  pineA: m(NK, 'tree_pineTallA'), pineB: m(NK, 'tree_pineRoundB'), pineC: m(NK, 'tree_pineDefaultA'), palm: m(NK, 'tree_palmTall'),
  palmB: m(NK, 'tree_palmBend'), rockT: m(NK, 'rock_tallB'), rockL: m(NK, 'rock_largeC'), crop: m(NK, 'crops_cornStageD'),
  head: m(NK, 'statue_head'),
  // the race circuit
  cStart: m(RK, 'roadStart'), cStraight: m(RK, 'roadStraight'), cCorner1: m(RK, 'roadCornerSmall'), cCorner2: m(RK, 'roadCornerLarge'),
  cCorner3: m(RK, 'roadCornerLarger'), stand: m(RK, 'grandStandCovered'), arch: m(RK, 'overheadLights'), banner: m(RK, 'bannerTowerRed'),
  // the railway
  rail: m(TK, 'railroad-straight'), loco: m(TK, 'train-locomotive-a'), wagonA: m(TK, 'train-carriage-container-red'),
  wagonB: m(TK, 'train-carriage-wood'), wagonC: m(TK, 'train-carriage-tank'),
  // crash debris
  ...Object.fromEntries(['bumper', 'door', 'door-window', 'tire', 'plate-a', 'plate-b', 'spoiler-a', 'bolt', 'nut'].map(k => ['deb:' + k, m(CK, 'debris-' + k)])),
  // cars
  ...Object.fromEntries(['race', 'race-future', 'sedan-sports', 'hatchback-sports', 'police', 'sedan', 'taxi', 'suv', 'suv-luxury', 'van',
    'delivery', 'truck', 'ambulance', 'firetruck', 'garbage-truck', 'tractor', 'kart-oobi'].map(k => ['car:' + k, m(CK, k)])),
};
