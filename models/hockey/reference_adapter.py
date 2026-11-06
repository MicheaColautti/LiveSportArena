"""Optional bridge to the supplied notebook model. Training is never automatic by default."""
from pathlib import Path


def predict(context):
    from .reference_model import prevedi_national_league
    result, _, _ = prevedi_national_league(
        data_dir=Path(context["dataDirectory"]),
        data_previsione=context["targetDate"],
        output_dir=Path("national_league_predictions"),
    )
    return [{"gameId": str(r["game_id"]), "homeProbability": float(r["probabilita_casa"]),
             "awayProbability": float(r["probabilita_ospite"]), "score": r["risultato_indicativo"],
             "homeExpectedGoals": float(r["gol_attesi_60_casa"]), "awayExpectedGoals": float(r["gol_attesi_60_ospite"])}
            for r in result.to_dict("records")]
