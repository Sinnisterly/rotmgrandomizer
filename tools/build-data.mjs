#!/usr/bin/env node
/*
 * Builds data/items.js and data/renders.png for the randomizer.
 *
 * Input is RealmEye's definition.js (the "items = {...}; classes = {...}" file
 * that RealmEye, Muledump and other fan tools use) plus the matching
 * renders.png sprite sheet.
 *
 * Usage:
 *   node tools/build-data.mjs                     auto-discover from realmeye.com
 *   node tools/build-data.mjs --definition <file|url> --renders <file|url>
 *
 * Requires Node 18+ (global fetch). No npm packages.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data');
const UA = 'Mozilla/5.0 (compatible; rotmg-randomizer-data-builder; +https://github.com/sinnisterly/rotmgrandomizer)';

// RealmEye slot type ids. Ids not listed here get a name from CLASS_ABILITY_NAMES
// or fall back to "Slot N". Edit this list when a new type appears.
const SLOT_TYPE_NAMES = {
  1: 'Sword', 2: 'Dagger', 3: 'Bow', 4: 'Tome', 5: 'Shield', 6: 'Leather Armor',
  7: 'Heavy Armor', 8: 'Wand', 9: 'Ring', 10: 'Consumable', 11: 'Spell', 12: 'Seal',
  13: 'Cloak', 14: 'Robe', 15: 'Quiver', 16: 'Helm', 17: 'Staff', 18: 'Poison',
  19: 'Skull', 20: 'Trap', 21: 'Orb', 22: 'Prism', 23: 'Scepter', 24: 'Katana',
  25: 'Star', 26: 'Egg', 27: 'Wakizashi', 28: 'Lute',
};
// Used when a class's ability slot type id is not in SLOT_TYPE_NAMES.
const CLASS_ABILITY_NAMES = { Summoner: 'Mace', Kensei: 'Sheath' };

const CATEGORIES = ['weapon', 'ability', 'armor', 'ring'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1], i++;
  }
  return args;
}

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function load(src) {
  if (/^https?:\/\//.test(src)) return fetchBuf(src);
  return fs.readFileSync(path.resolve(src));
}

// Finds the current definition.js and renders.png URLs on realmeye.com.
async function discoverRealmEye() {
  const base = 'https://www.realmeye.com';
  const html = (await fetchBuf(`${base}/wiki/items`)).toString('utf8');
  const abs = (u) => new URL(u, base).href;

  const defMatch = html.match(/["']([^"']*definition\.js[^"']*)["']/);
  if (!defMatch) throw new Error('Could not find definition.js on realmeye.com/wiki/items');
  const definition = abs(defMatch[1]);

  let renders = null;
  const rendersRe = /["'(]([^"'()]*renders\.png[^"'()]*)["')]/;
  let m = html.match(rendersRe);
  if (m) renders = abs(m[1]);

  // Check linked stylesheets if the page itself does not name the sheet.
  if (!renders) {
    const cssLinks = [...html.matchAll(/href=["']([^"']+\.css[^"']*)["']/g)].map((x) => abs(x[1]));
    for (const css of cssLinks) {
      try {
        const text = (await fetchBuf(css)).toString('utf8');
        m = text.match(rendersRe);
        if (m) { renders = new URL(m[1], css).href; break; }
      } catch { /* try next */ }
    }
  }
  // Last resort: guess paths next to definition.js.
  if (!renders) {
    for (const guess of ['renders.png', '../css/renders.png', '../img/renders.png']) {
      const url = new URL(guess, definition).href;
      try {
        const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } });
        if (res.ok) { renders = url; break; }
      } catch { /* try next */ }
    }
  }
  if (!renders) throw new Error('Could not find renders.png on realmeye.com');
  return { definition, renders };
}

// Runs definition.js in a sandbox and returns its globals.
function evalDefinition(code) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 10000 });
  const g = { ...sandbox.window, ...sandbox };
  if (!g.items || !g.classes) throw new Error('definition.js did not define items and classes');
  console.log('definition.js globals:', Object.keys(g).filter((k) => k !== 'window').join(', '));
  return g;
}

function pngSize(buf) {
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('renders file is not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function build(g, meta) {
  // Classes: [name, base, averages, maxes, slots]. Find the slots array defensively.
  const classes = [];
  for (const [id, row] of Object.entries(g.classes)) {
    const slots = row.find((v) => Array.isArray(v) && v.length === 4 && v.every(Number.isInteger) && v[3] === 9)
      || row[4];
    classes.push({ id: Number(id), name: row[0], slots });
  }
  classes.sort((a, b) => a.id - b.id);

  // Slot types used by classes, and which equipment category each one belongs to.
  const slotTypes = {};
  for (const c of classes) {
    c.slots.forEach((t, i) => {
      if (!slotTypes[t]) {
        let name = SLOT_TYPE_NAMES[t];
        if (!name && i === 1 && CLASS_ABILITY_NAMES[c.name]) name = CLASS_ABILITY_NAMES[c.name];
        if (!name) { name = `Slot ${t}`; console.warn(`WARN: unknown slot type ${t} (${c.name} ${CATEGORIES[i]})`); }
        slotTypes[t] = { name, category: CATEGORIES[i] };
      }
    });
  }

  // Items: [name, slotType, tier, x, y, fameBonus, feedPower, bagType, soulbound, utst]
  const items = [];
  for (const [rawId, row] of Object.entries(g.items)) {
    const id = Number(rawId);
    const [name, slot, tier, x, y] = row;
    const utst = row[9] | 0;
    if (!slotTypes[slot] || id <= 0) continue;
    if (/ skin\b/i.test(name)) continue;
    const kind = tier >= 0 ? 't' : utst === 1 ? 'ut' : utst === 2 ? 'st' : 'o';
    const flags = [];
    if (/shiny/i.test(name)) flags.push('shiny');
    if (/^legacy /i.test(name)) flags.push('legacy');
    if (row[8] === true) flags.push('sb');
    items.push([id, name, slot, tier, x, y, kind, flags.join(',')]);
  }

  // ST sets: set pieces get item ids next to each other. Sort ST items by id and
  // group runs with small id gaps, one item per category, max 4 pieces.
  const sets = [];
  let cur = [];
  const catOf = (it) => slotTypes[it[2]].category;
  const flush = () => { if (cur.length >= 2) sets.push(cur.map((it) => it[0])); cur = []; };
  const stItems = items.filter((it) => it[6] === 'st').sort((a, b) => a[0] - b[0]);
  for (const it of stItems) {
    const prev = cur[cur.length - 1];
    if (prev && (it[0] - prev[0] > 4 || cur.some((c) => catOf(c) === catOf(it)))) flush();
    cur.push(it);
    if (cur.length === 4) flush();
  }
  flush();

  return {
    meta: { ...meta, generated: new Date().toISOString(), itemCount: items.length, setCount: sets.length },
    slotTypes,
    classes,
    items,
    sets,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let src = { definition: args.definition, renders: args.renders };
  if (!src.definition || !src.renders) {
    console.log('Discovering data files on realmeye.com ...');
    src = { ...(await discoverRealmEye()), ...Object.fromEntries(Object.entries(src).filter(([, v]) => v)) };
  }
  console.log('definition:', src.definition);
  console.log('renders:   ', src.renders);

  const [defBuf, pngBuf] = await Promise.all([load(src.definition), load(src.renders)]);
  const size = pngSize(pngBuf);
  const g = evalDefinition(defBuf.toString('utf8'));
  const data = build(g, {
    source: args.label || (/^https?:/.test(src.definition) ? src.definition : path.basename(src.definition)),
    rendersVersion: g.rendersVersion || null,
    sheet: { file: 'data/renders.png', w: size.w, h: size.h, cell: 40 },
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'renders.png'), pngBuf);
  const js = '// Generated by tools/build-data.mjs. Do not edit by hand.\n'
    + `window.ROTMG_DATA = ${JSON.stringify(data)};\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'items.js'), js);

  console.log(`Classes: ${data.classes.map((c) => c.name).join(', ')}`);
  console.log(`Items: ${data.items.length}, ST sets: ${data.sets.length}, sheet ${size.w}x${size.h}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
