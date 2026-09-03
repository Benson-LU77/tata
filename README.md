# Tata

**Signal becomes structure.** A pixel city grown from your journal.

Write a page tonight and it becomes a building — the more you write, the
taller it stands. A month is an island; boardwalks connect the months you
have lived through. Residents move in as the city grows, remember the
replies you picked, and eventually call you by name. Above it all: real
moon phases, and constellations that light up as you level.

**Local-first, free, forever.** There is no server, no account and no
analytics. Every page is a plain `.md` file that stays on your machine —
Tata reads and writes it through a conflict guard, and never deletes.

→ **[tata.page](https://tata.page)** · iOS build in App Store review

<p align="center">
  <em>Black, white, amber. Nothing else.</em>
</p>

## How it plays

- **Write** — press `N` (or *Today*). Tonight's building grows storey by
  storey as you type, lit with the only warm colour in the city.
- **Earn watts** — every night you write earns watts; word counts are
  log-compressed and capped, so writing nights beat word floods.
- **The Depot** (`B`) — spend watts on cats, a dog, messenger ships, street
  lamps, groves, a fountain, district skins, weather, and a daily ornament
  that rotates at midnight. Everything is earned. Amber is not for sale.
- **The Registry** (`C`) — neighbours met, landmarks raised, city rings
  replayed. The city keeps the list.
- **Meet someone** — tap a resident. Twelve trades, each fixed for life;
  friendship deepens over 1 / 4 / 10 / 20 days of meeting.
- **Nothing decays** — skip a week and nothing is taken away. Buildings
  never shrink, streetlights remember your best streak, past pages seal
  themselves read-only.

## Where your words live

Tata writes through one `FileStore` interface with four backends, so the
same write guard protects all of them:

| Bridge | Where the files are |
|---|---|
| **Local bookcase** (default) | Origin Private File System — zero setup, works offline |
| **A folder you pick** | File System Access API, on desktop browsers |
| **Obsidian** | via the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin |
| **iPhone** | a native Swift plugin writing into the app's Documents folder, visible in Files |

Pick one in the setup card — *"Where should your words live?"*

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
npm test           # 74 tests across 11 files
npm run typecheck
npm run ios:sync   # rebuild the iOS shell (Capacitor + Swift plugin)
```

## Principles

- **The city is a portrait of your vault, not a score.** No punishing
  streaks, no numbers on the main screen, nothing ever decays.
- **Same vault, same city.** Layout, residents and tonight's errand are pure
  functions of your notes and the date — nothing is stored twice.
- **No instruction text.** Everything you need to know, a resident tells you
  on the street.
- **Watts you spend must be visible.** A gift system was built and then
  deleted, because you could not see the gift in the city.
- **Refusing to write is the default.** After a real data-loss incident on
  day 10, every guard branch asks for evidence before it overwrites: a
  missing field means stop, "cannot read" is not "does not exist", a shadow
  backup is taken before every overwrite, and the write is verified by
  reading it back.

## Under the hood

Built with React 19, Three.js and CodeMirror 6; packaged for iOS with
Capacitor 8 and a Swift file plugin. The scene renders at 324p and
integer-scales up through an 8-step greyscale palette (plus amber) with
Bayer dithering. Residents, trees and street ornaments are hand-drawn ASCII
sprites baked into an atlas — anything under two world units is drawn by
hand, because a tree assembled from boxes never looks like a tree at 12px.

Dialogue is data: 277 openers, each with its own bespoke replies and
closers (554 in total), with 100% coverage enforced by a test.

Architecture notes live in [`docs/`](docs/) — build map, wireframes,
maintenance loops and the data-guard rules.

## License

MIT — see [LICENSE](LICENSE). The pixel art and writing are part of Tata's
identity; please build on the code rather than shipping a copy of the art.
