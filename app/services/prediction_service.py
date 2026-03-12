import numpy as np
import pandas as pd
from joblib import load
from pathlib import Path

from ..utils.preprocessing import preprocess_features


class PredictionService:
    def __init__(self):
        model_path = (
            Path(__file__).resolve().parents[1]
            / "models"
            / "heart_risk_multiclass_pipeline.joblib"
        )

        self.model = load(model_path)

    def predict(self, df: pd.DataFrame) -> dict:
        # NO manual preprocessing
        proba = self.model.predict_proba(df)[0]
        pred_class = int(np.argmax(proba))

        proba = proba.astype(float) * 100.0

        risk_map = {
            0: "Low",
            1: "Medium",
            2: "High",
            3: "Very High",
        }

        probs = {
            risk_map[i]: round(float(p), 2)
            for i, p in enumerate(proba)
        }

        return {
            "risk_level": risk_map[pred_class],
            "probabilities": probs,
        }