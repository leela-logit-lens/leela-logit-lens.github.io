/* Animated, scrubbable version of the paper's Figure 1 (forgotten puzzle).
   Lines grow layer by layer; board snapshots fade in when the front reaches their layer;
   the final layers play slowly; then the value head's view of both resulting positions. */
(function () {
  const { el, drawBoard } = window.LLLBoard;
  const COL = { star: "#00b894", hat: "#d63031", other: "#8a939b" };
  // Layout in SVG units. "compact" is used below 640px container width (phones): a narrower
  // drawing so that text stays legible after scaling, and the legend as a row under the boards.
  let W, H, CH, BOARD, BOARD_CX, LEGEND, S, COMPACT;
  function setLayout(compact) {
    COMPACT = compact;
    if (compact) {
      W = 600; H = 712; S = 1.45;
      CH = { x0: 64, x1: 572, yTop: 330, yBot: 614 };
      BOARD = { size: 172, y: 36 };
      BOARD_CX = [96, 300, 504];
      LEGEND = { x: 14, y: 248, row: true };
    } else {
      W = 960; H = 610; S = 1;
      CH = { x0: 74, x1: 930, yTop: 318, yBot: 548 };
      BOARD = { size: 186, y: 34 };
      BOARD_CX = [118, 368, 618];
      LEGEND = { x: 618 + 93 + 34, y: 58, row: false };
    }
  }
  setLayout(false);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const xOf = (k) => CH.x0 + (k / 15) * (CH.x1 - CH.x0);
  const yOf = (p) => CH.yBot - p * (CH.yBot - CH.yTop);
  const layerName = (k) => (k === 0 ? "Input" : k === 15 ? "Final output" : `Layer ${k - 1}`);
  const tickName = (k) => (k === 0 ? "Input" : k === 15 ? "Final" : String(k - 1));
  const pct = (p) => (p < 0.0005 ? "<0.1%" : (p >= 0.1 ? (p * 100).toFixed(0) : (p * 100).toFixed(1)) + "%");
  const pct1 = (p) => (p * 100).toFixed(1) + "%";
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function topK(data, k, n) {
    return data.legal
      .map((u) => ({ uci: u, p: data.probs[u][k] }))
      .sort((a, b) => b.p - a.p)
      .slice(0, n);
  }
  function moveColor(data, uci) {
    return uci === data.m_star ? COL.star : uci === data.m_hat ? COL.hat : "#5f6870";
  }
  function arrowsFor(data, list) {
    const max = list[0].p, min = list[list.length - 1].p;
    return list.map((m) => ({
      uci: m.uci,
      color: moveColor(data, m.uci),
      opacity: 0.4 + 0.6 * (max > min ? (m.p - min) / (max - min) : 1),
    }));
  }
  function moveLabel(data, uci) {
    const san = data.san[uci];
    return data.turn === "b" ? `…${san}` : san;
  }

  // A short confetti burst from a point on screen (client coordinates).
  function confetti(x, y) {
    if (reduceMotion) return;
    const cvs = document.createElement("canvas");
    cvs.className = "lll-confetti";
    const dpr = window.devicePixelRatio || 1;
    cvs.width = innerWidth * dpr; cvs.height = innerHeight * dpr;
    document.body.appendChild(cvs);
    const ctx = cvs.getContext("2d");
    ctx.scale(dpr, dpr);
    const colors = ["#00b894", "#55efc4", "#fdcb6e", "#0984e3", "#e84393", "#2d3436"];
    const parts = Array.from({ length: 150 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 5 + Math.random() * 9;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0] };
    });
    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1300) / 600);
      parts.forEach((p) => {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (t < 1900) requestAnimationFrame(frame); else cvs.remove();
    };
    requestAnimationFrame(frame);
  }

  // "Dun-dun" for a lost solution: two low notes (Web Audio, quiet; only ever after the reader's own click).
  let audio = null;
  function sting() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + 0.02;
      [[196, 0, 0.28], [146.8, 0.38, 0.85]].forEach(([f, at, len]) => {
        [[f, 0.14], [f / 2, 0.1]].forEach(([freq, peak]) => { // the note and its lower octave, for weight
          const o = audio.createOscillator(), g = audio.createGain();
          o.type = "triangle";
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, t0 + at);
          g.gain.linearRampToValueAtTime(peak, t0 + at + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + at + len);
          o.connect(g).connect(audio.destination);
          o.start(t0 + at);
          o.stop(t0 + at + len + 0.05);
        });
      });
    } catch (e) { /* no audio: the visual beats remain */ }
  }

  // "A chess puzzle with a single winning move: Black mates in two, starting with a queen sacrifice: 1…Qxf1+ 2.Kxf1 Rd1#."
  function describePuzzle(d, mate) {
    const side = d.turn === "b" ? "Black" : "White";
    const PIECE = { Q: "queen", R: "rook", B: "bishop", N: "knight", K: "king" };
    // a sacrifice if the opponent immediately recaptures on the same square
    const sac = d.pv.length > 1 && d.pv[1].slice(2, 4) === d.pv[0].slice(2, 4) ? `${PIECE[d.pv_san[0][0]] || "pawn"} sacrifice` : null;
    const words = ["", "one", "two", "three", "four", "five"];
    let n = 1, line = "";
    d.pv_san.forEach((m, i) => {
      const white = (d.turn === "w") === (i % 2 === 0);
      if (i === 0 && !white) line += `1…${m}`;
      else if (white) line += `${i ? " " : ""}${n}.${m}`;
      else line += ` ${m}`;
      if (!white) n += 1;
    });
    const what = mate ? `${side} mates in ${words[+mate] || mate}` : d.themes.includes("crushing") ? `${side} wins decisively` : `${side} wins`;
    return `A chess puzzle with a single winning move: ${what}${sac ? `, starting with a ${sac}` : ""}: <span class="mono">${line}</span>.`;
  }

  // What the corrupted board used for the look-ahead ablation changes: "an extra white pawn on d2".
  function describeCorruption(fen, cfen) {
    const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
    const board = (f) => {
      const m = {};
      f.split(" ")[0].split("/").forEach((row, r) => {
        let x = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) x += +ch;
          else { m["abcdefgh"[x] + (8 - r)] = ch; x += 1; }
        }
      });
      return m;
    };
    const a = board(fen), b = board(cfen);
    const name = (p) => `${p === p.toUpperCase() ? "white" : "black"} ${NAME[p.toLowerCase()]}`;
    const sqs = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((s) => a[s] !== b[s]);
    const added = sqs.filter((s) => b[s] && !a[s]), removed = sqs.filter((s) => a[s] && !b[s]);
    const out = [];
    added.forEach((s) => {
      const from = removed.find((r) => a[r] === b[s]);
      if (from) { out.push(`the ${name(b[s])} on ${s} instead of ${from}`); removed.splice(removed.indexOf(from), 1); }
      else out.push(`an extra ${name(b[s])} on ${s}`);
    });
    removed.forEach((s) => out.push(`no ${name(a[s])} on ${s}`));
    sqs.filter((s) => a[s] && b[s]).forEach((s) => out.push(`a ${name(b[s])} on ${s} instead of the ${NAME[a[s].toLowerCase()]}`));
    return out.join(", ");
  }

  // Path of the first fraction t of a cubic Bezier (de Casteljau), so dashed connectors can "grow".
  function cubicPath(P, t) {
    const L = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const p01 = L(P[0], P[1]), p12 = L(P[1], P[2]), p23 = L(P[2], P[3]);
    const p012 = L(p01, p12), p123 = L(p12, p23), p = L(p012, p123);
    return `M${P[0][0]},${P[0][1]} C${p01[0]},${p01[1]} ${p012[0]},${p012[1]} ${p[0]},${p[1]}`;
  }

  // requestAnimationFrame tween that still finishes if frames are paused (background tab).
  function tween(dur, update, done) {
    let finished = false, t0 = null;
    const end = () => { if (finished) return; finished = true; clearTimeout(fb); update(1); if (done) done(); };
    const step = (now) => {
      if (finished) return;
      if (t0 == null) t0 = now;
      const t = Math.min(1, (now - t0) / dur);
      update(t);
      if (t < 1) requestAnimationFrame(step); else end();
    };
    const fb = setTimeout(end, dur + 400);
    requestAnimationFrame(step);
    return { cancel: () => { finished = true; clearTimeout(fb); } };
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function valueNet() {
    const xs = [14, 34, 54], ys = [26, 50, 74, 98];
    const links = [1, 2].map((c) => `<g class="vnet__links">${ys.map((a) => ys.map((b) =>
      `<line x1="${xs[c - 1] + 5}" y1="${a}" x2="${xs[c] - 5}" y2="${b}"/>`).join("")).join("")}</g>`).join("");
    const cols = xs.map((x) => `<g class="vnet__col">${ys.map((y) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2"/>`).join("")}</g>`).join("");
    return `<svg class="vnet" viewBox="0 0 68 132" aria-hidden="true">
      <path class="vnet__arrow vnet__arrow--in" pathLength="1" d="M0,62 L7,62"/><path class="vnet__head vnet__head--in" d="M4,59 L7,62 L4,65"/>
      ${links}${cols}
      <path class="vnet__arrow vnet__arrow--out" pathLength="1" d="M60,62 L68,62"/><path class="vnet__head vnet__head--out" d="M65,59 L68,62 L65,65"/>
      <text x="34" y="118" text-anchor="middle" class="vnet__label">value</text>
      <text x="34" y="129" text-anchor="middle" class="vnet__label">head</text></svg>`;
  }

  class LensFigure {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.front = 0;
      this.stage = "idle";
      this.raf = null;
      this.steer = { on: false, concept: "king_safety_opponent_ph", v: 0.5, t: 1 };
      this.la = { on: false, t: 1 }; // look-ahead removed from layer 10 on (needs data.lookahead)
      this.build();
    }

    build() {
      const r = this.root;
      r.classList.add("lens-fig");
      r.innerHTML = `
        <div class="lens-fig__intro">
          <h2 class="lens-fig__q">Which move would a chess-playing network choose if it stopped after each layer?</h2>
          <p class="lens-fig__how"><span class="lens-fig__puzzle"></span> Each line is one legal move; its height is the probability the network gives it when we read out its policy after that layer (the logit lens).</p>
        </div>
        <div class="lens-fig__stage">
          <div class="lens-fig__main">
            <svg class="lens-fig__svg" role="img"></svg>
            <div class="lens-fig__tip" role="status" aria-live="polite"></div>
          </div>
          <div class="lens-fig__cta" hidden>
            <button class="cta-btn cta-btn--primary lens-fig__show" type="button">Show the position after each move <span aria-hidden="true">→</span></button>
          </div>
          <div class="lens-fig__value" aria-hidden="true">
            <div class="lens-fig__value-head">Value head on the resulting positions</div>
            <div class="lens-fig__cards"></div>
            <svg class="lens-fig__note-arrows" aria-hidden="true"></svg>
          </div>
          <svg class="lens-fig__overlay" aria-hidden="true"></svg>
        </div>
        <div class="lens-fig__controls">
          <button class="btn btn--icon lens-fig__play" type="button" aria-label="Pause">
            <svg viewBox="0 0 24 24" width="18" height="18"><path class="i-pause" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="i-play" d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn lens-fig__replay" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>
            Replay
          </button>
          <label class="lens-fig__scrub">
            <span class="sr-only">Layer</span>
            <input type="range" min="0" max="15" step="0.01" value="0" aria-label="Scrub through the layers" />
          </label>
          <output class="lens-fig__layer">Input</output>
        </div>
        <div class="lens-fig__steer">
          <button class="steer-toggle" type="button" role="switch" aria-checked="false">
            <span class="steer-toggle__track"><span class="steer-toggle__knob"></span></span>
            Steer against the safety prior
          </button>
          <label class="lens-fig__field">Direction
            <select class="lens-fig__concept"></select>
          </label>
          <label class="lens-fig__field lens-fig__field--s">Strength
            <input class="lens-fig__s" type="range" min="1" max="4" step="1" value="2" aria-label="Steering strength against the safety prior" />
            <output class="lens-fig__s-out mono"></output>
          </label>
          <div class="lens-fig__stats" aria-live="polite"></div>
        </div>
        <div class="lens-fig__la">
          <button class="steer-toggle la-toggle" type="button" role="switch" aria-checked="false">
            <span class="steer-toggle__track"><span class="steer-toggle__knob"></span></span>
            Remove look-ahead
          </button>
          <span class="lens-fig__la-what"></span>
          <details class="lens-fig__la-how"><summary>How?</summary><p></p></details>
          <div class="lens-fig__stats lens-fig__la-stats" aria-live="polite"></div>
        </div>`;
      this.svg = r.querySelector(".lens-fig__svg");
      this.tip = r.querySelector(".lens-fig__tip");
      this.valueBox = r.querySelector(".lens-fig__value");
      this.valueBox.addEventListener("transitionend", (e) => { if (e.target === this.valueBox) this.drawConnectors(); });
      this.cards = r.querySelector(".lens-fig__cards");
      this.overlay = r.querySelector(".lens-fig__overlay");
      this.slider = r.querySelector("input[type=range]");
      this.layerOut = r.querySelector(".lens-fig__layer");
      this.playBtn = r.querySelector(".lens-fig__play");
      this.steerBtn = r.querySelector(".steer-toggle");
      this.conceptSel = r.querySelector(".lens-fig__concept");
      this.sSlider = r.querySelector(".lens-fig__s");
      this.sOut = r.querySelector(".lens-fig__s-out");
      this.stats = r.querySelector(".lens-fig__stats");
      this.cta = r.querySelector(".lens-fig__cta");
      this.noteSvg = r.querySelector(".lens-fig__note-arrows");
      window.addEventListener("resize", () => this.drawNoteArrows());
      r.querySelector(".lens-fig__show").addEventListener("click", () => this.revealPositions(false));
      window.addEventListener("resize", () => this.syncButtonScale());

      this.steerPanel = r.querySelector(".lens-fig__steer");
      this.head = r.querySelector(".lens-fig__puzzle");
      const ST = window.LLLSteer;
      ST.CONCEPTS.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.key;
        o.textContent = c.label + (c.note ? ` (${c.note})` : "");
        this.conceptSel.appendChild(o);
      });
      this.conceptSel.value = this.steer.concept;
      this.steerBtn.addEventListener("click", () => this.setSteer({ on: !this.steer.on }));
      this.conceptSel.addEventListener("change", () => this.setSteer({ on: true, concept: this.conceptSel.value }));
      this.sSlider.addEventListener("input", () => this.setSteer({ on: true, v: +this.sSlider.value * 0.25 }));
      this.laPanel = r.querySelector(".lens-fig__la");
      this.laBtn = r.querySelector(".la-toggle");
      this.laWhat = r.querySelector(".lens-fig__la-what");
      this.laHow = r.querySelector(".lens-fig__la-how p");
      this.laStats = r.querySelector(".lens-fig__la-stats");
      this.laBtn.addEventListener("click", () => this.setLA({ on: !this.la.on }));

      r.querySelector(".lens-fig__replay").addEventListener("click", () => { this.steer.on = false; this.la.on = false; this.play(true); });
      this.playBtn.addEventListener("click", () => (this.raf ? this.pause() : this.play(this.front >= 15)));
      this.slider.addEventListener("input", () => {
        this.pause();
        this.steer.on = false;
        this.la.on = false;
        this.setFront(+this.slider.value, { showValue: +this.slider.value >= 15 });
      });
      this.slider.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          this.pause();
          const k = Math.max(0, Math.min(15, Math.round(this.front) + (e.key === "ArrowRight" ? 1 : -1)));
          this.setFront(k, { showValue: k >= 15 });
        }
      });
      window.addEventListener("resize", () => {
        if (this.data && (this.root.getBoundingClientRect().width < 640) !== COMPACT) {
          const f = this.front, done = this.root.classList.contains("is-complete");
          this.drawStatic();
          this.setFront(f, { showValue: done });
        }
        this.drawConnectors();
      });
    }

    // notes: optional [{uci, lines: [..]}] — an annotation at the peak of another move's line
    // extra: optional {laNote} — a one-line remark shown when look-ahead is removed
    load(data, snapshots, notes, extra) {
      this.notes = notes || [];
      this.laNote = (extra && extra.laNote) || null;
      this.pause();
      this.data = data;
      // A solved example (data.solved): m_hat is then the solution's main contender before the output,
      // not the played move. Steering and look-ahead removal then show whether the solution survives.
      this.solved = !!data.solved;
      this.root.classList.toggle("is-solved", this.solved);
      this.root.classList.toggle("no-steer", !data.steering);
      const peakOf = (u) => data.probs[u].slice(0, 15).reduce((b, p, k, a) => (p > a[b] ? k : b), 0);
      const peak = peakOf(data.m_star);
      this.peakK = peak;
      // early layer, the solution's peak (solved: the rival's peak) if it lies strictly between, output;
      // a rival that peaks early is shown at its peak, then layer 9
      const mid = this.solved ? peakOf(data.m_hat) : peak;
      this.snapshots = snapshots || (this.solved && mid <= 6 ? [mid, 10, 15] : [3, mid > 3 && mid < 15 ? mid : 10, 15]);
      this.svg.setAttribute("aria-label",
        `Probability of each legal move across the layers of Leela's policy network for puzzle ${data.id}. ` +
        `The solution ${data.san[data.m_star]} peaks at ${pct(data.probs[data.m_star][peak])} at ${layerName(peak)} ` +
        `and ends at ${pct(data.probs[data.m_star][15])}; ` +
        (this.solved
          ? `its main contender ${data.san[data.m_hat]} peaks at ${pct(data.probs[data.m_hat][mid])} at ${layerName(mid)}.`
          : `the played move ${data.san[data.m_hat]} ends at ${pct(data.probs[data.m_hat][15])}.`));
      this.steer.on = false;
      this.la.on = false;
      if (this.valueRows) this.resetValue();
      const mate = (data.themes.find((t) => /^mateIn\d$/.test(t)) || "").replace("mateIn", "");
      this.head.innerHTML = describePuzzle(data, mate);
      this.mateIn = mate;
      this.describeLookahead();
      this.drawStatic();
      this.drawValueCards();
      this.setFront(0, { showValue: false });
    }

    // The look-ahead panel's text for this puzzle: which follow-up move, and how it is removed.
    describeLookahead() {
      const d = this.data, la = d.lookahead;
      this.root.classList.toggle("has-la", !!la && d.pv.length >= 3);
      if (!la || d.pv.length < 3) return;
      const third = (d.turn === "b" ? "…" : "") + d.pv_san[2];
      const sq1 = d.pv[0].slice(2, 4), sq3 = d.pv[2].slice(2, 4);
      const layers = `${la.patch_layers[0]}–${la.patch_layers[la.patch_layers.length - 1]}`;
      this.laWhat.innerHTML = `From layer ${la.from_layer} on, the network can no longer use what it computes about the follow-up <span class="mono">${third}</span>.`;
      const corr = describeCorruption(d.fen, la.corruption.fen);
      this.laHow.innerHTML =
        `The paper's two look-ahead interventions together: we block the attention that carries information from the follow-up's square (${sq3}) ` +
        `to the first move's square (${sq1}) in heads ${la.heads.join(" and ")}, and overwrite ${sq3} after layers ${layers} with its activations ` +
        `from a corrupted board on which the follow-up fails (${corr}). ` +
        (la.corruption.official
          ? "The corrupted board comes from the paper's corruption set."
          : "This puzzle has no corrupted board that passes all of the paper's filters (the network already sees the position as lost, so no corruption can lower its evaluation by the required margin); this one is chosen by hand.") +
        " As with steering, a change made after a layer shows from the next layer's read-out on." +
        " Combining the two, and with steering, is a demonstration on these puzzles; the paper reports each intervention on its own." +
        ` <a href="#lookahead">What look-ahead is, and the evidence for it ↓</a>`;
    }

    drawStatic() {
      const d = this.data, svg = this.svg;
      setLayout(this.root.getBoundingClientRect().width < 640);
      this.root.classList.toggle("is-compact", COMPACT);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      requestAnimationFrame(() => this.syncButtonScale());
      this.syncButtonScale();
      // Chart background, grid, axes
      const chart = el("g", { class: "lf-chart" }, svg);
      el("rect", { x: CH.x0, y: CH.yTop, width: CH.x1 - CH.x0, height: CH.yBot - CH.yTop, class: "lf-plotbg" }, chart);
      [0, 0.25, 0.5, 0.75, 1].forEach((p) => {
        el("line", { x1: CH.x0, x2: CH.x1, y1: yOf(p), y2: yOf(p), class: "lf-grid" }, chart);
        const t = el("text", { x: CH.x0 - 12, y: yOf(p), class: "lf-tick", "text-anchor": "end", "dominant-baseline": "central" }, chart);
        t.textContent = COMPACT && p === 1 ? "100%" : String(p * 100);
      });
      el("line", { x1: CH.x0, x2: CH.x1, y1: CH.yBot, y2: CH.yBot, class: "lf-axis" }, chart);
      for (let k = 0; k <= 15; k++) {
        const major = k === 0 || k === 15 || this.snapshots.includes(k);
        el("line", { x1: xOf(k), x2: xOf(k), y1: CH.yBot, y2: CH.yBot + (major ? 9 : 5) * S, class: "lf-axis" }, chart);
        if (major) {
          const t = el("text", { x: xOf(k), y: CH.yBot + 26 * S, class: "lf-tick lf-tick--major", "text-anchor": "middle" }, chart);
          t.textContent = tickName(k);
        }
      }
      const xl = el("text", { x: (CH.x0 + CH.x1) / 2, y: H - 8, class: "lf-axis-label", "text-anchor": "middle" }, chart);
      xl.textContent = "Layer";
      if (!COMPACT) {
        const yl = el("text", { x: 0, y: 0, class: "lf-axis-label", "text-anchor": "middle", transform: `translate(22,${(CH.yTop + CH.yBot) / 2}) rotate(-90)` }, chart);
        yl.textContent = "Move probability (%)";
      }

      // Snapshot boards, connectors and dashed layer markers
      // (the marker grows up from the axis, the connector grows towards the board, then the board fades in)
      this.snapEls = this.snapshots.map((k, i) => {
        const g = el("g", { class: "lf-snap" }, svg);
        const cx = BOARD_CX[i], by = BOARD.y + BOARD.size;
        const vline = el("line", { x1: xOf(k), x2: xOf(k), y1: CH.yBot, y2: CH.yBot, class: "lf-connector" }, g);
        const conn = el("path", { d: "", class: "lf-connector" }, g);
        const boardG = el("g", { class: "lf-snap__board", opacity: 0 }, g);
        const title = el("text", { x: cx, y: BOARD.y - 12, class: "lf-board-title", "text-anchor": "middle" }, boardG);
        title.textContent = k === 15 ? "Model output" : layerName(k);
        drawBoard(boardG, { fen: d.fen, size: BOARD.size, x: cx - BOARD.size / 2, y: BOARD.y, arrows: arrowsFor(d, topK(d, k, 3)), flipped: false });
        const cubic = [[xOf(k), CH.yTop], [xOf(k), CH.yTop - 55], [cx, by + 40], [cx, by + 4]];
        return { k, g, cx, vline, conn, boardG, cubic, shown: false, anim: null };
      });

      // Legend: top right (wide) or one row under the boards (compact)
      const lg = el("g", { class: "lf-legend", transform: `translate(${LEGEND.x},${LEGEND.y})` }, svg);
      if (!LEGEND.row) el("text", { x: 0, y: 0, class: "lf-legend-title" }, lg).textContent = "Move";
      const items = [
        [COL.star, `${moveLabel(d, d.m_star)}`, "solution"],
        [COL.hat, `${moveLabel(d, d.m_hat)}`, this.solved ? "other contender" : "played"],
        [COL.other, LEGEND.row ? "other moves" : "other legal moves", ""],
      ];
      items.forEach(([c, a, b], i) => {
        const x0 = LEGEND.row ? [0, 200, 384][i] : 0, y = LEGEND.row ? 0 : 30 + i * 30;
        el("line", { x1: x0, x2: x0 + 26 * S, y1: y, y2: y, stroke: c, "stroke-width": (i === 2 ? 2 : 3) * S, "stroke-linecap": "round", opacity: i === 2 ? 0.6 : 1 }, lg);
        const t = el("text", { x: x0 + 36 * S, y, class: "lf-legend-item", "dominant-baseline": "central" }, lg);
        t.innerHTML = b ? `<tspan class="lf-mono">${a}</tspan><tspan class="lf-muted"> ${b}</tspan>` : `<tspan class="lf-muted">${a}</tspan>`;
      });

      // Look-ahead removal: shaded layers and marker, behind the lines
      this.laG = el("g", { class: "lf-la" }, svg);

      // Lines: others first (behind), then played, then solution
      const lines = el("g", { class: "lf-lines" }, svg);
      this.lineEls = {};
      const order = d.legal.filter((u) => u !== d.m_star && u !== d.m_hat).concat([d.m_hat, d.m_star]);
      const noted = new Set(this.notes.map((n) => n.uci));
      order.sort((a, b) => noted.has(a) - noted.has(b)); // annotated lines drawn above the other grey lines
      order.forEach((u) => {
        const cls = u === d.m_star ? "lf-line lf-line--star" : u === d.m_hat ? "lf-line lf-line--hat" : noted.has(u) ? "lf-line lf-line--noted" : "lf-line lf-line--other";
        this.lineEls[u] = el("path", { class: cls, d: "" }, lines);
      });

      // Steering layer (ghost tails, steered tails, marker), the in-chart steering button and the outcome badge
      this.steerG = el("g", { class: "lf-steer" }, svg);
      this.pill = el("g", { class: "lf-pill", role: "button", tabindex: "0", "aria-label": "Steer against the safety prior after layer 13" }, svg);
      this.pillRect = el("rect", { rx: 14 * S, ry: 14 * S, height: 28 * S, class: "lf-pill__bg" }, this.pill);
      this.pillText = el("text", { class: "lf-pill__text", "dominant-baseline": "central", "text-anchor": "middle" }, this.pill);
      this.pill.addEventListener("click", () => this.setSteer({ on: !this.steer.on }));
      this.pill.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.setSteer({ on: !this.steer.on }); } });
      this.laPill = el("g", { class: "lf-lapill", role: "button", tabindex: "0", "aria-label": "Remove look-ahead from layer 10 on" }, svg);
      this.laPillRect = el("rect", { rx: 14 * S, ry: 14 * S, height: 28 * S, class: "lf-lapill__bg" }, this.laPill);
      this.laPillText = el("text", { class: "lf-lapill__text", "dominant-baseline": "central", "text-anchor": "middle" }, this.laPill);
      this.laPill.addEventListener("click", () => this.setLA({ on: !this.la.on }));
      this.laPill.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.setLA({ on: !this.la.on }); } });
      this.badge = el("g", { class: "lf-badge" }, svg);

      // Front marker
      this.frontG = el("g", { class: "lf-front" }, svg);
      this.frontLine = el("line", { y1: CH.yTop - 4, y2: CH.yBot, class: "lf-front-line" }, this.frontG);
      this.frontLabel = el("text", { y: CH.yTop - 12 * S, class: "lf-front-label", "text-anchor": "middle" }, this.frontG);
      this.dots = {};
      this.dotLabels = {};
      [d.m_hat, d.m_star].forEach((u) => {
        this.dots[u] = el("circle", { r: 5.5 * S, class: u === d.m_star ? "lf-dot lf-dot--star" : "lf-dot lf-dot--hat" }, this.frontG);
        this.dotLabels[u] = el("text", { class: "lf-dot-label", "dominant-baseline": "central" }, this.frontG);
      });
      this.ghostDots = el("g", { class: "lf-ghost-dots" }, this.frontG);

      // Annotations
      // Where the solution first becomes the top move. Phases as in the paper: early (through
      // layer 5, K <= 6), middle (through layer 10, K <= 11), late.
      const pStar = d.probs[d.m_star];
      // solved: how many read-outs in a row, up to the output, the solution has been the top move
      let run = 0;
      while (run < 16 && d.legal.every((u) => d.probs[u][15 - run] <= pStar[15 - run])) run++;
      this.findK = -1;
      for (let k = 0; k < 15 && this.findK < 0; k++) if (d.legal.every((u) => d.probs[u][k] <= pStar[k])) this.findK = k;
      this.annFind = el("g", { class: "lf-ann lf-ann--find" }, svg);
      if (this.solved && run < 5) this.findK = -1; // solved: only the story "found early and kept"
      if (this.findK >= 0) {
        const kf = this.findK, phase = kf <= 6 ? "Early" : kf <= 11 ? "Middle" : "Late";
        const ax = xOf(kf), ay = yOf(pStar[kf]);
        const tx = Math.min(ax + 40, CH.x1 - 300), ty = Math.max(CH.yTop + 22, yOf(Math.min(0.95, pStar[kf] + 0.3)));
        el("path", { d: `M${tx - 6},${ty - 4} C${ax + 4},${ty - 6} ${ax + 2},${(ty + ay) / 2} ${ax + 2},${ay - 10}`, class: "lf-ann-arrow", "marker-end": "url(#lf-arrowhead)" }, this.annFind);
        el("text", { x: tx, y: ty, class: "lf-ann-text lf-ann-text--strong", "dominant-baseline": "central" }, this.annFind).textContent = `${phase} layers find the solution`;
      }

      // Puzzle-specific notes on another move's line, at that line's peak before the output
      this.noteEls = this.notes.filter((n) => d.probs[n.uci]).map((n) => {
        const p = d.probs[n.uci], k = p.slice(0, 15).reduce((b, v, i, a) => (v > a[b] ? i : b), 0);
        const g = el("g", { class: "lf-ann lf-ann--note" }, svg);
        const px = xOf(k), py = yOf(p[k]), tx = px + 34, ty = Math.max(CH.yTop + 12, py - 6);
        el("path", { d: `M${tx - 4},${ty - 2} Q${px + 14},${ty - 4} ${px + 6},${py - 3}`, class: "lf-ann-arrow", "marker-end": "url(#lf-arrowhead)" }, g);
        const t = el("text", { x: tx, y: ty, class: "lf-ann-text" }, g);
        t.innerHTML = n.lines.map((line, i) => `<tspan x="${tx}" dy="${i ? 17 : 0}"${i ? "" : ' class="lf-ann-text--strong"'}>${line}</tspan>`).join("");
        return { k, g };
      });

      // The solution's peak, if it is a separate moment (well after the find). No numbers: the axis
      // shows the value; the note carries the story (find → most confident → overridden).
      this.annPeak = el("g", { class: "lf-ann lf-ann--peak" }, svg);
      this.showPeak = !this.solved && this.peakK >= 3 && this.peakK <= 14 && this.peakK - Math.max(this.findK, 0) >= 3;
      if (this.showPeak) {
        const pk = this.peakK, late = pk >= 12; // peak in the last three read-outs before the output
        const px = xOf(pk), py = yOf(pStar[pk]);
        const tx = px - 34, ty = Math.max(CH.yTop + 12, py - (late ? 8 : 0));
        el("path", { d: `M${tx + 4},${ty + 2} Q${px - 16},${ty} ${px - 7},${py - 1}`, class: "lf-ann-arrow", "marker-end": "url(#lf-arrowhead)" }, this.annPeak);
        const t = el("text", { x: tx, y: ty, class: "lf-ann-text lf-ann-text--strong", "text-anchor": "end" }, this.annPeak);
        t.innerHTML = late
          ? `<tspan x="${tx}" dy="0">Very confident in the solution,</tspan><tspan x="${tx}" dy="17">just before the end</tspan>`
          : `<tspan x="${tx}" dy="0">Very confident in the solution</tspan>`;
      }

      this.annOverride = el("g", { class: "lf-ann lf-ann--override" }, svg);
      const ps = d.probs[d.m_star], ph = d.probs[d.m_hat];
      // crossing between K=14 and K=15 (or the output point if the lines do not cross there)
      const a0 = ps[14] - ph[14], a1 = ps[15] - ph[15];
      const tc = a0 * a1 < 0 ? a0 / (a0 - a1) : 1;
      const cxp = xOf(14 + tc), cyp = yOf(ps[14] + (ps[15] - ps[14]) * tc);
      // solved puzzles' curves vary more: put the note at the height where no line passes under it
      let oyP = COMPACT ? 0.9 : 0.43;
      if (this.solved) {
        const ks = COMPACT ? [7, 8, 9] : [9, 10, 11];
        const clear = (c) => Math.min(...d.legal.flatMap((u) => ks.map((k) => Math.abs(d.probs[u][k] - c))));
        oyP = (COMPACT ? [0.9, 0.75, 0.6, 0.3] : [0.43, 0.62, 0.8, 0.25, 0.12]).reduce((best, c) => (clear(c) > clear(best) + 0.02 ? c : best));
      }
      const ox = xOf(COMPACT ? 9.4 : 11.2), oy = yOf(oyP);
      const arrowD = COMPACT
        ? `M${ox + 8},${oy - 4} Q${xOf(14.6)},${oy - 10} ${cxp + 2},${cyp - 12}`
        : `M${ox + 8},${oy + 2} Q${xOf(13.6)},${oy + 4} ${cxp - 6},${cyp - 8}`;
      el("path", { d: arrowD, class: "lf-ann-arrow", "marker-end": "url(#lf-arrowhead)" }, this.annOverride);
      const ot = el("text", { x: ox, y: oy - 8, class: "lf-ann-text lf-ann-text--strong", "text-anchor": "end" }, this.annOverride);
      const [w1, w2] = !this.solved ? ["overridden in", "the final layers"]
        : run >= 5 ? ["kept to", "the output"] : run >= 2 ? ["takes over in", "the final layers"] : ["takes over", "at the output"];
      ot.innerHTML = `<tspan x="${ox}" dy="0">${w1}</tspan><tspan x="${ox}" dy="${18 * S}">${w2}</tspan>`;

      const defs = el("defs", {}, svg);
      const m = el("marker", { id: "lf-arrowhead", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", class: "lf-ann-head" }, m);

      // Hover layer
      this.hover = el("g", { class: "lf-hover" }, svg);
      this.hoverLine = el("line", { y1: CH.yTop, y2: CH.yBot, class: "lf-hover-line" }, this.hover);
      const hit = el("rect", { x: CH.x0 - 20, y: CH.yTop - 20, width: CH.x1 - CH.x0 + 40, height: CH.yBot - CH.yTop + 40, class: "lf-hit" }, svg);
      hit.addEventListener("pointermove", (e) => this.onHover(e));
      hit.addEventListener("pointerleave", () => this.hideTip());
    }

    // Each resulting position: board → the network's value head → win/draw/loss. The panel shows the
    // position before the move until the policy animation reaches the output; then the move is played
    // on the board, the position runs through the (stylized) network and the bars fill.
    drawValueCards() {
      const d = this.data;
      const rows = [
        { uci: d.m_hat, wdl: d.wdl.after_hat, kind: "played" },
        { uci: d.m_star, wdl: d.wdl.after_star, kind: "solution" },
      ].sort((a, b) => d.probs[b.uci][15] - d.probs[a.uci][15]);
      this.cards.innerHTML = "";
      this.cardEls = {};
      this.cardTags = {};
      this.valueRows = rows.map((row) => {
        const card = document.createElement("div");
        card.className = `vcard vcard--${row.kind}`;
        const [w, dr, l] = row.wdl;
        card.innerHTML = `
          <div class="vcard__title">After <span class="mono">${moveLabel(d, row.uci)}</span> <span class="vcard__tag">${row.kind === "played" && this.solved ? "other contender" : row.kind}</span></div>
          <div class="vcard__body">
            <div class="vcard__board"></div>
            ${valueNet()}
            <div class="wdl">${[["Win", w, "win"], ["Draw", dr, "draw"], ["Loss", l, "loss"]].map(([name, v, cls]) =>
              `<div class="wdl__row wdl__row--${cls}"><span class="wdl__name">${name}</span><span class="wdl__track"><span class="wdl__bar" style="--v:${Math.max(v, 0.004)}"></span></span><span class="wdl__val mono">${pct1(v)}</span></div>`).join("")}</div>
          </div>`;
        this.cardTags[row.uci] = card.querySelector(".vcard__tag");
        this.cards.appendChild(card);
        this.cardEls[row.uci] = card;
        return { uci: row.uci, card, host: card.querySelector(".vcard__board") };
      });
      const note = document.createElement("div");
      note.className = "vnote";
      note.innerHTML = `<button class="cta-btn cta-btn--primary lens-fig__eval" type="button" hidden>＋ Evaluate with the value head</button>` +
        `<span class="vnote__text">One move later, the network sees which move wins</span>`;
      this.cards.insertBefore(note, this.valueRows[1].card);
      this.noteText = note.querySelector(".vnote__text");
      this.next = note.querySelector(".lens-fig__eval");
      this.next.addEventListener("click", () => this.evaluate(false));
      this.valueRows.forEach((r) => this.drawValueBoard(r, false));
      this.valueStage = 0;
      this.wasComplete = false;
    }

    drawValueBoard(r, after) {
      const d = this.data, from = r.uci.slice(0, 2), to = r.uci.slice(2, 4);
      r.host.innerHTML = "";
      r.host.appendChild(window.LLLBoard.boardSvg({
        fen: after ? d.fen_after[r.uci] : d.fen, size: 200, highlight: after ? [from, to] : [],
        arrows: after ? [{ uci: r.uci, color: r.uci === d.m_star ? COL.star : COL.hat, opacity: 0.6 }] : [],
        label: after ? `Position after ${d.san[r.uci]}` : "Puzzle position",
      }));
    }

    // Stage 1 (on request): the arrows to the resulting positions grow, the panel fades in and the
    // moves are played on the boards. Stage 2 (on request): the positions run through the value head
    // and the bars fill. Steering is the alternative next step.
    revealPositions(instant) {
      if (this.valueStage >= 1) return;
      this.clearValueTimers();
      this.valueStage = 1;
      this.cta.hidden = true;
      this.root.classList.add("is-positions");
      const reveal = () => {
        this.valueBox.classList.add("is-visible");
        this.valueBox.setAttribute("aria-hidden", "false");
      };
      if (instant || reduceMotion) {
        this.connGrow = 1;
        reveal();
        this.valueRows.forEach((r) => this.drawValueBoard(r, true));
        this.drawConnectors();
        this.next.hidden = this.valueStage >= 2;
        return;
      }
      this.valueRows.forEach((r) => this.drawValueBoard(r, false));
      this.connGrow = 0;
      this.connAnim = tween(900, (t) => { this.connGrow = t; this.drawConnectors(); }, () => {
        reveal();
        this.valueRows.forEach((r, i) => {
          const t0 = 600 + i * 300;
          this.valueTimers.push(setTimeout(() => {
            let finished = false;
            const finish = () => { if (!finished) { finished = true; this.drawValueBoard(r, true); } };
            try { window.LLLBoard.animateMove(r.host.querySelector("svg"), r.uci, 750, finish); } catch (e) { finish(); }
            this.valueTimers.push(setTimeout(finish, 1000)); // if requestAnimationFrame is paused or missing
          }, t0));
        });
        this.valueTimers.push(setTimeout(() => { if (this.valueStage === 1) this.next.hidden = false; }, 600 + 300 + 1000));
      });
    }

    // Per card: arrow into the network, the columns appear and light up one after the other (the
    // position passing through), arrow out, W/D/L labels, bars drawn from the left, then the numbers.
    evaluate(instant) {
      if (this.valueStage < 1) this.revealPositions(true);
      if (this.valueStage >= 2) return;
      this.valueStage = 2;
      this.next.hidden = true;
      const parts = (r) => ({ cols: [...r.card.querySelectorAll(".vnet__col")], links: [...r.card.querySelectorAll(".vnet__links")] });
      const done = () => {
        this.root.classList.add("is-evaluated");
        requestAnimationFrame(() => this.drawNoteArrows());
        this.drawNoteArrows();
      };
      if (instant || reduceMotion) {
        this.valueRows.forEach((r) => {
          const { cols, links } = parts(r);
          cols.forEach((c) => c.classList.add("is-lit"));
          links.forEach((l) => l.classList.add("is-on"));
          r.card.classList.add("ev-start", "ev-out", "ev-labels", "is-evaluated", "ev-vals");
        });
        done();
        return;
      }
      // Both cards together: the whole network fades in faintly with the arrow in, then the layers
      // pulse and settle one after the other, arrow out, W/D/L labels, bars, numbers.
      const at = (t, fn) => this.valueTimers.push(setTimeout(fn, t));
      const PULSE = 850, T0 = 650;
      this.valueRows.forEach((r) => {
        const { cols, links } = parts(r);
        at(0, () => r.card.classList.add("ev-start"));
        cols.forEach((c, j) => {
          const t = T0 + j * PULSE;
          if (j > 0) at(t - 150, () => links[j - 1].classList.add("is-on"));
          at(t, () => c.classList.add("is-pulse"));
          at(t + PULSE, () => { c.classList.remove("is-pulse"); c.classList.add("is-lit"); });
        });
        const tOut = T0 + cols.length * PULSE;
        at(tOut, () => r.card.classList.add("ev-out"));
        at(tOut + 450, () => r.card.classList.add("ev-labels"));
        at(tOut + 850, () => r.card.classList.add("is-evaluated"));      // bars: 1 s
        at(tOut + 850 + 1050, () => r.card.classList.add("ev-vals"));   // numbers after the bars
      });
      at(T0 + 3 * PULSE + 850 + 1050 + 400, done);
    }

    // Arrows from the note between the cards to the decisive numbers: the loss after the played
    // move and the win after the solution.
    drawNoteArrows() {
      const svg = this.noteSvg;
      if (!svg) return;
      svg.innerHTML = "";
      if (!this.valueRows || this.valueStage < 2) return;
      const box = this.valueBox.getBoundingClientRect(), tr = this.noteText.getBoundingClientRect();
      if (!box.width || !tr.width) return;
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      const d = this.data;
      const most = ["win", "draw", "loss"][d.wdl.after_hat.indexOf(Math.max(...d.wdl.after_hat))];
      const other = this.solved ? most : "loss";
      const target = (r) => r.card.querySelector(r.uci === d.m_star ? ".wdl__row--win .wdl__val" : `.wdl__row--${other} .wdl__val`).getBoundingClientRect();
      const [up, down] = this.valueRows;
      const t1 = target(up), t2 = target(down);
      if (t2.top < t1.bottom) return; // cards side by side: no arrows
      // leave from the end of the first line (up) and the end of the last line (down), then one curve each
      const range = document.createRange();
      range.selectNodeContents(this.noteText);
      const lines = [...range.getClientRects()].filter((q) => q.width > 0);
      const first = lines[0] || tr, last = lines[lines.length - 1] || tr;
      const a = [first.right - box.left + 6, first.top - box.top + first.height / 2];
      const b = [last.right - box.left + 6, last.top - box.top + last.height / 2];
      const e1 = [t1.left - box.left + t1.width / 2, t1.bottom - box.top + 3];
      const e2 = [t2.left - box.left + t2.width / 2, t2.top - box.top - 3];
      el("path", { d: `M${a[0]},${a[1]} Q${e1[0]},${a[1]} ${e1[0]},${e1[1]}`, class: "note-arrow" }, svg);
      el("path", { d: `M${e1[0] - 5},${e1[1] + 7} L${e1[0]},${e1[1]} L${e1[0] + 5},${e1[1] + 7}`, class: "note-arrow" }, svg);
      el("path", { d: `M${b[0]},${b[1]} Q${e2[0]},${b[1]} ${e2[0]},${e2[1]}`, class: "note-arrow" }, svg);
      el("path", { d: `M${e2[0] - 5},${e2[1] - 7} L${e2[0]},${e2[1]} L${e2[0] + 5},${e2[1] - 7}`, class: "note-arrow" }, svg);
    }

    resetValue() {
      this.clearValueTimers();
      this.valueStage = 0;
      this.connGrow = 0;
      this.cta.hidden = true;
      this.next.hidden = true;
      this.root.classList.remove("is-positions", "is-evaluated");
      if (this.noteSvg) this.noteSvg.innerHTML = "";
      this.valueBox.classList.remove("is-visible");
      this.valueBox.setAttribute("aria-hidden", "true");
      (this.valueRows || []).forEach((r) => {
        this.drawValueBoard(r, false);
        r.card.querySelectorAll(".vnet__col").forEach((c) => c.classList.remove("is-on", "is-lit", "is-pulse"));
        r.card.querySelectorAll(".vnet__links").forEach((l) => l.classList.remove("is-on"));
        r.card.classList.remove("ev-start", "ev-out", "ev-labels", "is-evaluated", "ev-vals");
      });
      this.drawConnectors();
    }

    clearValueTimers() {
      (this.valueTimers || []).forEach(clearTimeout);
      this.valueTimers = [];
      if (this.connAnim) this.connAnim.cancel();
      this.connAnim = null;
    }

    pathUpTo(u, front) {
      const p = this.data.probs[u];
      const kf = Math.floor(front);
      let s = `M${xOf(0)},${yOf(p[0])}`;
      for (let k = 1; k <= kf; k++) s += `L${xOf(k)},${yOf(p[k])}`;
      if (front > kf && kf < 15) {
        const t = front - kf;
        s += `L${xOf(front)},${yOf(p[kf] + (p[kf + 1] - p[kf]) * t)}`;
      }
      return s;
    }
    valueAt(u, front) {
      const p = this.data.probs[u];
      const kf = Math.floor(front);
      if (kf >= 15) return p[15];
      return p[kf] + (p[kf + 1] - p[kf]) * (front - kf);
    }

    setFront(front, o) {
      o = o || {};
      this.front = Math.max(0, Math.min(15, front));
      const d = this.data;
      for (const u in this.lineEls) this.lineEls[u].setAttribute("d", this.pathUpTo(u, this.front));
      const fx = xOf(this.front);
      this.frontLine.setAttribute("x1", fx);
      this.frontLine.setAttribute("x2", fx);
      this.frontLabel.setAttribute("x", Math.min(CH.x1 - 30, Math.max(CH.x0 + 30, fx)));
      this.frontLabel.textContent = layerName(Math.round(this.front));
      this.frontG.classList.toggle("is-hidden", this.front <= 0.001);
      const ys = {};
      [d.m_star, d.m_hat].forEach((u) => {
        const v = this.valueAt(u, this.front);
        ys[u] = yOf(v);
        this.dots[u].setAttribute("cx", fx);
        this.dots[u].setAttribute("cy", ys[u]);
        this.dotLabels[u].textContent = pct(v); // the dot colour and the legend name the move
      });
      this.placeLabels(fx, ys);
      this.snapEls.forEach((s) => {
        const vis = this.front >= s.k - 0.001;
        if (vis && !s.shown) {
          s.shown = true;
          if (o.animate && !reduceMotion) s.anim = tween(1000, (t) => this.setSnap(s, t));
          else this.setSnap(s, 1);
        } else if (!vis && s.shown) {
          s.shown = false;
          if (s.anim) s.anim.cancel();
          this.setSnap(s, 0);
        }
      });
      this.annFind.classList.toggle("is-visible", !COMPACT && this.findK >= 0 && this.front >= this.findK + 0.4);
      (this.noteEls || []).forEach((n) => n.g.classList.toggle("is-visible", !COMPACT && this.front >= n.k - 0.02));
      this.annPeak.classList.toggle("is-visible", !COMPACT && this.showPeak && this.front >= this.peakK - 0.02); // as the line reaches the peak
      if (!o.keepAnnotations) this.annOverride.classList.toggle("is-visible", !!o.showValue && this.front >= 15);
      const show = !!o.showValue && this.front >= 15;
      const was = this.wasComplete;
      this.wasComplete = show;
      if (show && !was) {
        if (o.instant) { this.revealPositions(true); this.evaluate(true); }
        else this.cta.hidden = false;
      } else if (!show && was) this.resetValue();
      this.root.classList.toggle("is-complete", !!o.showValue && this.front >= 15);
      this.slider.value = this.front;
      this.layerOut.textContent = layerName(Math.round(this.front));
      this.renderSteer();
      this.drawConnectors();
    }

    // ---- steering and look-ahead acts ---------------------------------------------------
    steerActive() {
      return this.steer.on && this.root.classList.contains("is-complete");
    }
    laActive() {
      return this.la.on && !!this.data.lookahead && this.root.classList.contains("is-complete");
    }
    steerDist(readout) {
      const ST = window.LLLSteer, st = this.steer;
      return ST.dist(this.data, st.concept, ST.raw(st.concept, st.v), readout, 0);
    }
    // Output policy over d.legal as currently shown (steered or not, look-ahead removed or not);
    // withLA: the same with look-ahead intact.
    finalDist(withLA) {
      const d = this.data, ST = window.LLLSteer, st = this.steer, steered = this.steerActive();
      if (this.laActive() && !withLA) {
        const la = d.lookahead;
        if (!steered) return la.unsteered["15"];
        const k = ST.sKey(ST.raw(st.concept, st.v));
        return st.concept === "random" ? la.random[k] : la.steered[st.concept][k];
      }
      return steered ? this.steerDist(15) : d.legal.map((u) => d.probs[u][15]);
    }
    // Probability of move u at read-out k as currently shown.
    shownValue(u, k) {
      const d = this.data, i = d.legal.indexOf(u);
      if (k >= 15) return this.finalDist()[i];
      if (this.laActive() && k >= 12) return d.lookahead.unsteered[String(k)][i];
      return d.probs[u][k];
    }
    endValue(u) {
      return this.shownValue(u, 15);
    }

    setSteer(patch, instant) {
      Object.assign(this.steer, patch);
      this.root.classList.add("steer-used");
      if (!instant) {
        this.steerPanel.classList.remove("is-flash");
        void this.steerPanel.offsetWidth;
        this.steerPanel.classList.add("is-flash");
      }
      if (this.steer.on && !this.root.classList.contains("is-complete")) {
        this.pause();
        this.setFront(15, { showValue: true });
      }
      if (this.steerAnim) this.steerAnim.cancel();
      this.steerAnim = null;
      this.steer.t = 1;
      if (!this.steer.on) {
        this.setFront(this.front, { showValue: this.root.classList.contains("is-complete") });
        return;
      }
      if (instant || reduceMotion) {
        this.renderSteer();
        this.drawConnectors();
        return;
      }
      this.steer.t = 0;
      this.renderSteer();
      this.steerAnim = tween(1500, (t) => { this.steer.t = t; this.renderSteer(); }, () => {
        this.steerAnim = null;
        this.drawConnectors();
        this.celebrate();
      });
    }

    // Remove look-ahead: from layer 10 on the curves are redrawn, growing from the layer-10 read-out.
    setLA(patch, instant) {
      Object.assign(this.la, patch);
      this.root.classList.add("la-used");
      if (!instant) {
        this.laPanel.classList.remove("is-flash");
        void this.laPanel.offsetWidth;
        this.laPanel.classList.add("is-flash");
      }
      if (this.laAnim) this.laAnim.cancel();
      this.laAnim = null;
      this.la.t = 1;
      if (this.la.on && !this.root.classList.contains("is-complete")) {
        this.pause();
        this.setFront(15, { showValue: true });
      }
      if (!this.la.on) {
        this.setFront(this.front, { showValue: this.root.classList.contains("is-complete") });
        return;
      }
      if (instant || reduceMotion) {
        this.renderSteer();
        this.drawConnectors();
        return;
      }
      this.la.t = 0;
      this.renderSteer();
      this.laAnim = tween(2000, (t) => { this.la.t = t; this.renderSteer(); }, () => {
        this.laAnim = null;
        this.drawConnectors();
        this.celebrate();
      });
    }

    renderSteer() {
      if (!this.data || !this.steerG) return;
      const d = this.data, g = this.steerG, steered = this.steerActive(), L = this.laActive();
      g.innerHTML = "";
      this.laG.innerHTML = "";
      this.ghostDots.innerHTML = "";
      this.root.classList.toggle("is-steered", steered);
      this.root.classList.toggle("is-la", L);
      // notes on the solution's line in the changed read-outs now point at the faint curve
      this.annPeak.classList.toggle("is-ghosted", L && this.peakK >= 12);
      this.annFind.classList.toggle("is-ghosted", L && this.findK >= 12);
      this.updateSteerUI();
      this.drawPill(steered);
      const done = (steered || L) && this.steer.t >= 1 && this.la.t >= 1;
      this.drawSnapBoards(done);
      this.updateCards(done);
      this.drawBadge(done);
      if (!steered && !L) return;
      const la = d.lookahead, fin = this.finalDist();
      // Move u (index i) at read-out k, before the dashed steered segment. Without look-ahead the
      // read-outs from layer 11 on change (the first patch is after layer 10).
      const cur = (u, i, k) => (k >= 15 ? fin[i] : L && k >= 12 ? la.unsteered[String(k)][i] : d.probs[u][k]);
      // The growing front: from layer 10 when look-ahead was just removed, else through the steered
      // segment (the steering vector is added after layer 13, so it shows only in the output).
      const F = L && this.la.t < 1 ? 11 + 4 * this.la.t : steered ? 14 + this.steer.t : 15;
      const solidEnd = steered ? Math.min(F, 14) : F;
      const path = (f, a, b) => {
        let s = `M${xOf(a)},${yOf(f(a))}`;
        const kb = Math.floor(b);
        for (let k = a + 1; k <= kb; k++) s += `L${xOf(k)},${yOf(f(k))}`;
        if (b > kb && kb < 15) s += `L${xOf(b)},${yOf(f(kb) + (f(kb + 1) - f(kb)) * (b - kb))}`;
        return s;
      };
      const kindOf = (u) => (u === d.m_star ? "star" : u === d.m_hat ? "hat" : "other");
      for (const u in this.lineEls) {
        const i = d.legal.indexOf(u);
        this.lineEls[u].setAttribute("d", path((k) => cur(u, i, k), 0, solidEnd));
      }
      // Ghosts: what the network did before the last intervention. Without look-ahead, the curves
      // with look-ahead from layer 10 on (steered, if steering is on); steering only: the unsteered output.
      const gFrom = L ? 11 : 14, gEnd = this.finalDist(true);
      const gEndOf = L ? gEnd : d.legal.map((u) => d.probs[u][15]);
      const ghosts = el("g", {}, g), tails = el("g", {}, g);
      const order = d.legal.filter((u) => u !== d.m_star && u !== d.m_hat).concat([d.m_hat, d.m_star]);
      order.forEach((u) => {
        const i = d.legal.indexOf(u);
        el("path", { d: path((k) => (k >= 15 ? gEndOf[i] : d.probs[u][k]), gFrom, 15), class: `lf-ghost lf-ghost--${kindOf(u)}` }, ghosts);
        if (steered && F > 14) {
          const b14 = cur(u, i, 14);
          el("path", { d: `M${xOf(14)},${yOf(b14)}L${xOf(F)},${yOf(b14 + (fin[i] - b14) * (F - 14))}`, class: `lf-steered lf-steered--${kindOf(u)}` }, tails);
        }
      });
      if (steered) el("line", { x1: xOf(14), x2: xOf(14), y1: CH.yTop - 4 * S, y2: CH.yBot, class: "lf-inject" }, g);
      if (L) {
        // the intervened layers (patches after layers 10–13, the two heads in layers 12 and 13)
        el("rect", { x: xOf(11), y: CH.yTop, width: xOf(14) - xOf(11), height: CH.yBot - CH.yTop, class: "lf-la-band" }, this.laG);
        el("line", { x1: xOf(11), x2: xOf(11), y1: CH.yTop - 4 * S, y2: CH.yBot, class: "lf-la-mark" }, this.laG);
        if (!this.snapshots.includes(11)) {
          const t = el("text", { x: xOf(11), y: CH.yBot + 26 * S, class: "lf-tick lf-tick--major lf-tick--la", "text-anchor": "middle" }, this.laG);
          t.textContent = tickName(11);
        }
      }
      const fx = xOf(F), ys = {};
      [d.m_star, d.m_hat].forEach((u) => {
        const i = d.legal.indexOf(u);
        let v;
        if (steered && F > 14) v = cur(u, i, 14) + (fin[i] - cur(u, i, 14)) * (F - 14);
        else {
          const k0 = Math.floor(F);
          v = k0 >= 15 ? cur(u, i, 15) : cur(u, i, k0) + (cur(u, i, k0 + 1) - cur(u, i, k0)) * (F - k0);
        }
        ys[u] = yOf(v);
        this.dots[u].setAttribute("cx", fx);
        this.dots[u].setAttribute("cy", ys[u]);
        this.dotLabels[u].textContent = pct(v); // the dot colour and the legend name the move
        el("circle", { cx: xOf(15), cy: yOf(gEndOf[i]), r: 4 * S, class: `lf-ghost-dot lf-ghost-dot--${kindOf(u)}` }, this.ghostDots);
      });
      this.placeLabels(fx, ys);
    }

    // What the network now plays, whether that plays the whole solution line (known for steering
    // alone), and whether it played the solution with look-ahead intact.
    outcome() {
      const ST = window.LLLSteer, st = this.steer, d = this.data;
      const argmax = (p) => d.legal[p.indexOf(Math.max(...p))];
      const top = argmax(this.finalDist()), topWithLA = argmax(this.finalDist(true));
      let line = null;
      if (this.steerActive() && !this.laActive() && st.concept !== "random" && d.steering.pv && d.steering.pv[st.concept]) {
        const pvr = d.steering.pv[st.concept][ST.sKey(ST.raw(st.concept, st.v))];
        line = pvr ? pvr.solved : null;
      }
      return { top, first: top === d.m_star, line, foundWithLA: topWithLA === d.m_star };
    }

    drawPill(active) {
      if (!this.pill) return;
      const label = COMPACT ? (active ? "steered · undo" : "＋ steer after layer 13") : active ? "steered after layer 13 · undo" : "＋ steer after layer 13";
      this.pillText.textContent = label;
      const w = (label.length * 7.4 + 26) * S;
      const x = Math.min(xOf(14) + w / 2 - 18 * S, CH.x1 - w / 2 + 4 * S), y = CH.yTop - 30 * S;
      this.pillRect.setAttribute("x", x - w / 2);
      this.pillRect.setAttribute("y", y - 14 * S);
      this.pillRect.setAttribute("width", w);
      this.pillText.setAttribute("x", x);
      this.pillText.setAttribute("y", y);
      this.pill.classList.toggle("is-on", active);
      // The look-ahead pill ends just right of its marker at layer 10 (mirroring the steering pill,
      // which starts just left of its marker), and never runs into the steering pill.
      const laOn = this.laActive();
      const lt = COMPACT ? (laOn ? "no look-ahead · undo" : "− look-ahead") : laOn ? "look-ahead removed · undo" : "− look-ahead from layer 10";
      const lw = (lt.length * 7.4 + 26) * S;
      const right = Math.min(xOf(11) + 18 * S, x - w / 2 - 8 * S);
      this.laPillText.textContent = lt;
      this.laPillRect.setAttribute("x", right - lw);
      this.laPillRect.setAttribute("y", y - 14 * S);
      this.laPillRect.setAttribute("width", lw);
      this.laPillText.setAttribute("x", right - lw / 2);
      this.laPillText.setAttribute("y", y);
      this.laPill.classList.toggle("is-on", laOn);
    }

    drawBadge(done) {
      const b = this.badge;
      b.innerHTML = "";
      b.classList.remove("is-good", "is-bad", "is-mid");
      if (!done) return;
      const d = this.data, o = this.outcome(), L = this.laActive();
      if (L && !this.steerActive() && !this.solved) return; // the unsteered network misses the solution either way
      let icon = "✓", text, cls = "is-good";
      if (this.solved && !L) {
        if (o.first && o.line !== false) text = "Still solved";
        else if (o.first) { text = `Plays ${moveLabel(d, d.m_star)}, misses the follow-up`; cls = "is-mid"; }
        else { icon = "✗"; text = "Solution lost"; cls = "is-bad"; }
      } else if (L) {
        if (!o.foundWithLA) { icon = "✗"; text = "Still not the solution"; cls = "is-bad"; }
        else if (o.first) {
          // a flat output can keep the solution on top by a hair: then say how little it gets
          const p = this.endValue(d.m_star);
          text = p < 0.2 ? `Still top without look-ahead, at ${pct(p)}` : "Still found without look-ahead";
          cls = "is-mid";
        }
        else { icon = "✗"; text = "Not found without look-ahead"; cls = "is-bad"; }
      } else if (o.first && this.endValue(d.m_star) < 0.2) { text = `Top move, but only ${pct(this.endValue(d.m_star))}`; cls = "is-mid"; }
      else if (o.first && o.line !== false) text = this.mateIn ? `Mate in ${this.mateIn} found` : "Puzzle solved";
      else if (o.first) { text = `Plays ${moveLabel(d, d.m_star)}, misses the follow-up`; cls = "is-mid"; }
      else { icon = "✗"; text = "Still not the solution"; cls = "is-bad"; }
      b.classList.add(cls);
      // to the left of the pills, in the free row above the chart
      const label = `${icon}  ${text}`;
      const w = (label.length * 8.1 + 28) * S;
      // phones: inside the chart's empty top-left corner
      const cl = this.root.classList; // the look-ahead pill shows together with the steering pill
      const laShown = cl.contains("has-la") && cl.contains("is-complete");
      const pillLeft = +(laShown ? this.laPillRect : this.pillRect).getAttribute("x");
      const x = COMPACT ? CH.x0 + 12 + w : Math.max(CH.x0 + w, pillLeft - 10 * S);
      const y = COMPACT ? yOf(0.9) : CH.yTop - 30 * S;
      el("rect", { x: x - w, y: y - 16 * S, width: w, height: 32 * S, rx: 16 * S, class: "lf-badge__bg" }, b);
      el("text", { x: x - w / 2, y, class: "lf-badge__text", "text-anchor": "middle", "dominant-baseline": "central" }, b).textContent = label;
    }

    updateCards(done) {
      if (!this.cardTags) return;
      const d = this.data, o = done ? this.outcome() : null;
      for (const u in this.cardTags) {
        const tag = this.cardTags[u], card = this.cardEls[u];
        let text = u === d.m_star ? "solution" : this.solved ? "other contender" : "played", cls = "";
        if (o && this.solved) {
          if (u === d.m_star) { text = o.first ? "solution · still played" : "solution · no longer played"; cls = o.first ? "" : "is-old"; }
          else { text = o.top === u ? "other contender · now played" : "other contender"; cls = o.top === u ? "is-now" : ""; }
        } else if (o) {
          if (u === d.m_star) { text = o.first ? "solution · now played" : "solution · not played"; cls = o.first ? "is-now" : ""; }
          else { text = o.top === u ? "still played" : "no longer played"; cls = o.top === u ? "" : "is-old"; }
        }
        tag.textContent = text;
        tag.className = `vcard__tag ${cls}`;
        card.classList.toggle("is-now", cls === "is-now");
      }
    }

    celebrate() {
      const o = this.outcome();
      if (this.laActive()) {
        if (o.foundWithLA && !o.first) this.lostSolution(); // look-ahead removal took the solution away
        return;
      }
      if (this.solved) { // solved before: steering can only keep or lose it
        if (!o.first) this.lostSolution();
        return;
      }
      if (o.first) {
        const pt = this.svg.createSVGPoint();
        pt.x = xOf(15); pt.y = yOf(this.endValue(this.data.m_star));
        const sp = pt.matrixTransform(this.svg.getScreenCTM());
        if (o.line !== false && this.endValue(this.data.m_star) >= 0.2) confetti(sp.x, sp.y); // not for a flattened output
      } else this.shakeOutput();
    }
    // The solution was there and an intervention took it away: two beats at the output. Red rings from
    // the solution's end point, the output board flashes red and drops, and the two-note sting.
    lostSolution() {
      sting();
      if (reduceMotion) return;
      const beat = (t, at) => (t < at ? 0 : Math.exp(-(t - at) * 9));
      const snap = this.snapEls.find((x) => x.k === 15);
      if (snap) {
        snap.g.classList.remove("is-thud");
        void snap.g.getBBox();
        snap.g.classList.add("is-thud");
        setTimeout(() => snap.g.classList.remove("is-thud"), 950);
        const flash = el("rect", { x: snap.cx - BOARD.size / 2, y: BOARD.y, width: BOARD.size, height: BOARD.size, class: "lf-lost-flash", opacity: 0 }, snap.boardG);
        tween(900, (t) => flash.setAttribute("opacity", 0.45 * Math.max(beat(t, 0.02), beat(t, 0.45))), () => flash.remove());
      }
      const x = xOf(15), y = yOf(this.endValue(this.data.m_star));
      [0.02, 0.45].forEach((start, i) => {
        const ring = el("circle", { cx: x, cy: y, r: 6 * S, class: "lf-lost-ring", opacity: 0 }, this.svg);
        tween(1000, (t) => {
          const u = clamp01((t - start) / 0.5);
          ring.setAttribute("r", (6 + u * (i ? 64 : 42)) * S);
          ring.setAttribute("opacity", u > 0 ? (1 - u) * 0.9 : 0);
          ring.setAttribute("stroke-width", ((i ? 5 : 3.5) * (1 - u) + 0.5) * S);
        }, () => ring.remove());
      });
    }
    shakeOutput() {
      const snap = this.snapEls.find((x) => x.k === 15);
      if (snap) { snap.g.classList.remove("is-shaking"); void snap.g.getBBox(); snap.g.classList.add("is-shaking"); }
    }

    // Snapshot boards show the current state: the output when steered or without look-ahead, and
    // the read-outs from layer 11 on without look-ahead.
    drawSnapBoards(done) {
      if (!this.snapEls) return;
      const d = this.data, steered = this.steerActive(), L = this.laActive();
      this.snapEls.forEach((snap) => {
        const changed = done && (snap.k === 15 ? steered || L : L && snap.k >= 12);
        const key = changed ? `${steered}|${L}|${this.steer.concept}|${this.steer.v}` : "base";
        if (snap.key === key) return;
        snap.key = key;
        const list = d.legal.map((u) => ({ uci: u, p: changed ? this.shownValue(u, snap.k) : d.probs[u][snap.k] }))
          .sort((a, b) => b.p - a.p).slice(0, 3);
        const old = snap.boardG.querySelector(".lll-board");
        if (old) old.remove();
        drawBoard(snap.boardG, { fen: d.fen, size: BOARD.size, x: snap.cx - BOARD.size / 2, y: BOARD.y, arrows: arrowsFor(d, list) });
        let title = snap.k === 15 ? "Model output" : layerName(snap.k);
        if (changed && L) title = COMPACT ? "No look-ahead" : snap.k === 15 ? (steered ? "Steered, no look-ahead" : "Output, no look-ahead") : `${title}, no look-ahead`;
        else if (changed) title = COMPACT ? "Output, steered" : "Model output, steered";
        snap.g.querySelector(".lf-board-title").textContent = title;
      });
    }

    updateSteerUI() {
      const ST = window.LLLSteer, st = this.steer, d = this.data;
      this.steerBtn.setAttribute("aria-checked", String(this.steerActive()));
      this.conceptSel.value = st.concept;
      this.sSlider.value = Math.round(st.v / 0.25);
      const raw = ST.raw(st.concept, st.v);
      this.sOut.textContent = `${ST.fmtRaw(raw)}`;
      const S_ = moveLabel(d, d.m_star), iS = d.legal.indexOf(d.m_star);
      this.updateLAUI(S_, iS);
      if (!this.steerActive()) {
        this.stats.innerHTML = "";
        return;
      }
      // minimal: the solution's probability; random directions and the 449-puzzle aggregate are in the explorer
      const s15 = this.steerDist(15);
      const base = d.legal.map((u) => d.probs[u][15]);
      const chips = [`<span class="stat-chip" title="Probability of the solution at the output, without and with steering"><span class="mono">${S_}</span> ${pct1(base[iS])} → <b>${pct1(s15[iS])}</b></span>`];
      this.stats.innerHTML = chips.join("");
    }

    // The look-ahead panel: the solution's probability with and without look-ahead (at the peak
    // if that lies in the changed layers, and at the output), plus the puzzle's note.
    updateLAUI(S_, iS) {
      const d = this.data, L = this.laActive();
      this.laBtn.setAttribute("aria-checked", String(L));
      if (!L) {
        this.laStats.innerHTML = "";
        return;
      }
      const chips = [];
      const pk = this.peakK;
      if (pk >= 12 && pk <= 14) {
        chips.push(`<span class="stat-chip" title="Probability of the solution at the read-out where it peaks, with and without look-ahead"><span class="mono">${S_}</span> at ${layerName(pk).toLowerCase()}: ${pct1(d.probs[d.m_star][pk])} → <b>${pct1(d.lookahead.unsteered[String(pk)][iS])}</b></span>`);
      }
      const a = this.finalDist(true)[iS], b = this.finalDist()[iS];
      chips.push(`<span class="stat-chip" title="Probability of the solution at the output, with and without look-ahead${this.steerActive() ? " (both steered as above)" : ""}">${pk >= 12 && pk <= 14 ? "output" : `<span class="mono">${S_}</span>`}: ${pct1(a)} → <b>${pct1(b)}</b></span>`);
      if (this.laNote) chips.push(`<span class="stat-chip stat-chip--note">${this.laNote}</span>`);
      this.laStats.innerHTML = chips.join("");
    }

    // p in [0,1]: marker line (0–0.3), connector (0.3–0.75), board fade (0.75–1)
    setSnap(s, p) {
      const a = clamp01(p / 0.3), b = clamp01((p - 0.3) / 0.45), c = clamp01((p - 0.75) / 0.25);
      s.vline.setAttribute("y1", CH.yBot - (CH.yBot - CH.yTop) * a);
      s.conn.setAttribute("d", b > 0 ? cubicPath(s.cubic, b) : "");
      s.boardG.setAttribute("opacity", c);
    }

    // The steering pill is drawn inside the scaled chart; give the HTML prompt buttons the same size.
    syncButtonScale() {
      const w = this.svg.getBoundingClientRect().width;
      if (!w) return;
      const k = w / W;
      const st = this.root.style;
      st.setProperty("--cta-font", `${((COMPACT ? 18 : 13) * k).toFixed(2)}px`);
      st.setProperty("--cta-h", `${(28 * S * k).toFixed(2)}px`);
      st.setProperty("--cta-pad", `${(13 * S * k).toFixed(2)}px`);
    }

    // Dot labels to the right of the dots (left near the end), nudged apart if they collide.
    placeLabels(fx, ys) {
      const d = this.data, gap = 18 * S;
      let yS = Math.min(ys[d.m_star], CH.yBot - gap * 0.6), yH = Math.min(ys[d.m_hat], CH.yBot - gap * 0.6);
      if (Math.abs(yS - yH) < gap) {
        const mid = (yS + yH) / 2;
        if (yS <= yH) { yS = mid - gap / 2; yH = mid + gap / 2; } else { yS = mid + gap / 2; yH = mid - gap / 2; }
      }
      // labels sit right of the dot (left of it only at the very end), so they never run into the
      // "very confident" note, which is left of the peak
      const right = fx > CH.x1 - 50 * S;
      [[d.m_star, yS], [d.m_hat, yH]].forEach(([u, y]) => {
        const t = this.dotLabels[u];
        t.setAttribute("x", right ? fx - 11 * S : fx + 11 * S);
        t.setAttribute("text-anchor", right ? "end" : "start");
        t.setAttribute("y", y);
      });
    }

    drawConnectors() {
      const ov = this.overlay;
      ov.innerHTML = "";
      const g = this.connGrow || 0;
      if (!this.data || !(this.valueStage >= 1) || g <= 0) return;
      const stage = this.root.querySelector(".lens-fig__stage");
      if (getComputedStyle(stage).getPropertyValue("--side-by-side").trim() !== "1") return;
      const sr = stage.getBoundingClientRect();
      ov.setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`);
      const ctm = this.svg.getScreenCTM();
      if (!ctm) return;
      const d = this.data;
      [[d.m_star, COL.star], [d.m_hat, COL.hat]].forEach(([u, c]) => {
        const pt = this.svg.createSVGPoint();
        pt.x = xOf(15); pt.y = yOf(this.endValue(u));
        const sp = pt.matrixTransform(ctm);
        const card = this.cardEls[u].querySelector(".lll-board-svg").getBoundingClientRect();
        // the panel may still be sliding in: measure where the board will be once it settles
        const m = new DOMMatrixReadOnly(getComputedStyle(this.valueBox).transform === "none" ? undefined : getComputedStyle(this.valueBox).transform);
        const x0 = sp.x - sr.left + 4, y0 = sp.y - sr.top;
        const x1 = card.left - m.m41 - sr.left - 6, y1 = card.top - m.m42 - sr.top + card.height / 2;
        const dx = Math.max(30, (x1 - x0) * 0.5);
        el("path", { d: cubicPath([[x0, y0], [x0 + dx, y0], [x1 - dx, y1], [x1, y1]], g), stroke: c, class: "lf-vconn" }, ov);
        if (g >= 0.98) el("path", { d: `M${x1 - 9},${y1 - 6} L${x1},${y1} L${x1 - 9},${y1 + 6}`, stroke: c, class: "lf-vconn-head" }, ov);
      });
    }

    onHover(e) {
      if (!this.data) return;
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
      const k = Math.round(((p.x - CH.x0) / (CH.x1 - CH.x0)) * 15);
      if (k < 0 || k > 15 || k > this.front + 0.01) return this.hideTip();
      this.hoverLine.setAttribute("x1", xOf(k));
      this.hoverLine.setAttribute("x2", xOf(k));
      this.hover.classList.add("is-visible");
      const d = this.data;
      // values as drawn (steered output, read-outs without look-ahead)
      const all = d.legal.map((u) => ({ uci: u, p: this.shownValue(u, k) })).sort((a, b) => b.p - a.p);
      const list = all.slice(0, 5);
      [d.m_star, d.m_hat].forEach((u) => { if (!list.some((m) => m.uci === u)) list.push(all.find((m) => m.uci === u)); });
      const tags = [];
      if (k === 15 && this.steerActive()) tags.push("steered");
      if (k >= 12 && this.laActive()) tags.push("no look-ahead");
      this.tip.innerHTML = `<div class="tip__head">${layerName(k)}${tags.length ? ` · ${tags.join(", ")}` : ""}</div>` + list.map((m) =>
        `<div class="tip__row"><span class="tip__key" style="background:${moveColor(d, m.uci)}"></span><span class="mono">${moveLabel(d, m.uci)}</span><span class="tip__val mono">${pct1(m.p)}</span></div>`).join("");
      const box = this.svg.getBoundingClientRect();
      const host = this.root.querySelector(".lens-fig__main").getBoundingClientRect();
      const sx = box.left - host.left + (xOf(k) / W) * box.width;
      const sy = box.top - host.top + (CH.yTop / H) * box.height;
      this.tip.style.left = `${sx}px`;
      this.tip.style.top = `${sy}px`;
      this.tip.classList.toggle("is-left", sx > box.width * 0.62);
      this.tip.classList.add("is-visible");
    }
    hideTip() {
      this.tip.classList.remove("is-visible");
      this.hover.classList.remove("is-visible");
    }

    pause() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this.timers) this.timers.forEach(clearTimeout);
      this.timers = [];
      this.root.classList.remove("is-playing");
    }

    play(restart) {
      this.pause();
      if (reduceMotion) return this.setFront(15, { showValue: true });
      if (restart || this.front >= 15) this.setFront(0, { showValue: false });
      this.root.classList.add("is-playing");
      // Timeline from the current front: steady growth to layer 12 (K=13), a short hold,
      // then the last two layers slowly (eased), where the override happens.
      const f0 = this.front, SLOW = 13, PER_LAYER = 330, HOLD = 650, FINAL = 2600;
      const segs = [];
      if (f0 < SLOW) segs.push({ a: f0, b: SLOW, dur: (SLOW - f0) * PER_LAYER, fn: (t) => t });
      if (f0 <= SLOW) segs.push({ a: SLOW, b: SLOW, dur: HOLD, fn: (t) => t });
      const a = Math.max(SLOW, f0);
      segs.push({ a, b: 15, dur: (FINAL * (15 - a)) / (15 - SLOW), fn: ease });
      let si = 0, segStart = null;
      const tick = (now) => {
        if (segStart == null) segStart = now;
        const s = segs[si];
        const t = s.dur > 0 ? Math.min(1, (now - segStart) / s.dur) : 1;
        this.setFront(s.a + (s.b - s.a) * s.fn(t), { showValue: false, animate: true });
        if (t >= 1) {
          si += 1;
          segStart = now;
          if (si >= segs.length) {
            this.raf = null;
            this.root.classList.remove("is-playing");
            this.timers = [
              setTimeout(() => this.annOverride.classList.add("is-visible"), 450),
              setTimeout(() => this.setFront(15, { showValue: true, keepAnnotations: true }), 1600),
            ];
            return;
          }
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    autoplayWhenVisible() {
      if (reduceMotion) return this.setFront(15, { showValue: true });
      const io = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          io.disconnect();
          setTimeout(() => this.play(true), 450);
        }
      }, { threshold: 0.35 });
      io.observe(this.root);
    }
  }

  window.LensFigure = LensFigure;
})();
