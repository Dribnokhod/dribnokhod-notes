# Personal Notes — React + Flask

A small Notion-like Markdown publisher: public portfolio + notes, private editor, file tree, covers, emoji, images, GFM tables, link previews and draft/public state. Markdown remains the source of truth.

## Run

```bash
cp .env.example .env
# edit passwords
docker compose up -d --build
```

Open `http://localhost:8090`. Notes are at `/notes`; the deliberately unlinked editor login is `/login`.
Set `NOTES_ADMIN_PASSWORD` and `NOTES_DEVELOPER_PASSWORD` in `.env`. Both roles can edit
notes, but only the admin can mark pages as private; private pages are completely hidden
from developers and visitors. Visitors only see published, non-private pages.
Login sessions for both editor roles are persistent and refreshed for 90 days, so rebuilding
or restarting the application does not require entering the password again as long as the
`SECRET_KEY` value remains unchanged.

## Sharing articles

Open an article as an admin or developer and click **Поделиться**. Create an independent
**Зритель** (read-only) or **Редактор** (edit) link, then copy it. Anyone holding that link
can access just that article without logging in, including drafts. An admin can also share
private articles. Sharing does not publish the article or add it to the public tree.

Link editors can change content, title, emoji and cover, and upload images. They cannot
change publication/private status, manage links, delete/move articles, or access other
private notes. **Сбросить ссылку** replaces the selected link and invalidates its previous
version; **Отключить** revokes it without creating a replacement. The other permission's
link remains unchanged. Links follow article/folder moves and are revoked on deletion.

Sharing tokens are stored in `data/shares.sqlite3` beside the Markdown notes. Include
this file in data backups to preserve sharing links across restarts and restores.

## Obsidian import

Back up the vault first, then:

```bash
python3 import-obsidian.py /path/to/your/vault
docker compose restart
```

Imported notes start as **drafts**. Existing YAML frontmatter is preserved. Wiki links and embeds are converted where possible. Images are copied to `data/uploads`; because Obsidian attachment layouts differ between vaults, image references may need a second normalization pass for a particular vault.

## Data

`data/notes` contains Markdown pages. Metadata lives in YAML frontmatter:

```yaml
---
title: Page title
emoji: 🧠
cover: https://...
published: true
private: false
---
```

This means there is no proprietary note database to escape from. Back up `data/` and you have the content.

## Production

Put this behind your existing nginx/Caddy TLS proxy. Change `SECRET_KEY` and both role
passwords in `.env`. For Internet exposure, add rate limiting at the reverse proxy and use
strong, distinct passwords.
