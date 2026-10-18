import os
import re
import secrets
import shutil
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

import requests
import yaml
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request, send_from_directory, session

app = Flask(__name__)

# ------------------------------------------------------------------
# Session / authentication
# ------------------------------------------------------------------

# В production ОБЯЗАТЕЛЬНО задай SECRET_KEY через .env.
# Значение не должно меняться при перезапуске контейнера.
app.secret_key = os.getenv("SECRET_KEY", "dev-secret")

# Авторизация сохраняется на 90 дней.
app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=90),
    SESSION_REFRESH_EACH_REQUEST=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Если сайт работает только через HTTPS — оставь True.
    # Если запускаешь backend напрямую по HTTP для разработки,
    # cookie с Secure=True браузер по HTTP отправлять не будет.
    SESSION_COOKIE_SECURE=True,
)


# ------------------------------------------------------------------
# Storage
# ------------------------------------------------------------------

NOTES = Path(os.getenv("NOTES_DIR", "/data/notes"))
UP = Path(os.getenv("UPLOADS_DIR", "/data/uploads"))

NOTES.mkdir(parents=True, exist_ok=True)
UP.mkdir(parents=True, exist_ok=True)

TRASH = NOTES.parent / "trash"
TRASH.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def safe(rel):
    p = (NOTES / rel).resolve()

    if NOTES.resolve() not in p.parents and p != NOTES.resolve():
        raise ValueError("bad path")

    return p


def parse(p):
    raw = p.read_text("utf8")
    meta = {}
    body = raw

    if raw.startswith("---\n"):
        parts = raw.split("---\n", 2)

        if len(parts) == 3:
            meta = yaml.safe_load(parts[1]) or {}
            body = parts[2]

    return meta, body


def can_view(meta):
    """Return whether the current role may see a note."""
    if role() == "admin":
        return True
    if meta.get("private", False):
        return False
    return role() == "developer" or meta.get("published", False)


def tree(path=None):
    if path is None:
        path = NOTES

    out = []

    for p in sorted(path.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
        if p.name.startswith("."):
            continue

        rel = str(p.relative_to(NOTES)).replace("\\", "/")

        if p.is_dir():
            children = tree(p)

            if children or auth():
                out.append(
                    {
                        "type": "folder",
                        "name": p.name,
                        "path": rel,
                        "children": children,
                    }
                )

        elif p.suffix.lower() == ".md":
            m, _ = parse(p)

            if can_view(m):
                out.append(
                    {
                        "type": "note",
                        "name": m.get("title") or p.stem,
                        "path": rel,
                        "emoji": m.get("emoji", "📄"),
                    }
                )

    return out


def role():
    # Keep existing long-lived admin sessions valid after this upgrade.
    if session.get("admin"):
        return "admin"
    return session.get("role", "visitor")


def auth():
    return role() in ("developer", "admin")


def admin():
    return role() == "admin"


def is_private_note(path):
    try:
        meta, _ = parse(path)
        return bool(meta.get("private", False))
    except Exception:
        return False


def developer_cannot_access(path):
    return role() == "developer" and is_private_note(path)


def start_role_session(role_name):
    """Create the same persistent session for either editor role."""
    session.clear()
    session["role"] = role_name
    session.permanent = True


def write_note(p, meta, body):
    meta["title"] = meta.get("title") or p.stem

    p.write_text(
        "---\n"
        + yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
        + "---\n"
        + body,
        "utf8",
    )


def clear_other_start_pages(current):
    for other in NOTES.rglob("*.md"):
        if other.resolve() == current.resolve():
            continue

        meta, body = parse(other)

        if role() == "developer" and meta.get("private", False):
            continue

        if meta.get("start_page"):
            meta["start_page"] = False
            write_note(other, meta, body)


# ------------------------------------------------------------------
# Tree / start page
# ------------------------------------------------------------------


@contextmanager
def share_db():
    with sqlite3.connect(NOTES.parent / "shares.sqlite3", timeout=10) as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS shares (path TEXT, mode TEXT, token TEXT UNIQUE, PRIMARY KEY(path, mode))"
        )
        if "kind" not in [row[1] for row in db.execute("PRAGMA table_info(shares)")]:
            db.execute(
                "ALTER TABLE shares ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'"
            )
        yield db


@app.route("/api/shares", methods=["GET", "POST", "DELETE"])
def manage_shares():
    if not auth():
        return jsonify(error="Unauthorized"), 401
    try:
        p = safe(request.args.get("path", ""))
        if (
            p == NOTES.resolve()
            or not (p.is_dir() or (p.is_file() and p.suffix.lower() == ".md"))
            or developer_cannot_access(p)
        ):
            return jsonify(error="Not found"), 404
    except (ValueError, OSError):
        return jsonify(error="Not found"), 404
    path = p.relative_to(NOTES).as_posix()
    with share_db() as db:
        if request.method != "GET":
            mode = (request.get_json(silent=True) or {}).get("mode")
            if mode not in ("view", "edit"):
                return jsonify(error="Invalid sharing mode"), 400
            if request.method == "DELETE":
                db.execute("DELETE FROM shares WHERE path=? AND mode=?", (path, mode))
            else:
                db.execute(
                    "INSERT OR REPLACE INTO shares (path, mode, token, kind) VALUES (?, ?, ?, ?)",
                    (
                        path,
                        mode,
                        secrets.token_urlsafe(32),
                        "folder" if p.is_dir() else "note",
                    ),
                )
        links = dict(db.execute("SELECT mode, token FROM shares WHERE path=?", (path,)))
    response = jsonify(links=links)
    response.headers["Cache-Control"] = "no-store"
    return response


def shared_target(token):
    with share_db() as db:
        row = db.execute(
            "SELECT path, mode, kind FROM shares WHERE token=?", (token,)
        ).fetchone()
    if row:
        try:
            p = safe(row[0])
            if (row[2] == "folder" and p.is_dir()) or (
                row[2] == "note" and p.is_file() and p.suffix.lower() == ".md"
            ):
                return p, row[1], row[2]
        except (ValueError, OSError):
            pass
    return None, None, None


def shared_note(token):
    root, mode, kind = shared_target(token)
    if root is None:
        return None, None
    if kind == "note":
        return root, mode
    # Folder links expose Markdown articles only, never personal pages.
    rel = request.args.get("path")
    if request.method == "PUT":
        data = request.get_json(silent=True)
        rel = data.get("path") if isinstance(data, dict) else None
    if not isinstance(rel, str):
        return None, None
    try:
        p = safe(rel)
        if (
            root.resolve() in p.parents
            and p.is_file()
            and p.suffix.lower() == ".md"
            and not is_private_note(p)
        ):
            return p, mode
    except (ValueError, OSError):
        pass
    return None, None


def shared_tree(root):
    items = []
    for p in sorted(root.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
        if p.name.startswith(".") or p.is_symlink():
            continue
        path = p.relative_to(NOTES).as_posix()
        if p.is_dir():
            items.append(
                dict(type="folder", name=p.name, path=path, children=shared_tree(p))
            )
        elif p.suffix.lower() == ".md":
            meta, _ = parse(p)
            if not meta.get("private", False):
                items.append(
                    dict(
                        type="note",
                        name=meta.get("title") or p.stem,
                        path=path,
                        emoji=meta.get("emoji", "📄"),
                    )
                )
    return items


@app.route("/api/shared/<token>", methods=["GET", "PUT"])
def access_shared_note(token):
    root, mode, kind = shared_target(token)
    if (
        root is not None
        and kind == "folder"
        and request.method == "GET"
        and "path" not in request.args
    ):
        response = jsonify(
            type="folder",
            name=root.name,
            path=root.relative_to(NOTES).as_posix(),
            tree=shared_tree(root),
            share_mode=mode,
        )
        response.headers["Cache-Control"] = "no-store"
        return response
    p, mode = shared_note(token)
    if p is None:
        return jsonify(error="Ссылка недействительна или доступ отключён"), 404
    meta, content = parse(p)
    if request.method == "PUT":
        if mode != "edit":
            return jsonify(error="Эта ссылка разрешает только просмотр"), 403
        d = request.get_json(silent=True) or {}
        incoming = d.get("meta", {})
        if not isinstance(incoming, dict) or not isinstance(d.get("content", ""), str):
            return jsonify(error="Invalid note"), 400
        # Link holders edit content, never visibility or site-wide settings.
        for key in ("title", "emoji", "cover"):
            if key in incoming:
                if not isinstance(incoming[key], str):
                    return jsonify(error="Invalid metadata"), 400
                meta[key] = incoming[key]
        content = d.get("content", "")
        write_note(p, meta, content)
    response = jsonify(
        path=p.relative_to(NOTES).as_posix(),
        meta=meta,
        content=content,
        share_mode=mode,
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.post("/api/shared/<token>/upload")
def shared_upload(token):
    p, mode, kind = shared_target(token)
    if p is None:
        return jsonify(error="Not found"), 404
    if mode != "edit":
        return jsonify(error="Read-only link"), 403
    return store_upload()


@app.get("/api/tree")
def get_tree():
    return jsonify(tree())


@app.get("/api/start")
def get_start():
    for p in NOTES.rglob("*.md"):
        try:
            m, _ = parse(p)
        except Exception:
            continue

        if m.get("start_page") and can_view(m):
            return jsonify(path=str(p.relative_to(NOTES)).replace("\\", "/"))

    return jsonify(path=None)


# ------------------------------------------------------------------
# Notes
# ------------------------------------------------------------------


@app.get("/api/note")
def get_note():
    try:
        p = safe(request.args["path"])
        m, b = parse(p)

    except Exception:
        return jsonify(error="Not found"), 404

    if not can_view(m):
        return jsonify(error="Not found"), 404

    return jsonify(path=request.args["path"], meta=m, content=b)


@app.put("/api/note")
def save_note():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    d = request.json
    p = safe(d["path"])

    if developer_cannot_access(p):
        return jsonify(error="Not found"), 404

    p.parent.mkdir(parents=True, exist_ok=True)

    meta = d.get("meta", {})

    if role() == "developer" and meta.get("private", False):
        return jsonify(error="Only an admin can make a page private"), 403

    if meta.get("start_page"):
        clear_other_start_pages(p)

    write_note(p, meta, d.get("content", ""))

    return jsonify(ok=True)


@app.post("/api/note")
def create_note():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    d = request.json

    folder = d.get("folder", "").strip("/")
    title = d.get("title", "Untitled")

    slug = (
        re.sub(r"[^\w\- ]", "", title, flags=re.U).strip().replace(" ", "-")
        or "untitled"
    )

    rel = (folder + "/" if folder else "") + slug + ".md"

    p = safe(rel)

    i = 2

    while p.exists():
        p = safe((folder + "/" if folder else "") + slug + f"-{i}.md")

        i += 1

    p.parent.mkdir(parents=True, exist_ok=True)

    p.write_text(f"---\ntitle: {title}\nemoji: 📝\npublished: false\n---\n", "utf8")

    return jsonify(path=str(p.relative_to(NOTES)).replace("\\", "/"))


# ------------------------------------------------------------------
# Delete -> Trash
# ------------------------------------------------------------------


@app.delete("/api/note")
def delete_note():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    try:
        p = safe(request.args.get("path", ""))

        if p.suffix.lower() != ".md" or not p.is_file():
            return jsonify(error="Not found"), 404

        if developer_cannot_access(p):
            return jsonify(error="Not found"), 404

        rel = p.relative_to(NOTES)
        with share_db() as db:
            db.execute("DELETE FROM shares WHERE path=?", (rel.as_posix(),))

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")

        trash_name = f"{stamp}__{rel.name}"

        dest = TRASH / rel.parent / trash_name

        dest.parent.mkdir(parents=True, exist_ok=True)

        shutil.move(str(p), str(dest))

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


# ------------------------------------------------------------------
# Trash
# ------------------------------------------------------------------


def trashed_folder(p):
    return p.is_dir() and bool(re.match(r"^\d{8}-\d{6}-\d{6}__", p.name))


def private_folder(p):
    return p.is_dir() and any(is_private_note(n) for n in p.rglob("*.md"))


@app.delete("/api/folder")
def delete_folder():
    if not auth():
        return jsonify(error="Unauthorized"), 401
    try:
        p = safe(request.args.get("path", ""))
        if p == NOTES.resolve() or not p.is_dir():
            return jsonify(error="Not found"), 404
        if role() == "developer" and private_folder(p):
            return jsonify(
                error="Папку с личными страницами может удалить только администратор"
            ), 403
        rel = p.relative_to(NOTES)
        dest = (
            TRASH
            / rel.parent
            / (datetime.now().strftime("%Y%m%d-%H%M%S-%f") + "__" + rel.name)
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(p), str(dest))
        with share_db() as db:
            prefix = rel.as_posix() + "/"
            for path, mode in db.execute("SELECT path, mode FROM shares").fetchall():
                if path == rel.as_posix() or path.startswith(prefix):
                    db.execute(
                        "DELETE FROM shares WHERE path=? AND mode=?", (path, mode)
                    )
        return jsonify(ok=True)
    except (ValueError, OSError) as e:
        return jsonify(error=str(e)), 400


@app.get("/api/trash")
def trash_list():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    items = []

    for p in sorted(
        list(TRASH.rglob("*.md")) + [d for d in TRASH.rglob("*") if trashed_folder(d)],
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    ):
        try:
            if any(
                trashed_folder(parent)
                for parent in p.parents
                if parent != TRASH and TRASH in parent.parents
            ):
                continue
            folder = trashed_folder(p)
            meta = {} if folder else parse(p)[0]
            if role() == "developer" and folder and private_folder(p):
                continue

            if role() == "developer" and meta.get("private", False):
                continue

            raw_name = p.name

            original_name = raw_name.split("__", 1)[1] if "__" in raw_name else raw_name

            rel_parent = p.parent.relative_to(TRASH)

            original = (rel_parent / original_name).as_posix()

            items.append(
                {
                    "type": "folder" if folder else "note",
                    "trash_path": p.relative_to(TRASH).as_posix(),
                    "original_path": original,
                    "title": meta.get("title")
                    or (original_name if folder else Path(original_name).stem),
                    "emoji": meta.get("emoji") or ("📁" if folder else "📄"),
                    "deleted_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(
                        timespec="seconds"
                    ),
                }
            )

        except Exception:
            pass

    return jsonify(items)


@app.post("/api/trash/restore")
def trash_restore():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    try:
        rel = Path((request.json or {}).get("path", ""))

        if rel.is_absolute() or ".." in rel.parts:
            return jsonify(error="Bad path"), 400

        src = (TRASH / rel).resolve()

        if TRASH.resolve() not in src.parents or not (
            src.is_file() or trashed_folder(src)
        ):
            return jsonify(error="Not found"), 404

        if developer_cannot_access(src) or (
            role() == "developer" and private_folder(src)
        ):
            return jsonify(error="Not found"), 404

        raw_name = src.name

        original_name = raw_name.split("__", 1)[1] if "__" in raw_name else raw_name

        rel_parent = src.parent.relative_to(TRASH)

        dest = (NOTES / rel_parent / original_name).resolve()

        if NOTES.resolve() not in dest.parents:
            return jsonify(error="Bad path"), 400

        if dest.exists():
            return jsonify(error="A page with this path already exists"), 409

        dest.parent.mkdir(parents=True, exist_ok=True)

        shutil.move(str(src), str(dest))

        return jsonify(
            ok=True,
            type="folder" if dest.is_dir() else "note",
            path=dest.relative_to(NOTES).as_posix(),
        )

    except Exception as e:
        return jsonify(error=str(e)), 400


@app.delete("/api/trash")
def trash_delete_forever():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    try:
        rel = Path(request.args.get("path", ""))

        if rel.is_absolute() or ".." in rel.parts:
            return jsonify(error="Bad path"), 400

        p = (TRASH / rel).resolve()

        if TRASH.resolve() not in p.parents or not (p.is_file() or trashed_folder(p)):
            return jsonify(error="Not found"), 404

        if developer_cannot_access(p) or (role() == "developer" and private_folder(p)):
            return jsonify(error="Not found"), 404

        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


# ------------------------------------------------------------------
# Authentication
# ------------------------------------------------------------------


@app.post("/api/login")
def login():
    password = str((request.json or {}).get("password", ""))

    admin_password = os.getenv("NOTES_ADMIN_PASSWORD", "change-me")

    developer_password = os.getenv(
        "NOTES_DEVELOPER_PASSWORD", "change-developer-password"
    )

    if secrets.compare_digest(password, admin_password):
        start_role_session("admin")

        return jsonify(ok=True, role="admin")

    if secrets.compare_digest(password, developer_password):
        start_role_session("developer")
        return jsonify(ok=True, role="developer")

    return jsonify(error="Wrong password"), 401


@app.post("/api/logout")
def logout():
    session.clear()

    return jsonify(ok=True)


@app.get("/api/me")
def me():
    return jsonify(role=role(), admin=admin(), editor=auth())


# ------------------------------------------------------------------
# Folders
# ------------------------------------------------------------------


@app.post("/api/folder")
def folder():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    try:
        p = safe(request.json["path"])

        if p.exists():
            return jsonify(error="A folder with this path already exists"), 409

        p.mkdir(parents=True, exist_ok=False)

        return jsonify(ok=True, path=p.relative_to(NOTES).as_posix())

    except Exception as e:
        return jsonify(error=str(e)), 400


# ------------------------------------------------------------------
# Move
# ------------------------------------------------------------------


@app.post("/api/move")
def move_item():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    try:
        d = request.json or {}

        src = safe(d.get("path", ""))

        destination = safe(d.get("folder", ""))

        kind = d.get("type")

        if kind not in ("note", "folder") or not src.exists():
            return jsonify(error="Not found"), 404

        if role() == "developer":
            if src.is_file() and developer_cannot_access(src):
                return jsonify(error="Not found"), 404
            if src.is_dir() and any(is_private_note(p) for p in src.rglob("*.md")):
                return jsonify(
                    error="A folder containing private pages can only be moved by an admin"
                ), 403

        if kind == "note" and (not src.is_file() or src.suffix.lower() != ".md"):
            return jsonify(error="Not found"), 404

        if kind == "folder" and not src.is_dir():
            return jsonify(error="Not found"), 404

        if not destination.is_dir():
            return jsonify(error="Destination folder does not exist"), 404

        target = destination / src.name

        if target.exists():
            return jsonify(
                error="An item with this name already exists in the destination"
            ), 409

        if src == destination or (src.is_dir() and src in destination.parents):
            return jsonify(error="A folder cannot be moved into itself"), 400

        shutil.move(str(src), str(target))

        old = src.relative_to(NOTES).as_posix()
        new = target.relative_to(NOTES).as_posix()
        with share_db() as db:
            for shared_path, mode in db.execute(
                "SELECT path, mode FROM shares"
            ).fetchall():
                if shared_path == old or shared_path.startswith(old + "/"):
                    db.execute(
                        "UPDATE shares SET path=? WHERE path=? AND mode=?",
                        (new + shared_path[len(old) :], shared_path, mode),
                    )

        return jsonify(ok=True, path=target.relative_to(NOTES).as_posix())

    except Exception as e:
        return jsonify(error=str(e)), 400


# ------------------------------------------------------------------
# Uploads
# ------------------------------------------------------------------


@app.post("/api/upload")
def upload():
    if not auth():
        return jsonify(error="Unauthorized"), 401

    return store_upload()


def store_upload():
    if "file" not in request.files:
        return jsonify(error="File required"), 400
    f = request.files["file"]

    name = secrets.token_hex(6) + "-" + re.sub(r"[^\w.\-]", "_", f.filename)

    f.save(UP / name)

    return jsonify(url="/uploads/" + name)


@app.get("/uploads/<path:name>")
def uploads(name):
    return send_from_directory(UP, name)


# ------------------------------------------------------------------
# Link preview
# ------------------------------------------------------------------


@app.get("/api/link-preview")
def preview():
    url = request.args.get("url", "")

    try:
        r = requests.get(
            url, timeout=4, headers={"User-Agent": "Mozilla/5.0"}, allow_redirects=True
        )

        s = BeautifulSoup(r.text[:500000], "html.parser")

        def prop(p, n):
            x = s.find("meta", attrs={"property": p}) or s.find(
                "meta", attrs={"name": p}
            )

            return x.get("content", "") if x else ""

        return jsonify(
            url=url,
            title=(
                prop("og:title", "")
                or (s.title.string.strip() if s.title and s.title.string else url)
            ),
            description=(prop("og:description", "") or prop("description", "")),
            image=prop("og:image", ""),
        )

    except Exception:
        return jsonify(url=url, title=url, description="", image="")


# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------


@app.get("/api/health")
def health():
    return jsonify(ok=True)


# ------------------------------------------------------------------
# Run
# ------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
