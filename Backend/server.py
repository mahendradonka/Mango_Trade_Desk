import hashlib
import json
import mimetypes
import os
import sqlite3
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    import psycopg2
    from psycopg2 import extras
except ImportError:
    psycopg2 = None
    extras = None

BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "Frontend"
DB_DIR = BASE_DIR / "Database"
DB_PATH = DB_DIR / "mango.db"

DEDUCTION_RATE = 0.05
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
IS_POSTGRES = bool(DATABASE_URL)
PORT = int(os.getenv("PORT", "8787"))

SQLITE_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS varieties (
        name TEXT PRIMARY KEY,
        avg_weight REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prices (
        date TEXT NOT NULL,
        variety TEXT NOT NULL,
        grade TEXT NOT NULL,
        price REAL NOT NULL,
        PRIMARY KEY (date, variety, grade)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        farmer TEXT NOT NULL,
        phone TEXT,
        advance REAL NOT NULL,
        gross REAL NOT NULL,
        deduction REAL NOT NULL,
        net REAL NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS receipt_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER NOT NULL,
        variety TEXT NOT NULL,
        grade TEXT NOT NULL,
        crates INTEGER NOT NULL,
        weight REAL NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS farmers (
        name TEXT PRIMARY KEY,
        village TEXT,
        phone TEXT,
        notes TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
]

POSTGRES_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS varieties (
        name TEXT PRIMARY KEY,
        avg_weight DOUBLE PRECISION NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prices (
        date TEXT NOT NULL,
        variety TEXT NOT NULL,
        grade TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (date, variety, grade)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        farmer TEXT NOT NULL,
        phone TEXT,
        advance DOUBLE PRECISION NOT NULL,
        gross DOUBLE PRECISION NOT NULL,
        deduction DOUBLE PRECISION NOT NULL,
        net DOUBLE PRECISION NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS receipt_lines (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        variety TEXT NOT NULL,
        grade TEXT NOT NULL,
        crates INTEGER NOT NULL,
        weight DOUBLE PRECISION NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        total DOUBLE PRECISION NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS farmers (
        name TEXT PRIMARY KEY,
        village TEXT,
        phone TEXT,
        notes TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
]


def sql(statement):
    if IS_POSTGRES:
        return statement.replace("?", "%s")
    return statement


def get_connection():
    if IS_POSTGRES:
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL")
        return psycopg2.connect(DATABASE_URL, sslmode="require", cursor_factory=extras.RealDictCursor)
    return sqlite3.connect(DB_PATH)


def init_db():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        statements = POSTGRES_SCHEMA if IS_POSTGRES else SQLITE_SCHEMA
        if IS_POSTGRES:
            with conn.cursor() as cur:
                for stmt in statements:
                    cur.execute(stmt)
            conn.commit()
        else:
            for stmt in statements:
                conn.execute(stmt)
            conn.commit()


def json_response(handler, payload, status=HTTPStatus.OK):
    data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(data)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def hash_pin(pin):
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def fetch_all(conn, statement, params=()):
    if IS_POSTGRES:
        with conn.cursor() as cur:
            cur.execute(statement, params)
            return cur.fetchall()
    conn.row_factory = sqlite3.Row
    return conn.execute(statement, params).fetchall()


def execute(conn, statement, params=()):
    if IS_POSTGRES:
        with conn.cursor() as cur:
            cur.execute(statement, params)
        conn.commit()
        return None
    cur = conn.execute(statement, params)
    conn.commit()
    return cur


def insert_receipt(conn, payload):
    if IS_POSTGRES:
        with conn.cursor() as cur:
            cur.execute(
                sql(
                    "INSERT INTO receipts (date, farmer, phone, advance, gross, deduction, net, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
                ),
                (
                    payload["date"],
                    payload["farmer"],
                    payload["phone"],
                    payload["advance"],
                    payload["gross"],
                    payload["deduction"],
                    payload["net"],
                    payload["created_at"],
                ),
            )
            receipt_id = cur.fetchone()["id"]
        conn.commit()
        return receipt_id

    cur = conn.execute(
        "INSERT INTO receipts (date, farmer, phone, advance, gross, deduction, net, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            payload["date"],
            payload["farmer"],
            payload["phone"],
            payload["advance"],
            payload["gross"],
            payload["deduction"],
            payload["net"],
            payload["created_at"],
        ),
    )
    conn.commit()
    return cur.lastrowid


def compute_totals(lines, advance):
    computed = []
    gross = 0.0
    for line in lines:
        crates = float(line.get("crates", 0))
        weight = float(line.get("weight", 0))
        price = float(line.get("price", 0))
        total = crates * weight * price
        gross += total
        computed.append(
            {
                "variety": line.get("variety", ""),
                "grade": line.get("grade", ""),
                "crates": int(crates),
                "weight": float(weight),
                "price": float(price),
                "total": float(total),
            }
        )
    deduction = gross * DEDUCTION_RATE
    net = max(gross - deduction - advance, 0.0)
    return computed, gross, deduction, net


class MangoHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api_get(parsed)
        return self.handle_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api_post(parsed)
        json_response(self, {"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def handle_api_get(self, parsed):
        if parsed.path == "/api/health":
            return json_response(self, {"ok": True})

        query = parse_qs(parsed.query)
        with get_connection() as conn:
            if parsed.path == "/api/varieties":
                rows = fetch_all(conn, sql("SELECT name, avg_weight FROM varieties ORDER BY name"))
                return json_response(
                    self, [{"name": r["name"], "avgWeight": r["avg_weight"]} for r in rows]
                )

            if parsed.path == "/api/prices":
                date = (query.get("date") or [""])[0]
                rows = fetch_all(
                    conn,
                    sql("SELECT variety, grade, price FROM prices WHERE date = ?"),
                    (date,),
                )
                price_map = {}
                for row in rows:
                    price_map.setdefault(row["variety"], {})[row["grade"]] = row["price"]
                return json_response(self, price_map)

            if parsed.path == "/api/receipts":
                date = (query.get("date") or [""])[0]
                receipts = fetch_all(
                    conn,
                    sql(
                        "SELECT id, date, farmer, phone, advance, gross, deduction, net "
                        "FROM receipts WHERE date = ? ORDER BY id DESC"
                    ),
                    (date,),
                )
                receipt_ids = [r["id"] for r in receipts]
                lines_by_receipt = {}
                if receipt_ids:
                    placeholders = ",".join(["%s"] * len(receipt_ids)) if IS_POSTGRES else ",".join(["?"] * len(receipt_ids))
                    lines = fetch_all(
                        conn,
                        f"SELECT receipt_id, variety, grade, crates, weight, price, total "
                        f"FROM receipt_lines WHERE receipt_id IN ({placeholders})",
                        receipt_ids,
                    )
                    for line in lines:
                        lines_by_receipt.setdefault(line["receipt_id"], []).append(
                            {
                                "variety": line["variety"],
                                "grade": line["grade"],
                                "crates": line["crates"],
                                "weight": line["weight"],
                                "price": line["price"],
                                "total": line["total"],
                            }
                        )
                payload = []
                for receipt in receipts:
                    payload.append(
                        {
                            "id": receipt["id"],
                            "date": receipt["date"],
                            "farmer": receipt["farmer"],
                            "phone": receipt["phone"],
                            "advance": receipt["advance"],
                            "gross": receipt["gross"],
                            "deduction": receipt["deduction"],
                            "net": receipt["net"],
                            "lines": lines_by_receipt.get(receipt["id"], []),
                        }
                    )
                return json_response(self, payload)

            if parsed.path == "/api/farmers":
                rows = fetch_all(conn, sql("SELECT name, village, phone, notes FROM farmers ORDER BY name"))
                return json_response(
                    self,
                    [
                        {
                            "name": r["name"],
                            "village": r["village"],
                            "phone": r["phone"],
                            "notes": r["notes"],
                        }
                        for r in rows
                    ],
                )

        return json_response(self, {"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def handle_api_post(self, parsed):
        body = read_json(self)
        with get_connection() as conn:
            if parsed.path == "/api/varieties":
                name = (body.get("name") or "").strip()
                avg_weight = float(body.get("avgWeight", 0))
                if not name or avg_weight <= 0:
                    return json_response(self, {"error": "Invalid variety"}, status=HTTPStatus.BAD_REQUEST)
                execute(
                    conn,
                    sql("INSERT INTO varieties (name, avg_weight) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET avg_weight = EXCLUDED.avg_weight")
                    if IS_POSTGRES
                    else "INSERT OR REPLACE INTO varieties (name, avg_weight) VALUES (?, ?)",
                    (name, avg_weight),
                )
                return json_response(self, {"ok": True})

            if parsed.path == "/api/prices":
                date = (body.get("date") or "").strip()
                prices = body.get("prices") or {}
                if not date:
                    return json_response(self, {"error": "Missing date"}, status=HTTPStatus.BAD_REQUEST)
                execute(conn, sql("DELETE FROM prices WHERE date = ?"), (date,))
                for variety, grade_map in prices.items():
                    for grade, price in (grade_map or {}).items():
                        execute(
                            conn,
                            sql("INSERT INTO prices (date, variety, grade, price) VALUES (?, ?, ?, ?)")
                            if IS_POSTGRES
                            else "INSERT INTO prices (date, variety, grade, price) VALUES (?, ?, ?, ?)",
                            (date, variety, grade, float(price or 0)),
                        )
                return json_response(self, {"ok": True})

            if parsed.path == "/api/receipts":
                date = (body.get("date") or "").strip()
                farmer = (body.get("farmer") or "Unknown").strip()
                phone = (body.get("phone") or "").strip()
                advance = float(body.get("advance", 0))
                lines = body.get("lines") or []
                if not date or not lines:
                    return json_response(self, {"error": "Missing data"}, status=HTTPStatus.BAD_REQUEST)

                computed_lines, gross, deduction, net = compute_totals(lines, advance)
                created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
                receipt_payload = {
                    "date": date,
                    "farmer": farmer,
                    "phone": phone,
                    "advance": advance,
                    "gross": gross,
                    "deduction": deduction,
                    "net": net,
                    "created_at": created_at,
                }
                receipt_id = insert_receipt(conn, receipt_payload)

                for line in computed_lines:
                    execute(
                        conn,
                        sql(
                            "INSERT INTO receipt_lines (receipt_id, variety, grade, crates, weight, price, total) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?)"
                        ),
                        (
                            receipt_id,
                            line["variety"],
                            line["grade"],
                            line["crates"],
                            line["weight"],
                            line["price"],
                            line["total"],
                        ),
                    )

                return json_response(
                    self,
                    {
                        "id": receipt_id,
                        "date": date,
                        "farmer": farmer,
                        "phone": phone,
                        "advance": advance,
                        "gross": gross,
                        "deduction": deduction,
                        "net": net,
                        "lines": computed_lines,
                    },
                    status=HTTPStatus.CREATED,
                )

            if parsed.path == "/api/farmers":
                name = (body.get("name") or "").strip()
                if not name:
                    return json_response(self, {"error": "Missing farmer name"}, status=HTTPStatus.BAD_REQUEST)
                village = (body.get("village") or "").strip()
                phone = (body.get("phone") or "").strip()
                notes = (body.get("notes") or "").strip()
                execute(
                    conn,
                    sql(
                        "INSERT INTO farmers (name, village, phone, notes) VALUES (?, ?, ?, ?) "
                        "ON CONFLICT (name) DO UPDATE SET village = EXCLUDED.village, phone = EXCLUDED.phone, notes = EXCLUDED.notes"
                    )
                    if IS_POSTGRES
                    else "INSERT OR REPLACE INTO farmers (name, village, phone, notes) VALUES (?, ?, ?, ?)",
                    (name, village, phone, notes),
                )
                return json_response(self, {"ok": True})

            if parsed.path == "/api/login":
                username = (body.get("username") or "").strip() or "admin"
                pin = (body.get("pin") or "").strip()
                if not pin:
                    return json_response(self, {"error": "Missing PIN"}, status=HTTPStatus.BAD_REQUEST)

                user = fetch_all(
                    conn,
                    sql("SELECT username, pin_hash FROM users WHERE username = ?"),
                    (username,),
                )
                if not user:
                    created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
                    execute(
                        conn,
                        sql("INSERT INTO users (username, pin_hash, created_at) VALUES (?, ?, ?)"),
                        (username, hash_pin(pin), created_at),
                    )
                    return json_response(self, {"ok": True, "setup": True})

                if user[0]["pin_hash"] != hash_pin(pin):
                    return json_response(self, {"error": "Invalid PIN"}, status=HTTPStatus.UNAUTHORIZED)

                return json_response(self, {"ok": True})

            if parsed.path == "/api/set-pin":
                username = (body.get("username") or "").strip() or "admin"
                pin = (body.get("pin") or "").strip()
                if not pin:
                    return json_response(self, {"error": "Missing PIN"}, status=HTTPStatus.BAD_REQUEST)
                created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
                execute(
                    conn,
                    sql("INSERT INTO users (username, pin_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (username) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, created_at = EXCLUDED.created_at")
                    if IS_POSTGRES
                    else "INSERT OR REPLACE INTO users (username, pin_hash, created_at) VALUES (?, ?, ?)",
                    (username, hash_pin(pin), created_at),
                )
                return json_response(self, {"ok": True})

        return json_response(self, {"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def handle_static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        target = (FRONTEND_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(FRONTEND_DIR.resolve())):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        if not target.exists() or target.is_dir():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        content = target.read_bytes()
        mime, _ = mimetypes.guess_type(str(target))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MangoHandler)
    print(f"Mango backend running on http://localhost:{PORT}")
    server.serve_forever()
