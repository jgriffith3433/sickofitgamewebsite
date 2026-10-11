import sqlite3
import os
import time
import secrets
import hashlib
import logging

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DB_PATH", "/data/paywall.db")


def get_db():
    """Get a database connection with WAL mode for better concurrency."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize database tables."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS access_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code_hash TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            product_id TEXT NOT NULL DEFAULT 'default',
            stripe_session_id TEXT UNIQUE,
            stripe_payment_intent TEXT,
            is_used INTEGER NOT NULL DEFAULT 0,
            used_at REAL,
            created_at REAL NOT NULL,
            expires_at REAL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_token_hash TEXT NOT NULL UNIQUE,
            access_code_id INTEGER NOT NULL,
            product_id TEXT NOT NULL DEFAULT 'default',
            created_at REAL NOT NULL,
            expires_at REAL,
            is_revoked INTEGER NOT NULL DEFAULT 0,
            ip_address TEXT,
            user_agent TEXT,
            FOREIGN KEY (access_code_id) REFERENCES access_codes (id)
        );

        CREATE TABLE IF NOT EXISTS failed_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            attempt_type TEXT NOT NULL,
            attempted_value_hash TEXT,
            created_at REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_access_codes_code_hash ON access_codes (code_hash);
        CREATE INDEX IF NOT EXISTS idx_access_codes_stripe_session ON access_codes (stripe_session_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (session_token_hash);
        CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip ON failed_attempts (ip_address, created_at);

        CREATE TABLE IF NOT EXISTS emoji_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            ip_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_reactions_target ON emoji_reactions (target_id);
        CREATE INDEX IF NOT EXISTS idx_reactions_target_emoji ON emoji_reactions (target_id, emoji);
        CREATE INDEX IF NOT EXISTS idx_reactions_ip ON emoji_reactions (ip_hash, target_id);
    """)

    conn.commit()
    conn.close()
    logger.info("Database initialized at %s", DB_PATH)


def hash_value(value):
    """Hash a value using SHA-256 for secure storage."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_access_code():
    """
    Generate a human-readable access code in format: SICK-XXXX-XXXX-XXXX
    Uses alphanumeric characters (excluding ambiguous ones: 0,O,1,I,l)
    """
    # Character set without ambiguous characters
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    
    # Generate 3 segments of 4 characters each
    segment1 = ''.join(secrets.choice(chars) for _ in range(4))
    segment2 = ''.join(secrets.choice(chars) for _ in range(4))
    segment3 = ''.join(secrets.choice(chars) for _ in range(4))
    
    return f"SICK-{segment1}-{segment2}-{segment3}"


def is_code_unique(code):
    """Check if an access code already exists in the database."""
    code_hash = hash_value(code)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM access_codes WHERE code_hash = ?",
            (code_hash,)
        ).fetchone()
        return row is None
    finally:
        conn.close()


def generate_session_token():
    """Generate a cryptographically secure session token."""
    return secrets.token_urlsafe(48)


def create_access_code(email, product_id="default", stripe_session_id=None, stripe_payment_intent=None, expires_hours=None):
    """Create a new access code and store its hash. Validates uniqueness."""
    # Try up to 5 times to generate a unique code
    max_attempts = 5
    code = None
    
    for attempt in range(max_attempts):
        code = generate_access_code()
        if is_code_unique(code):
            break
        logger.warning("Generated duplicate code (attempt %d/%d), retrying", attempt + 1, max_attempts)
    else:
        logger.error("Failed to generate unique code after %d attempts", max_attempts)
        return None
    
    code_hash = hash_value(code)
    now = time.time()
    expires_at = now + (expires_hours * 3600) if expires_hours else None

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO access_codes 
               (code_hash, email, product_id, stripe_session_id, stripe_payment_intent, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (code_hash, email, product_id, stripe_session_id, stripe_payment_intent, now, expires_at),
        )
        conn.commit()
        logger.info("Access code created for %s, product=%s", email, product_id)
        return code
    except sqlite3.IntegrityError:
        logger.error("Duplicate access code or session ID")
        conn.rollback()
        return None
    finally:
        conn.close()


def redeem_access_code(code, product_id="default"):
    """
    Redeem an access code. Returns the access_code row if valid, None otherwise.
    Codes are reusable - they are not invalidated after use.
    """
    code_hash = hash_value(code)
    now = time.time()

    conn = get_db()
    try:
        row = conn.execute(
            """SELECT * FROM access_codes
               WHERE code_hash = ? AND product_id = ?
               AND (expires_at IS NULL OR expires_at > ?)""",
            (code_hash, product_id, now),
        ).fetchone()
        if not row:
            logger.warning("Failed to redeem code (invalid or expired)")
            return None

        # Track usage but don't block reuse
        conn.execute(
            """UPDATE access_codes SET is_used = 1, used_at = ? WHERE code_hash = ?""",
            (now, code_hash),
        )
        conn.commit()
        logger.info("Access code redeemed for %s, product=%s", row["email"], product_id)
        return dict(row)
    except Exception as e:
        logger.error("Error redeeming code: %s", e)
        conn.rollback()
        return None
    finally:
        conn.close()


def create_session(access_code_id, product_id="default", ip_address=None, user_agent=None, expires_days=0):
    """Create a session token after code redemption. expires_days=0 means never expire."""
    token = generate_session_token()
    token_hash = hash_value(token)
    now = time.time()
    expires_at = now + (expires_days * 86400) if expires_days > 0 else None

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO sessions 
               (session_token_hash, access_code_id, product_id, created_at, expires_at, ip_address, user_agent)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (token_hash, access_code_id, product_id, now, expires_at, ip_address, user_agent),
        )
        conn.commit()
        logger.info("Session created for access_code_id=%d, product=%s", access_code_id, product_id)
        return token, expires_at
    except Exception as e:
        logger.error("Error creating session: %s", e)
        conn.rollback()
        return None, None
    finally:
        conn.close()


def validate_session(token, product_id="default"):
    """Validate a session token. Returns True if valid."""
    if not token:
        return False

    token_hash = hash_value(token)
    now = time.time()

    conn = get_db()
    try:
        row = conn.execute(
            """SELECT * FROM sessions
               WHERE session_token_hash = ? AND product_id = ? AND is_revoked = 0
               AND (expires_at IS NULL OR expires_at > ?)""",
            (token_hash, product_id, now),
        ).fetchone()
        return row is not None
    except Exception as e:
        logger.error("Error validating session: %s", e)
        return False
    finally:
        conn.close()


def record_failed_attempt(ip_address, attempt_type, attempted_value=None):
    """Record a failed access attempt for rate limiting."""
    conn = get_db()
    try:
        value_hash = hash_value(attempted_value) if attempted_value else None
        conn.execute(
            """INSERT INTO failed_attempts (ip_address, attempt_type, attempted_value_hash, created_at)
               VALUES (?, ?, ?, ?)""",
            (ip_address, attempt_type, value_hash, time.time()),
        )
        conn.commit()
    except Exception as e:
        logger.error("Error recording failed attempt: %s", e)
    finally:
        conn.close()


def check_rate_limit(ip_address, attempt_type, max_attempts=10, window_seconds=3600):
    """Check if an IP has exceeded the rate limit. Returns True if rate limited."""
    cutoff = time.time() - window_seconds
    conn = get_db()
    try:
        row = conn.execute(
            """SELECT COUNT(*) as cnt FROM failed_attempts
               WHERE ip_address = ? AND attempt_type = ? AND created_at > ?""",
            (ip_address, attempt_type, cutoff),
        ).fetchone()
        return row["cnt"] >= max_attempts
    except Exception as e:
        logger.error("Error checking rate limit: %s", e)
        return False
    finally:
        conn.close()


def cleanup_expired(days_old=30):
    """Clean up expired codes and sessions older than specified days."""
    cutoff = time.time() - (days_old * 86400)
    conn = get_db()
    try:
        conn.execute("DELETE FROM failed_attempts WHERE created_at < ?", (cutoff,))
        conn.execute(
            "DELETE FROM sessions WHERE expires_at < ? OR is_revoked = 1", (cutoff,)
        )
        conn.commit()
        logger.info("Cleaned up expired records older than %d days", days_old)
    except Exception as e:
        logger.error("Error during cleanup: %s", e)
    finally:
        conn.close()


def get_access_code_by_stripe_session(stripe_session_id):
    """Look up an access code by its Stripe session ID."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM access_codes WHERE stripe_session_id = ?",
            (stripe_session_id,),
        ).fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error("Error looking up by stripe session: %s", e)
        return None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Emoji Reactions
# ---------------------------------------------------------------------------


def add_emoji_reaction(target_id, emoji, user_id):
    """Add an emoji reaction. Toggle: add if not present, remove if exists."""
    uid_hash = hash_value(user_id)
    now = time.time()

    conn = get_db()
    try:
        # Check if this user already reacted with this emoji on this target
        existing = conn.execute(
            "SELECT id FROM emoji_reactions WHERE target_id = ? AND emoji = ? AND ip_hash = ?",
            (target_id, emoji, uid_hash),
        ).fetchone()
        if existing:
            # Toggle off - remove the reaction
            conn.execute("DELETE FROM emoji_reactions WHERE id = ?", (existing["id"],))
            conn.commit()
            return {"action": "removed", "id": existing["id"]}

        cursor = conn.execute(
            "INSERT INTO emoji_reactions (target_id, emoji, ip_hash, created_at) VALUES (?, ?, ?, ?)",
            (target_id, emoji, uid_hash, now),
        )
        conn.commit()
        return {"action": "added", "id": cursor.lastrowid}
    except Exception as e:
        logger.error("Error adding emoji reaction: %s", e)
        conn.rollback()
        return None
    finally:
        conn.close()


def get_reactions_for_target(target_id):
    """Get aggregated emoji counts for a single target."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT emoji, COUNT(*) as count FROM emoji_reactions WHERE target_id = ? GROUP BY emoji ORDER BY count DESC",
            (target_id,),
        ).fetchall()
        return {row["emoji"]: row["count"] for row in rows}
    except Exception as e:
        logger.error("Error getting reactions: %s", e)
        return {}
    finally:
        conn.close()


def get_reactions_batch(target_ids):
    """Get aggregated emoji counts for multiple targets at once."""
    if not target_ids:
        return {}
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(target_ids))
        rows = conn.execute(
            f"SELECT target_id, emoji, COUNT(*) as count FROM emoji_reactions WHERE target_id IN ({placeholders}) GROUP BY target_id, emoji ORDER BY count DESC",
            target_ids,
        ).fetchall()
        result = {}
        for row in rows:
            tid = row["target_id"]
            if tid not in result:
                result[tid] = {}
            result[tid][row["emoji"]] = row["count"]
        return result
    except Exception as e:
        logger.error("Error getting batch reactions: %s", e)
        return {}
    finally:
        conn.close()


def get_user_reactions(target_ids, user_id):
    """Get which emojis a specific user has reacted with on given targets."""
    if not target_ids:
        return {}
    uid_hash = hash_value(user_id)
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(target_ids))
        rows = conn.execute(
            f"SELECT target_id, emoji FROM emoji_reactions WHERE target_id IN ({placeholders}) AND ip_hash = ?",
            target_ids + [uid_hash],
        ).fetchall()
        result = {}
        for row in rows:
            tid = row["target_id"]
            if tid not in result:
                result[tid] = []
            result[tid].append(row["emoji"])
        return result
    except Exception as e:
        logger.error("Error getting user reactions: %s", e)
        return {}
    finally:
        conn.close()
