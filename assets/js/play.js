/* Play against a layer. chess.js keeps the rules, lc0-input.js builds the network input, and the policy server
   (website/space, a Hugging Face Space) returns Leela's policy read out after the chosen layer. The layer plays
   like its Lichess bot: it samples from its policy for the first five moves, then plays its most likely move. */
(function () {
  "use strict";
  const root = document.getElementById("play");
  if (!root) return;

  const API = new URLSearchParams(location.search).get("api") || "https://eliasbela-leela-logit-lens.hf.space";
  const chessUrl = new URL("../vendor/chess.mjs", document.currentScript.src).href;
  const FILES = "abcdefgh";
  const SIZE = 400;
  const { el } = window.LLLBoard;
  const $ = (sel) => root.querySelector(sel);

  const ui = {
    board: $(".play__board"), range: $(".play__range"), name: $(".play__name"), elo: $(".play__elo"),
    status: $(".play__status"), promo: $(".play__promo"), think: $(".play__think"), moves: $(".play__moves"),
    undo: $('[data-act="undo"]'), lichess: $(".play__lichess"),
  };
  const state = { Chess: null, chess: null, hist: null, human: "w", k: +ui.range.value, selected: null, last: null, token: 0, busy: false };

  const label = (k) => window.LLL_BOTS.labels[k];

  // ---- board ----
  function render() {
    const { chess } = state;
    const svg = window.LLLBoard.boardSvg({
      fen: chess.fen(), size: SIZE, flipped: state.human === "b", highlight: state.last ? [state.last.from, state.last.to] : [],
      label: `Chessboard, you play ${state.human === "w" ? "white" : "black"}`,
    });
    const g = svg.querySelector(".lll-board");
    const geo = { sq: +g.dataset.sq, border: +g.dataset.border, flipped: state.human === "b" };
    const at = (s) => {
      const f = FILES.indexOf(s[0]), r = +s[1] - 1;
      return { x: geo.border + (geo.flipped ? 7 - f : f) * geo.sq, y: geo.border + (geo.flipped ? r : 7 - r) * geo.sq };
    };
    const overlay = el("g", { class: "play__overlay" });
    g.insertBefore(overlay, g.querySelector("use"));
    if (chess.inCheck()) {
      const king = chess.board().flat().find((p) => p && p.type === "k" && p.color === chess.turn());
      if (king) el("rect", { ...at(king.square), width: geo.sq, height: geo.sq, class: "play__check" }, overlay);
    }
    if (state.selected) {
      el("rect", { ...at(state.selected), width: geo.sq, height: geo.sq, class: "play__sel" }, overlay);
      const targets = g.appendChild(el("g", { class: "play__targets" }));
      for (const m of chess.moves({ square: state.selected, verbose: true })) {
        const p = at(m.to);
        const capture = m.flags.includes("c") || m.flags.includes("e");
        el("circle", { cx: p.x + geo.sq / 2, cy: p.y + geo.sq / 2, r: geo.sq * (capture ? 0.44 : 0.15), class: capture ? "play__hit" : "play__dot" }, targets);
      }
    }
    svg.addEventListener("pointerdown", (e) => pointerDown(e, svg, geo));
    ui.board.replaceChildren(svg);
    renderMoves();
  }

  function renderMoves() {
    const san = state.chess.history();
    const items = [];
    for (let i = 0; i < san.length; i += 2) items.push(`<li>${san[i]}${san[i + 1] ? " " + san[i + 1] : ""}</li>`);
    ui.moves.innerHTML = items.join("");
    ui.moves.scrollTop = ui.moves.scrollHeight;
    ui.undo.disabled = !humanMoves();
    ui.lichess.href = "https://lichess.org/analysis/pgn/" + encodeURIComponent(state.chess.pgn() || "");
    ui.lichess.hidden = !san.length;
  }

  // ---- the human's moves: drag a piece, or click it and then its target square ----
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function squareAt(svg, geo, e) {
    const p = svgPoint(svg, e);
    const col = Math.floor((p.x - geo.border) / geo.sq), row = Math.floor((p.y - geo.border) / geo.sq);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return FILES[geo.flipped ? 7 - col : col] + (geo.flipped ? row + 1 : 8 - row);
  }

  function pointerDown(e, svg, geo) {
    const { chess } = state;
    if (e.button !== 0 || state.busy || chess.isGameOver() || chess.turn() !== state.human) return;
    const s = squareAt(svg, geo, e);
    if (!s) return;
    e.preventDefault();
    ui.promo.hidden = true;
    if (state.selected && tryMove(state.selected, s)) return;
    const piece = chess.get(s);
    if (!piece || piece.color !== state.human) {
      state.selected = null;
      return render();
    }
    const wasSelected = state.selected === s;
    state.selected = s;
    render();
    drag(e, s, wasSelected);
  }

  function tryMove(from, to) {
    const options = state.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) return false;
    state.selected = null;
    if (options.some((m) => m.promotion)) choosePromotion(from, to);
    else play({ from, to });
    return true;
  }

  // The piece on `from` follows the pointer until it is released; a press without movement counts as a click.
  function drag(down, from, wasSelected) {
    const svg = ui.board.querySelector("svg"), g = svg.querySelector(".lll-board");
    const geo = { sq: +g.dataset.sq, border: +g.dataset.border, flipped: g.dataset.flipped === "1" };
    const piece = g.querySelector(`use[data-sq="${from}"]`);
    let moved = false;
    const move = (e) => {
      if (e.pointerId !== down.pointerId) return;
      if (!moved && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 4) return;
      if (!moved) {
        moved = true;
        g.appendChild(piece); // above the other pieces and the target marks
        piece.classList.add("is-dragged");
      }
      const p = svgPoint(svg, e);
      piece.setAttribute("transform", `translate(${p.x - geo.sq / 2},${p.y - geo.sq / 2}) scale(${piece.dataset.s})`);
    };
    const up = (e) => {
      if (e.pointerId !== down.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) {
        if (wasSelected) {
          state.selected = null; // clicking the selected piece again deselects it
          render();
        }
        return;
      }
      const to = e.type === "pointerup" ? squareAt(svg, geo, e) : null;
      if (!(to && to !== from && tryMove(from, to))) render(); // dropped elsewhere: back to its square, still selected
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function choosePromotion(from, to) {
    ui.promo.hidden = false;
    ui.promo.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        ui.promo.hidden = true;
        play({ from, to, promotion: b.dataset.piece });
      };
    });
    render();
  }

  function play(move) {
    const m = state.chess.move(move);
    state.hist.push(state.chess);
    state.last = m;
    ui.think.textContent = "";
    render();
    if (!finished()) layerMove();
  }

  // ---- the layer's moves ----
  async function layerMove() {
    const { chess, hist } = state;
    const token = state.token, k = state.k;
    state.busy = true;
    const legal = chess.moves({ verbose: true });
    const planes = hist.planes();
    const bytes = new Uint8Array(planes.length);
    planes.forEach((v, i) => (bytes[i] = v));
    status(`${label(k)} is thinking…`);
    const slow = setTimeout(() => status("Waking up the server. After a quiet period, the first move can take up to a minute."), 4000);
    let logits;
    try {
      const res = await fetch(API + "/policy", {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // a simple request, without a CORS preflight
        body: JSON.stringify({ planes: btoa(String.fromCharCode(...bytes)), k, moves: legal.map((m) => hist.moveIndex(m.lan)) }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(res.status === 429 ? "Too many requests, please wait a moment." : `server error ${res.status}`);
      logits = (await res.json()).logits;
    } catch (err) {
      clearTimeout(slow);
      if (token !== state.token) return;
      state.busy = false;
      status(`Could not reach the server (${err.message || err}). `, true);
      return;
    } finally {
      clearTimeout(slow);
    }
    if (token !== state.token) return; // new game or take-back meanwhile

    const max = Math.max(...logits);
    const w = logits.map((l) => Math.exp(l - max));
    const total = w.reduce((a, b) => a + b, 0);
    const probs = w.map((x) => x / total);
    let pick = probs.indexOf(Math.max(...probs));
    if (chess.moveNumber() <= 5) {
      let u = Math.random();
      pick = probs.findIndex((p) => (u -= p) < 0);
      if (pick < 0) pick = probs.length - 1;
    }
    const others = probs.map((p, i) => [p, i]).filter(([, i]) => i !== pick).sort((a, b) => b[0] - a[0]).slice(0, 2);
    const pct = (p) => (p >= 0.995 ? "99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
    const chosen = legal[pick];
    window.LLLBoard.animateMove(ui.board.querySelector("svg"), chosen.lan, 260, () => {
      if (token !== state.token) return;
      state.last = chess.move(chosen.lan);
      hist.push(chess);
      state.busy = false;
      ui.think.innerHTML = `${label(k)} played <b>${state.last.san}</b> (${pct(probs[pick])})` +
        (others.length ? `; next in its policy: ${others.map(([p, i]) => `${legal[i].san} ${pct(p)}`).join(", ")}.` : ".");
      render();
      finished();
    });
  }

  function finished() {
    const { chess } = state;
    if (!chess.isGameOver()) {
      status(chess.turn() === state.human ? (chess.inCheck() ? "Check. Your move." : "Your move.") : "");
      return false;
    }
    if (chess.isCheckmate()) status(chess.turn() === state.human ? `Checkmate. ${label(state.k)} wins.` : "Checkmate. You win!");
    else if (chess.isStalemate()) status("Draw by stalemate.");
    else if (chess.isThreefoldRepetition()) status("Draw by threefold repetition.");
    else if (chess.isInsufficientMaterial()) status("Draw: insufficient material.");
    else status("Draw by the fifty-move rule.");
    return true;
  }

  function status(text, retry) {
    ui.status.textContent = text;
    if (retry) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "linkish";
      b.textContent = "Try again";
      b.onclick = layerMove;
      ui.status.appendChild(b);
    }
  }

  // ---- games ----
  const humanMoves = () => state.chess.history({ verbose: true }).filter((m) => m.color === state.human).length;

  function newGame(human) {
    state.token++;
    state.human = human;
    state.chess = new state.Chess();
    state.hist = new window.LLLLc0.History(state.chess);
    state.selected = state.last = null;
    state.busy = false;
    ui.promo.hidden = true;
    ui.think.textContent = "";
    render();
    if (human === "b") layerMove();
    else status("Your move.");
  }

  function takeBack() {
    if (!humanMoves()) return;
    state.token++;
    state.busy = false;
    const { chess, hist } = state;
    do {
      chess.undo();
      hist.pop();
    } while (chess.turn() !== state.human);
    const prev = chess.history({ verbose: true });
    state.last = prev[prev.length - 1] || null;
    state.selected = null;
    ui.promo.hidden = true;
    ui.think.textContent = "";
    render();
    status("Your move.");
  }

  function showLayer() {
    state.k = +ui.range.value;
    ui.name.textContent = label(state.k);
    ui.elo.textContent = `${window.LLL_BOTS.blitz[state.k]} Lichess blitz`;
  }

  ui.range.addEventListener("input", showLayer);
  root.querySelector('[data-act="white"]').addEventListener("click", () => newGame("w"));
  root.querySelector('[data-act="black"]').addEventListener("click", () => newGame("b"));
  ui.undo.addEventListener("click", takeBack);
  showLayer();

  // Wake the server once the board comes into view, so the first move is quick.
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) {
      fetch(API + "/", { mode: "no-cors" }).catch(() => {});
      obs.disconnect();
    }
  }, { rootMargin: "600px" }).observe(root);

  import(chessUrl).then(({ Chess }) => {
    state.Chess = Chess;
    newGame("w");
  }).catch(() => status("The chess rules could not be loaded. Open the page over http(s), not from disk."));
})();
