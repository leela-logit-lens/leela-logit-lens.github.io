(function () {
  const HERO_ID = "ANklq";
  const HERO_SNAPSHOTS = { ANklq: [3, 10, 15] }; // the paper's Figure 1 shows layers 2 and 9
  // Notes on other moves' lines (shown at that line's peak)
  const HERO_NOTES = {
    "6PIrs": [{ uci: "e2e5", lines: ["Greedy queen capture …Qxe5,", "just a trade (f4 recaptures)"] }],
  };
  // One-line remarks shown when look-ahead is removed
  const HERO_LA_NOTES = {};
  // The forgotten puzzles shown in the paper: Figure 1 and the five case studies (appendix), in paper order.
  const PAPER = [["ANklq", "Figure 1"], ["58Ib0", "case study 1"], ["6PIrs", "case study 2"], ["1Egyn", "case study 3"], ["DsaGi", "case study 4"], ["00aDl", "case study 5"]];
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
  const chips = document.getElementById("hero-chips");
  PAPER.filter(([id]) => meta[id]).forEach(([id, where]) => {
    const pair = document.createElement("span");
    pair.className = "chip-pair";
    pair.innerHTML = `<button type="button" class="chip" role="radio" data-id="${id}"><span class="mono">${id}</span> <small>${where}</small></button>` +
      `<a class="chip-link" href="https://lichess.org/training/${id}" target="_blank" rel="noopener" aria-label="Open puzzle ${id} on Lichess" title="Open on Lichess">↗</a>`;
    pair.querySelector("button").addEventListener("click", () => showHero(id, true));
    chips.appendChild(pair);
  });
  async function showHero(id, autoplay) {
    let data;
    try {
      data = await loadPuzzle(id);
    } catch (e) {
      chips.querySelector(`[data-id="${id}"]`)?.classList.add("is-error");
      return;
    }
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", c.dataset.id === id));
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
      { group: "Hard cases", items: HARD.filter((id) => meta[id]).map((id) => ({ id, meta: meta[id] })) },
    ], loadPuzzle);
    ex.select(meta.DsaGi ? "DsaGi" : PAPER[0][0]);
  }

  // ---- Elo per layer (internal tournament, tau = 0) ----
  const ELO = [351, 609, 655, 730, 832, 908, 993, 997, 1028, 1030, 1055, 1082, 1117, 1356, 1670, 2268];
  const ANCHOR = 2292;
  drawElo(document.getElementById("elo-chart"));
  function drawElo(host) {
    if (!host) return;
    const { el } = window.LLLBoard;
    const W = 760, H = 300, X0 = 56, X1 = 740, Y0 = 20, Y1 = 250;
    const x = (k) => X0 + (k / 15) * (X1 - X0);
    const y = (e) => Y1 - (e / 2400) * (Y1 - Y0);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Elo of the policy read out at each layer, from 351 at the input to 2268 for the full network." });
    [[0, 6, "early gains"], [6, 11, "plateau"], [11, 15, "late gains"]].forEach(([a, b, t], i) => {
      el("rect", { x: x(a), y: Y0, width: x(b) - x(a), height: Y1 - Y0, class: i % 2 ? "elo__phase elo__phase--alt" : "elo__phase" }, svg);
      el("text", { x: (x(a) + x(b)) / 2, y: Y0 + 16, class: "lf-tick lf-tick--sm", "text-anchor": "middle" }, svg).textContent = t;
    });
    [0, 500, 1000, 1500, 2000].forEach((e) => {
      el("line", { x1: X0, x2: X1, y1: y(e), y2: y(e), class: "lf-grid" }, svg);
      el("text", { x: X0 - 8, y: y(e), class: "lf-tick", "text-anchor": "end", "dominant-baseline": "central" }, svg).textContent = e.toLocaleString("en-US");
    });
    el("line", { x1: X0, x2: X1, y1: y(ANCHOR), y2: y(ANCHOR), class: "elo__anchor" }, svg);
    el("text", { x: X0 + 6, y: y(ANCHOR) - 6, class: "lf-tick lf-tick--sm" }, svg).textContent = `Lc0 policy anchor (${ANCHOR})`;
    el("polyline", { points: ELO.map((e, k) => `${x(k)},${y(e)}`).join(" "), class: "elo__line" }, svg);
    const tip = document.createElement("div");
    tip.className = "lens-fig__tip elo__tip";
    ELO.forEach((e, k) => {
      el("circle", { cx: x(k), cy: y(e), r: 4.5, class: "elo__dot" }, svg);
      const label = k === 0 ? "Input" : k === 15 ? "Full" : String(k - 1);
      el("text", { x: x(k), y: Y1 + 18, class: "lf-tick lf-tick--sm", "text-anchor": "middle" }, svg).textContent = label;
      const hit = el("rect", { x: x(k) - 22, y: Y0, width: 44, height: Y1 - Y0, class: "lf-hit" }, svg);
      hit.addEventListener("pointerenter", () => {
        tip.innerHTML = `<div class="tip__head">${k === 0 ? "Input embedding" : k === 15 ? "Full network" : "After layer " + (k - 1)}</div><div class="tip__row"><span class="mono">${e} Elo</span></div>`;
        const r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
        tip.style.left = `${r.left - hr.left + (x(k) / W) * r.width}px`;
        tip.style.top = `${r.top - hr.top + (y(e) / H) * r.height - 8}px`;
        tip.classList.toggle("is-left", k > 11);
        tip.classList.add("is-visible");
      });
      hit.addEventListener("pointerleave", () => tip.classList.remove("is-visible"));
    });
    el("text", { x: (X0 + X1) / 2, y: H - 4, class: "lf-axis-label lf-axis-label--sm", "text-anchor": "middle" }, svg).textContent = "Layer";
    host.appendChild(svg);
    host.appendChild(tip);
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
    // Live online status and blitz ratings from Lichess, refreshed every few minutes while the page is open.
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
    refresh();
    setInterval(refresh, 3 * 60 * 1000);
  }

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

  // ---- scroll-spy for the side navigation ----
  const navLinks = [...document.querySelectorAll(".sidenav a")];
  const targets = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  targets.forEach((t) => spy.observe(t));

  // ---- design variants (preview only) ----
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  let design = params.get("design");
  try { design = design || localStorage.getItem("lll-design"); } catch (e) {}
  if (design) root.dataset.design = design;
  if (params.get("switch") === "0") document.querySelector(".design-switch")?.remove();
  document.querySelectorAll(".design-switch button").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.design === root.dataset.design);
    b.addEventListener("click", () => {
      root.dataset.design = b.dataset.design;
      try { localStorage.setItem("lll-design", b.dataset.design); } catch (e) {}
      document.querySelectorAll(".design-switch button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      hero.drawConnectors();
    });
  });
})();
