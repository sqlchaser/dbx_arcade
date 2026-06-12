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
  const controlsCard = $("#controls");
  const controlsListEl = $("#controlsList");
  const ctrlBtn = $("#ctrlBtn");

  let CATALOG = [];
  let activeGenre = "ALL";
  let query = "";

  // ---- js-dos player handle ----
  let dosProps = null;   // returned by Dos()
  let muted = false;

  // -------- Gamepad / controller support --------
  // js-dos takes GLFW key codes via ci.sendKeyEvent(code, pressed). We poll the
  // Gamepad API and translate a standard controller into the keys nearly every
  // DOS game uses (arrows + Ctrl/Alt/Space/Shift/Enter/Esc).
  const KBD = { up: 265, down: 264, left: 263, right: 262, ctrl: 341, alt: 342, shift: 340, space: 32, enter: 257, esc: 256 };
  // standard Gamepad button index -> DOS key
  const PAD_BUTTONS = {
    0: KBD.ctrl,   // A  – primary (fire / jump)
    1: KBD.space,  // B  – use / open / jump
    2: KBD.alt,    // X  – strafe / secondary
    3: KBD.shift,  // Y  – run
    4: KBD.alt,    // LB
    5: KBD.ctrl,   // RB – fire
    6: KBD.shift,  // LT
    7: KBD.ctrl,   // RT – fire
    8: KBD.esc,    // Back/Select
    9: KBD.enter,  // Start
    12: KBD.up, 13: KBD.down, 14: KBD.left, 15: KBD.right, // d-pad
  };
  const gamepad = (() => {
    let ci = null, raf = 0;
    const held = new Set();
    const DEAD = 0.5;
    function setKey(code, pressed) {
      if (pressed && !held.has(code)) { held.add(code); try { ci && ci.sendKeyEvent(code, true); } catch (_) {} }
      else if (!pressed && held.has(code)) { held.delete(code); try { ci && ci.sendKeyEvent(code, false); } catch (_) {} }
    }
    function poll() {
      raf = requestAnimationFrame(poll);
      if (!ci) return;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const want = new Set();
      for (const p of pads) {
        if (!p) continue;
        p.buttons.forEach((b, i) => { if (b.pressed && PAD_BUTTONS[i] != null) want.add(PAD_BUTTONS[i]); });
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (ax < -DEAD) want.add(KBD.left); else if (ax > DEAD) want.add(KBD.right);
        if (ay < -DEAD) want.add(KBD.up); else if (ay > DEAD) want.add(KBD.down);
      }
      for (const code of [...held]) if (!want.has(code)) setKey(code, false);
      for (const code of want) setKey(code, true);
    }
    return {
      attach(commandInterface) { ci = commandInterface; if (!raf) poll(); },
      detach() { for (const code of [...held]) setKey(code, false); ci = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    };
  })();
  let padConnected = false;
  window.addEventListener("gamepadconnected", () => { padConnected = true; document.body.classList.add("has-pad"); });

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
      const logoFallback = `this.replaceWith(Object.assign(document.createElement('span'),{className:'marquee-text',textContent:'${escapeJs(game.title)}'}))`;
      // attract-mode reel (plays on hover) — src is lazy-set on first hover
      const reelEl = game.reel
        ? (/\.gif$/i.test(game.reel)
            ? `<img class="screen-reel" data-src="${game.reel}" alt="" />`
            : `<video class="screen-reel" data-src="${game.reel}" muted loop playsinline preload="none"></video>`)
        : "";
      cab.innerHTML = `
        <div class="cab-marquee">
          <div class="marquee-light">
            <img class="marquee-logo" src="./art/${game.id}.png" alt="${title}" onerror="${logoFallback}" />
          </div>
        </div>
        <div class="cab-screen">
          ${reelEl}
          <div class="screen-title">${title}</div>
          <div class="screen-coin">▸ INSERT COIN</div>
          <div class="screen-cta">▶ PLAY</div>
        </div>
        <div class="cab-deck">
          <span class="deck-joy"></span>
          <span class="deck-btns"><i></i><i></i><i></i></span>
          <span class="deck-label"><b>${escapeHtml(game.genre || "")}</b> · ${game.year || ""}</span>
        </div>`;
      cab.addEventListener("click", () => launch(game));
      if (game.reel) attachReel(cab);
      grid.appendChild(cab);
    }
  }

  // Attract-mode reel: load + play the gameplay clip on hover, stop on leave.
  function attachReel(cab) {
    const reel = cab.querySelector(".screen-reel");
    if (!reel) return;
    cab.addEventListener("pointerenter", () => {
      if (!reel.getAttribute("src")) reel.setAttribute("src", reel.dataset.src);
      cab.classList.add("reeling");
      if (reel.tagName === "VIDEO") reel.play().catch(() => {});
    });
    cab.addEventListener("pointerleave", () => {
      cab.classList.remove("reeling");
      if (reel.tagName === "VIDEO") { try { reel.pause(); reel.currentTime = 0; } catch (_) {} }
    });
  }

  // -------- Player --------
  async function launch(game) {
    nowPlaying.textContent = game.title;
    playerEl.classList.remove("hidden");
    bootHint.classList.remove("gone");
    document.body.style.overflow = "hidden";
    renderControls(game);           // populate + show the keyboard legend on launch

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
        onEvent: (event, ci) => {
          if (event === "ci-ready") gamepad.attach(ci);   // controller -> DOS keys
        },
      });
    } catch (e) {
      nowPlaying.textContent = "Failed to boot — " + e;
    }

    // hide the "click to start" hint (and tuck the legend away) after first interaction
    const dismiss = () => {
      bootHint.classList.add("gone");
      controlsCard.classList.add("hidden");
      dosEl.removeEventListener("pointerdown", dismiss);
    };
    dosEl.addEventListener("pointerdown", dismiss);
  }

  function renderControls(game) {
    const ctrls = Array.isArray(game.controls) ? game.controls : [];
    if (!ctrls.length) {
      ctrlBtn.style.display = "none";
      controlsCard.classList.add("hidden");
      return;
    }
    ctrlBtn.style.display = "";
    const kbHtml = ctrls.map((c) => {
      const caps = String(c.k).split(" + ")
        .map((p) => `<span class="keycap">${escapeHtml(p)}</span>`)
        .join('<span class="kplus">+</span>');
      return `<div class="controls-row"><span class="keys">${caps}</span><span class="action">${escapeHtml(c.a)}</span></div>`;
    }).join("");
    // Universal gamepad mapping (same for every game)
    const padRows = [
      ["D-Pad / Stick", "Move"], ["A", "Fire / Jump"], ["B", "Use / Open"],
      ["X", "Strafe / 2nd"], ["Y", "Run"], ["Start", "Enter"], ["Back", "Esc"],
    ];
    const padHtml = `<div class="controls-sub">🎮 GAMEPAD</div>` + padRows.map(([k, a]) =>
      `<div class="controls-row"><span class="keys"><span class="keycap pad">${k}</span></span><span class="action">${a}</span></div>`).join("");
    controlsListEl.innerHTML = `<div class="controls-sub">⌨ KEYBOARD</div>` + kbHtml + padHtml;
    controlsCard.classList.remove("hidden");   // auto-show the legend on launch
  }

  async function stopGame() {
    gamepad.detach();   // stop polling + release any held keys
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
  ctrlBtn.addEventListener("click", () => controlsCard.classList.toggle("hidden"));
  $("#ctrlClose").addEventListener("click", () => controlsCard.classList.add("hidden"));
  // interacting with the legend must not start/dismiss the game underneath it
  controlsCard.addEventListener("pointerdown", (e) => e.stopPropagation());

  // -------- Keyboard / search --------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !playerEl.classList.contains("hidden")) exit();
  });
  searchEl.addEventListener("input", (e) => { query = e.target.value; render(); });

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeJs(s) { return String(s).replace(/['\\]/g, "\\$&"); }

  init();
})();
