import os
import logging
import resend

logger = logging.getLogger(__name__)

# Resend API configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "support@sickofitgame.com")
SITE_NAME = os.environ.get("SITE_NAME", "Sick Of It")
SITE_URL = os.environ.get("SITE_URL", "https://localhost")

# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def send_access_code_email(to_email, access_code, product_id="default"):
    """Send an access code to the buyer via email."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email send")
        return False

    redeem_url = f"{SITE_URL}/paywall/redeem?code={access_code}&product={product_id}"

    subject = f"Your {SITE_NAME} Access Code"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }}
            .container {{ padding: 20px; }}
            .code-box {{ background: #f5f5f5; border: 1px solid #ddd; padding: 15px; margin: 20px 0; text-align: center; }}
            .code {{ font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; letter-spacing: 2px; }}
            .button {{ display: inline-block; background: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>{SITE_NAME}</h1>
            <p>Thank you for your purchase!</p>
            
            <p>Here is your access code:</p>
            
            <div class="code-box">
                <div class="code">{access_code}</div>
            </div>
            
            <div style="text-align: center;">
                <a href="{redeem_url}" class="button">Activate Access Now</a>
            </div>
            
            <p><strong>Info:</strong></p>
            <ul>
                <li>Use this code to unlock access.</li>
                <li>After activation, a secure cookie will keep you logged in.</li>
                <li>If you clear your cookies or switch browsers, just use the code again.</li>
                <li>Want to share this code with a friend? Go for it. That's your call.</li>
            </ul>
            
            <div class="footer">
                <p>If you did not make this purchase, please ignore this email.</p>
                <p>&copy; {SITE_NAME}</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_body = f"""
{SITE_NAME} - Your Access Code

Thank you for your purchase!

Your access code: {access_code}

Click here to activate: {redeem_url}

INFO:
- Use this code to unlock access.
- After activation, a secure cookie will keep you logged in.
- If you clear your cookies or switch browsers, just use the code again.
- Want to share this code with a friend? Go for it. That's your call.

If you did not make this purchase, please ignore this email.
    """

    try:
        params = {
            "from": RESEND_FROM,
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "text": text_body,
        }

        response = resend.Emails.send(params)
        logger.info("Access code email sent to %s via Resend (ID: %s)", to_email, response.get('id', 'unknown'))
        return True
    except Exception as e:
        logger.error("Error sending email via Resend: %s", e)
        return False
