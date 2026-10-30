/* Steering explorer: the output policy of a forgotten puzzle when a concept direction is
   added to the residual stream after layer 13, at the strengths of the paper's grid.
   Shows the full distribution, its entropy and random directions of equal norm, so that
   "it only flattens the distribution" is visible at a glance. */
(function () {
  const { el, boardSvg } = window.LLLBoard;
  const COL = { star: "#00b894", hat: "#d63031", other: "#8a939b" };
  const ST = window.LLLSteer;
  const CONCEPTS = ST.CONCEPTS;
  const LEVELS = ST.LEVELS; // in "against the safety prior" units; the raw strength is ST.raw(concept, v)
  const pct1 = (p) => (p * 100).toFixed(1) + "%";
  const entropy = ST.entropy;

  class SteerExplorer {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.concept = "threats_opponent_ph"; // the paper's headline setting
      this.v = 0.5;
      this.randomIdx = 0;
      this.build();
    }

    build() {
      this.root.classList.add("steer");
      this.root.innerHTML = `
        <div class="steer__controls">
          <div class="steer__group">
            <div class="steer__label">Puzzle</div>
            <div class="steer__puzzles" role="radiogroup" aria-label="Puzzle"></div>
          </div>
          <div class="steer__group">
            <div class="steer__label">Direction added to the residual stream after layer 13</div>
            <div class="seg steer__concepts" role="radiogroup" aria-label="Steering direction"></div>
          </div>
          <div class="steer__group steer__group--strength">
            <div class="steer__label">Strength <output class="steer__s mono"></output></div>
            <input type="range" min="0" max="${LEVELS.length - 1}" step="1" aria-label="Steering strength, toward or against the safety prior" />
            <div class="steer__scale"><span>toward the safety prior</span><span>0</span><span>against it</span></div>
          </div>
        </div>
        <div class="steer__viz">
          <div class="steer__board"></div>
          <div class="steer__dist">
            <div class="steer__dist-head"><span>Output policy</span><span class="steer__legend"><i class="sw sw--base"></i>unsteered <i class="sw sw--steer"></i>steered</span></div>
            <div class="steer__bars"></div>
          </div>
          <div class="steer__traj"><div class="steer__dist-head"><span>Last layers</span><span class="steer__legend"><i class="ln"></i>unsteered <i class="ln ln--dash"></i>steered</span></div><svg viewBox="0 0 300 210" class="steer__traj-svg" role="img"></svg></div>
        </div>
        <div class="steer__stats"></div>`;
      this.$ = (s) => this.root.querySelector(s);
      const conceptsBox = this.$(".steer__concepts");
      CONCEPTS.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "seg__btn";
        b.dataset.key = c.key;
        b.setAttribute("role", "radio");
        b.innerHTML = `${c.label}${c.note ? `<small>${c.note}</small>` : ""}`;
        b.addEventListener("click", () => {
          if (c.key === "random" && this.concept === "random") this.randomIdx = (this.randomIdx + 1) % 3;
          this.concept = c.key;
          this.render();
        });
        conceptsBox.appendChild(b);
      });
      this.slider = this.$("input[type=range]");
      this.slider.value = LEVELS.indexOf(this.v);
      this.slider.addEventListener("input", () => {
        this.v = LEVELS[+this.slider.value];
        this.render();
      });
    }

    // groups: [{group, items: [{id, meta, where}]}]; each chip shows whether the current setting
    // solves that puzzle's full line (from the index, so no puzzle data has to be loaded).
    setPuzzles(groups, loader) {
      this.loader = loader;
      const box = this.$(".steer__puzzles");
      box.innerHTML = "";
      this.chipMeta = {};
      groups.forEach((g) => {
        if (!g.items.length) return;
        const row = document.createElement("div");
        row.className = "steer__chiprow";
        row.innerHTML = `<span class="steer__chipgroup">${g.group}</span>`;
        g.items.forEach((p) => {
          this.chipMeta[p.id] = p.meta;
          const pair = document.createElement("span");
          pair.className = "chip-pair";
          const n = p.meta.settings_solved, tot = p.meta.settings_total;
          pair.innerHTML = `<button type="button" class="chip" role="radio" data-id="${p.id}"><span class="chip__mark" aria-hidden="true"></span><span class="mono">${p.id}</span>` +
            `${p.where ? ` <small>${p.where}</small>` : ` <small title="steering settings after layer 13 that recover the full line">${n}/${tot} settings</small>`}</button>` +
            `<a class="chip-link" href="https://lichess.org/training/${p.id}" target="_blank" rel="noopener" aria-label="Open puzzle ${p.id} on Lichess" title="Open on Lichess">↗</a>`;
          pair.querySelector("button").addEventListener("click", () => this.select(p.id));
          row.appendChild(pair);
        });
        box.appendChild(row);
      });
    }

    updateChipMarks() {
      const raw = this.raw();
      this.root.querySelectorAll(".steer__puzzles .chip").forEach((c) => {
        const m = this.chipMeta[c.dataset.id], mark = c.querySelector(".chip__mark");
        const solved = this.concept !== "random" && raw !== 0 && m.pv_solved && m.pv_solved[this.concept] ? m.pv_solved[this.concept][ST.sKey(raw)] : null;
        mark.textContent = solved == null ? "" : solved ? "✓" : "✗";
        mark.className = "chip__mark" + (solved == null ? "" : solved ? " is-yes" : " is-no");
        c.title = solved == null ? "" : solved ? "This setting recovers the full solution line" : "This setting does not recover the full solution line";
      });
    }

    async select(id) {
      this.data = await this.loader(id);
      this.root.querySelectorAll(".steer__puzzles .chip").forEach((c) => c.setAttribute("aria-checked", c.dataset.id === id));
      this.render();
    }

    raw() {
      return ST.raw(this.concept, this.v);
    }
    dist(readout) {
      return ST.dist(this.data, this.concept, this.raw(), readout, this.randomIdx);
    }

    render() {
      const d = this.data;
      if (!d) return;
      this.root.querySelectorAll(".seg__btn").forEach((b) => b.setAttribute("aria-checked", b.dataset.key === this.concept));
      this.updateChipMarks();
      const rnd = this.concept === "random";
      const raw = this.raw(), off = raw === 0;
      this.$(".steer__s").textContent = off ? "0 (off)" : `raw ${ST.fmtRaw(raw)}` + (rnd ? ` · direction ${this.randomIdx + 1}/3` : "");
      const base = d.legal.map((u) => d.probs[u][15]);
      const st = this.dist(15);
      const iStar = d.legal.indexOf(d.m_star), iHat = d.legal.indexOf(d.m_hat);
      const order = d.legal.map((u, i) => i).sort((a, b) => st[b] - st[a]);
      const topSteer = order[0];

      // Board with the steered top-3 moves
      const top3 = order.slice(0, 3);
      const max = st[top3[0]], min = st[top3[2]];
      const boardBox = this.$(".steer__board");
      boardBox.innerHTML = "";
      boardBox.appendChild(boardSvg({
        fen: d.fen, size: 260,
        arrows: top3.map((i) => ({
          uci: d.legal[i],
          color: i === iStar ? COL.star : i === iHat ? COL.hat : "#5f6870",
          opacity: 0.4 + 0.6 * (max > min ? (st[i] - min) / (max - min) : 1),
        })),
        label: `Top three moves of the ${off ? "unsteered" : "steered"} output`,
      }));
      const cap = document.createElement("div");
      cap.className = "steer__board-cap";
      cap.innerHTML = `Top moves of the ${off ? "unsteered" : "steered"} output · <a href="${d.puzzle_url}" target="_blank" rel="noopener">puzzle ${d.id}</a>`;
      boardBox.appendChild(cap);

      // Distribution bars: rows = union of top moves, solution and played move
      const rows = new Set(order.slice(0, 5));
      d.legal.map((u, i) => i).sort((a, b) => base[b] - base[a]).slice(0, 3).forEach((i) => rows.add(i));
      rows.add(iStar); rows.add(iHat);
      const rowList = [...rows].sort((a, b) => st[b] - st[a]).slice(0, 8);
      const scale = Math.max(...rowList.map((i) => Math.max(st[i], base[i]))) || 1;
      const others = d.legal.length - rowList.length;
      this.$(".steer__bars").innerHTML = rowList.map((i) => {
        const kind = i === iStar ? "star" : i === iHat ? "hat" : "other";
        const tag = kind === "star" ? "solution" : kind === "hat" ? "played" : "";
        return `<div class="sbar sbar--${kind}">
          <span class="sbar__move mono">${d.turn === "b" ? "…" : ""}${d.san[d.legal[i]]}${tag ? `<small>${tag}</small>` : ""}</span>
          <span class="sbar__track"><span class="sbar__base" style="--v:${base[i] / scale}"></span><span class="sbar__steer" style="--v:${st[i] / scale}"></span></span>
          <span class="sbar__val mono">${pct1(base[i])} <span class="arrow">→</span> <b>${pct1(st[i])}</b></span>
        </div>`;
      }).join("") + `<div class="sbar__more">+ ${others} more legal moves</div>`;

      this.renderTrajectory(iStar, iHat);

      // Stats
      const H0 = entropy(base), H1 = entropy(st), Hmax = Math.log(d.legal.length);
      const solved = topSteer === iStar;
      const rs = ST.randomSummary(d, raw);
      const agg = ST.aggregate(this.concept, raw);
      const A = window.LLL_AGG;
      const nRandTop = rs ? rs.filter((r) => r["15"].top === d.m_star).length : null;
      const medP = rs ? median(rs.map((r) => r["15"].p_star)) : null;
      const medH = rs ? median(rs.map((r) => r["15"].H)) : null;
      this.$(".steer__stats").innerHTML = `
        <div class="stat ${solved ? "stat--good" : "stat--bad"}">
          <div class="stat__k">Top move</div>
          <div class="stat__v mono">${d.turn === "b" ? "…" : ""}${d.san[d.legal[topSteer]]}</div>
          <div class="stat__s">${solved ? "the solution" : topSteer === iHat ? "the quiet move, as unsteered" : "not the solution"}</div>
        </div>
        <div class="stat">
          <div class="stat__k">P(solution)</div>
          <div class="stat__v mono">${pct1(base[iStar])} → ${pct1(st[iStar])}</div>
          <div class="stat__s">margin to the runner-up: ${solved ? "+" + pct1(st[iStar] - st[order[1]]) : "−" + pct1(st[order[0]] - st[iStar])}</div>
        </div>
        <div class="stat">
          <div class="stat__k">Entropy of the output</div>
          <div class="stat__v mono">${H0.toFixed(2)} → ${H1.toFixed(2)} <small>nats</small></div>
          <div class="meter" title="Fraction of the maximum (uniform over ${d.legal.length} legal moves = ${Hmax.toFixed(2)} nats)"><span class="meter__base" style="--v:${H0 / Hmax}"></span><span class="meter__val" style="--v:${H1 / Hmax}"></span></div>
          <div class="stat__s">uniform over ${d.legal.length} legal moves: ${Hmax.toFixed(2)}</div>
        </div>
        <div class="stat">
          <div class="stat__k">50 random directions, same norm</div>
          <div class="stat__v mono">${rs ? `${nRandTop} / 50` : "—"}</div>
          <div class="stat__s">${rs ? `put the solution on top · median P(solution) ${pct1(medP)}, median entropy ${medH.toFixed(2)}` : "set a strength to compare"}</div>
        </div>
        <p class="steer__agg">${agg ? (rnd
          ? "A random direction with the same norm as the concept directions, for comparison."
          : `This exact setting, across all ${A.n_forgotten} forgotten puzzles of the 10k set: <b>${Math.round(agg.forgotten * 100)}% recovered</b>; ` +
            `solve rate on all puzzles ${(A.baseline.solve * 100).toFixed(1)}% → ${(agg.solve * 100).toFixed(1)}%; median entropy change ${agg.dH_all >= 0 ? "+" : "−"}${Math.abs(agg.dH_all).toFixed(2)} nats.`)
          : "Move the slider to steer. Right of 0 reverses the late-layer shift toward safe play; left of 0 strengthens it."}</p>`;
    }

    renderTrajectory(iStar, iHat) {
      const d = this.data, svg = this.$(".steer__traj-svg");
      svg.innerHTML = "";
      const X0 = 34, X1 = 286, Y0 = 18, Y1 = 176, K0 = 10;
      const x = (k) => X0 + ((k - K0) / (15 - K0)) * (X1 - X0);
      const y = (p) => Y1 - p * (Y1 - Y0);
      [0, 0.5, 1].forEach((p) => {
        el("line", { x1: X0, x2: X1, y1: y(p), y2: y(p), class: "lf-grid" }, svg);
        el("text", { x: X0 - 6, y: y(p), class: "lf-tick lf-tick--sm", "text-anchor": "end", "dominant-baseline": "central" }, svg).textContent = p * 100;
      });
      for (let k = K0; k <= 15; k++) {
        el("text", { x: x(k), y: Y1 + 16, class: "lf-tick lf-tick--sm", "text-anchor": "middle" }, svg).textContent = k === 15 ? "Final" : String(k - 1);
      }
      // The vector is added to the residual stream after layer 13. The layer-13 point is drawn
      // unsteered and the steered line runs from it to the steered output.
      const on = this.raw() !== 0;
      if (on) {
        el("line", { x1: x(14), x2: x(14), y1: Y0 - 6, y2: Y1, class: "steer__inject" }, svg);
        el("text", { x: x(14) + 4, y: Y0 - 8, class: "lf-tick lf-tick--sm", "text-anchor": "end" }, svg).textContent = "+ vector after layer 13";
      }
      const s15 = this.dist(15);
      [[iHat, COL.hat], [iStar, COL.star]].forEach(([i, c]) => {
        const u = d.legal[i], p = d.probs[u];
        const pts = [];
        for (let k = K0; k <= (on ? 14 : 15); k++) pts.push(`${x(k)},${y(p[k])}`);
        el("polyline", { points: pts.join(" "), fill: "none", stroke: c, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
        if (on) {
          el("line", { x1: x(14), x2: x(15), y1: y(p[14]), y2: y(p[15]), stroke: c, "stroke-width": 1.6, opacity: 0.3 }, svg);
          el("circle", { cx: x(15), cy: y(p[15]), r: 3.5, fill: "var(--surface)", stroke: c, "stroke-width": 1.6, opacity: 0.7 }, svg);
          el("line", { x1: x(14), y1: y(p[14]), x2: x(15), y2: y(s15[i]), stroke: c, "stroke-width": 2.5, "stroke-dasharray": "5 4", "stroke-linecap": "round" }, svg);
          el("circle", { cx: x(15), cy: y(s15[i]), r: 4.5, fill: c, class: "lf-dot" }, svg);
        }
      });
      svg.setAttribute("aria-label", `Probability of the solution and the played move over the last layers, unsteered and steered.`);
    }
  }

  function median(a) {
    const s = [...a].sort((x, y) => x - y);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  }

  window.SteerExplorer = SteerExplorer;
})();
