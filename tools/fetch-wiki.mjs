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
  'shiny-items', 'enchanting', 'dungeons', 'pet-player-experience-guide',
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

// ---------- Images ----------
// Class skins from the classes page and dungeon portals from the dungeons page.
// Saved to data/img/<kind>/<slug>.png. Existing files are kept.

const IMG_DIR = path.join(ROOT, 'data', 'img');
const slug = (s) => s.toLowerCase().replace(/&#39;|’|'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function saveImage(src, kind, name) {
  const dir = path.join(IMG_DIR, kind);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug(name)}.png`);
  if (fs.existsSync(file)) return;
  const url = new URL(src, 'https://www.realmeye.com').href;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    console.log(res.status, url, '->', path.relative(ROOT, file));
    if (res.ok) fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    console.log('ERR', url, e.message);
  }
  await sleep(300);
}

const readPage = (p) => (fs.existsSync(path.join(OUT, `${p}.html`)) ? fs.readFileSync(path.join(OUT, `${p}.html`), 'utf8') : '');

const CLASS_NAMES = ['Rogue', 'Archer', 'Wizard', 'Priest', 'Warrior', 'Knight', 'Paladin', 'Assassin',
  'Necromancer', 'Huntress', 'Mystic', 'Trickster', 'Sorcerer', 'Ninja', 'Samurai', 'Bard', 'Summoner',
  'Kensei', 'Druid'];
const classesHtml = readPage('classes');
for (const name of CLASS_NAMES) {
  const m = classesHtml.match(new RegExp(`<img alt="${name}" src="([^"]+)"`));
  if (m) await saveImage(m[1], 'classes', name);
}

const dungeonsHtml = readPage('dungeons');
for (const row of dungeonsHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  const tds = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (tds.length < 2) continue;
  const name = tds[0].replace(/<[^>]+>/g, '').trim();
  const img = tds[1].match(/<img[^>]*src="([^"]+)"/);
  if (name && img) await saveImage(img[1], 'dungeons', name);
}
