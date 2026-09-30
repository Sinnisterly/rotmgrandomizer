#!/usr/bin/env node
/*
 * Builds the randomizer data files from RealmEye:
 *   data/items.js     classes, item types, items, ST sets
 *   data/renders.png  item sprite sheet
 *   data/enchants.js  enchantments
 *   data/dungeons.js  dungeons with difficulty
 *
 * Sources (saved in data/source/):
 *   definition.js, classinfo.js, renders.png   from realmeye.com/s/<ver>/...
 *   wiki/*.html                                from tools/fetch-wiki.mjs
 *
 * Usage:
 *   node tools/build-data.mjs            download RealmEye files, then build
 *   node tools/build-data.mjs --offline  build from files already in data/source
 *
 * Requires Node 18+. No npm packages.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data');
const SRC = path.join(OUT_DIR, 'source');
const WIKI = path.join(SRC, 'wiki');
const UA = 'Mozilla/5.0 (compatible; rotmg-randomizer-data-builder; +https://github.com/sinnisterly/rotmgrandomizer)';
const CELL = 48; // sprite cell size in renders.png

// RealmEye item slot type ids.
const SLOT_TYPES = {
  1: ['Sword', 'weapon', 'swords'],
  2: ['Dagger', 'weapon', 'daggers'],
  3: ['Bow', 'weapon', 'bows'],
  8: ['Wand', 'weapon', 'wands'],
  17: ['Staff', 'weapon', 'staves'],
  24: ['Katana', 'weapon', 'katanas'],
  4: ['Tome', 'ability', 'tomes'],
  5: ['Shield', 'ability', 'shields'],
  11: ['Spell', 'ability', 'spells'],
  12: ['Seal', 'ability', 'seals'],
  13: ['Cloak', 'ability', 'cloaks'],
  15: ['Quiver', 'ability', 'quivers'],
  16: ['Helm', 'ability', 'helms'],
  18: ['Poison', 'ability', 'poisons'],
  19: ['Skull', 'ability', 'skulls'],
  20: ['Trap', 'ability', 'traps'],
  21: ['Orb', 'ability', 'orbs'],
  22: ['Prism', 'ability', 'prisms'],
  23: ['Scepter', 'ability', 'scepters'],
  25: ['Star', 'ability', 'stars'],
  27: ['Wakizashi', 'ability', 'wakizashi'],
  28: ['Lute', 'ability', 'lutes'],
  29: ['Mace', 'ability', 'maces'],
  30: ['Sheath', 'ability', 'sheaths'],
  31: ['Sigil', 'ability', 'sigils'],
  6: ['Leather Armor', 'armor', 'leather-armors'],
  7: ['Heavy Armor', 'armor', 'heavy-armors'],
  14: ['Robe', 'armor', 'robes'],
  9: ['Ring', 'ring', 'untiered-rings'],
};

// Equipment per class: [weapon, ability, armor, ring] slot type ids.
// Checked against each class's starting items on the RealmEye wiki.
const CLASS_SLOTS = {
  Rogue: [2, 13, 6, 9], Archer: [3, 15, 6, 9], Wizard: [17, 11, 14, 9],
  Priest: [8, 4, 14, 9], Warrior: [1, 16, 7, 9], Knight: [1, 5, 7, 9],
  Paladin: [1, 12, 7, 9], Assassin: [2, 18, 6, 9], Necromancer: [17, 19, 14, 9],
  Huntress: [3, 20, 6, 9], Mystic: [17, 21, 14, 9], Trickster: [2, 22, 6, 9],
  Sorcerer: [8, 23, 14, 9], Ninja: [24, 25, 6, 9], Samurai: [24, 27, 7, 9],
  Bard: [3, 28, 14, 9], Summoner: [8, 29, 14, 9], Kensei: [24, 30, 7, 9],
  Druid: [8, 31, 6, 9],
};

// Dungeon difficulty groups (RealmEye difficulty rating, inclusive max).
const DUNGEON_GROUPS = [
  { id: 'beginner', name: 'Beginner', max: 3 },
  { id: 'adept', name: 'Adept', max: 5 },
  { id: 'hard', name: 'Hard', max: 7 },
  { id: 'exalt', name: 'Exalt', max: 99 },
];
// RealmEye dungeon page sections to keep, and whether they are on by default.
const DUNGEON_SECTIONS = {
  'Realm Dungeons': ['realm', 'Realm', true],
  'Realm Event Dungeons': ['event', 'Realm Event', true],
  'Advanced Dungeons': ['advanced', 'Advanced', true],
  "Oryx's Castle": ['oryx', "Oryx's Castle", true],
  'Wormholes': ['wormhole', 'Wormholes', true],
  'Advanced Wormholes': ['advwormhole', 'Advanced Wormholes', true],
  'Heroic Dungeons': ['heroic', 'Legacy Heroic', false],
  'Special Event Dungeons': ['special', 'Special Event', false],
};

// ---------- helpers ----------

const norm = (s) => decode(s).replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).toLowerCase();

function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// Same slug rule as tools/fetch-wiki.mjs. Returns the image path if the file exists.
const slug = (s) => s.toLowerCase().replace(/&#39;|’|'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function imagePath(kind, name) {
  const rel = `data/img/${kind}/${slug(name)}.png`;
  return fs.existsSync(path.join(ROOT, rel)) ? rel : null;
}

const text = (html) => norm(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
const cells = (rowHtml) => [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
const rows = (html) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);

function readWiki(page) {
  const file = path.join(WIKI, `${page}.html`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

// Splits a page into [heading, html] sections on the given heading tags.
function sections(html, tags) {
  const re = new RegExp(`<(${tags})[^>]*>([\\s\\S]*?)</(?:${tags})>`, 'g');
  const out = [];
  let last = { head: '', start: 0 };
  for (const m of html.matchAll(re)) {
    out.push([last.head, html.slice(last.start, m.index)]);
    last = { head: text(m[2]), start: m.index + m[0].length };
  }
  out.push([last.head, html.slice(last.start)]);
  return out;
}

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- download ----------

// Finds RealmEye's current definition.js, classinfo.js and renders.png and saves them.
async function download() {
  const base = 'https://www.realmeye.com';
  const html = (await fetchBuf(`${base}/wiki/items`)).toString('utf8');
  const find = (re, what) => {
    const m = html.match(re);
    if (!m) throw new Error(`Could not find ${what} on realmeye.com/wiki/items`);
    return new URL(m[1], base).href;
  };
  const definition = find(/["']([^"']*\/definition\.js[^"']*)["']/, 'definition.js');
  const classinfo = find(/["']([^"']*\/classinfo\.js[^"']*)["']/, 'classinfo.js');
  // renders.png sits in img/ next to js/ on RealmEye.
  const renders = new URL('../img/renders.png', definition).href;

  fs.mkdirSync(SRC, { recursive: true });
  for (const [url, name] of [[definition, 'definition.js'], [classinfo, 'classinfo.js'], [renders, 'renders.png']]) {
    console.log('GET', url);
    fs.writeFileSync(path.join(SRC, name), await fetchBuf(url));
  }
  return { version: definition.match(/\/s\/([^/]+)\//)?.[1] || null };
}

// ---------- parse sources ----------

function loadGlobals() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const def = fs.readFileSync(path.join(SRC, 'definition.js'), 'utf8');
  const cls = fs.readFileSync(path.join(SRC, 'classinfo.js'), 'utf8');
  vm.runInContext(`${def}\n;window.__items = items;`, sandbox, { timeout: 10000 });
  vm.runInContext(cls, sandbox, { timeout: 10000 });
  const items = sandbox.window.__items;
  const classInfos = sandbox.window.classInfos;
  if (!items || !classInfos) throw new Error('definition.js or classinfo.js has an unknown format');
  return { items, classInfos };
}

// Extra wiki pages with item tables, and the flag their items get.
const EXTRA_ITEM_PAGES = {
  'rings': null, 'limited-rings': 'limited', 'reskinned-equipment': 'reskin',
  'untiered-drops': null, 'event-whites': null, 'biome-whites': null, 'other-items': null,
};

// Reads every item table on the given pages. Finds the Tier and Name columns
// from the table header. Returns name key -> { kind: 'ut'|'st'|'t', flags }.
function parseItemPages() {
  const map = new Map();
  const pages = Object.fromEntries(Object.values(SLOT_TYPES).map((t) => [t[2], null]));
  Object.assign(pages, EXTRA_ITEM_PAGES);
  const missing = [];
  for (const [page, pageFlag] of Object.entries(pages)) {
    const html = readWiki(page);
    if (!html) { missing.push(page); continue; }
    for (const [head, body] of sections(html, 'h2|h3|h4')) {
      const secFlag = /limited/i.test(head) ? 'limited' : null;
      for (const table of body.matchAll(/<table[\s\S]*?<\/table>/g)) {
        const header = [...table[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
        const tierCol = header.findIndex((h) => /^tier$/i.test(h));
        const nameCol = header.findIndex((h) => /^name$/i.test(h));
        if (tierCol < 0 || nameCol < 0) continue;
        for (const r of rows(table[0])) {
          const c = cells(r);
          if (c.length <= Math.max(tierCol, nameCol)) continue;
          const tierText = text(c[tierCol]);
          const name = text(c[nameCol]).replace(/\s*\*+$/, '');
          let kind = null;
          if (/^UT\b/.test(tierText)) kind = 'ut';
          else if (/^ST\b/.test(tierText)) kind = 'st';
          else if (/^T\d+/.test(tierText)) kind = 't';
          if (!kind || !name) continue;
          const k = key(name);
          const entry = map.get(k) || { kind, flags: new Set() };
          if (secFlag) entry.flags.add(secFlag);
          if (pageFlag) entry.flags.add(pageFlag);
          map.set(k, entry);
        }
      }
    }
  }
  if (missing.length) console.warn('WARN: missing wiki pages:', missing.join(', '));
  return map;
}

// ST sets from the set list and one page per set.
// Returns [{ name, group, keys: [item name keys] }].
function parseSetPages() {
  const list = readWiki('set-tier-items');
  if (!list) return [];
  const out = [];
  for (const table of list.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const header = [...table[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    if (header[0] !== 'Class') continue;
    for (const r of rows(table[0])) {
      cells(r).forEach((cell, col) => {
        const m = cell.match(/href="\/wiki\/([a-z0-9-]+-set)"[\s\S]*?title="([^"]+)"/);
        if (!m || col === 0) return;
        const file = path.join(WIKI, 'sets', `${m[1]}.html`);
        if (!fs.existsSync(file)) return;
        const html = fs.readFileSync(file, 'utf8');
        const body = html.slice(html.indexOf('<h1'), html.search(/initializeWikiPage|class="wiki-nav/));
        const names = [...body.matchAll(/<a href="\/wiki\/[^"]+"[^>]*>([^<]+)<\/a>|title="([^"]+)"/g)]
          .map((x) => key(x[1] || x[2]));
        out.push({ name: norm(m[2]), group: header[col] || '', keys: [...new Set(names)] });
      });
    }
  }
  return out;
}

function parseEnchants() {
  const html = readWiki('enchanting');
  if (!html) { console.warn('WARN: no enchanting page'); return []; }
  const start = html.search(/Basic Enchantments<\/h/);
  const end = html.search(/>Notes<\/h/);
  const body = html.slice(start, end > start ? end : undefined);
  const out = new Map();
  for (const [head, part] of sections(body, 'h2|h3|h4')) {
    const type = /awakened/i.test(head) ? 'awakened' : /unique/i.test(head) ? 'unique' : 'basic';
    if (type === 'awakened') continue; // item specific, not random
    for (const r of rows(part)) {
      const c = cells(r).map(text);
      if (c.length < 5) continue;
      const [name, eligible, effect, labels, incompat] = c.slice(-5);
      if (!name || out.has(name)) continue;
      const slots = /\bALL\b/.test(eligible)
        ? ['weapon', 'ability', 'armor', 'ring']
        : ['weapon', 'ability', 'armor', 'ring'].filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(eligible));
      if (!slots.length) continue;
      out.set(name, {
        name, type, slots, effect,
        labels: labels.split(/\s+/).filter(Boolean),
        incompat: incompat.split(/\s+/).filter(Boolean),
      });
    }
  }
  return [...out.values()];
}

function parseDungeons() {
  const html = readWiki('dungeons');
  if (!html) { console.warn('WARN: no dungeons page'); return []; }
  const out = [];
  const seen = new Set();
  for (const [head, body] of sections(html, 'h2|h3')) {
    const sec = DUNGEON_SECTIONS[norm(head)];
    if (!sec) continue;
    for (const r of rows(body)) {
      const c = cells(r).map(text);
      if (c.length < 4) continue;
      const diff = Number(c[c.length - 1]);
      const name = c[0];
      if (!name || !Number.isFinite(diff) || seen.has(name)) continue;
      seen.add(name);
      const group = DUNGEON_GROUPS.find((g) => diff <= g.max).id;
      out.push({ name, section: sec[0], difficulty: diff, group, img: imagePath('dungeons', name) });
    }
  }
  return out;
}

// ---------- build ----------

function build(meta) {
  const { items: rawItems, classInfos } = loadGlobals();
  const wikiItems = parseItemPages();
  // Items listed only on an ST set page count as ST.
  const setPages = parseSetPages();
  for (const set of setPages) {
    for (const k of set.keys) if (!wikiItems.has(k)) wikiItems.set(k, { kind: 'st', flags: new Set(), fromSet: true });
  }

  const classes = [];
  for (const row of classInfos) {
    const slots = CLASS_SLOTS[row[1]];
    if (!slots) { console.warn(`WARN: no equipment slots known for class ${row[1]}, skipped`); continue; }
    classes.push({ id: row[0], name: row[1], slots, img: imagePath('classes', row[1]) });
  }

  const slotTypes = {};
  for (const [id, [name, category]] of Object.entries(SLOT_TYPES)) slotTypes[id] = { name, category };

  // Keep equipment rows. Untiered rows must be listed on the wiki, which drops
  // projectiles, test items and other internal entries.
  const kept = [];
  const dropped = [];
  for (const [rawId, row] of Object.entries(rawItems)) {
    const id = Number(rawId);
    if (row.length < 8 || id <= 0 || !SLOT_TYPES[row[1]]) continue;
    const [name0, slot, tier, x, y] = row;
    const name = norm(name0);
    if (/^tester\b/i.test(name)) { dropped.push(name); continue; }
    const wiki = wikiItems.get(key(name)) || wikiItems.get(key(name.replace(/\s*\(SB\)$/i, '')));
    let kind;
    if (tier >= 0) kind = 't';
    else if (wiki && wiki.kind !== 't') kind = wiki.kind;
    else { dropped.push(name); continue; }
    const flags = wiki ? [...wiki.flags] : [];
    if (/^legacy /i.test(name)) flags.push('legacy');
    if (/\(SB\)$/i.test(name)) flags.push('sb');
    kept.push({ id, name, slot, tier, x, y, kind, flags });
  }

  // Shiny: RealmEye gives shiny variants the same name as the base item.
  // The lowest id is the base item, the rest are shiny.
  const byName = new Map();
  for (const it of kept.sort((a, b) => a.id - b.id)) {
    const k = `${it.slot}|${key(it.name)}`;
    if (byName.has(k)) it.flags.push('shiny');
    else byName.set(k, it);
  }

  // ST sets: match item names on each set page to base (non shiny) ST items,
  // one item per equipment category.
  const catOf = (it) => SLOT_TYPES[it.slot][1];
  const stByKey = new Map();
  for (const it of kept) {
    if (it.kind === 'st' && !it.flags.includes('shiny') && !stByKey.has(key(it.name))) stByKey.set(key(it.name), it);
  }
  const sets = [];
  const setKeys = new Set();
  for (const set of setPages) {
    const pieces = [];
    for (const k of set.keys) {
      const it = stByKey.get(k);
      if (it && !pieces.some((p) => catOf(p) === catOf(it))) pieces.push(it);
    }
    const sig = pieces.map((p) => p.id).sort().join(',');
    if (pieces.length < 2 || setKeys.has(sig)) continue;
    setKeys.add(sig);
    sets.push({ name: set.name, group: set.group, ids: pieces.map((p) => p.id) });
  }

  const count = (k) => kept.filter((i) => i.kind === k).length;
  console.log(`Classes (${classes.length}): ${classes.map((c) => c.name).join(', ')}`);
  console.log(`Items: ${kept.length} (tiered ${count('t')}, UT ${count('ut')}, ST ${count('st')}, shiny ${kept.filter((i) => i.flags.includes('shiny')).length})`);
  console.log(`ST sets: ${sets.length}. Dropped ${dropped.length} unlisted rows, e.g. ${dropped.slice(0, 8).join('; ')}`);

  return {
    meta: { ...meta, generated: new Date().toISOString(), itemCount: kept.length },
    slotTypes,
    classes,
    items: kept.map((it) => [it.id, it.name, it.slot, it.tier, it.x, it.y, it.kind, it.flags.join(',')]),
    sets,
  };
}

function pngSize(buf) {
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('renders file is not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function writeJs(file, globalName, data, note) {
  fs.writeFileSync(path.join(OUT_DIR, file),
    `// Generated by tools/build-data.mjs from RealmEye. ${note}\nwindow.${globalName} = ${JSON.stringify(data)};\n`);
}

async function main() {
  const offline = process.argv.includes('--offline');
  let version = null;
  if (!offline) ({ version } = await download());

  const png = fs.readFileSync(path.join(SRC, 'renders.png'));
  const size = pngSize(png);
  const data = build({
    source: 'RealmEye',
    realmeyeVersion: version,
    sheet: { file: 'data/renders.png', w: size.w, h: size.h, cell: CELL },
  });
  fs.writeFileSync(path.join(OUT_DIR, 'renders.png'), png);
  writeJs('items.js', 'ROTMG_DATA', data, 'Do not edit by hand.');

  const enchants = parseEnchants();
  console.log(`Enchantments: ${enchants.length} (unique ${enchants.filter((e) => e.type === 'unique').length})`);
  writeJs('enchants.js', 'ROTMG_ENCHANTS', enchants, 'Do not edit by hand.');

  const dungeons = parseDungeons();
  console.log(`Dungeons: ${dungeons.length}`);
  const sections = Object.values(DUNGEON_SECTIONS).map(([id, name, on]) => ({ id, name, on }));
  writeJs('dungeons.js', 'ROTMG_DUNGEONS', { groups: DUNGEON_GROUPS, sections, dungeons }, 'Do not edit by hand.');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
