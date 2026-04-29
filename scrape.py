#!/usr/bin/env python3
"""
Fetch EasyStats box-score pages listed in games.json, extract our team's player
rows, compute per-game and season-aggregate stats, and write data/stats.json
for the frontend to consume.

Stdlib only — no pip install required.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import datetime
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "games.json"
OUT_PATH = ROOT / "data" / "stats.json"

STAT_HEADERS = ["fg", "fg%", "3pt", "3pt%", "ft", "ft%", "oreb", "dreb",
                "foul", "stl", "to", "blk", "asst", "+/-", "pts"]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "CKStats/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def strip_tags(s: str) -> str:
    return unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_made_attempted(cell: str) -> tuple[int, int]:
    if not cell or cell == "-":
        return 0, 0
    m = re.match(r"(\d+)\s*-\s*(\d+)", cell)
    if not m:
        return 0, 0
    return int(m.group(1)), int(m.group(2))


def parse_int(cell: str) -> int:
    if cell is None or cell == "-" or cell == "":
        return 0
    try:
        return int(cell)
    except ValueError:
        return 0


def parse_box_score(html: str, our_team: str, roster: dict | None = None) -> dict:
    """Parse one EasyStats box-score page. Returns dict with game info + our players."""
    title_m = re.search(r"<title>([^<]+)</title>", html)
    title = title_m.group(1).strip() if title_m else ""

    # Title format: "<Team A> <score A> at <Team B> <score B>"
    # The "at" team is the home team; we don't really need home/away, just opp+score.
    score_m = re.match(r"^(.*?)\s+(\d+)\s+at\s+(.*?)\s+(\d+)$", title)
    if not score_m:
        raise ValueError(f"Cannot parse title: {title!r}")
    away_name, away_score, home_name, home_score = score_m.groups()
    away_score, home_score = int(away_score), int(home_score)

    if our_team == home_name:
        opponent = away_name
        our_score, opp_score = home_score, away_score
        location = "home"
    elif our_team == away_name:
        opponent = home_name
        our_score, opp_score = away_score, home_score
        location = "away"
    else:
        raise ValueError(f"Our team {our_team!r} not in title {title!r}")

    date_m = re.search(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+\d{4}",
        html,
    )
    date_str = date_m.group(0) if date_m else ""
    date_iso = ""
    if date_str:
        try:
            date_iso = datetime.strptime(date_str, "%b %d, %Y").date().isoformat()
        except ValueError:
            pass

    # Pull the stats table block.
    table_m = re.search(r"<table id=['\"]stats['\"][^>]*>(.*?)</table>", html, re.S)
    if not table_m:
        raise ValueError("stats table not found")
    table_html = table_m.group(1)

    all_rows = re.findall(r"<tr>(.*?)</tr>", table_html, re.S)
    if not all_rows:
        raise ValueError("no rows in stats table")

    header_cells = [strip_tags(c).lower()
                    for c in re.findall(r"<th>(.*?)</th>", all_rows[0], re.S)]
    if not header_cells:
        raise ValueError("no header row in stats table")
    # Map stat-name → column index. EasyStats sometimes adds a 'min' column.
    col = {name: i for i, name in enumerate(header_cells)}

    def need(name):
        if name not in col:
            raise ValueError(f"missing expected column {name!r} in {header_cells!r}")
        return col[name]

    i_fg, i_3p, i_ft = need("fg"), need("3pt"), need("ft")
    i_oreb, i_dreb = need("oreb"), need("dreb")
    i_foul, i_stl, i_to = need("foul"), need("stl"), need("to")
    i_blk, i_ast = need("blk"), need("asst")
    i_pm, i_pts = need("+/-"), need("pts")

    parsed_rows = []
    for row in all_rows[1:]:
        cells = [strip_tags(c) for c in re.findall(r"<td>(.*?)</td>", row, re.S)]
        if cells:
            parsed_rows.append(cells)

    players = []
    for cells in parsed_rows:
        if len(cells) <= i_pts:
            continue
        label = cells[0]
        if not label.startswith("#"):
            continue
        m = re.match(r"#(\S+)\s+(.+)", label)
        if not m:
            continue
        jersey, name = m.group(1), m.group(2).strip()
        # Apply roster override (e.g., correct mistyped jersey numbers in source).
        if roster and name in roster and "jersey" in roster[name]:
            jersey = str(roster[name]["jersey"])

        fgm, fga = parse_made_attempted(cells[i_fg])
        tpm, tpa = parse_made_attempted(cells[i_3p])
        ftm, fta = parse_made_attempted(cells[i_ft])
        oreb = parse_int(cells[i_oreb])
        dreb = parse_int(cells[i_dreb])
        foul = parse_int(cells[i_foul])
        stl = parse_int(cells[i_stl])
        to = parse_int(cells[i_to])
        blk = parse_int(cells[i_blk])
        ast = parse_int(cells[i_ast])
        plusminus_raw = cells[i_pm]
        plus_minus = None
        if plusminus_raw not in ("", "-"):
            try:
                plus_minus = int(plusminus_raw)
            except ValueError:
                plus_minus = None
        # DNP: the points cell is "-" (a player who plays but scores 0 has pts="0").
        dnp = cells[i_pts] == "-"
        pts = 0 if dnp else parse_int(cells[i_pts])

        players.append({
            "jersey": jersey,
            "name": name,
            "dnp": dnp,
            "fgm": fgm, "fga": fga,
            "tpm": tpm, "tpa": tpa,
            "ftm": ftm, "fta": fta,
            "oreb": oreb, "dreb": dreb, "reb": oreb + dreb,
            "foul": foul, "stl": stl, "to": to, "blk": blk, "ast": ast,
            "plus_minus": plus_minus,
            "pts": pts,
        })

    return {
        "title": title,
        "date": date_iso,
        "date_display": date_str,
        "opponent": opponent,
        "our_score": our_score,
        "opp_score": opp_score,
        "location": location,
        "result": "W" if our_score > opp_score else ("L" if our_score < opp_score else "T"),
        "players": players,
    }


def compute_advanced(stat: dict) -> dict:
    """Add eFG%, TS%, A/TO, FG%, 3P%, FT% to a stat dict (totals or per-game)."""
    fgm, fga = stat.get("fgm", 0), stat.get("fga", 0)
    tpm, tpa = stat.get("tpm", 0), stat.get("tpa", 0)
    ftm, fta = stat.get("ftm", 0), stat.get("fta", 0)
    pts = stat.get("pts", 0)
    ast = stat.get("ast", 0)
    to = stat.get("to", 0)

    fg_pct = (fgm / fga) if fga else None
    tp_pct = (tpm / tpa) if tpa else None
    ft_pct = (ftm / fta) if fta else None
    efg = ((fgm + 0.5 * tpm) / fga) if fga else None
    ts_denom = 2 * (fga + 0.44 * fta)
    ts = (pts / ts_denom) if ts_denom else None
    ato = (ast / to) if to else (float("inf") if ast > 0 else None)

    out = dict(stat)
    out.update({
        "fg_pct": fg_pct,
        "tp_pct": tp_pct,
        "ft_pct": ft_pct,
        "efg_pct": efg,
        "ts_pct": ts,
        "ato": ato if ato != float("inf") else None,  # JSON can't represent inf
        "ato_inf": ato == float("inf"),
    })
    return out


COUNTING_KEYS = ["fgm", "fga", "tpm", "tpa", "ftm", "fta",
                 "oreb", "dreb", "reb", "foul", "stl", "to", "blk", "ast", "pts"]


def aggregate_player(games_for_player: list[dict]) -> dict:
    """Given a list of per-game player stat dicts (only games where they played),
    return a season-aggregate dict with totals + per-game averages + advanced."""
    totals = {k: 0 for k in COUNTING_KEYS}
    plus_minus_total = 0
    plus_minus_games = 0
    games_played = 0
    for g in games_for_player:
        if g.get("dnp"):
            continue
        games_played += 1
        for k in COUNTING_KEYS:
            totals[k] += g.get(k, 0)
        if g.get("plus_minus") is not None:
            plus_minus_total += g["plus_minus"]
            plus_minus_games += 1

    totals["plus_minus"] = plus_minus_total if plus_minus_games else None
    totals = compute_advanced(totals)

    avgs = {}
    if games_played:
        for k in COUNTING_KEYS:
            avgs[k + "_pg"] = totals[k] / games_played
        if plus_minus_games:
            avgs["plus_minus_pg"] = plus_minus_total / plus_minus_games

    return {
        "games_played": games_played,
        "totals": totals,
        "averages": avgs,
    }


def main() -> int:
    config = json.loads(CONFIG_PATH.read_text())
    our_team = config["team_name"]
    roster = config.get("roster", {})

    games_out = []
    # player_key -> {jersey, name, per_game: [...]}
    players_index: dict[tuple[str, str], dict] = {}

    for entry in config["games"]:
        url = entry["url"]
        minutes = entry.get("minutes", 0)
        notes = entry.get("notes", "")
        print(f"fetching {url} ...", file=sys.stderr)
        html = fetch(url)
        game = parse_box_score(html, our_team, roster)
        game["url"] = url
        game["minutes"] = minutes
        game["notes"] = notes
        # Optional opponent name override (EasyStats often uses a short/wrong name).
        if "opponent" in entry:
            game["opponent"] = entry["opponent"]
        # Optional score overrides for source data-entry errors.
        if "our_score" in entry:
            game["our_score"] = int(entry["our_score"])
        if "opp_score" in entry:
            game["opp_score"] = int(entry["opp_score"])
        # Recompute result if either was overridden.
        if "our_score" in entry or "opp_score" in entry:
            game["result"] = ("W" if game["our_score"] > game["opp_score"]
                              else ("L" if game["our_score"] < game["opp_score"] else "T"))
        # Add team totals (sum across our players who played) + advanced.
        team_totals = {k: 0 for k in COUNTING_KEYS}
        for p in game["players"]:
            if p["dnp"]:
                continue
            for k in COUNTING_KEYS:
                team_totals[k] += p.get(k, 0)
        game["team_totals"] = compute_advanced(team_totals)
        # Annotate each player row with advanced.
        game["players"] = [compute_advanced(p) if not p["dnp"] else p
                           for p in game["players"]]
        games_out.append(game)

        for p in game["players"]:
            # Identify player by name only — jersey numbers can change across games.
            key = p["name"].strip().lower()
            if key not in players_index:
                players_index[key] = {
                    "jersey": p["jersey"],
                    "name": p["name"],
                    "jerseys_seen": [p["jersey"]],
                    "per_game": [],
                }
            else:
                if p["jersey"] not in players_index[key]["jerseys_seen"]:
                    players_index[key]["jerseys_seen"].append(p["jersey"])
            players_index[key]["per_game"].append({
                "game_index": len(games_out) - 1,
                "date": game["date"],
                "opponent": game["opponent"],
                "result": game["result"],
                "our_score": game["our_score"],
                "opp_score": game["opp_score"],
                **p,
            })

    # Build season aggregate per player.
    players_out = []
    for key, info in players_index.items():
        agg = aggregate_player(info["per_game"])
        players_out.append({
            "jersey": info["jersey"],
            "jerseys_seen": info["jerseys_seen"],
            "name": info["name"],
            "per_game": info["per_game"],
            **agg,
        })

    # Sort: by points scored season total desc, but DNP-only at bottom.
    players_out.sort(key=lambda p: (-(p["totals"].get("pts") or 0), p["name"]))

    # Team season totals.
    team_season_totals = {k: 0 for k in COUNTING_KEYS}
    plus_minus_total = 0
    games_count = len(games_out)
    for g in games_out:
        for k in COUNTING_KEYS:
            team_season_totals[k] += g["team_totals"].get(k, 0)
        plus_minus_total += g["our_score"] - g["opp_score"]
    team_season_totals["plus_minus"] = plus_minus_total
    team_season_totals = compute_advanced(team_season_totals)

    record = {"W": 0, "L": 0, "T": 0}
    for g in games_out:
        record[g["result"]] += 1

    out = {
        "team_name": our_team,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "games": games_out,
        "players": players_out,
        "season": {
            "games": games_count,
            "record": record,
            "team_totals": team_season_totals,
            "total_minutes": sum(g.get("minutes", 0) for g in games_out),
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"wrote {OUT_PATH}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
