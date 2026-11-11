(function () {
  const HERO_ID = "ANklq";
  // the paper's Figure 1 shows layers 2 and 9; Figure 2's puzzle: the forcing check (layer 9) and the rook lift (layer 12)
  const HERO_SNAPSHOTS = { ANklq: [3, 10, 15], "62FeU": [10, 13, 15] };
  // Notes on other moves' lines (shown at that line's peak)
  const HERO_NOTES = {
    "6PIrs": [{ uci: "e2e5", lines: ["Greedy queen capture …Qxe5,", "just a trade (f4 recaptures)"] }],
  };
  // One-line remarks shown when look-ahead is removed
  const HERO_LA_NOTES = {};
  // The forgotten puzzles shown in the paper: Figure 1 and the five case studies (appendix), in paper order.
  const PAPER = [["ANklq", "Figure 1"], ["58Ib0", "case study 1"], ["6PIrs", "case study 2"], ["1Egyn", "case study 3"], ["DsaGi", "case study 4"], ["00aDl", "case study 5"]];
  // The solved examples: Figure 2 and the appendix's "Correctly solved puzzle case studies" (export_data.py --solved).
  const SOLVED = [["62FeU", "Figure 2"], ["9JvtA", "case study 1"], ["70v1B", "case study 2"], ["0KBPy", "case study 3"], ["09SS5", "case study 4"], ["7UUlN", "case study 5"]];
  // Hard cases for the explorer: forgotten puzzles that (almost) no steering setting after layer 13 recovers,
  // although the middle layers clearly had the solution (top move at 9 consecutive read-outs). Not 3aGwk or
  // CkzuP: there the solution was top at only one or two read-outs, a blip rather than a found solution.
  const HARD = ["4drwt", "LktHH"];

  // ---- data loading (script tags, so the page also works from file://) ----
  // puzzle files carry the page's version tag, so a new export is not served from the browser cache
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  const cache = {};
  function loadPuzzle(id) {
    if (window.LLL_PUZZLES && window.LLL_PUZZLES[id]) return Promise.resolve(window.LLL_PUZZLES[id]);
    if (cache[id]) return cache[id];
    cache[id] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `data/puzzles/${id}.js${V ? `?v=${V}` : ""}`;
      s.onload = () => (window.LLL_PUZZLES && window.LLL_PUZZLES[id] ? resolve(window.LLL_PUZZLES[id]) : reject(new Error(`no data for ${id}`)));
      s.onerror = () => reject(new Error(`could not load data/puzzles/${id}.js`));
      document.head.appendChild(s);
    }).catch((err) => {
      delete cache[id]; // allow a retry instead of caching the failure
      console.error(err);
      throw err;
    });
    return cache[id];
  }
  const index = window.LLL_INDEX || [];
  const meta = Object.fromEntries(index.map((p) => [p.id, p]));
  const sanFirst = (p) => (p ? `…${p.pv_san[0]}` : "");

  // ---- hero: animated Figure 1 ----
  const heroHost = document.getElementById("lens-figure");
  const hero = new window.LensFigure(heroHost);
  const chips = document.getElementById("hero-chips"), solvedChips = document.getElementById("hero-chips-solved");
  const addChip = (host, id, where) => {
    const pair = document.createElement("span");
    pair.className = "chip-pair";
    pair.innerHTML = `<button type="button" class="chip" role="radio" data-id="${id}"><span class="mono">${id}</span> <small>${where}</small></button>` +
      `<a class="chip-link" href="https://lichess.org/training/${id}" target="_blank" rel="noopener" aria-label="Open puzzle ${id} on Lichess" title="Open on Lichess">↗</a>`;
    pair.querySelector("button").addEventListener("click", () => {
      showHero(id, true);
      // on a phone the picker sits below the chart, and the replay would run out of sight
      const chart = heroHost.querySelector(".lens-fig__svg");
      if (chart.getBoundingClientRect().top < 0) chart.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    host.appendChild(pair);
  };
  PAPER.filter(([id]) => meta[id]).forEach(([id, where]) => addChip(chips, id, where));
  if (solvedChips) SOLVED.forEach(([id, where]) => addChip(solvedChips, id, where));
  const allChips = () => document.querySelectorAll(".hero-picker .chip");
  async function showHero(id, autoplay) {
    let data;
    try {
      data = await loadPuzzle(id);
    } catch (e) {
      document.querySelector(`.hero-picker [data-id="${id}"]`)?.classList.add("is-error");
      return;
    }
    allChips().forEach((c) => c.setAttribute("aria-checked", c.dataset.id === id));
    hero.load(data, HERO_SNAPSHOTS[id], HERO_NOTES[id], { laNote: HERO_LA_NOTES[id] });
    if (autoplay) hero.play(true);
  }
  // ?frame=final or ?frame=<layer> renders a fixed state (screenshots, social previews)
  const frameParam = new URLSearchParams(location.search).get("frame");
  const startId = new URLSearchParams(location.search).get("puzzle") || HERO_ID;
  showHero(startId, false).then(() => {
    if (frameParam === "final") {
      hero.setFront(15, { showValue: true, instant: true });
      const q = new URLSearchParams(location.search);
      if (q.get("steer") === "1") {
        const c = q.get("concept"), v = q.get("v");
        hero.setSteer(Object.assign({ on: true }, c ? { concept: c } : {}, v ? { v: +v } : {}), true);
      }
      if (q.get("la") === "1") hero.setLA({ on: true }, true);
    }
    else if (frameParam === "end") hero.setFront(15, { showValue: true }); // finished, waiting for the prompts
    else if (frameParam === "positions") { hero.setFront(15, { showValue: true }); hero.revealPositions(true); }
    else if (frameParam != null && !isNaN(+frameParam)) hero.setFront(+frameParam, { showValue: false });
    else hero.autoplayWhenVisible();
  });

  // ---- Figure 2: the network, layer by layer ----
  const netHost = document.getElementById("network-figure");
  if (netHost && window.LLL_FIG2) {
    const net = new window.NetworkFigure(netHost);
    net.load(window.LLL_FIG2);
    if (new URLSearchParams(location.search).get("frame") === "final") net.setFront(15, true);
    else net.autoplayWhenVisible();
  }

  // ---- steering explorer ----
  const steerHost = document.getElementById("steer-explorer");
  if (steerHost) {
    const ex = new window.SteerExplorer(steerHost);
    ex.setPuzzles([
      { group: "From the paper", items: PAPER.filter(([id]) => meta[id]).map(([id, where]) => ({ id, meta: meta[id], where })) },
      { group: "Hard cases", items: HARD.filter((id) => meta[id]).map((id) => ({ id, meta: meta[id], hard: true })) },
    ], loadPuzzle);
    ex.select(meta.DsaGi ? "DsaGi" : PAPER[0][0]);
  }

  // ---- Lichess bots ----
  // Blitz ratings frozen for the paper's Table 4 (2026-10-28 13:43 UTC), in K order: input, layers 0–13, full network.
  // They are shown until the live ratings arrive, and stay if Lichess cannot be reached.
  const names = ["In"].concat([...Array(14).keys()].map(String), ["Full"]);
  const labels = names.map((n) => (n === "In" ? "Input" : n === "Full" ? "Full network" : `Layer ${n}`));
  const blitz = [545, 631, 611, 655, 740, 723, 815, 815, 827, 906, 952, 860, 946, 1205, 1482, 2099];
  window.LLL_BOTS = { labels, blitz }; // also for the play board (play.js), which listens for "lll-bots"
  const bots = document.getElementById("bot-list");
  if (bots) {
    const ids = names.map((n) => `LLLBot-${n}`);
    bots.innerHTML = ids.map((bot, i) =>
      `<div class="bot" data-bot="${bot.toLowerCase()}">` +
      `<a class="bot__go" href="https://lichess.org/@/${bot}" target="_blank" rel="noopener" title="${bot} on Lichess">` +
      `<span class="bot__k"><span class="bot__dot" aria-hidden="true"></span>${labels[i]}</span><span class="bot__elo mono">${blitz[i]} blitz</span></a>` +
      `<a class="bot__tv" href="https://lichess.org/@/${bot}/tv" target="_blank" rel="noopener" title="Watch ${bot} play">Watch</a></div>`).join("");
    const card = (id) => bots.querySelector(`[data-bot="${id.toLowerCase()}"]`);
    // Live online status and blitz ratings from Lichess, refreshed every few minutes while the page is open and visible.
    const refresh = () => {
      if (document.hidden) return;
      fetch(`https://lichess.org/api/users/status?ids=${ids.join(",")}`)
        .then((r) => r.json())
        .then((list) => list.forEach((u) => {
          const c = card(u.id);
          if (!c) return;
          c.classList.toggle("is-online", !!u.online);
          c.classList.toggle("is-playing", !!u.playing);
          c.querySelector(".bot__dot").title = u.playing ? "playing a game" : u.online ? "online" : "offline";
        }))
        .catch(() => {});
      fetch("https://lichess.org/api/users", { method: "POST", body: ids.join(",") })
        .then((r) => r.json())
        .then((list) => {
          list.forEach((u) => {
            const i = ids.findIndex((id) => id.toLowerCase() === u.id);
            const r = u.perfs && u.perfs.blitz && u.perfs.blitz.rating;
            if (i < 0 || !r) return;
            blitz[i] = r;
            card(u.id).querySelector(".bot__elo").textContent = `${r} blitz`;
          });
          document.dispatchEvent(new Event("lll-bots"));
        })
        .catch(() => {});
    };
    // Nothing is sent to lichess.org until the Play section (play board and bot cards) comes near the screen.
    const start = () => { refresh(); setInterval(refresh, 3 * 60 * 1000); };
    const section = document.getElementById("bots") || bots;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
      }, { rootMargin: "300px 0px" });
      io.observe(section);
    } else start();
  }

  // a link to a collapsed <details> (e.g. "The definitions ↓") opens it
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    const t = a && a.getAttribute("href").length > 1 && document.getElementById(a.getAttribute("href").slice(1));
    if (t && t.tagName === "DETAILS") t.open = true;
  });

  // ---- BibTeX copy ----
  const copyBtn = document.querySelector(".bib__copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById("bib-text").textContent);
        copyBtn.textContent = "Copied";
      } catch (e) {
        copyBtn.textContent = "Select and copy";
      }
      setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
    });
  }

  // ---- links that are not live yet ----
  document.querySelectorAll("[data-todo]").forEach((a) => {
    a.classList.add("is-todo");
    a.title = "Link coming soon";
    a.addEventListener("click", (e) => e.preventDefault());
  });

  // ---- contact: each name in the address line opens a mail; the address is put together here, not in the HTML ----
  document.querySelectorAll("[data-mail]").forEach((a) => (a.href = `mailto:${a.dataset.mail}@hhi.fraunhofer.de`));

  // ---- figures ----
  // They are lazy, so they don't hold up the hero. Once the page has loaded, the rest are fetched in the background, so they
  // are there before the reader scrolls to them; those in closed "More results" panels stay lazy until opened.
  const preloadFigures = () => document.querySelectorAll('.figure img[loading="lazy"]').forEach((img) => {
    if (!img.closest("details:not([open])")) img.loading = "eager";
  });
  if (document.readyState === "complete") setTimeout(preloadFigures, 0);
  else addEventListener("load", () => setTimeout(preloadFigures, 0), { once: true });

  // ---- navigation bar ----
  // It slides in once the hero's buttons have scrolled out above the viewport, and marks the section in view.
  const bar = document.getElementById("topbar");
  const heroButtons = document.querySelector(".hero .buttons");
  if (bar && heroButtons) {
    new IntersectionObserver(([en]) => {
      bar.classList.toggle("is-shown", !en.isIntersecting && en.boundingClientRect.top < 0);
    }).observe(heroButtons);
  }
  const navRow = bar && bar.querySelector(".topbar__nav");
  const navLinks = navRow ? [...navRow.querySelectorAll("a")] : [];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  // the section the reading line (40% down the screen) is in; the Play link points into "More results"
  const sectionOf = (el) => el.closest("section") || el;
  const markActive = () => {
    const line = innerHeight * 0.4;
    let current = null;
    sections.forEach((t, i) => {
      const r = sectionOf(t).getBoundingClientRect();
      // a link can cover the sections after its own (Method: the setup text and Figure 2)
      const until = navLinks[i].dataset.spyUntil && document.querySelector(navLinks[i].dataset.spyUntil);
      const bottom = until ? until.getBoundingClientRect().bottom : r.bottom;
      if (r.top <= line && bottom > line) current = navLinks[i];
    });
    navLinks.forEach((a) => a.classList.toggle("is-active", a === current));
    // on phones the row scrolls sideways: keep the active link in view
    if (current && navRow.scrollWidth > navRow.clientWidth) {
      const c = current.getBoundingClientRect(), r = navRow.getBoundingClientRect();
      if (c.left < r.left || c.right > r.right) navRow.scrollLeft += c.left - r.left - 8;
    }
  };
  let spyQueued = false;
  addEventListener("scroll", () => {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(() => { spyQueued = false; markActive(); });
  }, { passive: true });
  markActive();
})();
