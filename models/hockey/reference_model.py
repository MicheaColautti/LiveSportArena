"""User supplied reference model, inactive until explicitly enabled. No training on import."""
# PREVISIONI NATIONAL LEAGUE — blocco autonomo: eseguilo dopo l'aggiornamento CSV.
from pathlib import Path
from collections import defaultdict, deque
from importlib.metadata import version
import json
import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.metrics import accuracy_score, log_loss, brier_score_loss, mean_poisson_deviance

try:
    from xgboost import XGBClassifier, XGBRegressor
except ImportError as exc:
    raise ImportError("Installa XGBoost nel kernel corrente: %pip install xgboost") from exc

SEED = 42


def _vero(values):
    return values.astype("string").str.strip().str.lower().isin(["true", "1", "1.0"])


def _dati_pregara(matches, data_previsione):
    """Ricostruisce gli input dai risultati; aggiorna gli storici solo a fine giornata.

    Anche rieseguendo il blocco in futuro, i risultati del giorno richiesto e dei
    giorni successivi NON entrano nello storico, nel training o nelle feature.
    """
    m = matches.copy()
    required = {
        "game_id", "date", "season", "status_id", "home_team_id", "away_team_id",
        "home_team_name", "away_team_name", "score_home", "score_away",
        "goals_60_home", "goals_60_away",
    }
    if not required.issubset(m):
        raise ValueError(f"matches.csv: colonne mancanti {sorted(required - set(m))}")
    m["date"] = pd.to_datetime(m["date"], errors="coerce").dt.normalize()
    m = m.dropna(subset=["date", "game_id", "home_team_id", "away_team_id"])
    m["game_id"] = m["game_id"].astype("string").str.replace(r"\.0$", "", regex=True)
    m = m.drop_duplicates("game_id", keep="last")
    for c in ("season", "status_id", "score_home", "score_away", "goals_60_home", "goals_60_away"):
        m[c] = pd.to_numeric(m[c], errors="coerce")
    if "status_canceled" in m:
        m = m.loc[~_vero(m["status_canceled"])].copy()
    for side in ("home", "away"):
        m[f"{side}_team_id"] = m[f"{side}_team_id"].astype("string").str.replace(r"\.0$", "", regex=True)
    m = m.loc[m["date"].le(data_previsione)].sort_values(["date", "game_id"])
    m["known_result"] = (
        m["date"].lt(data_previsione) & m["status_id"].eq(12)
        & m[["score_home", "score_away"]].notna().all(axis=1)
        & m["score_home"].ne(m["score_away"])
        & m[["score_home", "score_away"]].ge(0).all(axis=1)
    )
    ratings = defaultdict(lambda: 1500.0)
    histories = defaultdict(lambda: deque(maxlen=20))
    season_history = defaultdict(list)
    last_date, last_season = {}, {}
    rows = []
    for day, games in m.groupby("date", sort=True):
        # Tutte le gare dello stesso giorno condividono lo stato di inizio giornata.
        for g in games.to_dict("records"):
            for side in ("home", "away"):
                t = g[f"{side}_team_id"]
                if t in last_season and last_season[t] != g["season"]:
                    ratings[t] = 1500 + 0.75 * (ratings[t] - 1500)
                    season_history[t] = []
                    histories[t].clear()
                last_season[t] = g["season"]
            h, a = g["home_team_id"], g["away_team_id"]
            row = {k: g.get(k) for k in (
                "game_id", "season", "home_team_id", "away_team_id",
                "home_team_name", "away_team_name", "time",
            )}
            row.update(date=day, home_elo=ratings[h], away_elo=ratings[a])
            row["elo_diff"] = ratings[h] - ratings[a]
            for side, t in (("home", h), ("away", a)):
                hist, sh = list(histories[t]), season_history[t]
                row[f"{side}_games_season"] = len(sh)
                row[f"{side}_rest"] = min(14, max(0, (day - last_date[t]).days - 1)) if t in last_date else 14
                for window in (5, 10, 20):
                    recent = hist[-window:]
                    row[f"{side}_n_last{window}"] = len(recent)
                    for metric in ("gf", "ga", "win", "adjusted_margin"):
                        values = [x[metric] for x in recent if np.isfinite(x[metric])]
                        row[f"{side}_{metric}_last{window}"] = np.mean(values) if values else np.nan
                # Prior deboli e fissi, mai stimati usando stagioni future.
                for metric, prior in (("gf", 2.8), ("ga", 2.8), ("win", 0.5)):
                    values = [x[metric] for x in sh if np.isfinite(x[metric])]
                    row[f"{side}_{metric}_season"] = (sum(values) + 5 * prior) / (len(values) + 5)
            # Solo queste colonne saranno input: i target vengono aggiunti dopo.
            for metric in ("rest", "gf_last5", "ga_last5", "win_last5", "gf_last20", "ga_last20", "win_last20", "win_season"):
                row[f"diff_{metric}"] = row[f"home_{metric}"] - row[f"away_{metric}"]
            row["home_win"] = int(g["score_home"] > g["score_away"]) if g["known_result"] else np.nan
            for side in ("home", "away"):
                v = g[f"goals_60_{side}"]
                row[f"target_goals_{side}"] = v if g["known_result"] and pd.notna(v) and np.isfinite(v) and v >= 0 and v % 1 == 0 else np.nan
            rows.append(row)
        for g in games.to_dict("records"):
            if not g["known_result"]:
                continue
            h, a = g["home_team_id"], g["away_team_id"]
            win = float(g["score_home"] > g["score_away"])
            expected = 1 / (1 + 10 ** (-(ratings[h] - ratings[a] + 55) / 400))
            delta = 20 * (win - expected)
            gh, ga = g["goals_60_home"], g["goals_60_away"]
            valid_goals = pd.notna(gh) and pd.notna(ga) and gh >= 0 and ga >= 0 and gh % 1 == 0 and ga % 1 == 0
            gh, ga = (float(gh), float(ga)) if valid_goals else (np.nan, np.nan)
            # Margine corretto per la forza dell'avversario, nota prima della gara.
            margin = gh - ga - (ratings[h] - ratings[a] + 55) / 150
            for t, gf, gc, w, residual in ((h, gh, ga, win, margin), (a, ga, gh, 1-win, -margin)):
                record = dict(gf=gf, ga=gc, win=w, adjusted_margin=residual)
                histories[t].append(record)
                season_history[t].append(record)
                last_date[t] = day
            ratings[h] += delta
            ratings[a] -= delta
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise ValueError("Nessuna partita disponibile entro la data richiesta.")
    excluded = {"game_id", "date", "season", "home_team_name", "away_team_name", "time", "home_win", "target_goals_home", "target_goals_away"}
    inputs = [c for c in frame if c not in excluded]
    return frame, inputs


def _preprocess(columns, scale=False):
    categorical = [c for c in ("home_team_id", "away_team_id") if c in columns]
    numeric = [c for c in columns if c not in categorical]
    steps = [("missing", SimpleImputer(strategy="median", keep_empty_features=True))]
    if scale:
        steps.append(("scale", StandardScaler()))
    transformers = [("num", Pipeline(steps), numeric)]
    if categorical:
        transformers.append(("teams", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical))
    return ColumnTransformer(transformers)


def _fit_base(train, columns):
    """Parametri fissati prima del test; pesi temporali calcolati SOLO sul train."""
    X, y = train[columns], train["home_win"].astype(int)
    age = (train["date"].max() - train["date"]).dt.days
    weights = np.maximum(0.25, np.exp(-np.log(2) * age / 730))
    specs = {
        "Elo": (["elo_diff"], LogisticRegression(C=1.0, max_iter=2000), True),
        "Logistica C=0.1": (columns, LogisticRegression(C=0.1, max_iter=2000), True),
        "Logistica C=1": (columns, LogisticRegression(C=1.0, max_iter=2000), True),
        "XGBoost depth=2": (columns, XGBClassifier(
            n_estimators=300, max_depth=2, learning_rate=0.025, min_child_weight=20,
            reg_lambda=15, subsample=0.85, colsample_bytree=0.85,
            tree_method="hist", eval_metric="logloss", n_jobs=2, random_state=SEED,
        ), False),
        "XGBoost depth=3": (columns, XGBClassifier(
            n_estimators=300, max_depth=3, learning_rate=0.025, min_child_weight=25,
            reg_lambda=20, subsample=0.85, colsample_bytree=0.85,
            tree_method="hist", eval_metric="logloss", n_jobs=2, random_state=SEED,
        ), False),
    }
    models = {}
    for name, (cols, model, scale) in specs.items():
        pipe = Pipeline([("prepare", _preprocess(cols, scale)), ("model", model)])
        pipe.fit(X[cols], y, model__sample_weight=weights)
        models[name] = (cols, pipe)
    # Due modelli gol per ogni specifica: casa e trasferta, solo gol nei 60'.
    goal_models = {}
    good = train[["target_goals_home", "target_goals_away"]].notna().all(axis=1)
    for name in ("Poisson alpha=0.1", "Poisson alpha=1", "XGBoost Poisson"):
        pair = []
        for side in ("home", "away"):
            if name.startswith("Poisson"):
                estimator = PoissonRegressor(alpha=0.1 if name.endswith("0.1") else 1.0, max_iter=1000)
            else:
                estimator = XGBRegressor(
                    objective="count:poisson", n_estimators=250, max_depth=2,
                    learning_rate=0.025, min_child_weight=25, reg_lambda=20,
                    subsample=0.85, colsample_bytree=0.85, tree_method="hist",
                    n_jobs=2, random_state=SEED,
                )
            pipe = Pipeline([("prepare", _preprocess(columns, scale=name.startswith("Poisson"))), ("model", estimator)])
            pipe.fit(X.loc[good], train.loc[good, f"target_goals_{side}"], model__sample_weight=weights.loc[good])
            pair.append(pipe)
        goal_models[name] = pair
    return models, goal_models, float(np.average(y, weights=weights))


def _predict_base(fitted, frame, columns):
    models, goal_models, home_rate = fitted
    probabilities = {name: pipe.predict_proba(frame[cols])[:, 1] for name, (cols, pipe) in models.items()}
    probabilities["Ensemble logistica/XGBoost"] = 0.5 * probabilities["Logistica C=0.1"] + 0.5 * probabilities["XGBoost depth=2"]
    probabilities["Ensemble Elo/logistica/XGBoost"] = (
        0.5 * probabilities["Elo"] + 0.25 * probabilities["Logistica C=0.1"] + 0.25 * probabilities["XGBoost depth=2"]
    )
    probabilities["Baseline frequenza casa"] = np.full(len(frame), home_rate)
    goals = {name: np.column_stack([pipe.predict(frame[columns]) for pipe in pair]) for name, pair in goal_models.items()}
    goals["Ensemble Poisson/XGBoost"] = 0.5 * goals["Poisson alpha=0.1"] + 0.5 * goals["XGBoost Poisson"]
    return probabilities, {name: np.maximum(values, 1e-6) for name, values in goals.items()}


def _metriche(y, p):
    return dict(accuracy=accuracy_score(y, p >= 0.5), log_loss=log_loss(y, p, labels=[0, 1]), brier=brier_score_loss(y, p))


def _score_finale(mu_home, mu_away, p_home):
    """Score illustrativo: Poisson indipendenti ai 60', pareggi decisi OT/SO.

    Si ridistribuisce la massa dei due vincitori per rispettare la probabilità
    del classificatore. Lo score scelto è il più probabile TRA quelli della
    squadra favorita: non è necessariamente il massimo assoluto della griglia.
    """
    limit = max(20, int(poisson.ppf(0.999999, max(mu_home, mu_away))))
    k = np.arange(limit + 1)
    reg = np.outer(poisson.pmf(k, mu_home), poisson.pmf(k, mu_away))
    reg /= reg.sum()
    final = np.pad(reg, ((0, 1), (0, 1)))
    for j in k:
        tied = final[j, j]
        final[j, j] = 0
        final[j+1, j] += tied / 2
        final[j, j+1] += tied / 2
    hh, aa = np.indices(final.shape)
    home_wins, away_wins = hh > aa, hh < aa
    final[home_wins] *= p_home / final[home_wins].sum()
    final[away_wins] *= (1-p_home) / final[away_wins].sum()
    allowed = home_wins if p_home >= 0.5 else away_wins
    score = np.unravel_index(np.where(allowed, final, -1).argmax(), final.shape)
    return f"{score[0]}-{score[1]}", float(final[score])


def prevedi_national_league(data_dir, data_previsione, output_dir):
    cutoff = pd.Timestamp(data_previsione).normalize()
    raw = pd.read_csv(Path(data_dir) / "matches.csv", dtype={"game_id": "string"})
    frame, columns = _dati_pregara(raw, cutoff)
    history = frame.loc[frame["date"].lt(cutoff) & frame["home_win"].notna()].copy()
    today = frame.loc[frame["date"].eq(cutoff)].sort_values(["time", "game_id"]).copy()
    if today.empty:
        print(f"Nessuna partita non annullata nel CSV per il {cutoff:%d/%m/%Y}. Aggiorna i dati SIHF.")
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
    seasons = sorted(history["season"].dropna().unique())
    if len(seasons) < 5:
        raise ValueError("Servono almeno cinque stagioni per separare selezione e test temporale.")
    # Ultime due stagioni RISERVATE al test; nessuna scelta dipende dai loro risultati.
    test_seasons = seasons[-2:]
    development = history.loc[history["season"].lt(test_seasons[0])]
    dev_seasons = sorted(development["season"].unique())
    print(f"Previsioni pregara del {cutoff:%d/%m/%Y} — orari Europe/Zurich")
    print(f"Storico: {len(history)} gare concluse, dal {history.date.min():%d/%m/%Y} al {history.date.max():%d/%m/%Y}.")
    print("Le gare annullate o senza un vincitore finale identificabile sono escluse dal modello binario.")
    print("Ricostruzione cronologica di Elo, forma nelle ultime 5/10/20 gare, rendimento stagionale e riposo.")
    print("I tiri non sono usati: lo storico dettagliato è troppo incompleto rispetto ai risultati.")
    print("Selezione mediante validazione temporale per stagione; può richiedere qualche minuto.", flush=True)
    cv_y, cv_true_goals, cv_p, cv_g = [], [], defaultdict(list), defaultdict(list)
    fold_report = []
    for season in dev_seasons[1:]:
        train = development.loc[development["season"].lt(season)]
        valid = development.loc[development["season"].eq(season)]
        if train.date.max() >= valid.date.min():
            raise ValueError("Stagioni sovrapposte: impossibile garantire una separazione temporale.")
        p, g = _predict_base(_fit_base(train, columns), valid, columns)
        cv_y.extend(valid["home_win"].astype(int))
        cv_true_goals.append(valid[["target_goals_home", "target_goals_away"]].to_numpy())
        for name, values in p.items():
            cv_p[name].append(values)
        for name, values in g.items():
            cv_g[name].append(values)
        fold_report.append(dict(train_end=str(train.date.max().date()), valid_start=str(valid.date.min().date()), valid_end=str(valid.date.max().date()), n_train=len(train), n_valid=len(valid)))
        print(f"  Validazione stagione {int(season)-1}/{str(int(season))[-2:]}: {len(train)} train, {len(valid)} validazione.", flush=True)
    ycv = np.asarray(cv_y)
    ranking = pd.DataFrame([dict(modello=name, **_metriche(ycv, np.concatenate(parts))) for name, parts in cv_p.items()]).sort_values("log_loss").reset_index(drop=True)
    selected = ranking.loc[0, "modello"]
    true_goals = np.concatenate(cv_true_goals)
    ok = np.isfinite(true_goals).all(axis=1)
    goal_ranking = pd.DataFrame([
        dict(modello=name,
             poisson_deviance=mean_poisson_deviance(true_goals[ok].ravel(), np.concatenate(parts)[ok].ravel()),
             mae_gol=np.abs(true_goals[ok] - np.concatenate(parts)[ok]).mean())
        for name, parts in cv_g.items()
    ]).sort_values("poisson_deviance").reset_index(drop=True)
    selected_goals = goal_ranking.loc[0, "modello"]
    print("\nConfronto in VALIDAZIONE (log loss e Brier: più bassi è meglio):")
    print(ranking.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print("\nModelli gol ai 60' (deviance e MAE: più bassi è meglio):")
    print(goal_ranking.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(f"\nScelta bloccata prima del test: {selected}; gol: {selected_goals}.")
    # Test progressivo: si riaddestra all'inizio di ogni stagione, senza cambiarne
    # modello o parametri. Le feature di ciascuna gara includono solo gare precedenti.
    test_y, test_p, base_p, test_goals, test_mu, test_base_mu = [], [], [], [], [], []
    test_rows = []
    for season in test_seasons:
        train = history.loc[history["season"].lt(season)]
        test = history.loc[history["season"].eq(season)]
        if train.date.max() >= test.date.min():
            raise ValueError("Sovrapposizione temporale tra training e test.")
        p, g = _predict_base(_fit_base(train, columns), test, columns)
        y = test["home_win"].astype(int).to_numpy()
        metrics = _metriche(y, p[selected])
        test_rows.append(dict(stagione=int(season), n=len(test), **metrics))
        test_y.extend(y)
        test_p.extend(p[selected])
        base_p.extend(p["Baseline frequenza casa"])
        test_goals.append(test[["target_goals_home", "target_goals_away"]].to_numpy())
        test_mu.append(g[selected_goals])
        test_base_mu.append(np.tile(train[["target_goals_home", "target_goals_away"]].mean().to_numpy(), (len(test), 1)))
    yt, pt, pb = np.asarray(test_y), np.asarray(test_p), np.asarray(base_p)
    metrics = _metriche(yt, pt)
    baseline = _metriche(yt, pb)
    test_report = pd.DataFrame(test_rows)
    print("\nTEST TEMPORALE escluso dalla selezione:")
    print(test_report.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(f"Totale {len(yt)} gare: accuratezza {metrics['accuracy']:.1%}; baseline casa {baseline['accuracy']:.1%}.")
    print(f"Log loss modello {metrics['log_loss']:.3f}, baseline {baseline['log_loss']:.3f}; Brier {metrics['brier']:.3f}.")
    true, mu, mu_base = np.concatenate(test_goals), np.concatenate(test_mu), np.concatenate(test_base_mu)
    ok = np.isfinite(true).all(axis=1)
    mae = np.abs(true[ok] - mu[ok]).mean()
    deviance = mean_poisson_deviance(true[ok].ravel(), mu[ok].ravel())
    baseline_mae = np.abs(true[ok] - mu_base[ok]).mean()
    baseline_deviance = mean_poisson_deviance(true[ok].ravel(), mu_base[ok].ravel())
    print(f"Gol ai 60': MAE {mae:.2f} gol/squadra (baseline {baseline_mae:.2f}); deviance {deviance:.3f} (baseline {baseline_deviance:.3f}).")
    if metrics["log_loss"] >= baseline["log_loss"]:
        print("ATTENZIONE: nel test il modello non migliora la probabilità media di vittoria in casa.")
    # Il test è stato riportato; per stasera si riaddestra lo stesso modello su
    # TUTTO lo storico precedente al cutoff, senza ulteriori scelte sui risultati.
    p_today, g_today = _predict_base(_fit_base(history, columns), today, columns)
    probabilities, means = p_today[selected], g_today[selected_goals]
    predictions = []
    for row, ph, (mh, ma) in zip(today.to_dict("records"), probabilities, means):
        ph = float(np.clip(ph, 1e-6, 1-1e-6))
        score, exact = _score_finale(mh, ma, ph)
        predictions.append(dict(
            data=str(cutoff.date()), game_id=row["game_id"], ora=row.get("time", ""),
            casa=row["home_team_name"], ospite=row["away_team_name"],
            risultato_indicativo=score,
            vincente_prevista=row["home_team_name"] if ph >= 0.5 else row["away_team_name"],
            probabilita_casa=ph, probabilita_ospite=1-ph,
            gol_attesi_60_casa=float(mh), gol_attesi_60_ospite=float(ma),
            probabilita_score_indicativa=exact,
        ))
    result = pd.DataFrame(predictions)
    display_table = result[["ora", "casa", "ospite", "risultato_indicativo", "vincente_prevista"]].copy()
    display_table["P(vincente)"] = result[["probabilita_casa", "probabilita_ospite"]].max(axis=1).map(lambda p: f"{p:.1%}")
    display_table["Gol attesi 60'"] = [f"{h:.2f}-{a:.2f}" for h, a in means]
    print(f"\nPARTITE DEL {cutoff:%d/%m/%Y} — score e vincente includono eventuali OT/rigori")
    print(display_table.to_string(index=False))
    print("\nIl punteggio è lo score più probabile tra quelli in cui vince la favorita, in un'approssimazione Poisson.")
    print("La probabilità mostrata riguarda il VINCITORE, non lo score esatto; le probabilità sono stime del modello.")
    print(f"Probabilità indicative degli score esatti: {result.probabilita_score_indicativa.min():.1%}–{result.probabilita_score_indicativa.max():.1%}.")
    print("Infortuni, formazioni e portieri titolari non sono disponibili nei dati utilizzati.")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    result.to_csv(out / f"previsioni_{cutoff:%Y-%m-%d}.csv", index=False, encoding="utf-8-sig")
    ranking.to_csv(out / "confronto_modelli.csv", index=False, encoding="utf-8-sig")
    goal_ranking.to_csv(out / "confronto_modelli_gol.csv", index=False, encoding="utf-8-sig")
    test_report.to_csv(out / "verifica_test_temporale.csv", index=False, encoding="utf-8-sig")
    report = dict(
        data_previsione=str(cutoff.date()), modello_vincente=selected, modello_gol=selected_goals,
        n_training=len(history), ultimo_risultato_usato=str(history.date.max().date()),
        n_test=len(yt), metriche_test=metrics, baseline_test=baseline,
        gol_test=dict(mae=mae, poisson_deviance=deviance, baseline_mae=baseline_mae, baseline_deviance=baseline_deviance),
        folds_validazione=fold_report, feature_columns=columns, seed=SEED,
        versioni={p: version(p) for p in ("pandas", "numpy", "scipy", "scikit-learn", "xgboost")},
    )
    (out / f"report_{cutoff:%Y-%m-%d}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nPrevisioni e verifica salvate in: {out.resolve()}")
    return result, ranking, test_report

