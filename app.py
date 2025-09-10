import os
import smtplib
import ssl
from email.message import EmailMessage
from flask import Flask, render_template, request
from datetime import datetime
import pytz

app = Flask(__name__)

# --- Securely loads credentials from Render's Environment Variables ---
# --- Credentials for sending the notification TO YOU (the admin) ---
ADMIN_NOTIFIER_EMAIL = os.environ.get('ADMIN_NOTIFIER_EMAIL')
ADMIN_NOTIFIER_PASSWORD = os.environ.get('ADMIN_NOTIFIER_PASSWORD')
ADMIN_RECIPIENT_EMAIL = "devteam.circuitbreakers@gmail.com"

# --- Credentials for sending the confirmation copy TO THE CUSTOMER ---
CUSTOMER_CONFIRM_EMAIL = os.environ.get('CUSTOMER_CONFIRM_EMAIL')
CUSTOMER_CONFIRM_PASSWORD = os.environ.get('CUSTOMER_CONFIRM_PASSWORD')


@app.route('/')
def home():
    """Renders the homepage."""
    return render_template('index.html')

@app.route('/query.html')
def query_page():
    """Renders the query form page."""
    return render_template('query.html')

@app.route('/submit_query', methods=['POST'])
def submit_query():
    """Handles form submission, sends two emails (admin notification & customer confirmation), and returns a confirmation message."""
    if request.method == 'POST':
        # Get data from the form
        full_name = request.form.get('full_name')
        phone = request.form.get('phone')
        address = request.form.get('address')
        customer_email = request.form.get('email') # Customer's email
        interest_section = request.form.get('interest_section', 'General Inquiry')

        ist = pytz.timezone('Asia/Kolkata')
        submission_time = datetime.now(ist).strftime('%Y-%m-%d %H:%M:%S %Z')

        try:
            # --- EMAIL 1: Send Notification to Admin ---
            subject_for_admin = f"New Lead: Interest in {interest_section}"
            html_body_for_admin = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }}
                    .container {{ max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}
                    .header {{ background-color: #0f172a; color: #ffffff; padding: 20px; text-align: center; }}
                    .header h1 {{ margin: 0; font-size: 24px; }} .header .brand-green {{ color: #4ade80; }}
                    .content {{ padding: 30px; line-height: 1.6; color: #333333; }} .content h2 {{ color: #0f172a; margin-top: 0; }}
                    .info-table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
                    .info-table td {{ padding: 12px; border-bottom: 1px solid #dddddd; }}
                    .info-table tr td:first-child {{ font-weight: bold; color: #555555; width: 30%; }}
                    .interest-box {{ background-color: #eefbf3; border-left: 4px solid #4ade80; padding: 15px; margin-top: 20px; font-size: 18px; font-weight: bold; color: #14532d; }}
                    .footer {{ font-size: 12px; color: #888888; text-align: center; padding: 20px; background-color: #f4f4f4; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1><span class="brand-green">Circuit</span>Breakers</h1><p style="margin: 5px 0 0; color: #cbd5e1;">New Interest Lead Notification</p></div>
                    <div class="content">
                        <h2>A new user has registered their interest on the website.</h2><p>Please review the details below and ensure contact is made within 48 hours.</p>
                        <div class="interest-box">Area of Interest: {interest_section}</div>
                        <table class="info-table">
                            <tr><td>Full Name:</td><td>{full_name}</td></tr>
                            <tr><td>Phone:</td><td>{phone}</td></tr>
                            <tr><td>Email:</td><td><a href="mailto:{customer_email}">{customer_email}</a></td></tr>
                            <tr><td>Address:</td><td>{address}</td></tr>
                            <tr><td>Submitted On:</td><td>{submission_time}</td></tr>
                        </table>
                    </div>
                </div>
                <div class="footer">This is an automated notification from the Circuit Breakers website.</div>
            </body>
            </html>
            """
            
            em_admin = EmailMessage()
            em_admin['From'] = f"Circuit Breakers Notifier <{ADMIN_NOTIFIER_EMAIL}>"
            em_admin['To'] = ADMIN_RECIPIENT_EMAIL
            em_admin['Subject'] = subject_for_admin
            em_admin.add_alternative(html_body_for_admin, subtype='html')
            
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=context) as smtp:
                smtp.login(ADMIN_NOTIFIER_EMAIL, ADMIN_NOTIFIER_PASSWORD)
                smtp.send_message(em_admin)

            # --- EMAIL 2: Send Confirmation to Customer ---
            subject_for_customer = "Your Inquiry to Circuit Breakers has been Received!"
            html_body_for_customer = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }}
                    .container {{ max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}
                    .header {{ background-color: #0f172a; color: #ffffff; padding: 20px; text-align: center; }}
                    .header h1 {{ margin: 0; font-size: 24px; }} .header .brand-green {{ color: #4ade80; }}
                    .content {{ padding: 30px; line-height: 1.6; color: #333333; }} .content h2 {{ color: #0f172a; margin-top: 0; }}
                    .info-table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
                    .info-table td {{ padding: 12px; border-bottom: 1px solid #dddddd; }}
                    .info-table tr td:first-child {{ font-weight: bold; color: #555555; width: 30%; }}
                    .interest-box {{ background-color: #eefbf3; border-left: 4px solid #4ade80; padding: 15px; margin-top: 20px; font-size: 16px; color: #14532d; }}
                    .footer {{ font-size: 12px; color: #888888; text-align: center; padding: 20px; background-color: #f4f4f4; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1><span class="brand-green">Circuit</span>Breakers</h1><p style="margin: 5px 0 0; color: #cbd5e1;">Submission Confirmation</p></div>
                    <div class="content">
                        <h2>Thank you for your interest, {full_name.split()[0]}!</h2><p>We have successfully received your submission. Our team will review your details and contact you within 48 hours. For your records, here is a copy of the information you provided:</p>
                        <div class="interest-box"><strong>Area of Interest:</strong> {interest_section}</div>
                        <table class="info-table">
                            <tr><td>Full Name:</td><td>{full_name}</td></tr>
                            <tr><td>Phone:</td><td>{phone}</td></tr>
                            <tr><td>Email:</td><td>{customer_email}</td></tr>
                            <tr><td>Address:</td><td>{address}</td></tr>
                            <tr><td>Submitted On:</td><td>{submission_time}</td></tr>
                        </table>
                    </div>
                </div>
                <div class="footer">This is an automated confirmation. Please do not reply directly to this email.</div>
            </body>
            </html>
            """

            em_customer = EmailMessage()
            em_customer['From'] = f"Circuit Breakers Team <{CUSTOMER_CONFIRM_EMAIL}>"
            em_customer['To'] = customer_email
            em_customer['Subject'] = subject_for_customer
            em_customer.add_alternative(html_body_for_customer, subtype='html')

            with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=context) as smtp:
                smtp.login(CUSTOMER_CONFIRM_EMAIL, CUSTOMER_CONFIRM_PASSWORD)
                smtp.send_message(em_customer)

            success_message = """
            <style>
                body {{ font-family: 'Poppins', sans-serif; text-align: center; padding: 50px 20px; background-color: #0f172a; color: #e2e8f0; }}
                h1 {{ color: #4ade80; }}
                a {{ color: #4ade80; text-decoration: none; border: 1px solid #4ade80; padding: 10px 20px; border-radius: 5px; transition: all 0.3s; }}
                a:hover {{ background-color: #4ade80; color: #0f172a; }}
            </style>
            <h1>Thank You, {full_name}!</h1>
            <p style="font-size: 1.2rem; margin-bottom: 30px;">We have successfully received your interest and sent a confirmation to your email address.<br>Our team will contact you within 48 hours.</p>
            <a href='/'>Return to Homepage</a>
            """
            return success_message.format(full_name=full_name.split()[0]), 200

        except Exception as e:
            print(f"Error occurred during email sending: {e}")
            error_message = """
            <style>body {{ font-family: 'Poppins', sans-serif; text-align: center; padding: 50px 20px; background-color: #0f172a; color: #e2e8f0; }} h1 {{ color: #f87171; }} a {{ color: #4ade80; }}</style>
            <h1>Submission Failed</h1>
            <p>Sorry, there was a technical error processing your request. Please try again later or contact us directly at devteam.circuitbreakers@gmail.com.</p>
            <p><a href='/query.html'>Go back to the form</a></p>
            """
            return error_message, 500

    return render_template('query.html')

if __name__ == '__main__':
    app.run(debug=True)