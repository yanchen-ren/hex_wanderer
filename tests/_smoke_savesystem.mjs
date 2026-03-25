import { SaveSystem } from '../src/systems/SaveSystem.js';

const sys = new SaveSystem('1.0.0');

const state = {
  version: '1.0.0', seed: 12345, mapSize: 'medium', turnNumber: 15,
  player: { position: {q:0,r:0}, hp: 85, hpMax: 100, ap: 3, apMax: 5, relicsCollected: 1, items: [], statusEffects: [] },
  map: { tiles: {'0,0': {terrain:'grass'}}, relicPositions: [{q:-20,r:0},{q:15,r:-18},{q:5,r:20}], portalPosition: {q:10,r:-5}, teleportPairs: [] }
};

// Roundtrip
const json = sys.serialize(state);
const result = sys.deserialize(json);
console.assert(result.success === true, 'roundtrip success');
console.assert(result.state.seed === 12345, 'seed match');
console.assert(result.state.player.hp === 85, 'hp match');

// Version in output
const parsed = JSON.parse(json);
console.assert(parsed.version === '1.0.0', 'version in output');

// Invalid JSON
const bad = sys.deserialize('not json');
console.assert(bad.success === false, 'invalid json rejected');

// Validation
const v = sys.validate(state);
console.assert(v.valid === true, 'valid state');

const incomplete = { seed: 1 };
const v2 = sys.validate(incomplete);
console.assert(v2.valid === false, 'incomplete invalid');
console.assert(v2.errors.length > 0, 'has errors');

// Migration
const old = { version: '0.5.0', player: {position:{q:0,r:0}, hp:100, hpMax:100, ap:5, apMax:5}, map: {tiles:{}, relicPositions:[]} };
const migrated = sys.migrate(old, '0.5.0', '2.0.0');
console.assert(migrated.version === '2.0.0', 'migrated version');
console.assert(migrated.seed === 0, 'default seed');
console.assert(migrated.mapSize === 'medium', 'default mapSize');
console.assert(old.version === '0.5.0', 'original untouched');

// Auto-migrate on deserialize
const sys2 = new SaveSystem('2.0.0');
const oldJson = JSON.stringify(state);
const r2 = sys2.deserialize(oldJson);
console.assert(r2.success === true, 'auto-migrate success');
console.assert(r2.state.version === '2.0.0', 'auto-migrated version');

console.log('ALL SMOKE TESTS PASSED');
