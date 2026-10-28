/* Shared steering helpers: the concepts the page can steer along, the sign that counteracts
   the late-layer safety shift for each of them, and lookups into the exported data. */
(function () {
  // anti: sign of the raw strength that steers AGAINST the safety prior, i.e. reverses the
  // concept's late-layer shift in Fig 6 (left). The paper's headline setting is threats (opp.) at -0.5.
  const CONCEPTS = [
    { key: "king_safety_opponent_ph", label: "King safety (opp.)", anti: +1 },
    { key: "threats_opponent_ph", label: "Threats (opp.)", anti: -1, paper: true },
    { key: "threats_mine_ph", label: "Threats (mine)", anti: +1 },
    { key: "king_safety_mine_ph", label: "King safety (mine)", anti: -1 },
    { key: "random", label: "Random direction", anti: +1, note: "same norm" },
  ];
  const BY_KEY = Object.fromEntries(CONCEPTS.map((c) => [c.key, c]));
  const LEVELS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]; // in "against the prior" units
  const sKey = (s) => (Number.isInteger(s) ? s.toFixed(1) : String(s)); // Python's str(float)
  const raw = (concept, v) => v * BY_KEY[concept].anti;
  const fmtRaw = (s) => (s > 0 ? "+" : s < 0 ? "−" : "") + Math.abs(s).toFixed(2).replace(/0$/, "");

  /** Policy over d.legal at `readout` (14 or 15) for a concept at raw strength s. */
  function dist(d, concept, s, readout, randomIdx) {
    if (s === 0) return d.legal.map((u) => d.probs[u][readout]);
    if (concept === "random") return d.steering.random_full[sKey(s)][randomIdx || 0][String(readout)];
    return d.steering.concepts[concept][sKey(s)][String(readout)];
  }
  function randomSummary(d, s) {
    return s === 0 ? null : d.steering.random_summary[sKey(s)];
  }
  /** Aggregate over the 10k general puzzles for a fixed setting (window.LLL_AGG). */
  function aggregate(concept, s) {
    const A = window.LLL_AGG;
    if (!A || s === 0) return null;
    return concept === "random" ? A.random_mean[sKey(s)] : A.concepts[concept][sKey(s)];
  }
  function entropy(arr) {
    const z = arr.reduce((a, b) => a + b, 0);
    return -arr.reduce((h, p) => (p > 0 ? h + (p / z) * Math.log(p / z) : h), 0);
  }

  window.LLLSteer = { CONCEPTS, BY_KEY, LEVELS, sKey, raw, fmtRaw, dist, randomSummary, aggregate, entropy };
})();
