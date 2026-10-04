import os
import re
import shutil
import secrets
import requests
import yaml

from datetime import datetime, timedelta
from pathlib import Path

from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, send_from_directory, session


app = Flask(__name__)

# ------------------------------------------------------------------
# Session / authentication
# ------------------------------------------------------------------

# В production ОБЯЗАТЕЛЬНО задай SECRET_KEY через .env.
# Значение не должно меняться при перезапуске контейнера.
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret')

# Авторизация сохраняется на 90 дней.
app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=90),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',

    # Если сайт работает только через HTTPS — оставь True.
    # Если запускаешь backend напрямую по HTTP для разработки,
    # cookie с Secure=True браузер по HTTP отправлять не будет.
    SESSION_COOKIE_SECURE=True,
)


# ------------------------------------------------------------------
# Storage
# ------------------------------------------------------------------

NOTES = Path(os.getenv('NOTES_DIR', '/data/notes'))
UP = Path(os.getenv('UPLOADS_DIR', '/data/uploads'))

NOTES.mkdir(parents=True, exist_ok=True)
UP.mkdir(parents=True, exist_ok=True)

TRASH = NOTES.parent / 'trash'
TRASH.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def safe(rel):
    p = (NOTES / rel).resolve()

    if NOTES.resolve() not in p.parents and p != NOTES.resolve():
        raise ValueError('bad path')

    return p


def parse(p):
    raw = p.read_text('utf8')
    meta = {}
    body = raw

    if raw.startswith('---\n'):
        parts = raw.split('---\n', 2)

        if len(parts) == 3:
            meta = yaml.safe_load(parts[1]) or {}
            body = parts[2]

    return meta, body


def tree(path=NOTES, public=False):
    out = []

    for p in sorted(
        path.iterdir(),
        key=lambda x: (x.is_file(), x.name.lower())
    ):
        if p.name.startswith('.'):
            continue

        rel = str(p.relative_to(NOTES)).replace('\\', '/')

        if p.is_dir():
            children = tree(p, public)

            if children or not public:
                out.append({
                    'type': 'folder',
                    'name': p.name,
                    'path': rel,
                    'children': children
                })

        elif p.suffix.lower() == '.md':
            m, _ = parse(p)

            if not public or m.get('published', False):
                out.append({
                    'type': 'note',
                    'name': m.get('title') or p.stem,
                    'path': rel,
                    'emoji': m.get('emoji', '📄')
                })

    return out


def auth():
    return bool(session.get('admin'))


def write_note(p, meta, body):
    meta['title'] = meta.get('title') or p.stem

    p.write_text(
        '---\n'
        + yaml.safe_dump(
            meta,
            allow_unicode=True,
            sort_keys=False
        )
        + '---\n'
        + body,
        'utf8'
    )


def clear_other_start_pages(current):
    for other in NOTES.rglob('*.md'):
        if other.resolve() == current.resolve():
            continue

        meta, body = parse(other)

        if meta.get('start_page'):
            meta['start_page'] = False
            write_note(other, meta, body)


# ------------------------------------------------------------------
# Tree / start page
# ------------------------------------------------------------------

@app.get('/api/tree')
def get_tree():
    return jsonify(tree(public=not auth()))


@app.get('/api/start')
def get_start():
    for p in NOTES.rglob('*.md'):
        try:
            m, _ = parse(p)
        except Exception:
            continue

        if m.get('start_page') and (
            auth() or m.get('published', False)
        ):
            return jsonify(
                path=str(
                    p.relative_to(NOTES)
                ).replace('\\', '/')
            )

    return jsonify(path=None)


# ------------------------------------------------------------------
# Notes
# ------------------------------------------------------------------

@app.get('/api/note')
def get_note():
    try:
        p = safe(request.args['path'])
        m, b = parse(p)

    except Exception:
        return jsonify(error='Not found'), 404

    if not auth() and not m.get('published'):
        return jsonify(error='Not found'), 404

    return jsonify(
        path=request.args['path'],
        meta=m,
        content=b
    )


@app.put('/api/note')
def save_note():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    d = request.json
    p = safe(d['path'])

    p.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    meta = d.get('meta', {})

    if meta.get('start_page'):
        clear_other_start_pages(p)

    write_note(
        p,
        meta,
        d.get('content', '')
    )

    return jsonify(ok=True)


@app.post('/api/note')
def create_note():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    d = request.json

    folder = d.get('folder', '').strip('/')
    title = d.get('title', 'Untitled')

    slug = re.sub(
        r'[^\w\- ]',
        '',
        title,
        flags=re.U
    ).strip().replace(' ', '-') or 'untitled'

    rel = (
        (folder + '/' if folder else '')
        + slug
        + '.md'
    )

    p = safe(rel)

    i = 2

    while p.exists():
        p = safe(
            (folder + '/' if folder else '')
            + slug
            + f'-{i}.md'
        )

        i += 1

    p.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    p.write_text(
        f'---\n'
        f'title: {title}\n'
        f'emoji: 📝\n'
        f'published: false\n'
        f'---\n',
        'utf8'
    )

    return jsonify(
        path=str(
            p.relative_to(NOTES)
        ).replace('\\', '/')
    )


# ------------------------------------------------------------------
# Delete -> Trash
# ------------------------------------------------------------------

@app.delete('/api/note')
def delete_note():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    try:
        p = safe(
            request.args.get('path', '')
        )

        if (
            p.suffix.lower() != '.md'
            or not p.is_file()
        ):
            return jsonify(
                error='Not found'
            ), 404

        rel = p.relative_to(NOTES)

        stamp = datetime.now().strftime(
            '%Y%m%d-%H%M%S-%f'
        )

        trash_name = (
            f'{stamp}__{rel.name}'
        )

        dest = (
            TRASH
            / rel.parent
            / trash_name
        )

        dest.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        shutil.move(
            str(p),
            str(dest)
        )

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(
            error=str(e)
        ), 400


# ------------------------------------------------------------------
# Trash
# ------------------------------------------------------------------

@app.get('/api/trash')
def trash_list():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    items = []

    for p in sorted(
        TRASH.rglob('*.md'),
        key=lambda x: x.stat().st_mtime,
        reverse=True
    ):
        try:
            meta, body = parse(p)

            raw_name = p.name

            original_name = (
                raw_name.split('__', 1)[1]
                if '__' in raw_name
                else raw_name
            )

            rel_parent = (
                p.parent.relative_to(TRASH)
            )

            original = (
                rel_parent
                / original_name
            ).as_posix()

            items.append({
                'trash_path':
                    p.relative_to(TRASH).as_posix(),

                'original_path':
                    original,

                'title':
                    meta.get('title')
                    or Path(original_name).stem,

                'emoji':
                    meta.get('emoji')
                    or '📄',

                'deleted_at':
                    datetime.fromtimestamp(
                        p.stat().st_mtime
                    ).isoformat(
                        timespec='seconds'
                    )
            })

        except Exception:
            pass

    return jsonify(items)


@app.post('/api/trash/restore')
def trash_restore():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    try:
        rel = Path(
            (request.json or {}).get(
                'path',
                ''
            )
        )

        if (
            rel.is_absolute()
            or '..' in rel.parts
        ):
            return jsonify(
                error='Bad path'
            ), 400

        src = (
            TRASH / rel
        ).resolve()

        if (
            TRASH.resolve()
            not in src.parents
            or not src.is_file()
        ):
            return jsonify(
                error='Not found'
            ), 404

        raw_name = src.name

        original_name = (
            raw_name.split('__', 1)[1]
            if '__' in raw_name
            else raw_name
        )

        rel_parent = (
            src.parent.relative_to(TRASH)
        )

        dest = (
            NOTES
            / rel_parent
            / original_name
        ).resolve()

        if (
            NOTES.resolve()
            not in dest.parents
        ):
            return jsonify(
                error='Bad path'
            ), 400

        if dest.exists():
            return jsonify(
                error='A page with this path already exists'
            ), 409

        dest.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        shutil.move(
            str(src),
            str(dest)
        )

        return jsonify(
            ok=True,
            path=dest
                .relative_to(NOTES)
                .as_posix()
        )

    except Exception as e:
        return jsonify(
            error=str(e)
        ), 400


@app.delete('/api/trash')
def trash_delete_forever():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    try:
        rel = Path(
            request.args.get(
                'path',
                ''
            )
        )

        if (
            rel.is_absolute()
            or '..' in rel.parts
        ):
            return jsonify(
                error='Bad path'
            ), 400

        p = (
            TRASH / rel
        ).resolve()

        if (
            TRASH.resolve()
            not in p.parents
            or not p.is_file()
        ):
            return jsonify(
                error='Not found'
            ), 404

        p.unlink()

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(
            error=str(e)
        ), 400


# ------------------------------------------------------------------
# Authentication
# ------------------------------------------------------------------

@app.post('/api/login')
def login():
    password = str(
        (request.json or {}).get(
            'password',
            ''
        )
    )

    expected = os.getenv(
        'NOTES_ADMIN_PASSWORD',
        'change-me'
    )

    if secrets.compare_digest(
        password,
        expected
    ):
        session.clear()

        session['admin'] = True

        # Главное изменение:
        # превращает cookie из browser-session
        # в постоянную cookie.
        session.permanent = True

        return jsonify(ok=True)

    return jsonify(
        error='Wrong password'
    ), 401


@app.post('/api/logout')
def logout():
    session.clear()

    return jsonify(ok=True)


@app.get('/api/me')
def me():
    return jsonify(
        admin=auth()
    )


# ------------------------------------------------------------------
# Folders
# ------------------------------------------------------------------

@app.post('/api/folder')
def folder():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    try:
        p = safe(
            request.json['path']
        )

        if p.exists():
            return jsonify(
                error='A folder with this path already exists'
            ), 409

        p.mkdir(
            parents=True,
            exist_ok=False
        )

        return jsonify(
            ok=True,
            path=p
                .relative_to(NOTES)
                .as_posix()
        )

    except Exception as e:
        return jsonify(
            error=str(e)
        ), 400


# ------------------------------------------------------------------
# Move
# ------------------------------------------------------------------

@app.post('/api/move')
def move_item():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    try:
        d = request.json or {}

        src = safe(
            d.get('path', '')
        )

        destination = safe(
            d.get('folder', '')
        )

        kind = d.get('type')

        if (
            kind not in ('note', 'folder')
            or not src.exists()
        ):
            return jsonify(
                error='Not found'
            ), 404

        if (
            kind == 'note'
            and (
                not src.is_file()
                or src.suffix.lower() != '.md'
            )
        ):
            return jsonify(
                error='Not found'
            ), 404

        if (
            kind == 'folder'
            and not src.is_dir()
        ):
            return jsonify(
                error='Not found'
            ), 404

        if not destination.is_dir():
            return jsonify(
                error='Destination folder does not exist'
            ), 404

        target = (
            destination
            / src.name
        )

        if target.exists():
            return jsonify(
                error='An item with this name already exists in the destination'
            ), 409

        if (
            src == destination
            or (
                src.is_dir()
                and src in destination.parents
            )
        ):
            return jsonify(
                error='A folder cannot be moved into itself'
            ), 400

        shutil.move(
            str(src),
            str(target)
        )

        return jsonify(
            ok=True,
            path=target
                .relative_to(NOTES)
                .as_posix()
        )

    except Exception as e:
        return jsonify(
            error=str(e)
        ), 400


# ------------------------------------------------------------------
# Uploads
# ------------------------------------------------------------------

@app.post('/api/upload')
def upload():
    if not auth():
        return jsonify(error='Unauthorized'), 401

    f = request.files['file']

    name = (
        secrets.token_hex(6)
        + '-'
        + re.sub(
            r'[^\w.\-]',
            '_',
            f.filename
        )
    )

    f.save(
        UP / name
    )

    return jsonify(
        url='/uploads/' + name
    )


@app.get('/uploads/<path:name>')
def uploads(name):
    return send_from_directory(
        UP,
        name
    )


# ------------------------------------------------------------------
# Link preview
# ------------------------------------------------------------------

@app.get('/api/link-preview')
def preview():
    url = request.args.get(
        'url',
        ''
    )

    try:
        r = requests.get(
            url,
            timeout=4,
            headers={
                'User-Agent': 'Mozilla/5.0'
            },
            allow_redirects=True
        )

        s = BeautifulSoup(
            r.text[:500000],
            'html.parser'
        )

        def prop(p, n):
            x = (
                s.find(
                    'meta',
                    attrs={'property': p}
                )
                or
                s.find(
                    'meta',
                    attrs={'name': p}
                )
            )

            return (
                x.get('content', '')
                if x
                else ''
            )

        return jsonify(
            url=url,

            title=(
                prop('og:title', '')
                or (
                    s.title.string.strip()
                    if s.title
                    and s.title.string
                    else url
                )
            ),

            description=(
                prop('og:description', '')
                or prop('description', '')
            ),

            image=prop(
                'og:image',
                ''
            )
        )

    except Exception:
        return jsonify(
            url=url,
            title=url,
            description='',
            image=''
        )


# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------

@app.get('/api/health')
def health():
    return jsonify(ok=True)


# ------------------------------------------------------------------
# Run
# ------------------------------------------------------------------

app.run(
    host='0.0.0.0',
    port=5000
)
