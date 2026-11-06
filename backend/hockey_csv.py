"""Collector CSV adapted from the user's DownlaodAndUpdate.ipynb.

Kept separate from the lightweight website refresh. Historical seasons are
useful for training; the public website only displays the current season.
"""
from .diagnostics import logged_update, sihf_call
import argparse
import json
import time
from pathlib import Path
from collections import defaultdict, deque
import numpy as np
import pandas as pd
from sportsdataverse.hockey.sihf import sihf_results, sihf_game_team_stats, sihf_game_player_stats


def fetch_df(func, **kwargs):
    """Usa pandas come formato di ritorno (libreria nativamente anche Polars)."""
    result = sihf_call(func, return_as_pandas=True, **kwargs)
    return pd.DataFrame(result)


def read_csv(path: Path) -> pd.DataFrame:
    if path.exists() and path.stat().st_size:
        try:
            return pd.read_csv(path, dtype={"game_id": "string"})
        except pd.errors.EmptyDataError:
            pass
    return pd.DataFrame()


def save_csv(df: pd.DataFrame, path: Path):
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"  Salvato {path.name}: {len(df)} righe")


def merge_by_key(old: pd.DataFrame, fresh: pd.DataFrame, keys: list[str]):
    old, fresh = old.copy(), fresh.copy()
    # I CSV contengono id stringa, mentre SIHF restituisce id numerici.
    for frame in (old, fresh):
        if "game_id" in frame and "game_id" in keys:
            frame["game_id"] = frame["game_id"].astype("string").str.replace(r"\.0$", "", regex=True)
    if old.empty:
        return fresh.copy()
    if fresh.empty:
        return old.copy()
    combined = pd.concat([old, fresh], ignore_index=True)
    return combined.drop_duplicates(subset=keys, keep="last").reset_index(drop=True)


def as_periods(value):
    """Converte array, liste, tuple o JSON in una lista di gol per periodo."""
    if isinstance(value, np.ndarray):
        value = value.tolist()
    elif isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return []

    # None, NaN e pd.NA non sono sequenze: evita pd.isna su un array.
    if not isinstance(value, (list, tuple)):
        return []

    try:
        return [int(v) for v in value]
    except (ValueError, TypeError, OverflowError):
        return []


def prepare_matches(df):
    if df.empty:
        return df
    df = df.copy()
    df["game_id"] = df["game_id"].astype("string").str.replace(r"\.0$", "", regex=True)
    for key in ("score_per_period_home", "score_per_period_away"):
        if key in df:
            df[key] = df[key].map(lambda x: json.dumps(as_periods(x)))
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    for c in ("score_home", "score_away", "status_id", "season"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    finished = (df["status_id"] == 12) & df["score_home"].notna() & df["score_away"].notna()
    if "status_canceled" in df:
        finished &= ~df["status_canceled"].astype("string").str.lower().eq("true")
    df["is_finished"] = finished.fillna(False)
    home_60, away_60, winner, extra = [], [], [], []
    for r in df.to_dict("records"):
        ph, pa = as_periods(r.get("score_per_period_home")), as_periods(r.get("score_per_period_away"))
        ok = bool(r.get("is_finished"))
        # Non dedurre i gol ai 60' dal risultato finale di una partita OT/SO.
        home_60.append(sum(ph[:3]) if ok and len(ph) >= 3 else pd.NA)
        away_60.append(sum(pa[:3]) if ok and len(pa) >= 3 else pd.NA)
        decision = r.get("decision")
        dec = "" if pd.isna(decision) else str(decision).upper()
        extra.append(dec if dec in ("OT", "SO") and ok else ("REG" if ok else pd.NA))
        a, b = r.get("score_home"), r.get("score_away")
        winner.append("home" if ok and a > b else "away" if ok and b > a else pd.NA)
    df["goals_60_home"] = home_60
    df["goals_60_away"] = away_60
    df["decision_type"] = extra
    df["winner_final"] = winner
    df["overtime_needed"] = df["decision_type"].isin(["OT", "SO"]).where(df["is_finished"], pd.NA)
    return df.sort_values(["date", "game_id"], kind="stable").reset_index(drop=True)


def shots_by_game(game_stats):
    """Tiri nello specchio per partita, dalla voce SIHF SOG Total.

    Le statistiche mancanti restano mancanti: non sono mai sostituite con zero.
    """
    if game_stats is None or game_stats.empty:
        return {}
    required = {"game_id", "statistic", "home_value", "away_value"}
    if not required.issubset(game_stats.columns):
        raise ValueError(f"Colonne mancanti in game_stats.csv: {sorted(required - set(game_stats.columns))}")
    labels = game_stats["statistic"].astype("string").str.strip().str.replace(r"\s+", " ", regex=True).str.casefold()
    shots = game_stats.loc[labels.eq("sog total").fillna(False)].copy()
    shots["game_id"] = shots["game_id"].astype("string").str.replace(r"\.0$", "", regex=True)
    shots = shots.dropna(subset=["game_id"]).drop_duplicates("game_id", keep="last")
    for col in ("home_value", "away_value"):
        values = pd.to_numeric(shots[col], errors="coerce")
        # Un conteggio deve essere finito, intero e non negativo.
        valid = np.isfinite(values) & values.ge(0) & values.mod(1).eq(0)
        shots[col] = values.where(valid)
    return {
        str(row["game_id"]): (row["home_value"], row["away_value"])
        for row in shots.to_dict("records")
    }


def make_features(matches, game_stats=None):
   
    if matches.empty:
        return pd.DataFrame()
    shot_lookup = shots_by_game(game_stats)
    history = defaultdict(lambda: deque(maxlen=5))
    last_date = {}
    rows = []
    for m in matches.sort_values(["date", "game_id"], kind="stable").to_dict("records"):
        home = str(m.get("home_team_id"))
        away = str(m.get("away_team_id"))
        d = pd.to_datetime(m.get("date"), errors="coerce")
        out = {
            "game_id": m["game_id"], "date": m.get("date"),
            "season": m.get("season"), "home_team_id": m.get("home_team_id"),
            "away_team_id": m.get("away_team_id"),
            "home_team_name": m.get("home_team_name"), "away_team_name": m.get("away_team_name"),
        }
        for side, team in (("home", home), ("away", away)):
            hist = history[team]
            out[f"{side}_prior_games"] = len(hist)
            for metric in ("gf", "ga", "win"):
                vals = [x[metric] for x in hist if pd.notna(x.get(metric))]
                out[f"{side}_{metric}_last5"] = (sum(vals) / len(vals)) if vals else pd.NA
            shots = [x["shots"] for x in hist if pd.notna(x["shots"])]
            out[f"{side}_shots_last5_n"] = len(shots)
            out[f"{side}_shots_last5"] = sum(shots) / 5 if len(shots) == 5 else pd.NA
            old_date = last_date.get(team)
            out[f"{side}_rest_days"] = ((d - old_date).days - 1) if old_date is not None and pd.notna(d) else pd.NA
        # Target disponibili soltanto per gare concluse.
        out.update({
            "goals_60_home": m.get("goals_60_home"),
            "goals_60_away": m.get("goals_60_away"),
            "winner_final": m.get("winner_final"),
            "decision_type": m.get("decision_type"),
            "overtime_needed": m.get("overtime_needed"),
            "is_finished": m.get("is_finished"),
        })
        rows.append(out)
        if not m.get("is_finished"):
            continue
        gf_h, gf_a = m.get("goals_60_home"), m.get("goals_60_away")
        # Aggiorna lo storico DOPO aver creato la riga: nessun dato della
        # partita corrente entra nei suoi stessi predittori.
        gid = str(m["game_id"])
        if gid.endswith(".0"):
            gid = gid[:-2]
        shots_h, shots_a = shot_lookup.get(gid, (pd.NA, pd.NA))
        gf_h = float(gf_h) if pd.notna(gf_h) else pd.NA
        gf_a = float(gf_a) if pd.notna(gf_a) else pd.NA
        winner = m.get("winner_final")
        win_h = int(winner == "home") if pd.notna(winner) else pd.NA
        win_a = int(winner == "away") if pd.notna(winner) else pd.NA
        # Anche una gara senza gol per periodo occupa un posto nelle ultime 5.
        history[home].append({"gf": gf_h, "ga": gf_a, "win": win_h, "shots": shots_h})
        history[away].append({"gf": gf_a, "ga": gf_h, "win": win_a, "shots": shots_a})
        if pd.notna(d):
            last_date[home] = d
            last_date[away] = d
    return pd.DataFrame(rows)


@logged_update("hockey_csv")
def main():
    p = argparse.ArgumentParser(description="Aggiorna dati reali National League SIHF in CSV")
    p.add_argument("--start-season", type=int, default=2022)
    p.add_argument("--end-season", type=int, default=2027)
    p.add_argument("--max-details", type=int, default=100, help="Max partite per cui recuperare nuove statistiche dettagliate (default: 100)")
    p.add_argument("--players", action="store_true", help="Includi statistiche giocatori delle stesse nuove partite")
    p.add_argument("--out", type=Path, default=Path("national_league_data"))
    args = p.parse_args()
    if args.start_season > args.end_season or args.max_details < 0:
        p.error("Intervallo di stagioni o max-details non valido")
    args.out.mkdir(parents=True, exist_ok=True)

    matches_path = args.out / "matches.csv"
    old = read_csv(matches_path)
    batches = []
    for season in range(args.start_season, args.end_season + 1):
        print(f"Risultati stagione {season-1}/{str(season)[-2:]}...")
        try:
            df = fetch_df(sihf_results, season=season, league_id=1, language="en")
            if not df.empty:
                if "row_type" in df:
                    df = df.loc[df["row_type"].eq("data")].copy()
                df["season"] = season
                batches.append(df)
                print(f"  {len(df)} partite trovate")
        except Exception as exc:
            print(f"  ATTENZIONE: stagione non scaricata: {exc}")
        time.sleep(1.2)
    if not batches and old.empty:
        raise SystemExit("Nessun dato: controlla connessione, versioni libreria e disponibilità SIHF")
    fresh = pd.concat(batches, ignore_index=True) if batches else pd.DataFrame()
    merged = merge_by_key(old, fresh, ["game_id"])
    if "season" in merged:
        merged = merged.loc[pd.to_numeric(merged["season"], errors="coerce").between(args.start_season, args.end_season)]
    matches = prepare_matches(merged)
    save_csv(matches, matches_path)

    stats_path = args.out / "game_stats.csv"
    old_stats = read_csv(stats_path)
    player_path = args.out / "player_stats.csv"
    old_players = read_csv(player_path) if args.players else pd.DataFrame()
    cached_stats = set(old_stats["game_id"].astype(str)) if not old_stats.empty else set()
    completed = matches.loc[matches["is_finished"]].sort_values("date", ascending=False)
    cached_players = set(old_players["game_id"].astype(str)) if not old_players.empty else set()
    needs_stats = ~completed["game_id"].isin(cached_stats)
    needs_players = ~completed["game_id"].isin(cached_players) if args.players else False
    pending = completed.loc[needs_stats | needs_players].head(args.max_details)
    new_stats, new_players = [], []
    for m in pending.to_dict("records"):
        gid = str(m["game_id"])
        print(f"Dettagli game_id={gid}...")
        try:
            stats = fetch_df(sihf_game_team_stats, game_id=int(gid), language="en")
            if not stats.empty:
                stats["game_id"] = gid
                new_stats.append(stats)
            else:
                print("  Nessuna statistica restituita; riproverò al prossimo aggiornamento")
        except Exception as exc:
            print(f"  ATTENZIONE statistiche: {exc}")
        time.sleep(1.2)
        if args.players:
            try:
                players = fetch_df(sihf_game_player_stats, game_id=int(gid), language="en")
                if not players.empty:
                    players["game_id"] = gid
                    new_players.append(players)
            except Exception as exc:
                print(f"  ATTENZIONE giocatori: {exc}")
            time.sleep(1.2)

    stats = pd.concat([old_stats, *new_stats], ignore_index=True) if new_stats else old_stats
    if not stats.empty:
        stats["game_id"] = stats["game_id"].astype("string").str.replace(r"\.0$", "", regex=True)
        stats = stats.drop_duplicates(subset=["game_id", "statistic"], keep="last")
    save_csv(stats, stats_path)
    if args.players:
        players = pd.concat([old_players, *new_players], ignore_index=True) if new_players else old_players
        if not players.empty:
            players["game_id"] = players["game_id"].astype("string").str.replace(r"\.0$", "", regex=True)
            players = players.drop_duplicates(subset=["game_id", "team_side", "player_id", "row_type"], keep="last")
        save_csv(players, player_path)

    features = make_features(matches, stats)
    save_csv(features, args.out / "team_features.csv")
    save_csv(features, args.out / "ml_dataset.csv")
    for side in ("home", "away"):
        available = features.get(f"{side}_shots_last5", pd.Series(dtype=float)).notna().sum()
        print(f"Tiri pregara {side}: {available}/{len(features)} medie disponibili (richiesti 5 dati su 5).")
    print("Per ampliare lo storico dei tiri, riesegui lo script o aumenta --max-details.")
    print("\nFatto. 'ml_dataset.csv' contiene feature pregara e target postpartita; le righe future hanno target mancanti.")
    print("NOTA: 'game_stats.csv' sono statistiche POST-partita, NON usarle direttamente come feature per predizioni pregara.")
    print("I file vengono aggiornati quando riesegui questo script, non automaticamente in background.")


if __name__ == "__main__":
    main()