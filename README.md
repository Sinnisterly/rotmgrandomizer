# RotMG Randomizer

A class, item and dungeon randomizer for Realm of the Mad God Exalt. It is a static site with no build step, so it runs on GitHub Pages.

## Features

- Rolls a class and 4 items that the class can equip (weapon, ability, armor, ring).
- Weighted item types (Tiered, UT, ST), with tier limits per slot.
- Full ST set rolls, with an adjustable chance.
- Challenge modes. Iron Man and UPE filter the item pool. PPE, NPE, HPE, TPE, BPE, GPE and Realmlocke show their rules.
- Lock or reroll any single slot.
- Seeds, share links, copy as text, and roll history.
- Dungeon randomizer with difficulty filters.

## Hosting on GitHub Pages

Settings > Pages > Source: "Deploy from a branch", then pick the branch and `/ (root)`.

## Updating item data

Item data and sprites come from RealmEye's `definition.js` and `renders.png`.

- **GitHub:** Actions > "Update item data" > Run workflow. The workflow rebuilds the data and commits `data/items.js` and `data/renders.png`.
- **Locally (Node 18+):** `node tools/build-data.mjs`
- **From local files:** `node tools/build-data.mjs --definition path/to/definition.js --renders path/to/renders.png`

If a new class adds a new item type, add its name to `SLOT_TYPE_NAMES` in `tools/build-data.mjs`.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `css/styles.css`, `js/app.js` | The app |
| `data/items.js`, `data/renders.png` | Generated item data and sprite sheet |
| `data/dungeons.js` | Dungeon list and difficulty groups (edit by hand) |
| `data/enchants.js` | Enchantment list (empty until a source is added) |
| `tools/build-data.mjs` | Data builder |

Fan made. Not affiliated with DECA Games.
