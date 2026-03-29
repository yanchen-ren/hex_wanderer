import { readFileSync } from 'fs';

const items = JSON.parse(readFileSync('config/item.json', 'utf8'));
const events = readFileSync('config/event.json', 'utf8');
const codeFiles = [
  'src/systems/TurnSystem.js', 'src/core/GameLoop.js',
  'src/systems/EventSystem.js', 'src/systems/MovementSystem.js',
  'src/systems/ItemSystem.js', 'src/systems/BuildingSystem.js',
  'src/systems/FogSystem.js',
];
const code = codeFiles.map(f => readFileSync(f, 'utf8')).join('\n');

const combos = items.combinations || [];
const comboItems = new Set();
combos.forEach(c => { comboItems.add(c.materialA); comboItems.add(c.materialB); comboItems.add(c.result); });

for (const [id, def] of Object.entries(items.items)) {
  const inEvents = events.includes('"' + id + '"');
  const inCode = code.includes("'" + id + "'") || code.includes('"' + id + '"');
  const inCombo = comboItems.has(id);
  const hasEffects = def.effects && def.effects.length > 0;
  const effectTypes = (def.effects || []).map(e => e.type);

  if (!inEvents && !inCombo) {
    console.log(`[NOT IN EVENTS] ${id} (${def.name}) - inCode:${inCode} combo:${inCombo} effects:${effectTypes.join(',')}`);
  }
  if (!inEvents && !inCode && !inCombo) {
    console.log(`  >>> COMPLETELY UNUSED`);
  }
}
