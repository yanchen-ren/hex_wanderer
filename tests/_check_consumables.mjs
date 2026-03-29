import { readFileSync } from 'fs';
const items = JSON.parse(readFileSync('config/item.json', 'utf8'));
const events = readFileSync('config/event.json', 'utf8');

for (const [id, def] of Object.entries(items.items)) {
  if (!def.consumable) continue;
  const inEvents = events.includes('"' + id + '"');
  const hasConsume = events.includes('"consume_item", "itemId": "' + id + '"') || events.includes('"consume_item","itemId":"' + id + '"');
  if (inEvents && !hasConsume) {
    console.log(`[NO CONSUME] ${id} (${def.name}) — used in events but never consumed`);
  }
}
