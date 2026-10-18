import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm as gfmPlugin } from 'turndown-plugin-gfm';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Menu,
  Plus,
  FolderPlus,
  Save,
  Trash2,
  RotateCcw,
  LogOut,
  ExternalLink,
  Sun,
  Moon,
  Palette,
  ChevronDown,
  Folder,
  ChevronRight,
} from 'lucide-react';
import './style.css';

/* ------------------------------------------------------------------ */
/*  API helper                                                         */
/* ------------------------------------------------------------------ */

const api = (u, o = {}) =>
  fetch('/api' + u, {
    credentials: 'include',
    headers: o.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...o,
  }).then(async (r) => {
    let j = await r.json();
    if (!r.ok) throw Error(j.error || 'Error');
    return j;
  });

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EMOJIS = [
  '📝',
  '📄',
  '📚',
  '📖',
  '📕',
  '📗',
  '📘',
  '📙',
  '📓',
  '📒',
  '🗒️',
  '📔',
  '🔖',
  '💡',
  '🧠',
  '💻',
  '⌨️',
  '🖥️',
  '📱',
  '🛠️',
  '🔧',
  '🔨',
  '⚙️',
  '🧰',
  '📊',
  '📈',
  '📉',
  '🧮',
  '🔬',
  '🧪',
  '🎓',
  '🏫',
  '🏗️',
  '🏢',
  '🏠',
  '🗄️',
  '🚀',
  '🛰️',
  '🌐',
  '🔗',
  '📌',
  '📍',
  '🧷',
  '✅',
  '☑️',
  '❗',
  '❓',
  '⚠️',
  '⭐',
  '🌟',
  '✨',
  '🔥',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🤍',
  '👀',
  '🎯',
  '🏆',
  '🥇',
  '🧩',
  '🗺️',
  '🧭',
  '📷',
  '🎥',
  '🎨',
  '🖌️',
  '💬',
  '💭',
  '📦',
  '🔐',
  '🔑',
  '☕',
  '🍵',
  '🌙',
  '☀️',
  '🌱',
  '🌿',
  '🌳',
  '🌊',
  '⛰️',
  '🐍',
  '🐳',
  '🦊',
  '🐧',
  '🐱',
  '🐶',
  '🍀',
  '⚡',
  '🎵',
  '🎧',
  '🎮',
  '♟️',
  '⚽',
  '🏀',
  '✈️',
  '🚗',
  '🚲',
  '🧳',
  '💰',
  '💎',
  '🕒',
  '📅',
  '🗑️',
];

const GRADIENTS = [
  'linear-gradient(120deg,#f6d365 0%,#fda085 100%)',
  'linear-gradient(120deg,#84fab0 0%,#8fd3f4 100%)',
  'linear-gradient(120deg,#a18cd1 0%,#fbc2eb 100%)',
  'linear-gradient(120deg,#89f7fe 0%,#66a6ff 100%)',
  'linear-gradient(120deg,#d4fc79 0%,#96e6a1 100%)',
  'linear-gradient(120deg,#667eea 0%,#764ba2 100%)',
  'linear-gradient(120deg,#232526 0%,#414345 100%)',
  'linear-gradient(120deg,#fdfbfb 0%,#ebedee 100%)',
];

const SLASH_COMMANDS = [
  ['Text', 'p', (e) => e.chain().focus().setParagraph().run()],
  ['Heading 1', 'h1', (e) => e.chain().focus().toggleHeading({ level: 1 }).run()],
  ['Heading 2', 'h2', (e) => e.chain().focus().toggleHeading({ level: 2 }).run()],
  ['Heading 3', 'h3', (e) => e.chain().focus().toggleHeading({ level: 3 }).run()],
  ['Bulleted list', 'bullet', (e) => e.chain().focus().toggleBulletList().run()],
  ['Numbered list', 'number', (e) => e.chain().focus().toggleOrderedList().run()],
  ['Quote', 'quote', (e) => e.chain().focus().toggleBlockquote().run()],
  ['Code block', 'code', (e) => e.chain().focus().toggleCodeBlock().run()],
  [
    'Table',
    'table',
    (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  ],
];

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

function useTheme() {
  const [t, setT] = useState(() => localStorage.theme || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = t;
    localStorage.theme = t;
  }, [t]);

  return [t, () => setT((x) => (x === 'light' ? 'dark' : 'light'))];
}

function ThemeButton() {
  const [t, toggle] = useTheme();

  return (
    <button className="iconBtn" onClick={toggle} title="Theme">
      {t === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Link preview card                                                  */
/* ------------------------------------------------------------------ */

function LinkCard({ href, children }) {
  let [p, setP] = useState(null);

  useEffect(() => {
    if (/^https?:/.test(href)) {
      api('/link-preview?url=' + encodeURIComponent(href))
        .then(setP)
        .catch(() => {});
    }
  }, [href]);

  if (!p) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <a className="linkcard" href={href} target="_blank" rel="noreferrer">
      {p.image && <img src={p.image} />}
      <span>
        <b>{p.title}</b>
        <small>{p.description}</small>
        <em>
          {new URL(href).hostname} <ExternalLink size={12} />
        </em>
      </span>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar tree                                                       */
/* ------------------------------------------------------------------ */

function Tree({ items, onOpen }) {
  return items.map((x) => (
    <div key={x.path} className={x.type === 'folder' ? 'treeFolder' : ''}>
      {x.type === 'folder' ? (
        <details>
          <summary>
            <ChevronRight className="folderChevron" size={14} />
            <Folder className="folderIcon" size={16} />
            <span>{x.name}</span>
          </summary>
          <div className="nest">
            <Tree items={x.children} onOpen={onOpen} />
          </div>
        </details>
      ) : (
        <button className="treeNote" onClick={() => onOpen(x.path)}>
          <span className="treeEmoji">{x.emoji}</span>
          <span>{x.name}</span>
        </button>
      )}
    </div>
  ));
}

/* ------------------------------------------------------------------ */
/*  Markdown -> HTML helpers                                           */
/* ------------------------------------------------------------------ */

function markdownToHtml(md = '') {
  return marked.parse(md, { gfm: true, breaks: false });
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

turndown.use(gfmPlugin);

turndown.addRule('tiptapImage', {
  filter: 'img',
  replacement: (_, node) =>
    `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`,
});

/* ------------------------------------------------------------------ */
/*  Rich editor                                                        */
/* ------------------------------------------------------------------ */

function RichEditor({ note, setNote, upload }) {
  const [slash, setSlash] = useState(false);
  const fileRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: markdownToHtml(note.content || ''),
    editorProps: {
      attributes: { class: 'tiptapEditor' },
      handlePaste(view, event) {
        const f = [...(event.clipboardData?.files || [])].find((x) =>
          x.type.startsWith('image/'),
        );
        if (!f) return false;
        event.preventDefault();
        upload(f, false).then((x) =>
          view.dispatch(
            view.state.tr.replaceSelectionWith(
              view.state.schema.nodes.image.create({ src: x.url, alt: f.name }),
            ),
          ),
        );
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      setNote((n) => ({ ...n, content: turndown.turndown(editor.getHTML()) + '\n' }));
      const { $from } = editor.state.selection;
      setSlash($from.parent.textBetween(0, $from.parentOffset, '', '').endsWith('/'));
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return null;

  const cmd = (fn) => {
    const { from } = editor.state.selection;
    if (editor.state.doc.textBetween(Math.max(0, from - 1), from) === '/') {
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - 1, to: from })
        .run();
    }
    fn(editor);
    setSlash(false);
  };

  const addLink = () => {
    let u = prompt('Link URL');
    if (u) editor.chain().focus().extendMarkRange('link').setLink({ href: u }).run();
  };

  const addImage = async (f) => {
    let x = await upload(f, false);
    editor.chain().focus().setImage({ src: x.url, alt: f.name }).run();
  };

  return (
    <div className="richEditor">
      <div className="editorToolbar">
        <button
          className={editor.isActive('bold') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          className={editor.isActive('italic') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          className={editor.isActive('strike') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </button>
        <button
          className={editor.isActive('underline') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </button>
        <span></span>
        <button onClick={() => editor.chain().focus().setParagraph().run()}>
          Text
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </button>
        <button onClick={addLink}>Link</button>
        <button onClick={() => fileRef.current?.click()}>Image</button>
        <button onClick={() => editor.chain().focus().undo().run()}>↶</button>
        <button onClick={() => editor.chain().focus().redo().run()}>↷</button>
      </div>

      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])}
      />

      <div className="editorSurface">
        <EditorContent editor={editor} />

        {slash && (
          <div className="tiptapSlash">
            {SLASH_COMMANDS.map(([name, type, fn]) => (
              <button
                key={type}
                onMouseDown={(e) => {
                  e.preventDefault();
                  cmd(fn);
                }}
              >
                <b>{name}</b>
                <small>{type}</small>
              </button>
            ))}

            <button
              onMouseDown={(e) => {
                e.preventDefault();
                let { from } = editor.state.selection;
                if (editor.state.doc.textBetween(Math.max(0, from - 1), from) === '/') {
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from: from - 1, to: from })
                    .run();
                }
                fileRef.current?.click();
                setSlash(false);
              }}
            >
              <b>Image</b>
              <small>upload</small>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cover picker                                                       */
/* ------------------------------------------------------------------ */

function CoverPicker({ note, setNote }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pickerWrap">
      <button onClick={() => setOpen(!open)}>
        <Palette size={15} /> Cover <ChevronDown size={14} />
      </button>

      {open && (
        <div className="coverPicker">
          <b>Gradients</b>

          <div className="gradientGrid">
            {GRADIENTS.map((g) => (
              <button
                key={g}
                style={{ background: g }}
                onClick={() => {
                  setNote({ ...note, meta: { ...note.meta, cover: g } });
                  setOpen(false);
                }}
              />
            ))}
          </div>

          <input
            placeholder="Or image URL"
            value={
              note.meta.cover?.startsWith('linear-gradient')
                ? ''
                : note.meta.cover || ''
            }
            onChange={(e) =>
              setNote({ ...note, meta: { ...note.meta, cover: e.target.value } })
            }
          />

          <button
            className="plain"
            onClick={() => setNote({ ...note, meta: { ...note.meta, cover: '' } })}
          >
            Remove cover
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Emoji picker                                                       */
/* ------------------------------------------------------------------ */

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="emojiPick">
      <button className="emojiButton" onClick={() => setOpen(!open)}>
        {value || '📄'}
      </button>

      {open && (
        <div className="emojiPanel">
          {EMOJIS.map((e, idx) => (
            <button
              key={e + '-' + idx}
              onClick={() => {
                onChange(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Notes page                                                         */
/* ------------------------------------------------------------------ */

function Notes() {
  const [tree, setTree] = useState([]);
  const [note, setNote] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [edit, setEdit] = useState(false);
  const [side, setSide] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState([]);

  let loadTree = () => api('/tree').then(setTree);

  let open = (p) =>
    api('/note?path=' + encodeURIComponent(p)).then((n) => {
      setNote(n);
      setEdit(false);
      setSide(false);
    });

  useEffect(() => {
    api('/me').then((x) => setAdmin(x.admin));
    loadTree();

    api('/start')
      .then((x) => {
        if (x.path) open(x.path);
      })
      .catch(() => {});
  }, []);

  let save = () =>
    api('/note', { method: 'PUT', body: JSON.stringify(note) }).then(() => {
      setEdit(false);
      loadTree();
    });

  let remove = async () => {
    if (!note) return;

    const title = note.meta.title || 'Без названия';
    if (!confirm(`Переместить страницу «${title}» в корзину?`)) return;

    await api('/note?path=' + encodeURIComponent(note.path), { method: 'DELETE' });

    setNote(null);
    setEdit(false);
    await loadTree();

    api('/start')
      .then((x) => {
        if (x.path) open(x.path);
      })
      .catch(() => {});
  };

  let loadTrash = () => api('/trash').then(setTrash);

  let showTrash = () => {
    loadTrash();
    setTrashOpen(true);
  };

  let restoreTrash = async (item) => {
    try {
      const x = await api('/trash/restore', {
        method: 'POST',
        body: JSON.stringify({ path: item.trash_path }),
      });
      await loadTree();
      await loadTrash();
      setTrashOpen(false);
      open(x.path);
    } catch (e) {
      alert(e.message);
    }
  };

  let deleteForever = async (item) => {
    if (
      !confirm(
        `Удалить «${item.title}» навсегда?\n\nВосстановить страницу после этого будет нельзя.`,
      )
    ) {
      return;
    }

    await api('/trash?path=' + encodeURIComponent(item.trash_path), {
      method: 'DELETE',
    });

    loadTrash();
  };

  let create = () => {
    let t = prompt('Название страницы');
    if (t) {
      api('/note', { method: 'POST', body: JSON.stringify({ title: t }) }).then((x) => {
        loadTree();
        open(x.path).then?.(() => setEdit(true));
        setTimeout(() => setEdit(true), 150);
      });
    }
  };

  let upload = async (f, append = true) => {
    let fd = new FormData();
    fd.append('file', f);
    let x = await api('/upload', { method: 'POST', body: fd });
    if (append) {
      setNote((n) => ({ ...n, content: n.content + `\n![${f.name}](${x.url})\n` }));
    }
    return x;
  };

  let coverStyle = note?.meta.cover
    ? note.meta.cover.startsWith('linear-gradient')
      ? { background: note.meta.cover }
      : { backgroundImage: `url(${note.meta.cover})` }
    : {};

  return (
    <div className="notes">
      <aside className={side ? 'show' : ''}>
        <div className="sideHead">
          <a href="/" className="brand">
            ED.
          </a>
          <div>
            <ThemeButton />
            <button className="close" onClick={() => setSide(false)}>
              ×
            </button>
          </div>
        </div>

        {admin && (
          <div className="tools">
            <button onClick={create}>
              <Plus size={16} /> Page
            </button>
            <button
              onClick={() => {
                let n = prompt('Folder');
                if (n) {
                  api('/folder', {
                    method: 'POST',
                    body: JSON.stringify({ path: n }),
                  }).then(loadTree);
                }
              }}
            >
              <FolderPlus size={16} />
            </button>
          </div>
        )}

        <Tree items={tree} onOpen={open} />

        <div className="sideBottom">
          {admin && (
            <button className="trashOpenBtn" onClick={showTrash}>
              <Trash2 size={15} /> Корзина
            </button>
          )}

          {admin ? (
            <button
              onClick={() =>
                api('/logout', { method: 'POST' }).then(() => location.reload())
              }
            >
              <LogOut size={15} /> Log out
            </button>
          ) : null}
        </div>
      </aside>

      <main className="page">
        <button className="hamb" onClick={() => setSide(true)}>
          <Menu />
        </button>

        {note ? (
          <>
            <div className="cover" style={coverStyle}></div>

            <article>
              <div className="noteTop">
                {edit ? (
                  <EmojiPicker
                    value={note.meta.emoji}
                    onChange={(emoji) =>
                      setNote({ ...note, meta: { ...note.meta, emoji } })
                    }
                  />
                ) : (
                  <div className="emoji">{note.meta.emoji || '📄'}</div>
                )}
                {edit && <CoverPicker note={note} setNote={setNote} />}
              </div>

              {admin && (
                <div className="adminbar">
                  <button onClick={() => setEdit(!edit)}>
                    {edit ? 'Done' : 'Edit'}
                  </button>

                  {edit && (
                    <button className="save" onClick={save}>
                      <Save size={15} /> Save
                    </button>
                  )}

                  <label>
                    <input
                      type="checkbox"
                      checked={!!note.meta.published}
                      onChange={(e) =>
                        setNote({
                          ...note,
                          meta: { ...note.meta, published: e.target.checked },
                        })
                      }
                    />{' '}
                    Published
                  </label>

                  <label title="Эта страница откроется первой при переходе в заметки">
                    <input
                      type="checkbox"
                      checked={!!note.meta.start_page}
                      onChange={(e) =>
                        setNote({
                          ...note,
                          meta: { ...note.meta, start_page: e.target.checked },
                        })
                      }
                    />{' '}
                    Начальная страница
                  </label>

                  <button
                    className="deleteNote"
                    onClick={remove}
                    title="Удалить страницу"
                  >
                    <Trash2 size={15} /> Удалить
                  </button>
                </div>
              )}

              {edit ? (
                <>
                  <input
                    className="titleInput"
                    value={note.meta.title || ''}
                    onChange={(e) =>
                      setNote({
                        ...note,
                        meta: { ...note.meta, title: e.target.value },
                      })
                    }
                  />
                  <RichEditor
                    key={note.path}
                    note={note}
                    setNote={setNote}
                    upload={upload}
                  />
                </>
              ) : (
                <>
                  <h1>{note.meta.title}</h1>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <LinkCard href={href}>{children}</LinkCard>
                      ),
                    }}
                  >
                    {note.content}
                  </ReactMarkdown>
                </>
              )}
            </article>
          </>
        ) : (
          <div className="empty">
            <span>👋</span>
            <h1>Notes</h1>
            <p>Choose a page from the sidebar.</p>
          </div>
        )}
      </main>

      {trashOpen && (
        <div className="trashBackdrop" onMouseDown={() => setTrashOpen(false)}>
          <div className="trashModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="trashHead">
              <div>
                <h2>Корзина</h2>
                <p>Удалённые страницы можно восстановить.</p>
              </div>
              <button className="trashClose" onClick={() => setTrashOpen(false)}>
                ×
              </button>
            </div>

            <div className="trashList">
              {trash.length ? (
                trash.map((item) => (
                  <div className="trashItem" key={item.trash_path}>
                    <div className="trashInfo">
                      <span>{item.emoji || '📄'}</span>
                      <div>
                        <b>{item.title}</b>
                        <small>{item.original_path}</small>
                      </div>
                    </div>

                    <div className="trashActions">
                      <button onClick={() => restoreTrash(item)}>
                        <RotateCcw size={14} /> Восстановить
                      </button>
                      <button
                        className="deleteForever"
                        onClick={() => deleteForever(item)}
                      >
                        <Trash2 size={14} /> Навсегда
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="trashEmpty">Корзина пуста</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Login page                                                         */
/* ------------------------------------------------------------------ */

function Login() {
  let [p, setP] = useState('');
  let [err, setErr] = useState('');

  return (
    <div className="login">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          api('/login', { method: 'POST', body: JSON.stringify({ password: p }) })
            .then(() => (location.href = '/notes'))
            .catch(() => setErr('Wrong password'));
        }}
      >
        <a href="/" className="brand">
          ED.
        </a>
        <h1>Welcome back</h1>
        <p>Private editor access</p>
        <input
          type="password"
          autoFocus
          value={p}
          onChange={(e) => setP(e.target.value)}
          placeholder="Password"
        />
        <button>Continue</button>
        {err && <small>{err}</small>}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Home page                                                          */
/* ------------------------------------------------------------------ */

function Home() {
  return (
    <div className="home">
      <div className="homePattern" aria-hidden="true">
        <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice">
          <g className="patternLines">
            <path d="M-80 190 H300 L470 90 L700 225 L910 105 L1160 230 H1520" />
            <path d="M120 760 V520 L330 400 L530 515 L735 390 L980 535 L1220 390 L1500 550" />
            <path d="M-40 585 C190 420 330 720 560 535 S930 350 1110 515 S1370 680 1510 470" />
            <path d="M-40 610 C190 445 330 745 560 560 S930 375 1110 540 S1370 705 1510 495" />
            <path d="M-40 635 C190 470 330 770 560 585 S930 400 1110 565 S1370 730 1510 520" />
            <path d="M470 90 V515" />
            <path d="M910 105 V535" />
            <path d="M1220 230 V390" />
          </g>
          <g className="patternDots">
            <circle cx="300" cy="190" r="7" />
            <circle cx="470" cy="90" r="5" />
            <circle cx="700" cy="225" r="8" />
            <circle cx="910" cy="105" r="6" />
            <circle cx="1160" cy="230" r="9" />
            <circle cx="330" cy="400" r="5" />
            <circle cx="530" cy="515" r="9" />
            <circle cx="735" cy="390" r="5" />
            <circle cx="980" cy="535" r="7" />
            <circle cx="1220" cy="390" r="5" />
          </g>
        </svg>
      </div>

      <div className="homeContent">
        <nav>
          <b>Евгений Дрибноход</b>
          <div>
            <a href="#work">Проекты</a>
            <a href="/notes">Заметки</a>
            <a href="https://github.com/zemlianin">GitHub</a>
            <ThemeButton />
          </div>
        </nav>

        <header>
          <p className="eyebrow">Разработка · Backend · Data</p>
          <h1>Евгений Дрибноход</h1>
          <p className="homeRole">Разработчик и студент программной инженерии.</p>
          <p className="lead">
            Занимаюсь backend-разработкой, инфраструктурой и данными. Здесь собраны мои
            проекты, публикации и заметки о технологиях, которые я изучаю и использую.
          </p>
          <div className="actions">
            <a className="primary" href="/notes">
              Заметки
            </a>
            <a href="/resume">Резюме</a>
            <a href="https://telegram.me/ser_zemlianin">Telegram</a>
          </div>
        </header>

        <section id="writing">
          <p className="eyebrow">Публикации</p>
          <div className="feature">
            <div>
              <span className="tag">СТАТЬЯ НА ХАБРЕ</span>
              <h2>Асинхронный Telegram-бот на Bash глазами C#-программиста</h2>
              <p>
                Статья о создании асинхронного Telegram-бота на Bash с точки зрения
                C#-разработчика. Публикация получила рейтинг 20 на Хабре.
              </p>
              <a href="https://habr.com/ru/articles/832934/">
                Читать статью <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </section>

        <section id="work">
          <p className="eyebrow">Избранные проекты</p>
          <div className="work">
            <div>
              <span>01</span>
              <h3>Система заказа транспорта</h3>
              <p>
                Проект создан как решение для хакатона. Его задача — управление
                транспортом внутри строительной компании. За два дня наша команда
                сделала более 80 коммитов и вышла в финал соревнования.
              </p>
              <small>ASP.NET Core · EF Core · PostgreSQL · Docker</small>
              <a href="https://github.com/zemlianin/Ordering-transport">GitHub →</a>
            </div>

            <div>
              <span>02</span>
              <h3>Backend платформы для хакатонов</h3>
              <p>
                Курсовой проект, выполненный в рамках обучения от Сбера:
                backend-платформа для организации хакатонов по Data Science. В проекте
                более 230 коммитов, а работа получила высшую оценку в университете.
              </p>
              <small>Django · PostgreSQL · Nginx · GitHub Actions · Docker</small>
              <a href="https://github.com/BankingBattle/BB_back">GitHub →</a>
            </div>

            <div>
              <span>03</span>
              <h3>Система мониторинга</h3>
              <p>
                Система мониторинга платформы для хакатонов, отображающая более 30
                метрик о трафике и состоянии различных модулей приложения.
              </p>
              <small>Prometheus · Grafana · Nginx</small>
              <a href="https://github.com/BankingBattle/BB_monitoring">GitHub →</a>
            </div>
          </div>
        </section>

        <footer>
          <span>© 2026 Евгений Дрибноход</span>
          <span>
            <a href="https://telegram.me/ser_zemlianin">Telegram</a> ·{' '}
            <a href="https://github.com/zemlianin">GitHub</a> ·{' '}
            <a href="https://habr.com/ru/articles/832934/">Хабр</a>
          </span>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                          */
/* ------------------------------------------------------------------ */

let path = location.pathname;

createRoot(document.getElementById('root')).render(
  path === '/login' ? <Login /> : path.startsWith('/notes') ? <Notes /> : <Home />,
);
