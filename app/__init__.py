from flask import Flask
from dotenv import load_dotenv
import os

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'fallback-secret')
    app.config['ENV'] = os.getenv('FLASK_ENV', 'development')
    app.config['DEBUG'] = os.getenv('FLASK_DEBUG', 'False') == 'True'
    app.config['MODEL_PATH'] = os.getenv('MODEL_PATH')

    # Register blueprints/routes
    from .routes import main_bp
    app.register_blueprint(main_bp)
    # Batch test routes (CSV upload + batch predict)
    try:
        from .routes_test import test_bp
        app.register_blueprint(test_bp)
    except Exception:
        # Registering the optional test blueprint should not break startup
        pass

    return app