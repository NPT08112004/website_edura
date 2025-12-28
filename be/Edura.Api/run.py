import os
import sys
import traceback

# Log startup info
print(f"[STARTUP] Python version: {sys.version}")
print(f"[STARTUP] Working directory: {os.getcwd()}")
print(f"[STARTUP] PORT environment variable: {os.environ.get('PORT', 'NOT SET')}")

try:
    from app import create_app, socketio
    print("[STARTUP] Successfully imported create_app and socketio")
except Exception as e:
    print(f"[ERROR] Failed to import app modules: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    app = create_app()
    print("[STARTUP] Successfully created Flask app")
except Exception as e:
    print(f"[ERROR] Failed to create Flask app: {e}")
    traceback.print_exc()
    sys.exit(1)

if __name__ == "__main__":
    try:
        port = int(os.environ.get("PORT", 5000))
        print(f"[STARTUP] Starting server on port {port}")
        print(f"[STARTUP] Host: 0.0.0.0")
        
        socketio.run(
            app,
            host="0.0.0.0",
            port=port,
            allow_unsafe_werkzeug=True,   # Quan trọng trên Render!
            debug=False,
            use_reloader=False
        )
    except Exception as e:
        print(f"[ERROR] Failed to start server: {e}")
        traceback.print_exc()
        sys.exit(1)
