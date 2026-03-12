from flask import Blueprint, render_template, request, jsonify, send_from_directory
from .services.prediction_service import PredictionService
from pathlib import Path
import pandas as pd
import io

test_bp = Blueprint("test", __name__)
prediction_service = PredictionService()

EXPECTED_COLS = [
    "age", "sex", "systolic_bp", "cholesterol", "bmi",
    "smoking", "diabetes", "resting_hr", "physical_activity", "family_history",
]

TEST_DATA_DIR = Path(__file__).resolve().parents[1] / "test_data"


@test_bp.route("/test/download-sample", methods=["GET"])
def download_sample():
    return send_from_directory(TEST_DATA_DIR, "heart_riskt.csv", as_attachment=True)


@test_bp.route("/test", methods=["GET"])
def test_page():
    return render_template("test.html")


@test_bp.route("/test/upload", methods=["POST"])
def upload_csv():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file uploaded"}), 400

    if not f.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only .csv files are accepted"}), 400

    try:
        raw = f.read()
        file_size = len(raw)
        df = pd.read_csv(io.BytesIO(raw))
    except Exception:
        return jsonify({"error": "Could not parse CSV file"}), 400

    top = df.head(100)

    # Remove heart_risk column if present (ground-truth label)
    drop_cols = [c for c in top.columns if c.lower() == "heart_risk"]
    display = top.drop(columns=drop_cols)

    return jsonify({
        "metadata": {
            "file_name": f.filename,
            "file_size": file_size,
            "rows": len(df),
            "columns": len(df.columns) - len(drop_cols),
            "column_names": list(display.columns),
        },
        "rows": display.fillna("").values.tolist(),
        "columns": list(display.columns),
    })


@test_bp.route("/test/predict", methods=["POST"])
def predict_csv():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_csv(f)
    except Exception:
        return jsonify({"error": "Could not parse CSV file"}), 400

    missing = set(EXPECTED_COLS) - set(df.columns)
    if missing:
        return jsonify({"error": f"Missing columns: {', '.join(sorted(missing))}"}), 400

    top = df.head(100).copy()
    input_df = top[EXPECTED_COLS].copy()

    predictions = []
    probabilities = []
    for _, row in input_df.iterrows():
        result = prediction_service.predict(pd.DataFrame([row]))
        predictions.append(result["risk_level"])
        probabilities.append(result["probabilities"])

    # Remove heart_risk column if present, then append prediction
    drop_cols = [c for c in top.columns if c.lower() == "heart_risk"]
    top = top.drop(columns=drop_cols)
    top["Predicted Risk"] = predictions

    return jsonify({
        "columns": list(top.columns),
        "rows": top.fillna("").values.tolist(),
        "predictions": predictions,
        "probabilities": probabilities,
    })
