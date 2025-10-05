import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import razorpay

# When serving index.html from the same folder,
# we tell Flask to look for templates in the current directory ('.')
app = Flask(__name__, template_folder='.')
# Enable CORS to allow the frontend to communicate with this backend
CORS(app)

# --- Razorpay Configuration ---
# Getting keys from environment variables. This is the secure, production-ready method.
# You will set these variables in the Render dashboard.
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')

# Initialize Razorpay client
# The app will fail to start if keys are not set, which is a good safety check.
try:
    client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception as e:
    print(f"CRITICAL ERROR: Could not initialize Razorpay client. Check your environment variables. Error: {e}")
    client = None

@app.route('/')
def index():
    # This will now render and serve your index.html file
    return render_template('index.html')

@app.route('/create_order', methods=['POST'])
def create_order():
    if not client:
        return jsonify({'error': 'Razorpay client not configured on server'}), 500

    try:
        data = request.get_json()
        amount = int(data['amount'])  # Amount in paise (e.g., 50000 for ₹500)

        if amount < 1000: # Minimum amount check (e.g. Rs 10)
             return jsonify({'error': 'Amount must be at least ₹10'}), 400

        order_data = {
            'amount': amount,
            'currency': 'INR',
            'payment_capture': '1'  # Auto capture payment
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

# The if __name__ == '__main__': block is intentionally removed.
# Render will use a Gunicorn command to run the app, not this block.

