/* ============ DBX ARCADE ============ */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const grid = $("#grid");
  const genresEl = $("#genres");
  const searchEl = $("#search");
  const countEl = $("#count");
  const playerEl = $("#player");
  const dosEl = $("#dos");
  const nowPlaying = $("#nowPlaying");
  const bootHint = $("#bootHint");

  let CATALOG = [];
  let activeGenre = "ALL";
  let query = "";

  // ---- js-dos player handle ----
  let dosProps = null;   // returned by Dos()
  let muted = false;

  // -------- Theme --------
  const themeToggle = $("#themeToggle");
  const savedTheme = localStorage.getItem("dbxarcade-theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    localStorage.setItem("dbxarcade-theme", cur);
  });

  // -------- Load catalog --------
  async function init() {
    try {
      const res = await fetch("./catalog.json", { cache: "no-cache" });
      CATALOG = await res.json();
    } catch (e) {
      grid.innerHTML = `<div class="empty">Could not load the game catalog.<br/>${e}</div>`;
      return;
    }
    buildGenres();
    render();
  }

  function buildGenres() {
    const genres = ["ALL", ...Array.from(new Set(CATALOG.map(g => g.genre))).sort()];
    genresEl.innerHTML = "";
    for (const g of genres) {
      const chip = document.createElement("button");
      chip.className = "chip" + (g === activeGenre ? " active" : "");
      chip.textContent = g;
      chip.addEventListener("click", () => {
        activeGenre = g;
        buildGenres();
        render();
      });
      genresEl.appendChild(chip);
    }
  }

  function matches(game) {
    const okGenre = activeGenre === "ALL" || game.genre === activeGenre;
    const q = query.trim().toLowerCase();
    const okQuery = !q || (game.title + " " + game.genre + " " + (game.blurb || "")).toLowerCase().includes(q);
    return okGenre && okQuery;
  }

  function render() {
    const list = CATALOG.filter(matches);
    countEl.textContent = `${list.length} game${list.length === 1 ? "" : "s"}`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty">No games match.<br/>Try a different search or genre.</div>`;
      return;
    }
    grid.innerHTML = "";
    for (const game of list) {
      const cab = document.createElement("button");
      cab.className = "cab";
      cab.dataset.genre = game.genre || "";
      cab.setAttribute("aria-label", `Play ${game.title}`);
      const title = escapeHtml(game.title);
      const screenInner = game.art
        ? `<img src="${game.art}" alt="${title}" loading="lazy" onerror="this.remove()" />`
        : `<div class="screen-title">${title}</div>`;
      cab.innerHTML = `
        <div class="cab-marquee"><span>${title}</span></div>
        <div class="cab-screen">
          ${screenInner}
          <div class="screen-coin">▸ INSERT COIN</div>
          <div class="screen-cta">▶ PLAY</div>
        </div>
        <div class="cab-deck">
          <span class="deck-joy"></span>
          <span class="deck-btns"><i></i><i></i><i></i></span>
          <span class="deck-label"><b>${escapeHtml(game.genre || "")}</b> · ${game.year || ""}</span>
        </div>`;
      cab.addEventListener("click", () => launch(game));
      grid.appendChild(cab);
    }
  }

  // -------- Player --------
  async function launch(game) {
    nowPlaying.textContent = game.title;
    playerEl.classList.remove("hidden");
    bootHint.classList.remove("gone");
    document.body.style.overflow = "hidden";

    await stopGame(); // clean any previous instance

    try {
      dosProps = Dos(dosEl, {
        url: game.bundle,
        theme: "dark",
        backend: "dosbox",
        renderBackend: "webgl",
        imageRendering: "pixelated",
        noCloud: true,        // no js-dos cloud account prompts
        autoStart: true,
        kiosk: true,          // hide js-dos own chrome — we provide our own
        onEvent: (event) => {
          if (event === "ci-ready" || event === "emu-ready") {
            // running
          }
        },
      });
    } catch (e) {
      nowPlaying.textContent = "Failed to boot — " + e;
    }

    // hide the "click to start" hint after first interaction
    const dismiss = () => { bootHint.classList.add("gone"); dosEl.removeEventListener("pointerdown", dismiss); };
    dosEl.addEventListener("pointerdown", dismiss);
  }

  async function stopGame() {
    if (dosProps) {
      try { await dosProps.stop(); } catch (_) {}
      dosProps = null;
    }
    dosEl.innerHTML = "";
  }

  async function exit() {
    await stopGame();
    playerEl.classList.add("hidden");
    document.body.style.overflow = "";
  }

  $("#exitBtn").addEventListener("click", exit);
  $("#fsBtn").addEventListener("click", () => { try { dosProps && dosProps.setFullScreen(true); } catch (_) {} });
  $("#muteBtn").addEventListener("click", (e) => {
    muted = !muted;
    try { dosProps && dosProps.setVolume(muted ? 0 : 1); } catch (_) {}
    e.currentTarget.textContent = muted ? "🔇" : "♪";
  });

  // -------- Keyboard / search --------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !playerEl.classList.contains("hidden")) exit();
  });
  searchEl.addEventListener("input", (e) => { query = e.target.value; render(); });

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeJs(s) { return String(s).replace(/['\\]/g, "\\$&"); }

  init();
})();
