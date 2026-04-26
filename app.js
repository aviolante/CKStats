"use strict";

const state = {
  data: null,
  view: "season",
  selectedGame: 0,
  selectedPlayer: null,
};

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
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols));
  const tbody = document.createElement("tbody");
  for (const p of players) {
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
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols));
  const tbody = document.createElement("tbody");
  for (const p of players) {
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

function buildHeader(cols) {
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c.h;
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
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols));
  const tbody = document.createElement("tbody");
  for (const p of game.players) {
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

  // Game log.
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="section-header"><h2>Game Log</h2></div>`;
  card.appendChild(buildPlayerGameLog(player));
  root.appendChild(card);

  return root;
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
  const table = document.createElement("table");
  table.className = "box";
  table.appendChild(buildHeader(cols));
  const tbody = document.createElement("tbody");
  for (const g of player.per_game) {
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
