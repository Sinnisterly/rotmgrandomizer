#!/usr/bin/env node
/*
 * Downloads RealmEye wiki pages used to classify items (UT, ST, sets,
 * class equipment, enchantments) into data/source/wiki/.
 * Pages that do not exist are skipped. Waits between requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'source', 'wiki');
const UA = 'Mozilla/5.0 (compatible; rotmg-randomizer-data-builder; +https://github.com/sinnisterly/rotmgrandomizer)';

const PAGES = [
  'classes', 'druid', 'kensei', 'summoner',
  'shiny-items', 'enchanting', 'dungeons',
  'swords', 'daggers', 'bows', 'staves', 'wands', 'katanas',
  'sigils', 'maces', 'sheaths', 'lutes',
  'weapons', 'ability-items', 'armor', 'rings',
  'tomes', 'shields', 'spells', 'seals', 'cloaks', 'quivers', 'helms', 'poisons',
  'skulls', 'traps', 'orbs', 'prisms', 'scepters', 'stars', 'wakizashi',
  'leather-armors', 'robes', 'heavy-armors',
  'untiered-rings', 'limited-rings', 'set-tier-items', 'equipment-set-gear', 'themed-sets',
  'reskinned-equipment', 'april-fool-s-equipment-versions', 'untiered-drops',
  'event-whites', 'biome-whites', 'other-items',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function save(page, dir = OUT) {
  const url = `https://www.realmeye.com/wiki/${page}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    console.log(res.status, url);
    if (res.ok) fs.writeFileSync(path.join(dir, `${page}.html`), Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    console.log('ERR', url, e.message);
  }
  await sleep(1000);
}

fs.mkdirSync(OUT, { recursive: true });
for (const page of PAGES) await save(page);

// One page per ST set, linked from the set list.
const setsDir = path.join(OUT, 'sets');
fs.mkdirSync(setsDir, { recursive: true });
const list = fs.existsSync(path.join(OUT, 'set-tier-items.html'))
  ? fs.readFileSync(path.join(OUT, 'set-tier-items.html'), 'utf8') : '';
const setPages = new Set([...list.matchAll(/href="\/wiki\/([a-z0-9-]+-set)"/g)].map((m) => m[1]));
for (const page of setPages) await save(page, setsDir);
