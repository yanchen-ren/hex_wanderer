import { readFileSync } from 'fs';

const items = JSON.parse(readFileSync('config/item.json', 'utf8'));
const events = readFileSync('config/event.json', 'utf8');
const jsFiles = [
  'src/systems/TurnSystem.js', 'src/core/GameLoop.js',
  'src/systems/EventSystem.js', 'src/systems/MovementSystem.js',
  'src/systems/ItemSystem.js', 'src/systems/BuildingSystem.js',
  'src/systems/FogSystem.js', 'src/systems/PlayerState.js',
  'src/render/RenderEngine.js',
];
const code = jsFiles.map(f => readFileSync(f, 'utf8')).join('\n');

const combos = items.combinations || [];
const comboMats = new Set();
const comboResults = new Set();
combos.forEach(c => { comboMats.add(c.materialA); comboMats.add(c.materialB); comboResults.add(c.result); });

// Check each item
for (const [id, def] of Object.entries(items.items)) {
  const inEventReward = events.includes('"' + id + '"');  // in itemPool or has_item condition
  const inCodeById = code.includes("'" + id + "'") || code.includes('"' + id + '"');
  const isMaterial = comboMats.has(id);
  const isResult = comboResults.has(id);
  const effectTypes = (def.effects || []).map(e => e.type).join(', ');
  
  const issues = [];
  
  // Check if item can be obtained
  const canObtain = inEventReward || isMaterial; // materials might be obtainable via their own events
  if (!canObtain && !isResult) {
    issues.push('NO WAY TO OBTAIN');
  }
  
  // Check if effects are actually used
  for (const eff of (def.effects || [])) {
    if (eff.type === 'event_option_unlock') {
      // Check if any event uses this optionTag
      // Actually event_option_unlock works via has_item conditions, not optionTag matching
      // So we just need the item to be in has_item conditions
    }
    if (eff.type === 'npc_friendly') {
      if (!code.includes('npcFriendly')) issues.push('npc_friendly effect NOT IMPLEMENTED');
    }
    if (eff.type === 'combat_no_damage_on_win') {
      if (!code.includes('combatNoDamageOnWin')) issues.push('combat_no_damage_on_win NOT CHECKED');
    }
    if (eff.type === 'combat_surrender_chance') {
      if (!code.includes('combatSurrenderChance')) issues.push('combat_surrender_chance NOT CHECKED');
    }
    if (eff.type === 'ruin_loot_upgrade') {
      if (!code.includes('ruinLootUpgrade')) issues.push('ruin_loot_upgrade NOT CHECKED');
    }
    if (eff.type === 'hp_restore') {
      if (!code.includes('hp_restore')) issues.push('hp_restore NOT IMPLEMENTED');
    }
    if (eff.type === 'combat_capture') {
      issues.push('combat_capture NOT IMPLEMENTED');
    }
    if (eff.type === 'farm_rest_bonus') {
      if (!code.includes('farm_rest_bonus')) issues.push('farm_rest_bonus NOT CHECKED in code');
    }
  }
  
  if (issues.length > 0) {
    console.log(`[${id}] (${def.name}) ${def.quality} - ${issues.join(', ')} | effects: ${effectTypes}`);
  }
}
