import os
import sys
import traceback

# Log startup info
print(f"[STARTUP] Python version: {sys.version}")
print(f"[STARTUP] Working directory: {os.getcwd()}")

# Get PORT - Render tự động set PORT, nhưng có fallback
port_str = os.environ.get("PORT")
if not port_str:
    # Nếu không có PORT, thử detect Render environment
    # Render thường có RENDER env vars hoặc có thể detect từ working directory
    # Fallback về 5000 nếu không phải production
    port_str = "5000"
    print(f"[STARTUP] PORT environment variable: NOT SET (using fallback: {port_str})")
    print(f"[WARNING] PORT not set! Render should auto-set PORT. Using fallback: {port_str}")
else:
    print(f"[STARTUP] PORT environment variable: {port_str}")

try:
    port = int(port_str)
except (ValueError, TypeError):
    print(f"[WARNING] Invalid PORT value: {port_str}, using 5000")
    port = 5000

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
        print(f"[STARTUP] Starting server on port {port}")
        print(f"[STARTUP] Host: 0.0.0.0")
        print(f"[STARTUP] Server will bind to 0.0.0.0:{port}")
        
        socketio.run(
            app,
            host="0.0.0.0",
            port=port,
            allow_unsafe_werkzeug=True,   # Quan trọng trên Render!
            debug=False,
            use_reloader=False
        )
    except KeyboardInterrupt:
        print("[STARTUP] Server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Failed to start server: {e}")
        traceback.print_exc()
        sys.exit(1)
