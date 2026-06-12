# DBX Arcade 🕹️

A 90s DOS arcade in your browser. Pick a cabinet, it boots the real game in
[js-dos](https://js-dos.com) (DOSBox compiled to WebAssembly). Ships as a static
Databricks App. Minimal, dark, arcade aesthetic.

Every title is **legally free to redistribute** — official shareware episodes or
publisher-released freeware (Apogee/3D Realms/Epic/id). No commercial ROMs.

## Layout

```
app/
  server.py          FastAPI static server (sets COOP/COEP for SharedArrayBuffer)
  app.yaml           Databricks App entrypoint
  requirements.txt
  static/
    index.html       arcade shell
    arcade.css       theming (dark/light, CRT, neon)
    arcade.js        catalog render + js-dos player lifecycle
    catalog.json     generated — the game list the UI reads
    games/*.jsdos    generated — one DOSBox bundle per game
build/
  manifest.json      source of truth: id, title, genre, download_url, launch_cmd, cycles
  build_bundles.py   downloads game files -> builds .jsdos bundles -> writes catalog.json
  devserve.py        stdlib local test server (mirrors prod COOP/COEP headers)
  template/          known-good dosbox.conf template (autoexec swapped per game)
```

## Build the game bundles

```bash
python3 build/build_bundles.py            # build all games in manifest.json
python3 build/build_bundles.py doom wolf3d  # build only specific ids
```

This downloads each game's freely-distributable files and packages a `.jsdos`
bundle (a zip DOSBox mounts as drive C:) with an `[autoexec]` that launches it.

## Run locally

```bash
python3 build/devserve.py 8731     # http://localhost:8731
```

## Performance notes

DOSBox-in-WASM is CPU-bound. Two levers matter most:

1. **`cycles`** in each bundle's `dosbox.conf`. Default `auto` (period-correct for
   real-mode games, ramps to max for protected-mode). Override per game in
   `manifest.json` (`"cycles": "max"` for action games like DOOM/Descent).
2. **Cross-origin isolation.** The server sends `Cross-Origin-Opener-Policy:
   same-origin` + `Cross-Origin-Embedder-Policy: credentialless` so the browser
   exposes `SharedArrayBuffer`, letting js-dos run DOSBox in a Web Worker. Without
   it, DOSBox runs on the main thread and games lag badly.

## Legality

Bundles are built from shareware/freeware game files. For shareware FPS titles the
build verifies the *shareware* data file is present (e.g. DOOM ships `DOOM1.WAD`,
episode 1 — never the registered `DOOM.WAD`). See `build/manifest.json` for the
source + license tier of each title.
