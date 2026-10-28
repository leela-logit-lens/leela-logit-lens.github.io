/* Animated version of the paper's Figure 2, drawn like the paper: a stylized network of eight
   columns (five boxes each), the logit-lens read-outs after the input encoding and layers 4, 9
   and 12, and the model output. The network is revealed by a sweep at a constant pace; when the
   sweep passes a read-out column, the lens arrow grows to that layer's board with its top three
   moves (without pausing the sweep). */
(function () {
  const { el, drawBoard } = window.LLLBoard;
  const RANK = ["#d63031", "#00b894", "#0984e3"]; // paper: 1st, 2nd, 3rd best move
  const SOLUTION = "#6b737b";
  const PER_COL = 650; // ms per column of the sweep (it pauses at each read-out while its board builds)
  // build timings of a read-out, in seconds after it turns on (CSS: fade .4s, draw .45s, grow .55s)
  const T = { board: 0.4, brace: 0.4, bars: 0.45, row: 0.08, label: 0.05, bar: 0.25, val: 0.8, dots: 1.0, note: 1.05, fade: 0.4 };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FIG = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
  const figurine = (san) => (FIG[san[0]] ? FIG[san[0]] + san.slice(1) : san); // tooltips (HTML)
  const pct1 = (p) => (p * 100).toFixed(1) + "%";
  const N_COLS = 8;
  // Read-out columns of the stylized network → lens index K (0 = input encoding, K = after layer K-1).
  const PANELS = [
    // note: what the read-out's top move is; it points at the moving piece (input) or the target square
    { col: 0, k: 0, name: "Input encoding", note: "Piece prior: queen moves", at: "from" },
    { col: 2, k: 5, name: "Layer 4", note: "Greedy captures", at: "to3" }, // all three top moves capture
    { col: 4, k: 10, name: "Layer 9", note: "Forcing check", at: "to" },
    { col: 6, k: 13, name: "Layer 12", note: "Rook lift", at: "to" },
  ];
  const INPUT_TOKENS = [null, "br", "wn", "", "wr"]; // the input column shows square tokens with pieces

  function layout(compact) {
    if (!compact) {
      const L = { W: 1640, H: 606, S: 1, compact };
      L.input = { x: 60, y: 58, size: 222 };
      L.output = { x: 918, y: 58, size: 222 };
      L.cols = Array.from({ length: N_COLS }, (_, i) => 332 + i * 77.5);
      L.box = 24;
      L.boxY = [72, 120, 168, 216, 264];
      L.colTop = 58; L.colBot = 280;
      L.braceIn = { x: 300, dir: "left" };
      L.braceOut = { x: 897, dir: "right" };
      // (move labels sit well clear of the brace tip, so piece icons never touch it)
      L.outBars = { brace: 1150, labelX: 1238, axisX: 1248, rows: [121, 167, 211], dotsY: 262, barMax: 70 };
      L.outNote = { tx: 1166, ty: 44, rot: -1.5, sx: 1160, sy: 62, bend: 0.22 }; // top right of the output, left of the legend
      L.legend = { x: 1388, y: 66, w: 244, rowH: 40 };
      const xs = [62, 440, 828, 1226], f = [0.9, 0.62, 0.33, 0.06];
      L.panels = PANELS.map((p, i) => {
        const x = xs[i], y = 362, size = 190, left = f[i] >= 0.5; // title on the side the lens arrow does not land on
        // hand-placed note (as if annotated by hand): text position and tilt, arrow start and bend
        const hand = [
          { tx: x - 22, ty: y + size + 40, rot: -1.5, sx: x + 36, sy: y + size + 14, bend: 0.3 },
          { tx: x + 56, ty: y + size + 36, rot: 1.5, sx: x + 112, sy: y + size + 14, bend: 0.22 }, // fan to three captures
          { tx: x + size + 14, ty: y + size + 30, rot: -2, sx: x + size + 8, sy: y + size + 16, bend: 0.35 },
          { tx: x + size + 30, ty: y + 24, rot: -2.5, sx: x + size + 24, sy: y + 14, bend: -0.4 },
        ][i];
        return { ...p, x, y, size, hand, arrowTo: x + size * f[i], brace: x + size + 8,
          bars: { labelX: x + size + 94, axisX: x + size + 104, rows: [y + 55, y + 97, y + 139], dotsY: y + 182, barMax: 64 },
          title: { x: left ? x : x + size, y: y - 12, anchor: left ? "start" : "end" },
          noteAt: null };
      });
      return L;
    }
    // Phones: input and output boards side by side, legend and output bars below them,
    // the network, then the four read-outs stacked (marked in the lens colour instead of arrows).
    const L = { W: 640, H: 0, S: 1.4, compact };
    L.input = { x: 20, y: 52, size: 290 };
    L.output = { x: 330, y: 52, size: 290 };
    L.outBars = { labelX: 440, axisX: 452, rows: [384, 428, 472], dotsY: 518, barMax: 92 };
    L.outNote = { x: 452, y: 556, anchor: "start" };
    L.legend = { x: 20, y: 370, w: 290, rowH: 38 };
    L.cols = Array.from({ length: N_COLS }, (_, i) => 52 + i * 76.5);
    L.box = 30;
    L.boxY = [652, 700, 748, 796, 844];
    L.colTop = 632; L.colBot = 864;
    L.netTitleY = 612;
    L.panels = PANELS.map((p, i) => {
      const x = 24, y = 950 + i * 300, size = 250;
      return { ...p, x, y, size, side: true,
        bars: { labelX: x + size + 132, axisX: x + size + 144, rows: [y + 118, y + 162, y + 206], dotsY: y + 248, barMax: 92 },
        title: { x: x + size + 26, y: y + 26, anchor: "start" },
        noteAt: { x: x + size + 26, y: y + 64, anchor: "start" } };
    });
    L.H = 950 + 4 * 300 - 10;
    return L;
  }

  // Curly brace between y0 and y1 at x; "right" points its tip to the right.
  function brace(parent, x, y0, y1, dir, cls) {
    const d = dir === "right" ? 1 : -1, w = 9 * d, ym = (y0 + y1) / 2, r = 9;
    const path = `M${x},${y0} q${w},0 ${w},${r} L${x + w},${ym - r} q0,${r} ${w},${r} q${-w},0 ${-w},${r} L${x + w},${y1 - r} q0,${r} ${-w},${r}`;
    return el("path", { d: path, class: cls || "nf-brace" }, parent);
  }

  class NetworkFigure {
    constructor(root) {
      this.root = root;
      this.front = -1;
      this.timers = [];
      this.root.classList.add("net-fig");
      this.root.innerHTML = `
        <div class="net-fig__main">
          <svg class="net-fig__svg" role="img"></svg>
          <div class="lens-fig__tip net-fig__tip" role="status" aria-live="polite"></div>
        </div>
        <div class="lens-fig__controls">
          <button class="btn btn--icon net-fig__play" type="button" aria-label="Play">
            <svg viewBox="0 0 24 24" width="18" height="18"><path class="i-pause" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="i-play" d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn net-fig__replay" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>
            Replay
          </button>
          <label class="lens-fig__scrub"><span class="sr-only">Step</span>
            <input type="range" min="-1" max="${N_COLS}" step="0.01" value="-1" aria-label="Build the network layer by layer" /></label>
          <output class="lens-fig__layer">Input board</output>
        </div>`;
      this.svg = this.root.querySelector("svg");
      this.tip = this.root.querySelector(".net-fig__tip");
      this.slider = this.root.querySelector("input[type=range]");
      this.out = this.root.querySelector("output");
      this.root.querySelector(".net-fig__replay").addEventListener("click", () => this.play(true));
      this.root.querySelector(".net-fig__play").addEventListener("click", () => (this.playing ? this.stop() : this.play(this.front >= N_COLS)));
      this.slider.addEventListener("input", () => { this.stop(); this.setFront(+this.slider.value, true); });
      window.addEventListener("resize", () => {
        if (this.data && (this.root.getBoundingClientRect().width < 640) !== this.L.compact) { this.draw(); this.setFront(this.front, true); }
      });
    }

    load(data) {
      this.data = data;
      this.draw();
      this.setFront(-1, true);
    }

    topK(k, n) {
      const d = this.data;
      return d.legal.map((u) => ({ uci: u, p: d.probs[u][k] })).sort((a, b) => b.p - a.p).slice(0, n || 3);
    }

    arrows(list) {
      const max = list[0].p, min = list[list.length - 1].p;
      return list.map((m, i) => ({ uci: m.uci, color: RANK[i], opacity: 0.45 + 0.55 * (max > min ? (m.p - min) / (max - min) : 1) }));
    }

    // Staged reveal once the panel turns on: kind "fade" (opacity), "draw" (stroke from start to end)
    // or "grow" (scale from the left), starting t seconds after the panel turns on.
    anim(e, kind, t) {
      e.classList.add("nf-anim", `nf-${kind}`);
      e.style.setProperty("--t", `${t.toFixed(2)}s`);
      if (kind === "draw") e.setAttribute("pathLength", 1);
      return e;
    }

    // Top three moves: from t0 the moves appear (left to right: label, bar growing, then the value).
    bars(parent, list, b, t0) {
      const d = this.data, S = this.L.S;
      const g = el("g", { class: "nf-bars" }, parent);
      const h = 26 * (this.L.compact ? 1.2 : 1);
      this.anim(el("line", { x1: b.axisX, x2: b.axisX, y1: b.rows[0] - h * 0.95, y2: b.rows[2] + h * 0.95, class: "nf-bar-axis" }, g), "draw", t0);
      list.forEach((m, i) => {
        const y = b.rows[i], san = d.san[m.uci], piece = "KQRBN".includes(san[0]) ? san[0] : null, dt = i * T.row;
        const lab = this.anim(el("g", {}, g), "fade", t0 + T.label + dt);
        const t = el("text", { x: b.labelX, y, class: "nf-move", "text-anchor": "end", "dominant-baseline": "central" }, lab);
        t.textContent = piece ? san.slice(1) : san;
        if (piece) {
          const ps = 24 * S, tw = t.getComputedTextLength ? t.getComputedTextLength() : san.length * 10 * S;
          el("use", { href: `#lll-piece-w${piece.toLowerCase()}`, transform: `translate(${b.labelX - tw - ps},${y - ps / 2 - 1}) scale(${ps / 45})` }, lab);
        }
        const w = Math.max(3, m.p * b.barMax);
        this.anim(el("path", { d: `M${b.axisX},${y - h / 2} h${w - 5} q5,0 5,5 v${h - 10} q0,5 -5,5 h${-(w - 5)} z`, fill: RANK[i], class: "nf-bar" }, g), "grow", t0 + T.bar + dt);
        this.anim(el("text", { x: b.axisX + w + 6 * S, y, class: "nf-val", "dominant-baseline": "central" }, g), "fade", t0 + T.val + dt).textContent = pct1(m.p);
      });
      this.anim(el("text", { x: b.labelX - 18 * S, y: b.dotsY, class: "nf-dots", "text-anchor": "middle" }, g), "fade", t0 + T.dots).textContent = "⋮";
      return t0 + T.val + (list.length - 1) * T.row + T.fade; // when the last value is fully shown
    }

    draw() {
      const d = this.data, svg = this.svg;
      const L = (this.L = layout(this.root.getBoundingClientRect().width < 640));
      const S = L.S;
      this.root.classList.toggle("is-compact", L.compact);
      svg.setAttribute("viewBox", `0 0 ${L.W} ${L.H}`);
      svg.innerHTML = "";
      svg.setAttribute("aria-label", `Leela's policy read out after the input encoding and layers 4, 9 and 12 for puzzle ${d.id}: ` +
        PANELS.map((p) => `${p.name} prefers ${d.san[this.topK(p.k, 1)[0].uci]}`).join(", ") +
        `; the full network plays ${d.san[this.topK(15, 1)[0].uci]}.`);
      // The sweep: a mask with a soft left-to-right edge that reveals the network at a constant pace
      const defs = el("defs", {}, svg);
      this.sweepGrad = el("linearGradient", { id: "nf-sweep-grad", gradientUnits: "userSpaceOnUse", x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      el("stop", { offset: 0, "stop-color": "#fff" }, this.sweepGrad);
      el("stop", { offset: 1, "stop-color": "#000" }, this.sweepGrad);
      const mask = el("mask", { id: "nf-sweep", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: L.W, height: L.H }, defs);
      el("rect", { x: 0, y: 0, width: L.W, height: L.H, fill: "url(#nf-sweep-grad)" }, mask);

      // Input board with the puzzle solution
      el("text", { x: L.input.x + L.input.size / 2, y: L.input.y - 14 * S, class: "nf-title", "text-anchor": "middle" }, svg).textContent = "Input board";
      drawBoard(svg, { fen: d.fen, size: L.input.size, x: L.input.x, y: L.input.y, arrows: [{ uci: d.m_star, color: SOLUTION, opacity: 0.9 }] });
      if (L.braceIn) brace(svg, L.braceIn.x, L.colTop, L.colBot, "left");

      // Stylized network: eight columns of five boxes with dots in between
      const net = el("g", { class: "nf-net", mask: "url(#nf-sweep)" }, svg);
      const B = L.box, lensCol = new Map(PANELS.map((p) => [p.col, p]));
      this.colEls = L.cols.map((cx, i) => {
        const g = el("g", { class: "nf-col" }, net);
        if (i > 0) {
          const links = el("g", { class: "nf-links" }, g);
          L.boxY.forEach((y0) => L.boxY.forEach((y1) => el("line", { x1: L.cols[i - 1] + B / 2, y1: y0, x2: cx - B / 2, y2: y1 }, links)));
        }
        L.boxY.forEach((y, j) => {
          if (j > 0) el("text", { x: cx, y: (y + L.boxY[j - 1]) / 2 + 1, class: "nf-dots nf-dots--sm", "text-anchor": "middle", "dominant-baseline": "central" }, g).textContent = "⋮";
          const token = i === 0 ? INPUT_TOKENS[j] : undefined;
          el("rect", { x: cx - B / 2, y: y - B / 2, width: B, height: B, rx: 4, class: token === null ? "nf-box nf-box--dark" : "nf-box" }, g);
          if (token) el("use", { href: `#lll-piece-${token}`, transform: `translate(${cx - B / 2 + 1},${y - B / 2 + 1}) scale(${(B - 2) / 45})` }, g);
        });
        if (lensCol.has(i)) {
          el("rect", { x: cx - B / 2 - 7, y: L.colTop, width: B + 14, height: L.colBot - L.colTop, rx: 6, class: "nf-lensbox" }, g);
          if (L.compact) el("text", { x: cx, y: L.colBot + 30, class: "nf-lenslabel", "text-anchor": "middle" }, g).textContent = lensCol.get(i).name.replace("Input encoding", "Input");
          const hit = el("rect", { x: cx - 30, y: L.colTop - 10, width: 60, height: L.colBot - L.colTop + 20, class: "lf-hit" }, g);
          hit.addEventListener("pointerenter", () => this.hoverCol(lensCol.get(i), cx));
          hit.addEventListener("pointerleave", () => this.tip.classList.remove("is-visible"));
        }
        return g;
      });
      if (L.compact) el("text", { x: L.W / 2, y: L.netTitleY, class: "nf-title nf-title--lens", "text-anchor": "middle" }, svg).textContent = "Logit lens read-outs";

      // Output: brace, board, top three moves
      // (staged like a read-out: brace from the network, board, brace, moves, note)
      this.outG = el("g", { class: "nf-output" }, svg);
      let t = 0;
      if (L.braceOut) { this.anim(brace(this.outG, L.braceOut.x, L.colTop, L.colBot, "right"), "draw", 0); t = T.brace; }
      const ob = this.anim(el("g", {}, this.outG), "fade", t);
      el("text", { x: L.output.x + L.output.size / 2, y: L.output.y - 14 * S, class: "nf-title", "text-anchor": "middle" }, ob).textContent = "Model output";
      const outTop = this.topK(15, 3);
      drawBoard(ob, { fen: d.fen, size: L.output.size, x: L.output.x, y: L.output.y, arrows: this.arrows(outTop) });
      t += T.board;
      if (L.outBars.brace) { this.anim(brace(this.outG, L.outBars.brace, L.output.y, L.output.y + L.output.size, "right"), "draw", t); t += T.bars; }
      this.bars(this.outG, outTop, L.outBars, t);
      const mate = (d.themes.find((t) => /^mateIn\d$/.test(t)) || "").replace("mateIn", "");
      const outLines = ["Solution found:", mate ? `mate in ${mate}!` : ""];
      const tOut = t + T.val + 2 * T.row + 0.2;
      if (L.compact) this.anim(this.note(this.outG, outLines, L.outNote), "fade", tOut);
      else this.annotate(this.outG, L.output, [outTop[0].uci.slice(2, 4)], outLines, L.outNote, tOut);

      // Legend, as in the paper
      this.legend(svg, L.legend);

      // Read-out panels
      this.panelEls = L.panels.map((p) => {
        const g = el("g", { class: "nf-panel" }, svg);
        const top = this.topK(p.k, 3);
        let arrow = null;
        if (p.arrowTo != null) {
          const x0 = L.cols[p.col], y0 = L.colBot + 3, x1 = p.arrowTo, y1 = p.y - 6;
          arrow = el("path", { d: `M${x0},${y0} C${x0},${y0 + 44} ${x1},${y1 - 50} ${x1},${y1 - 6}`, class: "nf-lens-arrow" }, g);
          el("path", { d: `M${x1 - 6.5},${y1 - 9} L${x1},${y1 + 2} L${x1 + 6.5},${y1 - 9} z`, class: "nf-lens-head" }, g);
        }
        // the board fades in as the lens arrow arrives, then its brace is drawn top to bottom, then the moves
        const body = el("g", { class: "nf-panel__body" }, g);
        let t = arrow ? T.board : 0.05;
        const bg = this.anim(el("g", {}, body), "fade", t);
        if (p.side) el("rect", { x: p.x - 16, y: p.y, width: 6, height: p.size, rx: 3, class: "nf-lens-fill" }, bg);
        drawBoard(bg, { fen: d.fen, size: p.size, x: p.x, y: p.y, arrows: this.arrows(top) });
        el("text", { x: p.title.x, y: p.title.y, class: "nf-title", "text-anchor": p.title.anchor }, bg).textContent = p.name;
        t += T.brace;
        if (p.brace) { this.anim(brace(body, p.brace, p.y, p.y + p.size, "right"), "draw", t); t += T.bars; }
        this.bars(body, top, p.bars, t);
        // the note on what the top move is, with an arrow onto the board; the sweep waits for it
        const tNote = t + T.val + 2 * T.row + 0.2;
        const sq = p.at === "from" ? [top[0].uci.slice(0, 2)] : p.at === "to3" ? top.map((m) => m.uci.slice(2, 4)) : [top[0].uci.slice(2, 4)];
        const ready = L.compact
          ? (this.anim(this.note(body, [p.note], p.noteAt), "fade", tNote), tNote + T.fade)
          : this.annotate(body, p, sq, [p.note], p.hand, tNote);
        return { col: p.col, g, arrow, ready };
      });
    }

    legend(parent, Lg) {
      const S = this.L.S, g = el("g", { class: "nf-legend" }, parent);
      const items = [[RANK[0], "1st best move"], [RANK[1], "2nd best move"], [RANK[2], "3rd best move"], [SOLUTION, "Puzzle solution"], [null, "Logit lens mapping", true]];
      const h = items.length * Lg.rowH + 18;
      el("rect", { x: Lg.x, y: Lg.y, width: Lg.w, height: h, rx: 6, class: "nf-legend__box" }, g);
      items.forEach(([c, t, curved], i) => {
        const y = Lg.y + 28 + i * Lg.rowH, x = Lg.x + 16;
        if (curved) {
          // like the lens arrows: a curve down from the network, head pointing down
          el("path", { d: `M${x + 2},${y - 13} C${x + 2},${y - 2} ${x + 15},${y - 6} ${x + 15},${y + 4}`, class: "nf-lens-arrow nf-lens-arrow--legend" }, g);
          el("path", { d: `M${x + 9.5},${y + 3} L${x + 15},${y + 13} L${x + 20.5},${y + 3} z`, class: "nf-lens-head nf-lens-head--legend" }, g);
        }
        else {
          el("line", { x1: x, y1: y + 10, x2: x + 12, y2: y - 6, stroke: c, "stroke-width": 4.5 * Math.min(S, 1.2), "stroke-linecap": "butt" }, g);
          el("path", { d: `M${x + 6},${y - 9} L${x + 19},${y - 15} L${x + 16},${y - 1} z`, fill: c }, g);
        }
        el("text", { x: x + 36, y, class: "nf-legend__text", "dominant-baseline": "central" }, g).textContent = t;
      });
    }

    note(parent, lines, at) {
      const g = el("g", { class: "nf-note" }, parent);
      const t = el("text", { x: at.x, y: at.y, class: "nf-note__text", "text-anchor": at.anchor }, g);
      t.innerHTML = lines.filter(Boolean).map((l, i) => `<tspan x="${at.x}" dy="${i ? "1.2em" : 0}">${l}</tspan>`).join("");
      return g;
    }

    // A hand-drawn note: slightly tilted italic and a curved pen arrow that stops at the edge of the
    // square (on the side facing the note), so it does not cover the piece or the move arrows.
    // h = {tx, ty, rot, sx, sy, bend}: text position and tilt, arrow start, bend (fraction of its length).
    // Returns when it is fully shown (seconds after the panel turns on).
    annotate(parent, b, squares, lines, h, t) {
      const border = b.size * 0.045, sq = (b.size - 2 * border) / 8;
      const g = el("g", { class: "nf-ann" }, parent);
      const text = el("text", { x: h.tx, y: h.ty, class: "nf-ann__text", transform: `rotate(${h.rot} ${h.tx} ${h.ty})` }, g);
      text.innerHTML = lines.filter(Boolean).map((l, i) => `<tspan x="${h.tx}" dy="${i ? "1.0em" : 0}">${l}</tspan>`).join("");
      this.anim(text, "fade", t);
      // one arrow per square, fanning out from the same start (several targets: bends spread out)
      squares.forEach((square, j) => {
        const file = "abcdefgh".indexOf(square[0]), rank = +square[1];
        const cx = b.x + border + (file + 0.5) * sq, cy = b.y + border + (8 - rank + 0.5) * sq;
        // a fan bends each arrow outward, to the side of its target
        const bend = squares.length > 1 ? (Math.abs(cx - h.sx) < 18 ? 0 : (cx < h.sx ? -1 : 1) * Math.abs(h.bend)) : h.bend;
        const tj = t + 0.15 + j * 0.12;
        const dl = Math.hypot(h.sx - cx, h.sy - cy);
        const ex = cx + ((h.sx - cx) / dl) * sq * 0.45, ey = cy + ((h.sy - cy) / dl) * sq * 0.45;
        const len = Math.hypot(ex - h.sx, ey - h.sy), nx = -(ey - h.sy) / len, ny = (ex - h.sx) / len;
        const qx = (h.sx + ex) / 2 + nx * bend * len, qy = (h.sy + ey) / 2 + ny * bend * len;
        const d = `M${h.sx},${h.sy} Q${qx},${qy} ${ex},${ey}`;
        // open arrowhead along the end tangent
        const ul = Math.hypot(ex - qx, ey - qy), ax = (ex - qx) / ul, ay = (ey - qy) / ul, hl = 13, an = 0.5;
        const wing = (s_) => [ex - hl * (ax * Math.cos(s_ * an) - ay * Math.sin(s_ * an)), ey - hl * (ay * Math.cos(s_ * an) + ax * Math.sin(s_ * an))];
        const [w1, w2] = [wing(1), wing(-1)];
        const head = `M${w1[0]},${w1[1]} L${ex},${ey} L${w2[0]},${w2[1]}`;
        this.anim(el("path", { d, class: "nf-ann__halo" }, g), "draw", tj);
        this.anim(el("path", { d, class: "nf-ann__arrow" }, g), "draw", tj);
        this.anim(el("path", { d: head, class: "nf-ann__halo" }, g), "fade", tj + 0.35);
        this.anim(el("path", { d: head, class: "nf-ann__arrow" }, g), "fade", tj + 0.35);
      });
      return t + 0.5 + (squares.length - 1) * 0.12 + T.fade;
    }

    hoverCol(p, cx) {
      if (p.col > this.front) return;
      const top = this.topK(p.k, 3);
      this.tip.innerHTML = `<div class="tip__head">${p.name}</div>` + top.map((m, i) =>
        `<div class="tip__row"><span class="tip__key" style="background:${RANK[i]}"></span><span class="mono">${figurine(this.data.san[m.uci])}</span><span class="tip__val mono">${pct1(m.p)}</span></div>`).join("");
      const box = this.svg.getBoundingClientRect(), host = this.root.querySelector(".net-fig__main").getBoundingClientRect();
      const sx = box.left - host.left + (cx / this.L.W) * box.width;
      const sy = box.top - host.top + (this.L.colTop / this.L.H) * box.height;
      this.tip.style.left = `${sx}px`;
      this.tip.style.top = `${sy}px`;
      this.tip.classList.toggle("is-left", sx > box.width * 0.6);
      this.tip.classList.add("is-visible");
    }

    // front: continuous position of the sweep in column units, from -1 (nothing) through i (column i
    // fully shown) to N_COLS (model output shown).
    setFront(front, instant) {
      const L = this.L, B = L.box;
      this.front = Math.max(-1, Math.min(N_COLS, front));
      const f = this.front;
      this.root.classList.toggle("is-instant", !!instant);
      // soft edge of the sweep, a little ahead of the column the front has reached
      const edge = (i) => (i < 0 ? L.cols[0] - B / 2 - 16 : L.cols[Math.min(i, N_COLS - 1)] + B / 2 + 16);
      const i0 = Math.floor(f), xf = f >= N_COLS - 1 ? edge(N_COLS - 1) + 60 : edge(i0) + (edge(i0 + 1) - edge(i0)) * (f - i0);
      this.sweepGrad.setAttribute("x1", xf - 50);
      this.sweepGrad.setAttribute("x2", xf);
      this.colEls.forEach((g, i) => g.classList.toggle("is-on", i <= f + 0.001));
      // a read-out board drops in once the sweep has passed its column
      this.panelEls.forEach((p) => p.g.classList.toggle("is-on", f >= p.col + 0.15));
      this.outG.classList.toggle("is-on", f >= N_COLS - 0.001);
      this.slider.value = f;
      const reached = PANELS.filter((p) => p.col <= f + 0.001).pop();
      this.out.textContent = f < 0 ? "Input board" : f >= N_COLS ? "Model output" : reached ? reached.name : "Input board";
      if (instant) void this.svg.getBoundingClientRect();
      this.root.classList.remove("is-instant");
    }

    stop() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.playing = false;
      this.root.classList.remove("is-playing");
    }

    // Constant pace between read-outs; at each read-out the sweep waits until its board, brace, bars
    // and values are shown, then continues. A timer finishes it if frames stop (background tab).
    play(restart) {
      this.stop();
      if (reduceMotion) return this.setFront(N_COLS, true);
      if (restart || this.front >= N_COLS) this.setFront(-1, true);
      this.playing = true;
      this.root.classList.add("is-playing");
      const segs = [];
      let f = this.front;
      this.panelEls.forEach((p) => {
        const on = p.col + 0.15; // where setFront turns the panel on
        if (on <= f + 1e-6) return;
        segs.push({ a: f, b: on, dur: (on - f) * PER_COL });
        segs.push({ a: on, b: on, dur: p.ready * 1000 });
        f = on;
      });
      segs.push({ a: f, b: N_COLS, dur: (N_COLS - f) * PER_COL });
      const total = segs.reduce((x, sg) => x + sg.dur, 0);
      let t0 = null;
      const run = (this.run = (this.run || 0) + 1); // a newer play() ends this one
      const step = (now) => {
        if (!this.playing || this.run !== run) return;
        if (t0 == null) t0 = now;
        let e = now - t0, k = 0;
        while (k < segs.length - 1 && e > segs[k].dur) { e -= segs[k].dur; k += 1; }
        const sg = segs[k], u = sg.dur > 0 ? Math.min(1, e / sg.dur) : 1;
        this.setFront(sg.a + (sg.b - sg.a) * u);
        if (k < segs.length - 1 || u < 1) this.raf = requestAnimationFrame(step);
        else this.stop();
      };
      this.raf = requestAnimationFrame(step);
      this.timers.push(setTimeout(() => { if (this.playing && this.run === run) { this.setFront(N_COLS); this.stop(); } }, total + 1500));
    }

    autoplayWhenVisible() {
      if (reduceMotion) return this.setFront(N_COLS, true);
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); this.play(true); }
      }, { threshold: 0.4 });
      io.observe(this.root);
    }
  }

  window.NetworkFigure = NetworkFigure;
})();
