/* Lc0's network input (112 planes of 8×8) and policy index (1858 moves), built exactly as
   leela-interp's LeelaBoard does (lcz_features, batch_uci2idx), from chess.js positions.
   Needs window.LLL_LC0_MOVES (data/lc0-moves.js): the 1858 moves from white's side. */
(function () {
  "use strict";

  const PIECES = "pnbrqk";

  // One history frame: piece bitboards from white's side (12 × 64, white pieces first, square = rank * 8 + file),
  // plus what the constant planes need when this frame is the current position.
  function frame(chess, counts) {
    const bits = new Uint8Array(12 * 64);
    chess.board().forEach((row, i) => row.forEach((p, file) => {
      if (p) bits[((p.color === "w" ? 0 : 6) + PIECES.indexOf(p.type)) * 64 + (7 - i) * 8 + file] = 1;
    }));
    const fen = chess.fen().split(" ");
    // Repetitions count positions as python-chess's transposition key does: the en passant square only when the
    // capture is legal.
    const ep = chess.moves({ verbose: true }).find((m) => m.flags.includes("e"));
    const key = [fen[0], fen[1], fen[2], ep ? ep.to : "-"].join(" ");
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    const us = chess.turn(), them = us === "w" ? "b" : "w";
    const cr = { us: chess.getCastlingRights(us), them: chess.getCastlingRights(them) };
    return {
      bits, key, repetition: n >= 2, black: us === "b", rule50: +fen[4],
      usOOO: cr.us.q, usOO: cr.us.k, themOOO: cr.them.q, themOO: cr.them.k,
    };
  }

  // The game so far, one frame per position (start position included). push() after every move, pop() on undo.
  class History {
    constructor(chess) {
      this.counts = new Map();
      this.frames = [];
      if (chess) this.push(chess);
    }
    push(chess) { this.frames.push(frame(chess, this.counts)); }
    pop() {
      const f = this.frames.pop();
      this.counts.set(f.key, this.counts.get(f.key) - 1);
    }
    get current() { return this.frames[this.frames.length - 1]; }

    // Float32Array(112 * 64): 8 frames × (6 own, 6 opponent piece planes, repetition), seen from the side to move;
    // then castling (us O-O-O, us O-O, them O-O-O, them O-O), side to move, rule-50 count, zeros, ones.
    planes() {
      const out = new Float32Array(112 * 64);
      const cur = this.current;
      for (let h = 0; h < 8 && h < this.frames.length; h++) {
        const f = this.frames[this.frames.length - 1 - h];
        for (let p = 0; p < 12; p++) {
          const src = cur.black ? (p + 6) % 12 : p;
          for (let sq = 0; sq < 64; sq++) {
            if (!f.bits[src * 64 + sq]) continue;
            const rank = sq >> 3;
            out[(h * 13 + p) * 64 + (cur.black ? 7 - rank : rank) * 8 + (sq & 7)] = 1;
          }
        }
        if (f.repetition) out.fill(1, (h * 13 + 12) * 64, (h * 13 + 13) * 64);
      }
      const constant = [cur.usOOO, cur.usOO, cur.themOOO, cur.themOO, cur.black, cur.rule50, 0, 1];
      constant.forEach((v, i) => out.fill(+v, (104 + i) * 64, (105 + i) * 64));
      return out;
    }

    // Policy index of a legal move given in UCI ("e1g1", "a7a8q"), for the current position.
    moveIndex(uci) {
      const cur = this.current;
      let m = uci.replace(/n$/, ""); // knight promotions use the plain move's index
      if (cur.usOOO || cur.usOO) {
        // with castling rights, castling is encoded as the king taking its own rook (only on the mover's back rank)
        const r = cur.black ? "8" : "1";
        const swap = { [`e${r}g${r}`]: `e${r}h${r}`, [`e${r}h${r}`]: `e${r}g${r}`, [`e${r}c${r}`]: `e${r}a${r}`, [`e${r}a${r}`]: `e${r}c${r}` };
        m = swap[m] || m;
      }
      if (cur.black) m = m[0] + (9 - m[1]) + m[2] + (9 - m[3]) + m.slice(4);
      return moveIndex().get(m);
    }
  }

  let index = null;
  function moveIndex() {
    if (!index) index = new Map(window.LLL_LC0_MOVES.map((m, i) => [m, i]));
    return index;
  }

  window.LLLLc0 = { History };
})();
