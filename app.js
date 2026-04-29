"use strict";

const state = {
  data: null,
  view: "season",
  selectedGame: 0,
  selectedPlayer: null,
  sort: {},  // tableId -> { col, dir: "asc"|"desc" }
};

const TEXT_COLS = new Set(["_player", "_date", "_opp", "_res"]);

function handleSort(tableId, colKey) {
  const cur = state.sort[tableId];
  let dir;
  if (cur && cur.col === colKey) {
    dir = cur.dir === "desc" ? "asc" : "desc";
  } else {
    dir = TEXT_COLS.has(colKey) ? "asc" : "desc";
  }
  state.sort[tableId] = { col: colKey, dir };
  render();
}

function sortRows(rows, getValue, dir) {
  const mult = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    const aNull = va == null || (typeof va === "number" && isNaN(va));
    const bNull = vb == null || (typeof vb === "number" && isNaN(vb));
    if (aNull && bNull) return 0;
    if (aNull) return 1;   // nulls always go to bottom
    if (bNull) return -1;
    if (typeof va === "string") return mult * va.localeCompare(vb);
    return mult * (va - vb);
  });
}

const fmt = {
  pct: (v) => v == null ? "—" : (v * 100).toFixed(1) + "%",
  num: (v, d = 0) => v == null ? "—" : (typeof v === "number" ? v.toFixed(d) : v),
  ratio: (v, inf) => inf ? "∞" : (v == null ? "—" : v.toFixed(2)),
  signed: (v) => v == null ? "—" : (v > 0 ? "+" + v : "" + v),
  ma: (m, a) => `${m}-${a}`,
};

async function load() {
  try {
    const res = await fetch("data/stats.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
  } catch (e) {
    document.getElementById("content").innerHTML =
      `<div class="error"><strong>Could not load data/stats.json.</strong><br>
       Run <code>python3 scrape.py</code> first, then refresh.<br>
       <small>If you opened this file directly with file://, your browser may block local fetches —
       run <code>python3 -m http.server 8000</code> in this folder and open
       <code>http://localhost:8000</code>.</small><br><br>${e}</div>`;
    return;
  }
  document.getElementById("team-title").textContent = state.data.team_name;
  const s = state.data.season;
  document.getElementById("season-meta").textContent =
    `${s.games} games · Record ${s.record.W}-${s.record.L}${s.record.T ? "-" + s.record.T : ""} · Generated ${state.data.generated_at}`;
  document.getElementById("generated-at").textContent = "Generated " + state.data.generated_at;
  state.selectedPlayer = state.data.players[0]?.name || null;
  render();
}

function render() {
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.view === state.view);
  });
  const root = document.getElementById("content");
  root.innerHTML = "";
  if (state.view === "season") root.appendChild(renderSeason());
  else if (state.view === "games") root.appendChild(renderGames());
  else if (state.view === "player") root.appendChild(renderPlayer());
}

// ---------- season view ----------

function renderSeason() {
  const d = state.data;
  const root = document.createElement("div");

  // Print-only header (shown when user prints to PDF).
  const ph = document.createElement("div");
  ph.className = "print-header";
  ph.innerHTML = `<h1>${d.team_name} — Season Box Score</h1>
    <div class="sub">${d.season.games} games · Record ${d.season.record.W}-${d.season.record.L}${d.season.record.T ? "-" + d.season.record.T : ""} · Generated ${d.generated_at}</div>`;
  root.appendChild(ph);

  // Top tile grid: team totals.
  const t = d.season.team_totals;
  root.appendChild(renderTitle("Team Totals — Season"));
  root.appendChild(renderStatGrid([
    { label: "Points", value: t.pts, sub: `${(t.pts / d.season.games).toFixed(1)} PPG` },
    { label: "Assists", value: t.ast, sub: `${(t.ast / d.season.games).toFixed(1)} APG` },
    { label: "Rebounds", value: t.reb, sub: `${(t.reb / d.season.games).toFixed(1)} RPG` },
    { label: "Steals", value: t.stl, sub: `${(t.stl / d.season.games).toFixed(1)} SPG` },
    { label: "Blocks", value: t.blk, sub: `${(t.blk / d.season.games).toFixed(1)} BPG` },
    { label: "Turnovers", value: t.to, sub: `${(t.to / d.season.games).toFixed(1)} TPG` },
    { label: "FG%", value: fmt.pct(t.fg_pct), sub: `${t.fgm}/${t.fga}` },
    { label: "3PT%", value: fmt.pct(t.tp_pct), sub: `${t.tpm}/${t.tpa}` },
    { label: "FT%", value: fmt.pct(t.ft_pct), sub: `${t.ftm}/${t.fta}` },
    { label: "eFG%", value: fmt.pct(t.efg_pct) },
    { label: "TS%", value: fmt.pct(t.ts_pct) },
    { label: "A/TO", value: fmt.ratio(t.ato, t.ato_inf) },
    { label: "Net +/-", value: fmt.signed(t.plus_minus), sub: "scoring margin" },
  ]));

  // Per-player season aggregate table — totals.
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="section-header"><h2>Player Totals (Season)</h2></div>`;
  card.appendChild(buildPlayerTotalsTable(d.players, "totals"));
  root.appendChild(card);

  // Per-player season averages.
  const card2 = document.createElement("div");
  card2.className = "card";
  card2.innerHTML = `<div class="section-header"><h2>Player Per-Game Averages</h2></div>`;
  card2.appendChild(buildPlayerAveragesTable(d.players));
  root.appendChild(card2);

  return root;
}

function buildPlayerTotalsTable(players, mode) {
  const cols = [
    { k: "_player", h: "Player" },
    { k: "_gp", h: "GP" },
    { k: "pts", h: "PTS" },
    { k: "_fg", h: "FG" },
    { k: "fg_pct", h: "FG%", pct: true },
    { k: "_3p", h: "3PT" },
    { k: "tp_pct", h: "3P%", pct: true },
    { k: "_ft", h: "FT" },
    { k: "ft_pct", h: "FT%", pct: true },
    { k: "oreb", h: "OREB" },
    { k: "dreb", h: "DREB" },
    { k: "reb", h: "REB" },
    { k: "ast", h: "AST" },
    { k: "stl", h: "STL" },
    { k: "blk", h: "BLK" },
    { k: "to", h: "TO" },
    { k: "foul", h: "PF" },
    { k: "efg_pct", h: "eFG%", pct: true },
    { k: "ts_pct", h: "TS%", pct: true },
    { k: "_ato", h: "A/TO" },
    { k: "plus_minus", h: "+/-", signed: true },
  ];
  const tableId = "player-totals";
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols, tableId));
  const tbody = document.createElement("tbody");
  const sort = state.sort[tableId];
  const sortedPlayers = sort
    ? sortRows(players, p => playerTotalsSortValue(p, sort.col), sort.dir)
    : players;
  for (const p of sortedPlayers) {
    const t = p.totals;
    const tr = document.createElement("tr");
    for (const c of cols) {
      const td = document.createElement("td");
      td.textContent = playerCellValue(p, t, c);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  // Append team totals row.
  const team = state.data.season.team_totals;
  const teamRow = document.createElement("tr");
  teamRow.className = "team-totals";
  for (const c of cols) {
    const td = document.createElement("td");
    td.textContent = teamCellValue(team, c);
    teamRow.appendChild(td);
  }
  tbody.appendChild(teamRow);
  table.appendChild(tbody);
  return table;
}

function playerCellValue(p, t, c) {
  if (c.k === "_player") {
    const js = (p.jerseys_seen && p.jerseys_seen.length > 1) ? p.jerseys_seen.join("/") : p.jersey;
    return `#${js} ${p.name}`;
  }
  if (c.k === "_gp") return p.games_played;
  if (c.k === "_fg") return fmt.ma(t.fgm, t.fga);
  if (c.k === "_3p") return fmt.ma(t.tpm, t.tpa);
  if (c.k === "_ft") return fmt.ma(t.ftm, t.fta);
  if (c.k === "_ato") return fmt.ratio(t.ato, t.ato_inf);
  if (c.pct) return fmt.pct(t[c.k]);
  if (c.signed) return fmt.signed(t[c.k]);
  return t[c.k] != null ? t[c.k] : "—";
}

function teamCellValue(team, c) {
  if (c.k === "_player") return state.data.team_name + " (Total)";
  if (c.k === "_gp") return state.data.season.games;
  if (c.k === "_fg") return fmt.ma(team.fgm, team.fga);
  if (c.k === "_3p") return fmt.ma(team.tpm, team.tpa);
  if (c.k === "_ft") return fmt.ma(team.ftm, team.fta);
  if (c.k === "_ato") return fmt.ratio(team.ato, team.ato_inf);
  if (c.pct) return fmt.pct(team[c.k]);
  if (c.signed) return fmt.signed(team[c.k]);
  return team[c.k] != null ? team[c.k] : "—";
}

function buildPlayerAveragesTable(players) {
  const cols = [
    { k: "_player", h: "Player" },
    { k: "_gp", h: "GP" },
    { k: "pts_pg", h: "PPG", d: 1 },
    { k: "ast_pg", h: "APG", d: 1 },
    { k: "reb_pg", h: "RPG", d: 1 },
    { k: "oreb_pg", h: "OR", d: 1 },
    { k: "dreb_pg", h: "DR", d: 1 },
    { k: "stl_pg", h: "SPG", d: 1 },
    { k: "blk_pg", h: "BPG", d: 1 },
    { k: "to_pg", h: "TOPG", d: 1 },
    { k: "foul_pg", h: "PF/G", d: 1 },
    { k: "plus_minus_pg", h: "+/- avg", d: 1, signed: true },
  ];
  const tableId = "player-averages";
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols, tableId));
  const tbody = document.createElement("tbody");
  const sort = state.sort[tableId];
  const sortedPlayers = sort
    ? sortRows(players, p => playerAveragesSortValue(p, sort.col), sort.dir)
    : players;
  for (const p of sortedPlayers) {
    const a = p.averages || {};
    const tr = document.createElement("tr");
    for (const c of cols) {
      const td = document.createElement("td");
      if (c.k === "_player") {
        const js = (p.jerseys_seen && p.jerseys_seen.length > 1) ? p.jerseys_seen.join("/") : p.jersey;
        td.textContent = `#${js} ${p.name}`;
      } else if (c.k === "_gp") {
        td.textContent = p.games_played;
      } else if (c.signed) {
        td.textContent = fmt.signed(a[c.k] != null ? Number(a[c.k].toFixed(c.d)) : null);
      } else {
        td.textContent = a[c.k] != null ? a[c.k].toFixed(c.d) : "—";
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function buildHeader(cols, tableId) {
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  const sort = tableId ? state.sort[tableId] : null;
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c.h;
    if (tableId) {
      th.classList.add("sortable");
      th.addEventListener("click", () => handleSort(tableId, c.k));
      if (sort && sort.col === c.k) {
        th.classList.add("sorted");
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.textContent = sort.dir === "desc" ? " ▼" : " ▲";
        th.appendChild(arrow);
      }
    }
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  return thead;
}

// ---------- games view ----------

function renderGames() {
  const root = document.createElement("div");
  root.appendChild(renderTitle("Games"));

  const list = document.createElement("div");
  list.className = "games-list";
  state.data.games.forEach((g, idx) => {
    const card = document.createElement("div");
    card.className = "game-card" + (idx === state.selectedGame ? " active" : "");
    const margin = g.our_score - g.opp_score;
    card.innerHTML = `
      <div class="date">${g.date_display}</div>
      <div class="matchup">vs ${escapeHTML(g.opponent)}
        <span class="pill ${g.result}" style="margin-left:6px">${g.result}</span>
      </div>
      <div class="score">${g.our_score} – ${g.opp_score}
        <span style="font-size:12px;color:var(--muted);font-weight:normal;margin-left:6px">${margin > 0 ? "+" : ""}${margin}</span>
      </div>
      <div class="date">${g.minutes} min · ${g.location}</div>
    `;
    card.addEventListener("click", () => { state.selectedGame = idx; render(); });
    list.appendChild(card);
  });
  root.appendChild(list);

  // Box score for selected.
  const g = state.data.games[state.selectedGame];
  if (g) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginTop = "20px";
    card.innerHTML = `<div class="section-header"><h2>${escapeHTML(state.data.team_name)} vs ${escapeHTML(g.opponent)} — ${g.date_display}</h2>
      <span class="pill ${g.result}">${g.result} ${g.our_score}-${g.opp_score}</span></div>`;
    card.appendChild(buildSingleGameBoxScore(g));
    root.appendChild(card);
  }
  return root;
}

function buildSingleGameBoxScore(game) {
  const cols = [
    { k: "_player", h: "Player" },
    { k: "pts", h: "PTS" },
    { k: "_fg", h: "FG" },
    { k: "fg_pct", h: "FG%", pct: true },
    { k: "_3p", h: "3PT" },
    { k: "tp_pct", h: "3P%", pct: true },
    { k: "_ft", h: "FT" },
    { k: "ft_pct", h: "FT%", pct: true },
    { k: "oreb", h: "OR" },
    { k: "dreb", h: "DR" },
    { k: "reb", h: "REB" },
    { k: "ast", h: "AST" },
    { k: "stl", h: "STL" },
    { k: "blk", h: "BLK" },
    { k: "to", h: "TO" },
    { k: "foul", h: "PF" },
    { k: "efg_pct", h: "eFG%", pct: true },
    { k: "ts_pct", h: "TS%", pct: true },
    { k: "_ato", h: "A/TO" },
    { k: "plus_minus", h: "+/-", signed: true },
  ];
  const tableId = "game-box";
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols, tableId));
  const tbody = document.createElement("tbody");
  const sort = state.sort[tableId];
  const sortedGamePlayers = sort
    ? sortRows(game.players, p => gameSortValue(p, sort.col), sort.dir)
    : game.players;
  for (const p of sortedGamePlayers) {
    const tr = document.createElement("tr");
    if (p.dnp) {
      const td = document.createElement("td");
      td.colSpan = cols.length;
      td.className = "dnp";
      td.textContent = `#${p.jersey} ${p.name} — DNP`;
      tr.appendChild(td);
      tbody.appendChild(tr);
      continue;
    }
    for (const c of cols) {
      const td = document.createElement("td");
      td.textContent = gameCellValue(p, c);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  // Team total row.
  const t = game.team_totals;
  const teamRow = document.createElement("tr");
  teamRow.className = "team-totals";
  for (const c of cols) {
    const td = document.createElement("td");
    td.textContent = gameTeamCellValue(t, c, game);
    teamRow.appendChild(td);
  }
  tbody.appendChild(teamRow);
  table.appendChild(tbody);
  return table;
}

function gameCellValue(p, c) {
  if (c.k === "_player") {
    return `#${p.jersey} ${p.name}`;
  }
  if (c.k === "_fg") return fmt.ma(p.fgm, p.fga);
  if (c.k === "_3p") return fmt.ma(p.tpm, p.tpa);
  if (c.k === "_ft") return fmt.ma(p.ftm, p.fta);
  if (c.k === "_ato") return fmt.ratio(p.ato, p.ato_inf);
  if (c.pct) return fmt.pct(p[c.k]);
  if (c.signed) return fmt.signed(p[c.k]);
  return p[c.k] != null ? p[c.k] : "—";
}

function gameTeamCellValue(t, c, game) {
  if (c.k === "_player") return `${state.data.team_name} (Total)`;
  if (c.k === "_fg") return fmt.ma(t.fgm, t.fga);
  if (c.k === "_3p") return fmt.ma(t.tpm, t.tpa);
  if (c.k === "_ft") return fmt.ma(t.ftm, t.fta);
  if (c.k === "_ato") return fmt.ratio(t.ato, t.ato_inf);
  if (c.k === "plus_minus") return fmt.signed(game.our_score - game.opp_score);
  if (c.pct) return fmt.pct(t[c.k]);
  return t[c.k] != null ? t[c.k] : "—";
}

// ---------- player view ----------

function renderPlayer() {
  const root = document.createElement("div");
  root.appendChild(renderTitle("Player Profile"));

  const picker = document.createElement("div");
  picker.className = "player-picker";
  for (const p of state.data.players) {
    const chip = document.createElement("button");
    chip.className = "player-chip" + (p.name === state.selectedPlayer ? " active" : "");
    const js = (p.jerseys_seen && p.jerseys_seen.length > 1) ? p.jerseys_seen.join("/") : p.jersey;
    chip.textContent = `#${js} ${p.name}`;
    chip.addEventListener("click", () => { state.selectedPlayer = p.name; render(); });
    picker.appendChild(chip);
  }
  root.appendChild(picker);

  const player = state.data.players.find(p => p.name === state.selectedPlayer);
  if (!player) return root;

  const t = player.totals;
  const a = player.averages || {};
  const tiles = [
    { label: "Games", value: player.games_played },
    { label: "PPG", value: fmt.num(a.pts_pg, 1), sub: `${t.pts} pts total` },
    { label: "APG", value: fmt.num(a.ast_pg, 1), sub: `${t.ast} ast total` },
    { label: "RPG", value: fmt.num(a.reb_pg, 1), sub: `${t.reb} reb total` },
    { label: "SPG", value: fmt.num(a.stl_pg, 1), sub: `${t.stl} stl total` },
    { label: "BPG", value: fmt.num(a.blk_pg, 1), sub: `${t.blk} blk total` },
    { label: "TOPG", value: fmt.num(a.to_pg, 1), sub: `${t.to} to total` },
    { label: "FG%", value: fmt.pct(t.fg_pct), sub: `${t.fgm}/${t.fga}` },
    { label: "3PT%", value: fmt.pct(t.tp_pct), sub: `${t.tpm}/${t.tpa}` },
    { label: "FT%", value: fmt.pct(t.ft_pct), sub: `${t.ftm}/${t.fta}` },
    { label: "eFG%", value: fmt.pct(t.efg_pct) },
    { label: "TS%", value: fmt.pct(t.ts_pct) },
    { label: "A/TO", value: fmt.ratio(t.ato, t.ato_inf) },
    { label: "+/- Total", value: fmt.signed(t.plus_minus), sub: a.plus_minus_pg != null ? `${fmt.signed(Number(a.plus_minus_pg.toFixed(1)))} avg` : "" },
  ];
  root.appendChild(renderStatGrid(tiles));

  // Shooting splits — season + game-by-game trend.
  const splitsCard = document.createElement("div");
  splitsCard.className = "card";
  splitsCard.innerHTML = `<div class="section-header"><h2>Shooting Splits — Season</h2></div>`;
  splitsCard.appendChild(buildSplitsBarChart(player.totals));
  root.appendChild(splitsCard);

  const trendCard = document.createElement("div");
  trendCard.className = "card";
  trendCard.innerHTML = `<div class="section-header"><h2>Shooting Splits — Game by Game</h2></div>`;
  trendCard.appendChild(buildShootingTrendChart(player));
  root.appendChild(trendCard);

  // Game log.
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="section-header"><h2>Game Log</h2></div>`;
  card.appendChild(buildPlayerGameLog(player));
  root.appendChild(card);

  return root;
}

// ---------- shooting splits charts ----------

const SPLIT_COLORS = {
  fg:  "#1b1464",
  tp:  "#e8a317",
  ft:  "#178a3a",
  efg: "#5a4cad",
  ts:  "#b3261e",
};

function buildSplitsBarChart(totals) {
  const rows = [
    { label: "FG%",  pct: totals.fg_pct,  m: totals.fgm, a: totals.fga, color: SPLIT_COLORS.fg },
    { label: "3PT%", pct: totals.tp_pct,  m: totals.tpm, a: totals.tpa, color: SPLIT_COLORS.tp },
    { label: "FT%",  pct: totals.ft_pct,  m: totals.ftm, a: totals.fta, color: SPLIT_COLORS.ft },
    { label: "eFG%", pct: totals.efg_pct, color: SPLIT_COLORS.efg },
    { label: "TS%",  pct: totals.ts_pct,  color: SPLIT_COLORS.ts  },
  ];

  const wrap = document.createElement("div");
  wrap.className = "splits-bars";
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "splits-row";
    const pctVal = r.pct != null ? Math.max(0, Math.min(1, r.pct)) : 0;
    const labelText = r.pct != null ? (r.pct * 100).toFixed(1) + "%" : "—";
    const subText = (r.m != null && r.a != null) ? ` (${r.m}/${r.a})` : "";
    row.innerHTML = `
      <div class="splits-label">${r.label}</div>
      <div class="splits-track">
        <div class="splits-fill" style="width:${pctVal * 100}%; background:${r.color};"></div>
      </div>
      <div class="splits-value">${labelText}<span class="splits-sub">${subText}</span></div>
    `;
    wrap.appendChild(row);
  }
  return wrap;
}

function buildShootingTrendChart(player) {
  const games = player.per_game.filter(g => !g.dnp);
  if (games.length === 0) {
    const note = document.createElement("div");
    note.className = "subtitle";
    note.textContent = "No games played.";
    return note;
  }

  // Series: FG%, 3PT%, FT%. null where 0 attempts (creates a gap).
  const series = [
    { key: "fg_pct",  label: "FG%",  color: SPLIT_COLORS.fg, attemptsKey: "fga" },
    { key: "tp_pct",  label: "3PT%", color: SPLIT_COLORS.tp, attemptsKey: "tpa" },
    { key: "ft_pct",  label: "FT%",  color: SPLIT_COLORS.ft, attemptsKey: "fta" },
  ];

  // Layout
  const W = 720, H = 280;
  const M = { top: 20, right: 100, bottom: 50, left: 40 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const n = games.length;
  const xFor = (i) => M.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (pct) => M.top + (1 - pct) * innerH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "trend-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Y gridlines at 0/25/50/75/100%
  for (const pct of [0, 0.25, 0.5, 0.75, 1.0]) {
    const y = yFor(pct);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", M.left); line.setAttribute("x2", M.left + innerW);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    line.setAttribute("stroke", "#e2e2e8");
    line.setAttribute("stroke-dasharray", pct === 0 || pct === 1 ? "" : "3,3");
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", M.left - 6);
    label.setAttribute("y", y + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#6b6b75");
    label.textContent = (pct * 100).toFixed(0) + "%";
    svg.appendChild(label);
  }

  // X labels: opponent abbreviation per game
  for (let i = 0; i < n; i++) {
    const x = xFor(i);
    const tick = document.createElementNS(svgNS, "line");
    tick.setAttribute("x1", x); tick.setAttribute("x2", x);
    tick.setAttribute("y1", M.top + innerH); tick.setAttribute("y2", M.top + innerH + 4);
    tick.setAttribute("stroke", "#aaa");
    svg.appendChild(tick);

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", x);
    t.setAttribute("y", M.top + innerH + 18);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", "10");
    t.setAttribute("fill", "#6b6b75");
    const opp = games[i].opponent || "";
    const short = opp.length > 12 ? opp.slice(0, 11) + "…" : opp;
    t.textContent = short;
    svg.appendChild(t);

    // Date below
    if (games[i].date) {
      const d = document.createElementNS(svgNS, "text");
      d.setAttribute("x", x);
      d.setAttribute("y", M.top + innerH + 32);
      d.setAttribute("text-anchor", "middle");
      d.setAttribute("font-size", "9");
      d.setAttribute("fill", "#9b9ba2");
      d.textContent = games[i].date.slice(5); // MM-DD
      svg.appendChild(d);
    }
  }

  // Plot lines for each series, breaking on null.
  for (const s of series) {
    const segs = [];
    let current = [];
    games.forEach((g, i) => {
      const attempts = g[s.attemptsKey];
      const v = (attempts && attempts > 0) ? g[s.key] : null;
      if (v == null) {
        if (current.length) segs.push(current);
        current = [];
      } else {
        current.push({ i, v });
      }
    });
    if (current.length) segs.push(current);

    for (const seg of segs) {
      if (seg.length === 1) {
        // Lone point — just draw the dot below.
      } else {
        const d = seg.map((p, j) => `${j === 0 ? "M" : "L"} ${xFor(p.i)} ${yFor(p.v)}`).join(" ");
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", s.color);
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
      }
      for (const p of seg) {
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", xFor(p.i));
        c.setAttribute("cy", yFor(p.v));
        c.setAttribute("r", "3.5");
        c.setAttribute("fill", "#fff");
        c.setAttribute("stroke", s.color);
        c.setAttribute("stroke-width", "2");
        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${s.label}: ${(p.v * 100).toFixed(1)}% vs ${games[p.i].opponent}`;
        c.appendChild(title);
        svg.appendChild(c);
      }
    }
  }

  // Legend on the right
  series.forEach((s, idx) => {
    const ly = M.top + 16 + idx * 22;
    const lx = M.left + innerW + 14;
    const sw = document.createElementNS(svgNS, "line");
    sw.setAttribute("x1", lx); sw.setAttribute("x2", lx + 18);
    sw.setAttribute("y1", ly); sw.setAttribute("y2", ly);
    sw.setAttribute("stroke", s.color);
    sw.setAttribute("stroke-width", "3");
    svg.appendChild(sw);
    const lt = document.createElementNS(svgNS, "text");
    lt.setAttribute("x", lx + 24);
    lt.setAttribute("y", ly + 4);
    lt.setAttribute("font-size", "12");
    lt.setAttribute("fill", "#1a1a1f");
    lt.textContent = s.label;
    svg.appendChild(lt);
  });

  const wrap = document.createElement("div");
  wrap.className = "trend-wrap";
  wrap.appendChild(svg);
  return wrap;
}

function buildPlayerGameLog(player) {
  const cols = [
    { k: "_date", h: "Date" },
    { k: "_opp", h: "Opp" },
    { k: "_res", h: "Result" },
    { k: "pts", h: "PTS" },
    { k: "_fg", h: "FG" },
    { k: "_3p", h: "3PT" },
    { k: "_ft", h: "FT" },
    { k: "reb", h: "REB" },
    { k: "ast", h: "AST" },
    { k: "stl", h: "STL" },
    { k: "blk", h: "BLK" },
    { k: "to", h: "TO" },
    { k: "foul", h: "PF" },
    { k: "efg_pct", h: "eFG%", pct: true },
    { k: "ts_pct", h: "TS%", pct: true },
    { k: "plus_minus", h: "+/-", signed: true },
  ];
  const tableId = "player-log";
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols, tableId));
  const tbody = document.createElement("tbody");
  const sort = state.sort[tableId];
  const sortedGames = sort
    ? sortRows(player.per_game, g => playerLogSortValue(g, sort.col), sort.dir)
    : player.per_game;
  for (const g of sortedGames) {
    const tr = document.createElement("tr");
    if (g.dnp) {
      const td = document.createElement("td");
      td.colSpan = cols.length;
      td.className = "dnp";
      td.textContent = `${g.date || ""} vs ${g.opponent} — DNP`;
      tr.appendChild(td);
      tbody.appendChild(tr);
      continue;
    }
    for (const c of cols) {
      const td = document.createElement("td");
      td.textContent = playerLogCell(g, c);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  // Totals row.
  const t = player.totals;
  const totalRow = document.createElement("tr");
  totalRow.className = "team-totals";
  for (const c of cols) {
    const td = document.createElement("td");
    td.textContent = playerLogTotal(player, t, c);
    totalRow.appendChild(td);
  }
  tbody.appendChild(totalRow);
  table.appendChild(tbody);
  return table;
}

function playerLogCell(g, c) {
  if (c.k === "_date") return g.date || "—";
  if (c.k === "_opp") return g.opponent;
  if (c.k === "_res") return `${g.result} ${g.our_score}-${g.opp_score}`;
  if (c.k === "_fg") return fmt.ma(g.fgm, g.fga);
  if (c.k === "_3p") return fmt.ma(g.tpm, g.tpa);
  if (c.k === "_ft") return fmt.ma(g.ftm, g.fta);
  if (c.pct) return fmt.pct(g[c.k]);
  if (c.signed) return fmt.signed(g[c.k]);
  return g[c.k] != null ? g[c.k] : "—";
}

function playerLogTotal(player, t, c) {
  if (c.k === "_date") return "Totals";
  if (c.k === "_opp") return `${player.games_played} G`;
  if (c.k === "_res") return "";
  if (c.k === "_fg") return fmt.ma(t.fgm, t.fga);
  if (c.k === "_3p") return fmt.ma(t.tpm, t.tpa);
  if (c.k === "_ft") return fmt.ma(t.ftm, t.fta);
  if (c.pct) return fmt.pct(t[c.k]);
  if (c.signed) return fmt.signed(t[c.k]);
  return t[c.k] != null ? t[c.k] : "—";
}

// ---------- sort value extractors ----------
// Compound make/attempt columns sort by makes; A/TO with infinite ratio sorts as +Infinity.
// Returning null routes a row to the bottom regardless of direction (used for DNPs).

function playerTotalsSortValue(p, colKey) {
  const t = p.totals;
  if (colKey === "_player") return p.name;
  if (colKey === "_gp") return p.games_played;
  if (colKey === "_fg") return t.fgm;
  if (colKey === "_3p") return t.tpm;
  if (colKey === "_ft") return t.ftm;
  if (colKey === "_ato") return t.ato_inf ? Infinity : t.ato;
  return t[colKey];
}

function playerAveragesSortValue(p, colKey) {
  if (colKey === "_player") return p.name;
  if (colKey === "_gp") return p.games_played;
  return (p.averages || {})[colKey];
}

function gameSortValue(p, colKey) {
  if (p.dnp) return null;
  if (colKey === "_player") return p.name;
  if (colKey === "_fg") return p.fgm;
  if (colKey === "_3p") return p.tpm;
  if (colKey === "_ft") return p.ftm;
  if (colKey === "_ato") return p.ato_inf ? Infinity : p.ato;
  return p[colKey];
}

function playerLogSortValue(g, colKey) {
  if (g.dnp) return null;
  if (colKey === "_date") return g.date || "";
  if (colKey === "_opp") return g.opponent || "";
  if (colKey === "_res") return g.our_score - g.opp_score;
  if (colKey === "_fg") return g.fgm;
  if (colKey === "_3p") return g.tpm;
  if (colKey === "_ft") return g.ftm;
  return g[colKey];
}

// ---------- helpers ----------

function renderTitle(text) {
  const h = document.createElement("h2");
  h.className = "view-title";
  h.textContent = text;
  return h;
}

function renderStatGrid(tiles) {
  const grid = document.createElement("div");
  grid.className = "stat-grid";
  for (const t of tiles) {
    const cell = document.createElement("div");
    cell.className = "stat-tile";
    cell.innerHTML = `<div class="label">${escapeHTML(t.label)}</div>
                      <div class="value">${escapeHTML(String(t.value))}</div>
                      ${t.sub ? `<div class="sub">${escapeHTML(t.sub)}</div>` : ""}`;
    grid.appendChild(cell);
  }
  return grid;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// ---------- wiring ----------

document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => { state.view = t.dataset.view; render(); });
});

document.getElementById("print-btn").addEventListener("click", () => {
  // Force season view for printing.
  state.view = "season";
  render();
  setTimeout(() => window.print(), 100);
});

load();
