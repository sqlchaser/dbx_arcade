#!/usr/bin/env python3
"""Build .jsdos bundles for DBX Arcade from a verified acquisition manifest.

A .jsdos bundle is just a ZIP that js-dos v8 mounts as drive C:. Structure
(reverse-engineered from an official js-dos bundle):

    <game files...>            # at the archive root  -> become C:\\
    dosbox.conf                # full config, NO [autoexec]
    .jsdos/dosbox.conf         # full config WITH [autoexec] that launches the game
    .jsdos/readme.txt

js-dos reads `.jsdos/dosbox.conf`; its [autoexec] does `mount c .` then runs the
game. We template off a known-good config and only swap the [autoexec] block.

Manifest entry shape (build/manifest.json -> JSON array):
    {
      "id": "doom", "title": "DOOM (Shareware)", "year": 1993, "genre": "FPS",
      "download_url": "https://archive.org/download/.../doom1.zip",
      "launch_cmd": "DOOM.EXE",          # or "cd KEEN4\nKEEN4.EXE"
      "blurb": "optional short description"
    }
"""
import io
import json
import os
import re
import sys
import zipfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEMPLATE_CONF = os.path.join(HERE, "template", "jsdos_dosbox.conf")
GAMES_DIR = os.path.join(ROOT, "app", "static", "games")
CATALOG_PATH = os.path.join(ROOT, "app", "static", "catalog.json")
MANIFEST_PATH = os.path.join(HERE, "manifest.json")

EXE_SUFFIXES = (".exe", ".com", ".bat")


def base_config(cycles=None):
    """Template config truncated just before [autoexec].

    `cycles` overrides the DOSBox CPU speed. Default "auto" lets DOSBox pick
    period-correct speed for real-mode games and ramp to max for protected-mode
    games (DOOM, Descent). Pass e.g. "max", "20000", or "fixed 3000" to tune a
    specific title that runs too slow/fast.
    """
    with open(TEMPLATE_CONF, "r", errors="ignore") as f:
        conf = f.read()
    idx = conf.find("[autoexec]")
    if idx != -1:
        conf = conf[:idx]
    if cycles:
        conf = re.sub(r"(?m)^cycles=.*$", f"cycles={cycles}", conf)
    return conf.rstrip() + "\n\n"


def autoexec_block(launch_cmd):
    lines = "\n".join(l for l in launch_cmd.replace("\r", "").split("\n") if l.strip())
    return "[autoexec]\necho off\nmount c .\nc:\n" + lines + "\n"


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (DBX-Arcade builder)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def collect_game_files(raw_zip_bytes):
    """Return dict {arcname: bytes} of the game files, unwrapping one nested
    zip / single top-level folder if present."""
    zf = zipfile.ZipFile(io.BytesIO(raw_zip_bytes))
    names = [n for n in zf.namelist() if not n.endswith("/")]

    # If the archive is just a single nested .zip, descend into it once.
    if len(names) == 1 and names[0].lower().endswith(".zip"):
        return collect_game_files(zf.read(names[0]))

    # Many archive.org "emulated" items are themselves js-dos/Emularity bundles
    # that ship their own dosbox.conf / .jsdos folder / mapper. Strip those so OUR
    # generated config + autoexec is the only one js-dos sees.
    def is_ours_to_own(n):
        low = n.lower().lstrip("./")
        return (
            low == "dosbox.conf"
            or low == "dosbox-x.conf"
            or low.startswith(".jsdos/")
            or low.endswith("mapper-jsdos.map")
            or low == "file_id.diz"
        )

    files = {n: zf.read(n) for n in names if not is_ours_to_own(n)}
    return files


def files_from_dir(root):
    """Walk a local directory into {arcname: bytes}, stripping our own config."""
    out = {}
    for dirpath, _dirs, names in os.walk(root):
        for n in names:
            full = os.path.join(dirpath, n)
            arc = os.path.relpath(full, root).replace(os.sep, "/")
            low = arc.lower()
            if low in ("dosbox.conf", "dosbox-x.conf") or low.startswith(".jsdos/"):
                continue
            with open(full, "rb") as f:
                out[arc] = f.read()
    return out


def build_one(entry):
    gid = entry["id"]
    out_path = os.path.join(GAMES_DIR, f"{gid}.jsdos")
    if entry.get("source_dir"):
        src = entry["source_dir"]
        if not os.path.isabs(src):
            src = os.path.join(ROOT, src)
        print(f"  • {gid}: packaging local dir {src}")
        files = files_from_dir(src)
    elif entry.get("source_zip"):
        src = entry["source_zip"]
        if not os.path.isabs(src):
            src = os.path.join(ROOT, src)
        print(f"  • {gid}: packaging local zip {src}")
        with open(src, "rb") as f:
            files = collect_game_files(f.read())
    else:
        print(f"  • {gid}: downloading {entry['download_url']}")
        raw = download(entry["download_url"])
        files = collect_game_files(raw)
    if not files:
        raise RuntimeError("no files extracted")

    # Drop unwanted paths (e.g. bundled CD images) — keeps bundles under the
    # Databricks Apps 10 MB/file import limit. `exclude` is a list of substrings.
    for pat in entry.get("exclude", []):
        dropped = [n for n in files if pat.lower() in n.lower()]
        for n in dropped:
            del files[n]
        if dropped:
            print(f"    – excluded {len(dropped)} file(s) matching '{pat}'")

    has_exe = any(n.lower().endswith(EXE_SUFFIXES) for n in files)
    if not has_exe:
        print(f"    ! warning: no .exe/.com/.bat found in {gid} ({len(files)} files)")

    conf = base_config(entry.get("cycles"))
    bundle = io.BytesIO()
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
        zf.writestr("dosbox.conf", conf)                       # root config, no autoexec
        zf.writestr(".jsdos/dosbox.conf", conf + autoexec_block(entry["launch_cmd"]))
        zf.writestr(".jsdos/readme.txt", "DBX Arcade bundle — built from freely distributable game files.\n")

    os.makedirs(GAMES_DIR, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(bundle.getvalue())
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"    ✓ {gid}.jsdos  ({size_mb:.1f} MB, {len(files)} files)")
    return out_path


def main():
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    only = set(sys.argv[1:])  # optional: build only these ids
    catalog = []
    ok, fail = 0, 0
    for entry in manifest:
        if only and entry["id"] not in only:
            continue
        if entry.get("needs_install") and entry["id"] not in only:
            print(f"  – {entry['id']}: skipped (needs DOS install step; build explicitly to force)")
            continue
        try:
            build_one(entry)
            ok += 1
            catalog.append({
                "id": entry["id"],
                "title": entry["title"],
                "year": entry.get("year"),
                "genre": entry.get("genre", "ARCADE"),
                "blurb": entry.get("blurb", ""),
                "bundle": f"./games/{entry['id']}.jsdos",
                "art": entry.get("art", ""),
            })
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f"    ✗ {entry['id']} FAILED: {e}")

    # Merge into existing catalog when doing a partial build.
    if only and os.path.exists(CATALOG_PATH):
        with open(CATALOG_PATH) as f:
            existing = {g["id"]: g for g in json.load(f)}
        for g in catalog:
            existing[g["id"]] = g
        catalog = list(existing.values())

    with open(CATALOG_PATH, "w") as f:
        json.dump(catalog, f, indent=2)
    print(f"\nBuilt {ok} bundle(s), {fail} failed. Catalog -> {CATALOG_PATH} ({len(catalog)} games)")


if __name__ == "__main__":
    main()
