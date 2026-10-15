import os
import json
import logging
import time
import stripe
import urllib.request
import urllib.error
from flask import (
    Flask,
    request,
    redirect,
    jsonify,
    make_response,
    render_template,
    url_for,
)
from models import (
    init_db,
    create_access_code,
    redeem_access_code,
    create_session,
    validate_session,
    record_failed_attempt,
    check_rate_limit,
    get_access_code_by_stripe_session,
    cleanup_expired,
    add_emoji_reaction,
    get_reactions_for_target,
    get_reactions_batch,
    get_user_reactions,
)
from email_service import send_access_code_email

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "change-me-in-production")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Stripe config
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Site config
SITE_URL = os.environ.get("SITE_URL", "https://localhost")
SITE_NAME = os.environ.get("SITE_NAME", "Sick Of It")
COOKIE_DOMAIN = os.environ.get("COOKIE_DOMAIN", None)  # None = current domain
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
SESSION_EXPIRY_DAYS = int(os.environ.get("SESSION_EXPIRY_DAYS", "0"))  # 0 = never expire

# Umami tracking config
UMAMI_API_URL = os.environ.get("UMAMI_API_URL", "http://umami:3000")
UMAMI_WEBSITE_ID = os.environ.get("UMAMI_WEBSITE_ID", "")

# Product config – maps product IDs to Stripe price details
# Extend this dict to add more pay-per-content items in the future
_products_default = json.dumps(
    {
        "default": {
            "name": "Sick Of It - Full Access",
            "price_cents": 100,
            "currency": "usd",
            "description": "One-time access to the full game",
        }
    }
)
PRODUCTS = json.loads(os.environ.get("PRODUCTS") or _products_default)

# Free game key – grants access to /Game/ (tracked as the "free" tier)
FREE_GAME_KEY = os.environ.get("FREE_GAME_KEY", "SICK-0F1T-FR33-2026")

# Protected paths – Nginx will call /paywall/auth-check for these
PROTECTED_PATHS = json.loads(
    os.environ.get(
        "PROTECTED_PATHS",
        json.dumps(["/Game/", "/Game"]),
    )
)

# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

with app.app_context():
    init_db()
    logger.info("Paywall service started. Products: %s", list(PRODUCTS.keys()))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_client_ip():
    """Get the real client IP behind the reverse proxy."""
    return request.headers.get("X-Real-IP", request.headers.get("X-Forwarded-For", request.remote_addr))


def get_session_cookie(product_id="default"):
    """Read the session cookie for a product."""
    cookie_name = f"paywall_session_{product_id}"
    return request.cookies.get(cookie_name)


def set_session_cookie(response, token, expires_at, product_id="default"):
    """Set a secure httpOnly session cookie."""
    cookie_name = f"paywall_session_{product_id}"
    if SESSION_EXPIRY_DAYS == 0:
        # Never expire: set to ~20 years
        max_age = 20 * 365 * 86400
    else:
        max_age = int(expires_at - time.time())
    response.set_cookie(
        cookie_name,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="Lax",
        domain=COOKIE_DOMAIN,
        path="/",
    )
    return response


def set_game_tier_cookie(response, tier):
    """Set a readable (non-httpOnly) cookie indicating game tier: 'free' or 'paid'.
    
    This cookie can be read by JavaScript (e.g. for analytics tier tracking).
    """
    max_age = 20 * 365 * 86400  # ~20 years
    response.set_cookie(
        "game_tier",
        value=tier,
        max_age=max_age,
        httponly=False,  # Intentionally readable by JS
        secure=COOKIE_SECURE,
        samesite="Lax",
        domain=COOKIE_DOMAIN,
        path="/",
    )
    return response


# ---------------------------------------------------------------------------
# Nginx auth_request sub-request endpoint
# ---------------------------------------------------------------------------


@app.route("/paywall/auth-check")
def auth_check():
    """
    Called by Nginx auth_request for every protected path.
    Returns 200 if authorised, 401 otherwise.
    """
    original_uri = request.headers.get("X-Original-URI", "/")

    # Determine which product the path belongs to
    product_id = "default"
    for pid, _ in PRODUCTS.items():
        # Future: map specific paths to specific products
        pass

    token = get_session_cookie(product_id)
    if token and validate_session(token, product_id):
        return "", 200

    logger.info("Unauthorized access to %s from %s", original_uri, get_client_ip())
    return "", 401


# ---------------------------------------------------------------------------
# Stripe Checkout
# ---------------------------------------------------------------------------


@app.route("/paywall/checkout")
@app.route("/paywall/checkout/<product_id>")
def checkout(product_id="default"):
    """Show the checkout / landing page."""
    product = PRODUCTS.get(product_id)
    if not product:
        return "Product not found", 404

    return render_template(
        "checkout.html",
        product=product,
        product_id=product_id,
        stripe_key=STRIPE_PUBLISHABLE_KEY,
        site_name=SITE_NAME,
    )


@app.route("/paywall/create-checkout-session", methods=["POST"])
def create_checkout_session():
    """Create a Stripe Checkout Session and redirect."""
    product_id = request.form.get("product_id", "default")
    product = PRODUCTS.get(product_id)
    if not product:
        return jsonify(error="Product not found"), 404

    ip = get_client_ip()
    if check_rate_limit(ip, "checkout", max_attempts=20, window_seconds=3600):
        logger.warning("Rate limited checkout from %s", ip)
        return jsonify(error="Too many requests. Please try again later."), 429

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": product["currency"],
                        "product_data": {
                            "name": product["name"],
                            "description": product.get("description", ""),
                        },
                        "unit_amount": product["price_cents"],
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{SITE_URL}/paywall/success?session_id={{CHECKOUT_SESSION_ID}}&product={product_id}",
            cancel_url=f"{SITE_URL}/paywall/checkout/{product_id}",
            metadata={"product_id": product_id},
        )
        return redirect(session.url, code=303)
    except stripe.error.StripeError as e:
        logger.error("Stripe error creating session: %s", e)
        return jsonify(error="Payment service error. Please try again."), 500


# ---------------------------------------------------------------------------
# Stripe Webhook
# ---------------------------------------------------------------------------


@app.route("/paywall/webhook", methods=["POST"])
def stripe_webhook():
    """Handle Stripe webhook events."""
    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature")

    if not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook secret not configured")
        return jsonify(error="Webhook not configured"), 500

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        logger.error("Invalid webhook payload")
        return jsonify(error="Invalid payload"), 400
    except stripe.error.SignatureVerificationError:
        logger.error("Invalid webhook signature")
        return jsonify(error="Invalid signature"), 400

    logger.info("Webhook event: %s", event["type"])

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        handle_checkout_completed(session)
    elif event["type"] == "checkout.session.expired":
        logger.info("Checkout session expired: %s", event["data"]["object"]["id"])
    elif event["type"] == "payment_intent.payment_failed":
        pi = event["data"]["object"]
        logger.warning("Payment failed: %s – %s", pi["id"], pi.get("last_payment_error", {}).get("message", "unknown"))

    return jsonify(received=True), 200


def handle_checkout_completed(session):
    """Process a completed checkout: generate code, email it, track revenue."""
    email = session.get("customer_details", {}).get("email") or session.get("customer_email")
    product_id = session.get("metadata", {}).get("product_id", "default")
    session_id = session["id"]
    payment_intent = session.get("payment_intent")

    if not email:
        logger.error("No email found in checkout session %s", session_id)
        return

    # Check if we already processed this session (idempotency)
    existing = get_access_code_by_stripe_session(session_id)
    if existing:
        logger.info("Session %s already processed, skipping", session_id)
        return

    code = create_access_code(
        email=email,
        product_id=product_id,
        stripe_session_id=session_id,
        stripe_payment_intent=payment_intent,
        expires_hours=24 * 30,  # Code valid for 30 days if not redeemed
    )

    if code:
        email_sent = send_access_code_email(email, code, product_id)
        if not email_sent:
            logger.error("Failed to send email to %s for session %s", email, session_id)
        else:
            logger.info("Access code sent to %s for session %s", email, session_id)

        # Track revenue in Umami
        track_umami_revenue(product_id, session)
    else:
        logger.error("Failed to create access code for session %s", session_id)


# ---------------------------------------------------------------------------
# Umami revenue tracking
# ---------------------------------------------------------------------------


def track_umami_revenue(product_id, stripe_session):
    """Send a revenue event to Umami analytics."""
    if not UMAMI_WEBSITE_ID:
        logger.warning("UMAMI_WEBSITE_ID not configured, skipping revenue tracking")
        return

    product = PRODUCTS.get(product_id, {})
    amount_cents = product.get("price_cents", 0)
    currency = product.get("currency", "usd")
    amount_dollars = amount_cents / 100

    payload = json.dumps({
        "payload": {
            "hostname": SITE_URL.replace("https://", "").replace("http://", ""),
            "language": "en-US",
            "referrer": "",
            "screen": "1920x1080",
            "title": "Paywall Payment",
            "url": "/paywall/payment-complete",
            "website": UMAMI_WEBSITE_ID,
            "name": "paywall-revenue",
            "data": {
                "product_id": product_id,
                "product_name": product.get("name", "Unknown"),
                "amount": amount_dollars,
                "currency": currency.upper(),
                "stripe_session_id": stripe_session.get("id", ""),
                "revenue": {"currency": currency.upper(), "amount": amount_dollars},
            },
        },
        "type": "event",
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{UMAMI_API_URL}/api/send",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Paywall/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Umami revenue tracked: $%.2f %s (status %d)", amount_dollars, currency.upper(), resp.status)
    except urllib.error.URLError as e:
        logger.error("Failed to track Umami revenue: %s", e)
    except Exception as e:
        logger.error("Unexpected error tracking Umami revenue: %s", e)


# ---------------------------------------------------------------------------
# Success / Code Redemption
# ---------------------------------------------------------------------------


@app.route("/paywall/success")
def success():
    """
    Shown after Stripe Checkout completes.
    Tells the user to check email, or lets them enter code.
    """
    session_id = request.args.get("session_id")
    product_id = request.args.get("product", "default")
    product = PRODUCTS.get(product_id, PRODUCTS.get("default"))

    return render_template(
        "success.html",
        session_id=session_id,
        product_id=product_id,
        product=product,
        site_name=SITE_NAME,
    )


@app.route("/paywall/redeem", methods=["GET", "POST"])
def redeem():
    """Redeem an access code and set session cookie."""
    if request.method == "GET":
        code = request.args.get("code", "")
        product_id = request.args.get("product", "default")
        product = PRODUCTS.get(product_id, PRODUCTS.get("default"))

        # If code is in query string, try to redeem directly
        if code:
            return _do_redeem(code, product_id)

        return render_template(
            "redeem.html",
            product_id=product_id,
            product=product,
            site_name=SITE_NAME,
            error=None,
        )

    # POST
    code = request.form.get("code", "").strip()
    product_id = request.form.get("product_id", "default")
    product = PRODUCTS.get(product_id, PRODUCTS.get("default"))

    if not code:
        return render_template(
            "redeem.html",
            product_id=product_id,
            product=product,
            site_name=SITE_NAME,
            error="Please enter an access code.",
        )

    return _do_redeem(code, product_id)


def _do_redeem(code, product_id):
    """Internal: validate code, create session, set cookie."""
    ip = get_client_ip()
    product = PRODUCTS.get(product_id, PRODUCTS.get("default"))

    # Rate limit check
    if check_rate_limit(ip, "redeem", max_attempts=10, window_seconds=3600):
        logger.warning("Rate limited redeem from %s", ip)
        return render_template(
            "redeem.html",
            product_id=product_id,
            product=product,
            site_name=SITE_NAME,
            error="Too many attempts. Please try again in an hour.",
        ), 429

    access_code_row = redeem_access_code(code, product_id)
    if not access_code_row:
        record_failed_attempt(ip, "redeem", code)
        logger.warning("Invalid code redemption attempt from %s", ip)
        return render_template(
            "redeem.html",
            product_id=product_id,
            product=product,
            site_name=SITE_NAME,
            error="Invalid or expired access code.",
        ), 403

    # Create session
    token, expires_at = create_session(
        access_code_id=access_code_row["id"],
        product_id=product_id,
        ip_address=ip,
        user_agent=request.headers.get("User-Agent"),
        expires_days=SESSION_EXPIRY_DAYS,
    )

    if not token:
        return render_template(
            "redeem.html",
            product_id=product_id,
            product=product,
            site_name=SITE_NAME,
            error="An error occurred. Please try again.",
        ), 500

    # Determine tier: free key and paid key both go to /Game/; tier is tracked separately
    is_free = code.upper().strip() == FREE_GAME_KEY.upper()
    if is_free:
        redirect_to = "/Game/"
        game_tier = "free"
    elif product_id == "default":
        redirect_to = "/Game/"
        game_tier = "paid"
    else:
        redirect_to = f"/{product_id}/"
        game_tier = "paid"

    response = make_response(redirect(redirect_to))
    set_session_cookie(response, token, expires_at, product_id)
    set_game_tier_cookie(response, game_tier)

    logger.info(
        "Code redeemed successfully from %s (tier=%s), redirecting to %s",
        ip, game_tier, redirect_to,
    )
    return response


# ---------------------------------------------------------------------------
# Paywall gate page (shown when auth_request returns 401)
# ---------------------------------------------------------------------------


@app.route("/paywall/gate")
def gate():
    """
    Landing page shown when a user tries to access protected content
    without a valid session. Offers purchase or code entry.
    """
    product_id = request.args.get("product", "default")
    original_uri = request.args.get("uri", "/Game/")
    product = PRODUCTS.get(product_id, PRODUCTS.get("default"))

    return render_template(
        "gate.html",
        product_id=product_id,
        product=product,
        original_uri=original_uri,
        site_name=SITE_NAME,
        stripe_key=STRIPE_PUBLISHABLE_KEY,
    )


# ---------------------------------------------------------------------------
# Emoji Reactions API
# ---------------------------------------------------------------------------


@app.route("/api/reactions", methods=["POST"])
def post_reaction():
    """Add or toggle an emoji reaction on a target element."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify(error="JSON body required"), 400

    target_id = data.get("target_id", "").strip()
    emoji = data.get("emoji", "").strip()

    if not target_id or not emoji:
        return jsonify(error="target_id and emoji are required"), 400

    # Validate target_id length
    if len(target_id) > 500:
        return jsonify(error="target_id too long"), 400

    # Validate emoji - allow 1-8 characters (covers multi-codepoint emoji)
    if len(emoji) > 8:
        return jsonify(error="Invalid emoji"), 400

    ip = get_client_ip()
    reactor_id = request.headers.get("X-Reactor-Id", "").strip()

    # Validate reactor ID (must be a UUID-like string)
    if not reactor_id or len(reactor_id) > 64:
        return jsonify(error="X-Reactor-Id header required"), 400

    # Rate limit: 60 reactions per minute per IP
    if check_rate_limit(ip, "reaction", max_attempts=60, window_seconds=60):
        return jsonify(error="Too many reactions. Slow down!"), 429

    result = add_emoji_reaction(target_id, emoji, reactor_id)
    if result is None:
        return jsonify(error="Failed to add reaction"), 500

    # Return updated counts for this target
    counts = get_reactions_for_target(target_id)
    return jsonify(action=result["action"], reactions=counts), 200


@app.route("/api/reactions", methods=["GET"])
def get_reactions():
    """Get emoji reactions. Supports single target or batch."""
    target_id = request.args.get("target_id", "").strip()
    targets_param = request.args.get("targets", "").strip()

    ip = get_client_ip()
    reactor_id = request.headers.get("X-Reactor-Id", "").strip()

    if target_id:
        counts = get_reactions_for_target(target_id)
        user = get_user_reactions([target_id], reactor_id) if reactor_id else {}
        return jsonify(
            reactions={target_id: counts},
            user_reactions={target_id: user.get(target_id, [])},
        ), 200

    if targets_param:
        target_ids = [t.strip() for t in targets_param.split(",") if t.strip()]
        if len(target_ids) > 100:
            return jsonify(error="Too many targets (max 100)"), 400
        counts = get_reactions_batch(target_ids)
        user = get_user_reactions(target_ids, reactor_id) if reactor_id else {}
        return jsonify(reactions=counts, user_reactions=user), 200

    return jsonify(error="target_id or targets parameter required"), 400


# ---------------------------------------------------------------------------
# Health & maintenance
# ---------------------------------------------------------------------------


@app.route("/paywall/health")
def health():
    return jsonify(status="ok", service="paywall"), 200


@app.route("/paywall/check-access")
def check_access():
    """Check if user has valid session - returns JSON for frontend.
    
    Response includes:
      hasAccess (bool)  – whether a valid session exists
      tier      (str)   – 'paid' or 'free' (read from game_tier cookie)
      product   (str)   – product id
    """
    product_id = request.args.get("product", "default")
    token = get_session_cookie(product_id)

    if token and validate_session(token, product_id):
        # game_tier cookie is set by _do_redeem; default to 'paid' for
        # existing sessions that pre-date this feature.
        tier = request.cookies.get("game_tier", "paid")

        response = make_response(
            jsonify({"hasAccess": True, "product": product_id, "tier": tier})
        )

        # Re-stamp game_tier if it's missing (e.g. browser data was partly cleared).
        # This ensures the cookie is always present when a valid session exists.
        if "game_tier" not in request.cookies:
            set_game_tier_cookie(response, tier)

        return response, 200

    return jsonify({"hasAccess": False, "tier": None}), 200


@app.route("/paywall/cleanup", methods=["POST"])
def cleanup():
    """Manual cleanup endpoint (protect with a secret in production)."""
    secret = request.headers.get("X-Cleanup-Secret", "")
    expected = os.environ.get("CLEANUP_SECRET", "")
    if not expected or secret != expected:
        return jsonify(error="Unauthorized"), 403
    cleanup_expired()
    return jsonify(status="cleaned"), 200


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------


@app.errorhandler(404)
def not_found(e):
    return jsonify(error="Not found"), 404


@app.errorhandler(500)
def server_error(e):
    logger.error("Internal error: %s", e)
    return jsonify(error="Internal server error"), 500


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
