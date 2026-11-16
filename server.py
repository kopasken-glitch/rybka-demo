"""Local RYBKA server. Candidate data lives separately from the static catalog."""
import argparse
import base64
import binascii
from contextlib import contextmanager
from hashlib import sha256, scrypt
from hmac import compare_digest
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile

from matching import ROLES, detect_role, detect_skills, score

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
RUNTIME = ROOT / ".runtime"
sys.path.insert(0, str(RUNTIME / "deps"))
CATALOG = json.loads((ROOT / "data/catalog.json").read_text())["jobs"]
SESSION_AGE = 60 * 60 * 24 * 7
UPLOAD_MAX = 5 * 1024 * 1024
PARSE_SLOTS = threading.BoundedSemaphore(2)
COOKIE = "rybka_session"
DB_PATH = RUNTIME / "accounts.sqlite3"
AUTH_LIMIT = {}


class RequestError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


@contextmanager
def database():
    connection = sqlite3.connect(DB_PATH, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def init_db():
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    with database() as db:
        db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS candidate (
              id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE,
              phone TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, password BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS session (
              token TEXT PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
              expires INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS resume (
              candidate_id INTEGER PRIMARY KEY REFERENCES candidate(id) ON DELETE CASCADE,
              title TEXT NOT NULL, role TEXT NOT NULL, skills TEXT NOT NULL, experience TEXT NOT NULL,
              updated INTEGER NOT NULL
            );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(resume)")}
        if "name" not in columns:
            db.execute("ALTER TABLE resume ADD COLUMN name TEXT NOT NULL DEFAULT ''")


def normalize_phone(value):
    value = value.strip()
    if not re.fullmatch(r"[+\d ()-]+", value, flags=re.ASCII):
        raise RequestError(400, "Введите номер телефона с кодом страны.")
    digits = re.sub(r"\D", "", value)
    if not value.startswith("+"):
        if len(digits) == 10:
            digits = "7" + digits
        elif len(digits) == 11 and digits.startswith("8"):
            digits = "7" + digits[1:]
    if not 10 <= len(digits) <= 15 or digits.startswith("0"):
        raise RequestError(400, "Введите номер телефона с кодом страны.")
    return "+" + digits


def field(data, name, size):
    value = data.get(name, "")
    if not isinstance(value, str) or len(value) > size or "\x00" in value:
        raise RequestError(400, "Проверьте длину и формат полей.")
    return value


def password_hash(password, salt):
    return scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)


def digest(token):
    return sha256(token.encode()).hexdigest()


def account_data(db, candidate):
    if not candidate:
        return {"user": None, "resume": None, "matches": {}}
    resume = db.execute(
        "SELECT title, role, skills, experience, name FROM resume WHERE candidate_id=?", (candidate["id"],)
    ).fetchone()
    resume = dict(resume) if resume else None
    return {
        "user": {"email": candidate["email"], "phone": candidate["phone"]},
        "resume": resume,
        "matches": {j["id"]: score(resume, j) for j in CATALOG} if resume else {},
        "roles": {key: label for key, (label, _) in ROLES.items()},
    }


def file_text(filename, blob):
    suffix = Path(filename).suffix.lower()
    if suffix == ".txt":
        try:
            return blob.decode("utf-8-sig")
        except UnicodeDecodeError:
            return blob.decode("cp1251")
    if suffix == ".docx":
        with ZipFile(io.BytesIO(blob)) as archive:
            doc = archive.getinfo("word/document.xml")
            if doc.file_size > 2 * 1024 * 1024:
                raise ValueError("Large document XML")
            tree = ET.fromstring(archive.read(doc))
        namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        return "\n".join(
            "".join(t.text or "" for t in paragraph.findall(".//w:t", namespace))
            for paragraph in tree.findall(".//w:p", namespace)
        )
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RequestError(503, "На сервере недоступен разбор PDF. Используйте DOCX, TXT или вставьте текст.") from exc
        reader = PdfReader(io.BytesIO(blob))
        if reader.is_encrypted or len(reader.pages) > 20:
            raise RequestError(400, "Загрузите PDF без пароля, до 20 страниц.")
        result = []
        for page in reader.pages:
            content = page.get_contents()
            if content and len(content.get_data()) > 2 * 1024 * 1024:
                raise RequestError(400, "Страница PDF слишком сложная. Попробуйте DOCX или TXT.")
            result.append(page.extract_text() or "")
        return "\n".join(result)
    raise RequestError(400, "Поддерживаются PDF, DOCX и TXT.")


def import_resume(data):
    filename = field(data, "name", 250)
    try:
        blob = base64.b64decode(field(data, "file", 7 * 1024 * 1024), validate=True)
    except binascii.Error as exc:
        raise RequestError(400, "Файл не удалось прочитать.") from exc
    if len(blob) > UPLOAD_MAX:
        raise RequestError(413, "Выберите файл до 5 МБ.")
    if not PARSE_SLOTS.acquire(blocking=False):
        raise RequestError(429, "Сейчас обрабатывается много файлов. Повторите через минуту.")
    try:
        text = file_text(filename, blob).replace("\x00", "").strip()
    except RequestError:
        raise
    except (BadZipFile, ValueError, KeyError, UnicodeError, ET.ParseError) as exc:
        raise RequestError(400, "Не удалось прочитать документ. Проверьте файл или вставьте текст.") from exc
    except Exception as exc:
        raise RequestError(400, "Документ не удалось разобрать. Сохраните копию в DOCX или TXT.") from exc
    finally:
        PARSE_SLOTS.release()
    if len(normalized := re.sub(r"\s+", " ", text)) < 20:
        raise RequestError(400, "Текст не найден. Если это скан, вставьте текст вручную.")
    lines = [line.strip() for line in text.splitlines()[:12] if line.strip()]
    title = next((line for line in lines if len(line) <= 100 and detect_role(line)), "")
    if not title and len(normalized) <= 100:
        title = normalized
    return {"title": title, "role": detect_role(text), "skills": ", ".join(detect_skills(text)), "experience": text[:14000]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, _pattern, *_args):
        # Keep candidate request details out of terminal logs.
        return

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def json_response(self, status, payload, cookie=None):
        encoded = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(encoded)

    def token(self):
        try:
            morsel = SimpleCookie(self.headers.get("Cookie", "")).get(COOKIE)
            value = morsel.value if morsel else ""
            return value if re.fullmatch(r"[a-zA-Z0-9_-]{43}", value) else ""
        except ValueError:
            return ""

    def candidate(self, db):
        return db.execute(
            """SELECT candidate.id, email, phone FROM session JOIN candidate ON candidate.id=session.candidate_id
               WHERE token=? AND expires>?""", (digest(self.token()), int(time.time()))
        ).fetchone()

    def new_session(self, db, candidate_id):
        raw = secrets.token_urlsafe(32)
        now = int(time.time())
        db.execute("DELETE FROM session WHERE expires<=? OR token=?", (now, digest(self.token())))
        db.execute("INSERT INTO session VALUES (?, ?, ?)", (digest(raw), candidate_id, now + SESSION_AGE))
        return f"{COOKIE}={raw}; Path=/; Max-Age={SESSION_AGE}; HttpOnly; SameSite=Strict"

    def get_body(self):
        origin = self.headers.get("Origin")
        if origin and (urlsplit(origin).scheme != "http" or urlsplit(origin).netloc != self.headers.get("Host")):
            raise RequestError(403, "Откройте кабинет с адреса сайта.")
        if self.headers.get_content_type() != "application/json":
            raise RequestError(415, "Ожидается JSON.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise RequestError(400, "Неверный запрос.") from exc
        if not 0 < length <= 7 * 1024 * 1024:
            raise RequestError(413, "Запрос слишком большой.")
        try:
            data = json.loads(self.rfile.read(length))
        except (UnicodeError, ValueError) as exc:
            raise RequestError(400, "Неверный запрос.") from exc
        if not isinstance(data, dict):
            raise RequestError(400, "Неверный запрос.")
        return data

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/account":
            with database() as db:
                payload = account_data(db, self.candidate(db))
            self.json_response(200, payload)
        elif path == "/api/resume.pdf":
            self.download_resume()
        elif path.startswith("/api/"):
            self.json_response(404, {"error": "Страница не найдена."})
        elif unquote(path) not in {"/", "/index.html", "/app.js", "/account.js", "/jobs.js", "/style.css", "/fish.svg", "/baikal.jpg"}:
            self.send_error(404)
        else:
            super().do_GET()

    def download_resume(self):
        with database() as db:
            candidate = self.candidate(db)
            if not candidate:
                self.json_response(401, {"error": "Войдите в личный кабинет."})
                return
            resume = db.execute("SELECT * FROM resume WHERE candidate_id=?", (candidate["id"],)).fetchone()
        if not resume:
            self.json_response(404, {"error": "Сохраните резюме в кабинете."})
            return
        try:
            from resume_pdf import render_resume
            contact = candidate["phone"] + " · " + candidate["email"]
            document = render_resume(resume, contact, ROLES[resume["role"]][0])
        except (ImportError, FileNotFoundError):
            self.json_response(503, {"error": "Подготовка PDF временно недоступна."})
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", 'attachment; filename="RYBKA-resume.pdf"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(document)))
        self.end_headers()
        self.wfile.write(document)

    def do_HEAD(self):
        if urlsplit(self.path).path in {"/", "/index.html", "/app.js", "/account.js", "/jobs.js", "/style.css", "/fish.svg", "/baikal.jpg"}:
            super().do_HEAD()
        else:
            self.send_error(404)

    def do_POST(self):
        try:
            payload, cookie = self.action(urlsplit(self.path).path, self.get_body())
            self.json_response(200, payload, cookie)
        except RequestError as exc:
            self.json_response(exc.status, {"error": exc.message})
        except sqlite3.OperationalError:
            self.json_response(503, {"error": "База данных временно недоступна. Попробуйте ещё раз."})

    def throttle_auth(self):
        now = time.monotonic()
        with self.server.auth_lock:
            key = self.client_address[0]
            attempts = [ts for ts in AUTH_LIMIT.get(key, []) if now - ts < 60]
            if len(attempts) >= 15:
                raise RequestError(429, "Слишком много попыток входа. Попробуйте через минуту.")
            AUTH_LIMIT[key] = [*attempts, now]

    def action(self, path, data):
        if path in {"/api/register", "/api/login"}:
            self.throttle_auth()
            return self.authenticate(path, data)
        with database() as db:
            candidate = self.candidate(db)
            if not candidate:
                raise RequestError(401, "Войдите в личный кабинет.")
            if path == "/api/logout":
                db.execute("DELETE FROM session WHERE token=?", (digest(self.token()),))
                return account_data(db, None), f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"
            if path == "/api/resume/import":
                return import_resume(data), None
            if path == "/api/resume":
                name = field(data, "name", 100).strip()
                title = field(data, "title", 100).strip()
                role = field(data, "role", 32)
                skills = field(data, "skills", 1000).strip()
                experience = field(data, "experience", 14000).strip()
                if not title or role not in ROLES or len(skills + experience) < 3:
                    raise RequestError(400, "Укажите должность, направление и хотя бы один навык или опыт.")
                db.execute(
                    """INSERT INTO resume (candidate_id, title, role, skills, experience, updated, name)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, role=excluded.role,
                       skills=excluded.skills, experience=excluded.experience, updated=excluded.updated, name=excluded.name""",
                    (candidate["id"], title, role, skills, experience, int(time.time()), name),
                )
                return account_data(db, candidate), None
        raise RequestError(404, "Страница не найдена.")

    def authenticate(self, path, data):
        password = field(data, "password", 128)
        with database() as db:
            if path == "/api/register":
                email = field(data, "email", 254).strip().lower()
                if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                    raise RequestError(400, "Введите корректный адрес электронной почты.")
                phone = normalize_phone(field(data, "phone", 40))
                if len(password) < 8:
                    raise RequestError(400, "Пароль должен содержать хотя бы 8 символов.")
                salt = secrets.token_bytes(16)
                try:
                    cursor = db.execute("INSERT INTO candidate(email, phone, salt, password) VALUES (?, ?, ?, ?)",
                                        (email, phone, salt, password_hash(password, salt)))
                except sqlite3.IntegrityError as exc:
                    raise RequestError(409, "Аккаунт с такими контактами уже есть. Попробуйте войти.") from exc
                candidate = db.execute("SELECT id, email, phone FROM candidate WHERE id=?", (cursor.lastrowid,)).fetchone()
            else:
                identifier = field(data, "identifier", 254).strip().lower()
                if "@" not in identifier:
                    try:
                        identifier = normalize_phone(identifier)
                    except RequestError:
                        identifier = ""
                candidate = db.execute("SELECT * FROM candidate WHERE email=? OR phone=?", (identifier, identifier)).fetchone()
                actual = password_hash(password, candidate["salt"] if candidate else b"\x00" * 16)
                expected = candidate["password"] if candidate else b"\x00" * 32
                if not compare_digest(actual, expected) or not candidate:
                    raise RequestError(401, "Проверьте телефон, почту и пароль.")
            return account_data(db, candidate), self.new_session(db, candidate["id"])


def main():
    global DB_PATH
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db", type=Path, default=DB_PATH)
    args = parser.parse_args()
    DB_PATH = args.db
    os.umask(0o077)
    init_db()
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.auth_lock = threading.Lock()
        print(f"RYBKA: http://127.0.0.1:{server.server_port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
