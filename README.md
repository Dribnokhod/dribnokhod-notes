# Personal Notes — React + Flask

A small Notion-like Markdown publisher: public portfolio + notes, private editor, file tree, covers, emoji, images, GFM tables, link previews and draft/public state. Markdown remains the source of truth.

## Run

```bash
cp .env.example .env
# edit passwords
docker compose up -d --build
```

Open `http://localhost:8090`. Notes are at `/notes`; the deliberately unlinked admin login is `/login`.

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
---
```

This means there is no proprietary note database to escape from. Back up `data/` and you have the content.

## Production

Put this behind your existing nginx/Caddy TLS proxy. Change both secrets in `.env`. The current MVP uses one password-backed admin session. For Internet exposure, add rate limiting at the reverse proxy and use a strong password.

## Проверки качества кода

Нужны Node.js 22.14+ (линейка 22) и Python 3.13 для разработки приложения.
Ruff также запускается на локальном Python 3.8+, анализируя код как Python 3.13.
Все команды ниже выполняются из корня репозитория.

### Установка зависимостей разработки

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements-dev.txt
npm --prefix frontend ci
```

В bash активируйте окружение командой `source .venv/bin/activate`.
Для запуска backend вне Docker дополнительно установите
`python -m pip install -r backend/requirements.txt` на Python 3.13.
Ruff закреплён в `backend/requirements-dev.txt`, npm-инструменты — в
`frontend/package.json`; `frontend/package-lock.json` фиксирует дерево зависимостей.
Существующие зависимости приложения в package.json не изменены.

### Проверки без исправлений

```powershell
python -m ruff check backend/app import-obsidian.py
python -m ruff format --check backend/app import-obsidian.py
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run build
```

Ruff проверяет потенциальные ошибки Python и порядок импортов;
`ruff format --check` — форматирование. ESLint проверяет JS/JSX и React Hooks.
Prettier проверяет JS/JSX, CSS, HTML, JSON, корневую документацию, YAML и
проектные скиллы. Команды lint и format:check не меняют исходники.
Vite проверяет сборку и создаёт игнорируемый каталог `frontend/dist`.
Типизация и автоматические тесты пока не настроены; сборка их не заменяет.

Конфигурации: [pyproject.toml](pyproject.toml),
[frontend/eslint.config.mjs](frontend/eslint.config.mjs),
[.prettierrc.json](.prettierrc.json), [.prettierignore](.prettierignore).
Пользовательские данные, секреты, сторонний каталог Microsoft, зависимости,
кэши и результаты сборки исключены. Prettier использует явный список файлов
в npm-скриптах; не запускайте форматирование всего диска или пользовательских заметок.

### Исправления отдельной командой

Выполняйте только при запросе исправлений и в пределах задачи:

```powershell
python -m ruff check --fix backend/app import-obsidian.py
python -m ruff format backend/app import-obsidian.py
npm --prefix frontend run lint:fix
npm --prefix frontend run format:write
```

Для локальной правки замените Python-пути на конкретный файл.
Из каталога frontend доступны адресные команды без скачивания инструментов:

```powershell
npm exec --no -- eslint src/main.jsx --fix --fix-type problem,suggestion
npm exec --no -- prettier --write src/main.jsx --ignore-path ../.prettierignore
```

Не используйте `ruff --unsafe-fixes` автоматически. После исправлений проверьте
diff и повторите проверки. Изменения зависимостей React-эффектов проверяйте
по смыслу: они могут повлиять на поведение приложения.

Обязательный порядок работы описан в [AGENTS.md](AGENTS.md).
Проектный скилл:
[.agents/skills/code-quality/SKILL.md](.agents/skills/code-quality/SKILL.md).

## GitHub Actions CI

Workflow [.github/workflows/quality.yml](.github/workflows/quality.yml) запускается
при каждом push и pull request. Два независимых job на Ubuntu выполняют:

- backend (Python 3.13): установка `backend/requirements-dev.txt`, Ruff lint и
  проверка форматирования Python;
- frontend (Node.js 22): `npm --prefix frontend ci` по закоммиченному
  `frontend/package-lock.json`, ESLint, Prettier check и сборка Vite.

После ошибки линтера остальные проверки job продолжаются, если установка
зависимостей прошла успешно; сам job остаётся неуспешным. CI не исправляет файлы,
не выполняет деплой и имеет только право `contents: read`. Пользовательские
секреты не нужны. Для одного статического анализа Python зависимости приложения
из `backend/requirements.txt` не требуются.

Существующие ошибки Ruff и ESLint приведут к красному CI до их отдельного
исправления. Локальный запуск команд не означает, что workflow уже выполнен
на GitHub: первый удалённый запуск произойдёт после отправки файлов.
