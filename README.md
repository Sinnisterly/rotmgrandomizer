<p align="center">
  <img src="data/img/assets/rotmg-randomizer-logo-dark.png" alt="ROTMG Exalt Randomizer" width="480">
</p>

A randomizer for Realm of the Mad God Exalt. Roll a random class with gear it can equip, spin a wheel for your dungeon, pick challenge rules, track your run and race friends on a bingo card. Made to be fun on stream too.

## Tabs

| Tab | What it does |
| --- | --- |
| Randomizer | A random class plus a weapon, ability, armor and ring that class can use. |
| Wheel | Spin for a dungeon, a dungeon difficulty, a class, a challenge, a curse or your own list. |
| Challenges | Turn on challenge modes like PPE, UPE or TPE, and add your own house rules. |
| Run | Run timer, counters for deaths, dungeons, white bags and set bags, active curses and a log. |
| Bingo | A bingo card of RotMG goals. Share the link and friends get the same card. |
| Stream | OBS overlay, Twitch chat commands and votes, and hotkeys. |

## Randomizer

1. Press **Randomize**. You get a class and four items.
2. Press a slot's **reroll** button to reroll only that slot.
3. Press a slot's **lock** button to keep it when you randomize again.
4. Use **Copy link**, **Copy as text** or **Copy image** to share your build.

Extras, all in the settings for the tab:

- **Reveal**: every roll is hidden behind "?" cards. Click one to reveal it. Items drop in a loot bag that matches the in-game bag color, and better bags shake harder before they open.
- **Reroll limit**: a set number of rerolls per run.
- **No repeats**: classes or items you already rolled stay out until the list is used up.
- **Daily roll**: everyone gets the same build today.
- **Shiny chance**: when an item that has a shiny version rolls, this is the chance it becomes shiny (5% by default). Shinies use their real sprite and get their own reveal.
- **Odds**: shows how rare your exact build was.

## Wheel

Pick a list and press **Spin**. Short lists use a wheel. Long lists, like dungeons, use a case opening reel. You can change this in the settings.

- Turn on **Remove rolled options** and each result leaves the wheel until you put it back.
- Spin **Dungeon difficulty** first, then spin a dungeon from that difficulty.
- Win a class to roll gear for it. Win a challenge to turn it on.
- Edit the Curses list or make your own lists under **Edit options**.

## Streaming

- **Pop-out windows**: each tab can open in its own clean window that copies what you do on the main page, live. Capture them in OBS with Window Capture, on a green or magenta background with a Chroma Key filter. A tab pop-out can jump to the wheel while it spins, then go back on its own.
- **Alerts window**: stays empty until a spin or reveal happens, then pops up, shows the result and hides again.
- **Show on stream**: pick the pieces you want on screen (timer, counters, curses, build, rules, alerts, recent events, bingo, vote) and drag them into place on a 1920 by 1080 layout. The stream window shows them live.
- **OBS WebSocket**: turn on the WebSocket server in OBS (Tools, then WebSocket Server Settings) and connect from the Stream tab. OBS Browser Sources then follow the main page live with a see-through background, and OBS can switch to a scene of your choice while the wheel spins.
- **Run in OBS**: a link that runs the randomizer inside OBS by itself, with no browser tab open. Bits, subs, gift subs, raids and chat commands work there. Tips and channel points do not, because tokens are never put in a link.
- **Twitch chat**: type your channel and press Connect. It only reads chat, so no login is needed. Chat can use `!roll`, `!reveal`, `!spin`, `!vote` and `!death`, and vote 1 to keep or 2 to reroll. You choose who can use commands.
- **Viewer events**: bits, subs, gift subs and raids come from Twitch chat with no login. Tips can come from StreamElements or Streamlabs with a token you paste in. Channel points work after Log in with Twitch, which only asks to read redemptions. Rules decide what each event does, like "When bits is at least 500, spin Curses". Events play one at a time, can be combined when they arrive close together, or can wait for you to approve each one. A test button sends pretend events so you can try it without going live.
- **Privacy**: the site has no server and collects nothing. Tokens are saved only in your browser, shown only behind an eye button, and never put in pop-out windows, OBS links or shared settings. The Stream tab lists everything the site saves and connects to, with buttons to delete it.
- **Hotkeys**: start off, so they never clash with game keys like WASD. Set the ones you want in Settings > Hotkeys. F keys and the numpad are good picks. They work as normal key presses from a Stream Deck, while the page is the active window.

## Look and sound

Settings > General has the theme (Dungeon, Nexus or Void), font (Pixel, Pixel titles only, or Plain for easier reading), accent color, text size, effects (speed, particles, screen shake, flashes, glow) and sound (volume, style and which sounds play). The Sound button at the top mutes everything.

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
<summary>For maintainers</summary>

- Run **Actions > Update item data > Run workflow** on GitHub. It downloads the current RealmEye data and commits it.
- Locally (Node 18 or newer): `node tools/fetch-wiki.mjs && node tools/build-data.mjs`
- When a new class ships, add its equipment to `CLASS_SLOTS` in `tools/build-data.mjs`.
- The code is plain JavaScript with no build step. Each tab has its own file in `js/`.
- Fonts are Pixelify Sans and Silkscreen, self hosted under the SIL Open Font License. See `css/fonts`.

</details>

Fan made. Not affiliated with DECA Games. Realm of the Mad God is a trademark of DECA Games.
