import { readFileSync } from 'fs';

const items = JSON.parse(readFileSync('config/item.json', 'utf8'));
const events = readFileSync('config/event.json', 'utf8');
const jsFiles = [
  'src/systems/TurnSystem.js', 'src/core/GameLoop.js',
  'src/systems/EventSystem.js', 'src/systems/MovementSystem.js',
  'src/systems/ItemSystem.js',
];
const code = jsFiles.map(f => readFileSync(f, 'utf8')).join('\n');

const combos = items.combinations || [];
const comboResults = new Set();
combos.forEach(c => comboResults.add(c.result));

// Effects that are aggregated in getActiveEffects but may not be checked anywhere
const effectsToCheck = {
  'npc_friendly': 'npcFriendly',
  'combat_no_damage_on_win': 'combatNoDamageOnWin', 
  'combat_surrender_chance': 'combatSurrenderChance',
  'ruin_loot_upgrade': 'ruinLootUpgrade',
  'luck_modifier': 'luckModifier',
};

console.log('=== ITEMS NOT OBTAINABLE ===');
for (const [id, def] of Object.entries(items.items)) {
  const inEvents = events.includes('"' + id + '"');
  const isComboResult = comboResults.has(id);
  if (!inEvents && !isComboResult) {
    console.log(`  ${id} (${def.name}) [${def.quality}]`);
  }
}

console.log('\n=== EFFECTS NOT IMPLEMENTED IN CODE ===');
for (const [effectType, codeName] of Object.entries(effectsToCheck)) {
  const used = code.includes(codeName);
  if (!used) {
    const itemsWithEffect = Object.entries(items.items)
      .filter(([, d]) => (d.effects || []).some(e => e.type === effectType))
      .map(([id, d]) => `${id}(${d.name})`);
    if (itemsWithEffect.length > 0) {
      console.log(`  ${effectType} → ${codeName} — NOT USED IN CODE`);
      console.log(`    Items: ${itemsWithEffect.join(', ')}`);
    }
  }
}

console.log('\n===合成道具 — 检查材料是否可获得 ===');
for (const combo of combos) {
  const matAInEvents = events.includes('"' + combo.materialA + '"');
  const matBInEvents = events.includes('"' + combo.materialB + '"');
  if (!matAInEvents) console.log(`  ${combo.materialA} (材料A for ${combo.result}) — NOT IN EVENTS`);
  if (!matBInEvents) console.log(`  ${combo.materialB} (材料B for ${combo.result}) — NOT IN EVENTS`);
}
