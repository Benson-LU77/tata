# Tata

**Signal becomes structure.** A city built from your notes.

Every page you write in [Obsidian](https://obsidian.md) becomes a building.
The calendar is the map — one month is a block, weekdays run across it,
weeks run down it. Skipped days stay empty lots. The archive grows into a
pixel skyline drifting in deep space, with residents, cats, a dog, and one
amber figure walking the newest streets: you.

**Local-first, free, forever.** Your notes never leave your machine and are
never deleted — Tata only reads your vault and writes with a conflict guard.

→ **[tata.page](https://tata.page)**

## How it plays

- **Write** — press `N` (or *Today*). Tonight's building grows storey by
  storey as you type, lit with the only warm colour in the city.
- **Earn watts** — every night you write earns watts; word counts are
  log-compressed and capped, so writing nights beat word floods.
- **The Depot** (`B`) — spend watts on cats, birds, a dog, street lamps,
  groves, a fountain, district skins, and weather (rain, snow, sea fog).
  Everything is earned. Amber is not for sale.
- **The Registry** (`C`) — the city remembers how each page was written:
  a lighthouse for returning after seven days away, an arch for a page
  written to a past empty day, a chapel for the smallest hours.
- **Levels** — watts raise the skyline height limit; levelling up lets the
  whole city grow at once. Consecutive nights light streetlights that are
  never taken away.

## Controls

| Input | Action |
|---|---|
| drag | orbit (snaps to 45°) · `Q`/`E` rotate |
| wheel / pinch | zoom · horizontal scroll pans |
| arrows / `Shift`+drag | pan |
| `[` `]` | travel between months |
| click a building | open that note |
| `/` | search (lights up matching buildings) |
| `Z` | zen — chrome fades, just the city |

## Run it

```bash
npm install
npm run dev        # http://localhost:8080
npm run test:city  # determinism tests for the pure city layer
```

Connect Obsidian via the
[Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)
plugin — paste its key into the panel behind the ⚙ icon. Without it, Tata
still works: notes stay in the browser until you connect.

## Principles

- The city is a portrait of your vault, not a score. No streaks that
  punish, no numbers on the main screen, nothing ever decays.
- Same vault, same city — layout is a pure function of your notes.
- Amber belongs to today's page alone.

Built with React 19, Three.js, CodeMirror 6. Pixel pipeline: the whole
scene renders at ~270p and integer-scales up through an 8-step palette
with Bayer dithering.
