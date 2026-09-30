<p align="center">
  <img src="data/img/assets/rotmg-randomizer-logo-dark.png" alt="ROTMG Exalt Randomizer" width="480">
</p>

A randomizer for Realm of the Mad God Exalt. Press one button and get a random class with a full set of gear that class can actually equip. Roll a dungeon to run with it, add challenge rules, and share the result with friends.

## How to use

1. Press **Randomize**. You get a class plus a weapon, ability, armor and ring for that class.
2. Don't like one slot? Press its **reroll** button to reroll only that slot.
3. Want to keep something? Press its **lock** button. Locked slots stay when you randomize again.
4. Press **Roll dungeon** to pick a dungeon to run.
5. Use **Copy link** to share your exact roll, or **Copy as text** to paste it into Discord.

Tip: press **R** or **Space** to randomize without clicking.

## Settings

Open the settings panel on the right. Press **Hide** to collapse it and use the full width.

| Setting | What it does |
| --- | --- |
| Challenge modes | Pick a mode such as PPE, NPE, UPE or TPE to see its full rules. Modes marked "pool" also change which items can roll. |
| Item types | How often Tiered, UT and ST items show up. Set one to 0 to turn it off. You can also turn off Shiny, Limited, Legacy and Reskinned items. |
| Enchantments | Adds 1 to 4 random enchantments to each item. Incompatible enchantments never roll together. |
| ST sets | The chance to roll a full ST set for the class instead of single items. |
| Tier limits | The lowest and highest tier allowed for tiered items in each slot. |
| Classes | Which classes can be rolled. |
| Dungeons | Filter by difficulty (Beginner, Adept, Hard, Exalt) and dungeon type. |
| Display | Turn the slot machine animation on or off. |

Settings are saved in your browser.

## Seeds

Every roll has a seed. Type a seed and press **Use seed** to get the same roll again with the same settings. Your last 25 rolls are listed under **History**.

## Where the data comes from

Items, classes, enchantments, dungeons and all images come from [RealmEye](https://www.realmeye.com). The data is refreshed after game updates, so new items show up once RealmEye lists them.

Spotted a wrong or missing item? Open an issue on this repository.

## Support

Made by [Loathe](https://github.com/Sinnisterly). Discord: @Sinnisterly.
If you enjoy it, you can support me on [Ko-fi](https://ko-fi.com/loathed).

<details>
<summary>For maintainers: updating the data</summary>

- Run **Actions > Update item data > Run workflow** on GitHub. It downloads the current RealmEye data and commits it.
- Locally (Node 18 or newer): `node tools/fetch-wiki.mjs && node tools/build-data.mjs`
- When a new class ships, add its equipment to `CLASS_SLOTS` in `tools/build-data.mjs`.

</details>

Fan made. Not affiliated with DECA Games. Realm of the Mad God is a trademark of DECA Games.
