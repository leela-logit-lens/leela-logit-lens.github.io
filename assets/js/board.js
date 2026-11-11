/* Chessboard rendering in SVG, styled after the paper's figures (leela-interp boards,
   python-chess / cburnett pieces). No dependencies. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const FILES = "abcdefgh";
  const COLORS = {
    light: "#f5f5f5",
    dark: "#cfcfcf",
    lightLast: "#cfcfff",
    darkLast: "#a0a0ff",
    border: "#262626",
    coord: "#e6e6e6",
  };

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Piece glyphs are defined once per page and referenced with <use>.
  let defsReady = null;
  function ensurePieces() {
    if (defsReady) return defsReady;
    const pieces = window.LLL_PIECES;
    const holder = el("svg", { width: 0, height: 0, "aria-hidden": "true" });
    holder.style.position = "absolute";
    const defs = el("defs", {}, holder);
    for (const sym in pieces) {
      const g = el("g", { id: "lll-piece-" + (sym === sym.toUpperCase() ? "w" : "b") + sym.toLowerCase() }, defs);
      g.innerHTML = pieces[sym].replace(/\sid="[^"]*"/, "");
    }
    document.body.appendChild(holder);
    defsReady = true;
    return defsReady;
  }

  function parseFen(fen) {
    const rows = fen.split(" ")[0].split("/");
    const out = [];
    rows.forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += +ch;
        else {
          out.push({ piece: ch, file: f, rank: 7 - r });
          f += 1;
        }
      }
    });
    return out;
  }

  const sqIndex = (sq) => ({ file: FILES.indexOf(sq[0]), rank: +sq[1] - 1 });

  /**
   * Draw a board into `parent` (an SVG element or <g>).
   * opts: {fen, size, x, y, arrows: [{uci, color, opacity, width}], highlight: [sq], coords, flipped, title}
   * Returns the <g> containing the board.
   */
  function drawBoard(parent, opts) {
    ensurePieces();
    const size = opts.size || 240;
    const border = opts.coords === false ? 0 : size * 0.045;
    const inner = size - 2 * border;
    const sq = inner / 8;
    const flipped = !!opts.flipped;
    const g = el("g", { class: "lll-board", transform: `translate(${opts.x || 0},${opts.y || 0})`, "data-sq": sq, "data-border": border, "data-flipped": flipped ? 1 : 0 }, parent);

    const pos = (file, rank) => ({
      x: border + (flipped ? 7 - file : file) * sq,
      y: border + (flipped ? rank : 7 - rank) * sq,
    });

    if (border) el("rect", { width: size, height: size, fill: COLORS.border, rx: size * 0.006 }, g);
    const hl = new Set(opts.highlight || []);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = pos(f, r);
        const isLight = (f + r) % 2 === 1;
        const name = FILES[f] + (r + 1);
        const fill = hl.has(name) ? (isLight ? COLORS.lightLast : COLORS.darkLast) : isLight ? COLORS.light : COLORS.dark;
        el("rect", { x: p.x, y: p.y, width: sq + 0.3, height: sq + 0.3, fill }, g);
      }
    }
    if (border) {
      const fs = border * 0.62;
      for (let i = 0; i < 8; i++) {
        const fileLabel = FILES[flipped ? 7 - i : i];
        const rankLabel = String(flipped ? i + 1 : 8 - i);
        for (const yy of [border * 0.5, size - border * 0.5]) {
          const t = el("text", { x: border + (i + 0.5) * sq, y: yy, "font-size": fs, fill: COLORS.coord, "text-anchor": "middle", "dominant-baseline": "central", class: "lll-coord" }, g);
          t.textContent = fileLabel;
        }
        for (const xx of [border * 0.5, size - border * 0.5]) {
          const t = el("text", { x: xx, y: border + (i + 0.5) * sq, "font-size": fs, fill: COLORS.coord, "text-anchor": "middle", "dominant-baseline": "central", class: "lll-coord" }, g);
          t.textContent = rankLabel;
        }
      }
    }
    const scale = sq / 45;
    for (const p of parseFen(opts.fen)) {
      const xy = pos(p.file, p.rank);
      const id = "#lll-piece-" + (p.piece === p.piece.toUpperCase() ? "w" : "b") + p.piece.toLowerCase();
      // squares and coordinates on the piece, so a move can be animated (see animateMove)
      el("use", { href: id, transform: `translate(${xy.x},${xy.y}) scale(${scale})`, "data-sq": FILES[p.file] + (p.rank + 1), "data-x": xy.x, "data-y": xy.y, "data-s": scale }, g);
    }
    const arrowLayer = el("g", { class: "lll-arrows" }, g);
    (opts.arrows || []).forEach((a) => drawArrow(arrowLayer, a, pos, sq));
    return g;
  }

  function drawArrow(parent, a, pos, sq) {
    const from = sqIndex(a.uci.slice(0, 2));
    const to = sqIndex(a.uci.slice(2, 4));
    const p0 = pos(from.file, from.rank);
    const p1 = pos(to.file, to.rank);
    const x0 = p0.x + sq / 2, y0 = p0.y + sq / 2, x1 = p1.x + sq / 2, y1 = p1.y + sq / 2;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (!len) return;
    const ux = dx / len, uy = dy / len;
    const w = (a.width || 0.17) * sq;
    const head = w * 2.4;
    const tipX = x1 - ux * sq * 0.12, tipY = y1 - uy * sq * 0.12;
    const baseX = tipX - ux * head, baseY = tipY - uy * head;
    const g = el("g", { opacity: a.opacity == null ? 0.85 : a.opacity, class: "lll-arrow" }, parent);
    el("line", { x1: x0, y1: y0, x2: baseX, y2: baseY, stroke: a.color, "stroke-width": w, "stroke-linecap": "butt" }, g);
    const nx = -uy, ny = ux;
    el("polygon", {
      points: `${tipX},${tipY} ${baseX + nx * head * 0.62},${baseY + ny * head * 0.62} ${baseX - nx * head * 0.62},${baseY - ny * head * 0.62}`,
      fill: a.color,
    }, g);
  }

  function boardSvg(opts) {
    const size = opts.size || 240;
    const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, class: "lll-board-svg", role: "img" });
    if (opts.label) svg.setAttribute("aria-label", opts.label);
    drawBoard(svg, Object.assign({}, opts, { x: 0, y: 0 }));
    return svg;
  }

  function animateMove(svg, uci, dur, done) {
    const g = svg && svg.querySelector(".lll-board");
    const from = uci.slice(0, 2), to = uci.slice(2, 4);
    const piece = g && g.querySelector(`use[data-sq="${from}"]`), victim = g && g.querySelector(`use[data-sq="${to}"]`);
    if (!piece || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return done && done();
    const sq = +g.dataset.sq, border = +g.dataset.border, flipped = g.dataset.flipped === "1";
    const t = sqIndex(to);
    const x0 = +piece.dataset.x, y0 = +piece.dataset.y, s = piece.dataset.s;
    const x1 = border + (flipped ? 7 - t.file : t.file) * sq, y1 = border + (flipped ? t.rank : 7 - t.rank) * sq;
    g.insertBefore(piece, g.querySelector(".lll-arrows")); // above the other pieces
    const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur), e = ease(u);
      piece.setAttribute("transform", `translate(${x0 + (x1 - x0) * e},${y0 + (y1 - y0) * e}) scale(${s})`);
      if (victim) victim.setAttribute("opacity", String(1 - Math.max(0, (u - 0.5) / 0.5)));
      if (u < 1) requestAnimationFrame(step);
      else if (done) done();
    };
    requestAnimationFrame(step);
  }

  // A chart's hover tip. With a mouse it follows the pointer. With touch, a tap or a sideways slide shows it and it
  // stays until the next tap elsewhere: pointerleave fires as the finger lifts, so it cannot close the tip there.
  let openTip = null;
  document.addEventListener("pointerdown", (e) => {
    if (openTip && !e.target.closest(".lf-hit")) { openTip(); openTip = null; }
  });
  function hoverTip(hit, show, hide) {
    const on = (e) => { openTip = hide; show(e); };
    ["pointerenter", "pointermove", "pointerdown"].forEach((type) => hit.addEventListener(type, on));
    hit.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hide(); });
    hit.addEventListener("pointercancel", hide);
  }

  // Moves in figurine notation, as in the paper (skak): the piece letter becomes ♔♕♖♗♘, which the page shows in its
  // bundled figurine font (assets/css/fonts.css). FIGURINES = false goes back to letters. Screen-reader labels keep letters.
  const FIGURINES = true;
  const FIG = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
  const figSan = (san) => (FIGURINES ? san.replace(/^[KQRBN]/, (p) => FIG[p]).replace(/=([QRBN])/, (m, p) => "=" + FIG[p]) : san);

  window.LLLBoard = { drawBoard, boardSvg, animateMove, hoverTip, el, NS, figSan };
})();
