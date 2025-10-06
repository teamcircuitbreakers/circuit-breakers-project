import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import razorpay

# --- Flask App Configuration ---
# Serving index.html from the current directory ('.')
app = Flask(__name__, template_folder='.')

# ✅ Enable CORS for all routes and all origins
# This ensures full accessibility from any client — browser, AI, or API.
CORS(app, resources={r"/*": {"origins": "*"}})

# --- Razorpay Configuration ---
# Securely fetch keys from environment variables (set in Render dashboard)
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')

# Initialize Razorpay client safely
try:
    client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception as e:
    print(f"CRITICAL ERROR: Could not initialize Razorpay client. Check your environment variables. Error: {e}")
    client = None


# --- Pre-request Handling for Headless/AIs ---
@app.before_request
def handle_headless_requests():
    """
    Some automated systems (AI models, bots, API monitors) send requests without a User-Agent.
    This prevents 503 or 403 errors by sending a valid JSON response instead of rejection.
    """
    if not request.headers.get("User-Agent"):
        return jsonify({
            "status": "ok",
            "message": "Publicly accessible endpoint (Team Circuit Breakers)"
        }), 200


# --- Routes ---
@app.route('/')
def index():
    """
    Render the main website (index.html).
    Flask will serve the template from the same directory.
    """
    return render_template('index.html')


@app.route('/create_order', methods=['POST'])
def create_order():
    """
    API endpoint to create a Razorpay order.
    Validates amount and interacts with Razorpay's order creation API.
    """
    if not client:
        return jsonify({'error': 'Razorpay client not configured on server'}), 500

    try:
        data = request.get_json()
        amount = int(data['amount'])  # Amount in paise (e.g., 50000 = ₹500)

        if amount < 1000:  # Minimum Rs. 10
            return jsonify({'error': 'Amount must be at least ₹10'}), 400

        order_data = {
            'amount': amount,
            'currency': 'INR',
            'payment_capture': '1'  # Auto-capture payment
        }

        order = client.order.create(data=order_data)

        response_data = {
            'id': order['id'],
            'amount': order['amount'],
            'currency': order['currency'],
            'key': RAZORPAY_KEY_ID
        }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error creating order: {e}")
        return jsonify({'error': str(e)}), 500


# --- Diagnostic Route ---
@app.route('/status', methods=['GET'])
def status():
    """
    Public endpoint to verify that the site and backend are alive.
    Useful for AI, uptime monitors, and bots.
    """
    return jsonify({
        "site": "Team Circuit Breakers",
        "status": "active",
        "accessible": True
    })


# Note:
# No need for `if __name__ == '__main__':`
# Render automatically runs the app using Gunicorn (defined in your Procfile).
