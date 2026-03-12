from flask import Blueprint, render_template, request, flash, session, jsonify
from .services.prediction_service import PredictionService
import pandas as pd
import os
import re
from dotenv import load_dotenv
import markdown, bleach, json
import traceback

# Optional Gemini AI
try:
    import google.generativeai as genai
except Exception:
    genai = None

load_dotenv()
if genai:
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            genai.configure(api_key=api_key)
        except Exception:
            genai = None

main_bp = Blueprint("main", __name__)
prediction_service = PredictionService()


@main_bp.route("/", methods=["GET"])
def home():
    return render_template("home.html")


def md_to_html(text):
    if not text:
        return ""
    text = re.sub(r"</?hr\s*/?>", "", text, flags=re.IGNORECASE)
    html = markdown.markdown(text, extensions=["nl2br", "fenced_code", "tables"])
    allowed_tags = [
        "p","br","strong","em","ul","ol","li","h1","h2","h3","h4",
        "table","tr","td","th","thead","tbody","b","i","code","pre",
        "blockquote","a"
    ]
    allowed_attrs = {"a": ["href", "title"]}
    return bleach.clean(html, tags=allowed_tags, attributes=allowed_attrs, strip=True)


def generate_readable_report(data, result):
    payload = {"input_data": data, "model_output": result}

    prompt = f"""
Write a short, well-formatted patient-friendly markdown report.
Keep it brief, clear, and structured.
Do not return JSON.
Do not repeat the same idea.
Use this exact structure:
### Summary

2 short sentences only.

### Main Factors
- 3 brief bullet points max.

### Next Steps
- 3 brief bullet points max.

### Note
1 short sentence.

Rules:
- Keep the full report under 120 words.
- Use short lines and short bullets.
- Avoid long paragraphs.
- Do not mention raw JSON or internal model details.

Payload:
{json.dumps(payload, indent=2)}
"""

    if genai:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            r = model.generate_content(prompt).text
            return r.strip()
        except Exception:
            pass

    return (
        "### Summary\n"
        f"Your current assessment suggests a **{result.get('risk_level', 'unknown')} heart risk level**. "
        "This estimate is based on the health information you entered.\n\n"
        "### Main Factors\n"
        f"- Age: {int(data.get('age', 0)) if data.get('age') is not None else 'N/A'}\n"
        f"- Blood pressure: {data.get('systolic_bp', 'N/A')} mmHg\n"
        f"- Cholesterol: {data.get('cholesterol', 'N/A')} mg/dL\n"
        f"- Smoking: {'Yes' if data.get('smoking') == 1 else 'No' if data.get('smoking') == 0 else 'N/A'}\n\n"
        "### Next Steps\n"
        "- Stay active most days of the week.\n"
        "- Focus on blood pressure, weight, and cholesterol control.\n"
        "- Review the result with a clinician if symptoms or concerns exist.\n\n"
        "### Note\n"
        "This is a screening estimate, not a diagnosis."
    )


@main_bp.route("/app", methods=["GET", "POST"])
def index():

    session.setdefault("chat_history", [])
    session.setdefault("patient_context", None)

    if request.method == "POST" and request.form.get("age"):
        try:
            required_fields = [
                "age",
                "sex",
                "systolic_bp",
                "cholesterol",
                "bmi",
                "smoking",
                "diabetes",
                "resting_hr",
                "physical_activity",
                "family_history",
            ]

            missing = [f for f in required_fields if not request.form.get(f)]
            if missing:
                flash(f"Missing fields: {', '.join(missing)}", "warning")
            else:
                try:
                    data = {
                        "age": float(request.form.get("age")),
                        "sex": int(request.form.get("sex")),
                        "systolic_bp": float(request.form.get("systolic_bp")),
                        "cholesterol": float(request.form.get("cholesterol")),
                        "bmi": float(request.form.get("bmi")),
                        "smoking": int(request.form.get("smoking")),
                        "diabetes": int(request.form.get("diabetes")),
                        "resting_hr": float(request.form.get("resting_hr")),
                        "physical_activity": int(request.form.get("physical_activity")),
                        "family_history": int(request.form.get("family_history")),
                    }
                except ValueError:
                    flash("One or more fields have invalid numeric values.", "warning")
                    data = None

                if data:
                    df = pd.DataFrame([data])
                    result = prediction_service.predict(df)

                    session["patient_context"] = data
                    session["risk_level"] = result.get("risk_level")
                    session["probabilities"] = {
                        k: float(v) for k, v in result.get("probabilities", {}).items()
                    }
                    session["input_data"] = data

                    report = generate_readable_report(data, result)

                    if genai:
                        try:
                            model = genai.GenerativeModel("gemini-2.5-flash")
                            welcome = model.generate_content(
                                f"""
A patient just completed a heart risk test.
Risk level: {result.get('risk_level')}.

Explain the meaning of age, BMI, BP, cholesterol, and heart rate in simple terms.
"""
                            ).text.strip()
                        except Exception:
                            welcome = (
                                f"Your assessment shows a {result.get('risk_level')} risk level."
                            )
                    else:
                        welcome = (
                            f"Your assessment shows a {result.get('risk_level')} risk level."
                        )

                    session["chat_history"] = [
                        {"role": "model", "content": report},
                        {"role": "model", "content": welcome},
                    ]

                    flash("Assessment completed successfully.", "success")

        except Exception:
            traceback.print_exc()
            flash("Prediction failed due to a server error.", "danger")

    rendered = [
        {
            "role": m["role"],
            "content": md_to_html(m["content"]) if m["role"] == "model" else m["content"],
        }
        for m in session["chat_history"]
    ]

    return render_template(
        "index.html",
        chat_history=rendered,
        risk_level=session.get("risk_level"),
        probabilities=session.get("probabilities"),
        input_data=session.get("input_data", {}),
    )


@main_bp.route("/chat", methods=["POST"])
def chat():
    if not session.get("patient_context"):
        return jsonify({"error": "Complete assessment first"}), 403

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400

    msg = str(data.get("message", "")).strip()
    if not msg:
        return jsonify({"error": "Empty message"}), 400

    p = session["patient_context"]

    system_context = f"""
You are Dr Heart AI.
Never reveal raw data.

Age:{p['age']}
BMI:{p['bmi']}
BP:{p['systolic_bp']}
Cholesterol:{p['cholesterol']}
Risk:{session['risk_level']}
"""

    if not genai:
        reply = "AI features are currently unavailable."
    else:
        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            system_instruction=system_context,
        )

        history = [
            {"role": "model" if m["role"] == "model" else "user", "parts": [m["content"]]}
            for m in session["chat_history"]
        ]

        chat = model.start_chat(history=history)
        reply = chat.send_message(msg).text.strip()

    session.setdefault("chat_history", [])
    session["chat_history"].append({"role": "user", "content": msg})
    session["chat_history"].append({"role": "model", "content": reply})

    return jsonify({"ai_message": md_to_html(reply)})