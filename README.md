# ROTMG Exalt Randomizer

A class, item and dungeon randomizer for Realm of the Mad God Exalt. It is a static site with no build step, so it runs on GitHub Pages.

## Features

- Rolls one of the 19 classes and 4 items the class can equip (weapon, ability, armor, ring).
- Weighted item types (Tiered, UT, ST), with tier limits per slot.
- Toggles for shiny, limited edition, legacy and reskinned items.
- Full ST set rolls, with an adjustable chance.
- Enchantment rolls (1 to 4 per item) that never combine incompatible enchantments.
- Challenge modes. Iron Man and UPE filter the item pool. PPE, NPE, HPE, TPE, BPE, GPE and Realmlocke show their rules.
- Lock or reroll any single slot.
- Seeds, share links, copy as text, and roll history.
- Dungeon randomizer, filtered by RealmEye difficulty rating and dungeon type.

## Hosting on GitHub Pages

Settings > Pages > Source: "Deploy from a branch", then pick the branch and `/ (root)`.

## Updating data

All item, class, enchantment and dungeon data and the sprite sheet come from [RealmEye](https://www.realmeye.com).

- **GitHub:** Actions > "Update item data" > Run workflow. The workflow downloads the current RealmEye files and wiki pages, rebuilds `data/`, and commits the result.
- **Locally (Node 18+):** `node tools/fetch-wiki.mjs && node tools/build-data.mjs`
- **Rebuild without downloading:** `node tools/build-data.mjs --offline`

Raw downloads are kept in `data/source/`, so every build can be reproduced.

When a new class ships, add its equipment to `CLASS_SLOTS` in `tools/build-data.mjs`. If it brings a new item type, also add the type to `SLOT_TYPES` and the type's wiki page to `tools/fetch-wiki.mjs`.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `css/styles.css`, `js/app.js` | The app |
| `data/items.js`, `data/renders.png` | Classes, items, ST sets and the sprite sheet |
| `data/enchants.js` | Enchantments |
| `data/dungeons.js` | Dungeons with difficulty |
| `data/source/` | Raw RealmEye files the data is built from |
| `tools/fetch-wiki.mjs` | Downloads RealmEye wiki pages |
| `tools/build-data.mjs` | Builds `data/` from the RealmEye files |

Made by [Loathe](https://github.com/Sinnisterly). Fan made. Not affiliated with DECA Games.
