import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension, Mark } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
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
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  Menu,
  Plus,
  FolderPlus,
  Save,
  Share2,
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
  MoveRight,
  X,
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

const CODE_LANGUAGES = [
  ['Plain text', ''],
  ['C#', 'csharp'],
  ['Shell / Bash', 'bash'],
  ['PowerShell', 'powershell'],
  ['JavaScript', 'javascript'],
  ['TypeScript', 'typescript'],
  ['Python', 'python'],
  ['SQL', 'sql'],
  ['JSON', 'json'],
  ['HTML', 'html'],
  ['CSS', 'css'],
  ['Dockerfile', 'dockerfile'],
];

const LANGUAGE_ALIASES = {
  cs: 'csharp',
  'c#': 'csharp',
  sh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
  ps: 'powershell',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
};

function normalizeLanguage(language = '') {
  return LANGUAGE_ALIASES[language.toLowerCase()] || language.toLowerCase();
}

// Small dependency-free tokenizer: it deliberately favours safe, readable output
// over trying to be a full compiler for every language in the language picker.
function codeTokens(source, language = '') {
  const lang = normalizeLanguage(language);
  if (!lang) return [{ text: source, type: '' }];
  const keywords =
    {
      csharp:
        'abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while yield',
      bash: 'if then else elif fi for while in do done case esac function select time until',
      powershell:
        'begin break catch class continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function if in param process return switch throw trap try until using var while workflow',
      javascript:
        'async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield',
      typescript:
        'abstract any as async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface keyof let module namespace never new null number object of private protected public readonly return set static string super switch symbol this throw true try type typeof undefined unknown var void while yield',
      python:
        'and as assert async await break class continue def del elif else except false finally for from global if import in is lambda none nonlocal not or pass raise return true try while with yield',
      sql: 'add alter and as asc between by case column create database default delete desc distinct drop else end exists from group having in index insert into is join like limit not null on or order primary references select set table then union unique update values view when where',
    }[lang] || '';
  const keywordSet = new Set(keywords.split(' ').filter(Boolean));
  const pattern =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|<!--[\s\S]*?-->|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$-]*\b)/g;
  const result = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor)
      result.push({ text: source.slice(cursor, match.index), type: '' });
    const value = match[0];
    let type = '';
    if (/^(\/\/|\/\*|#|<!--)/.test(value)) type = 'comment';
    else if (/^["'`]/.test(value)) type = 'string';
    else if (/^\d/.test(value)) type = 'number';
    else if (keywordSet.has(value.toLowerCase())) type = 'keyword';
    else if (/^[A-Z]/.test(value) && ['csharp', 'typescript'].includes(lang))
      type = 'type';
    result.push({ text: value, type });
    cursor = match.index + value.length;
  }
  if (cursor < source.length) result.push({ text: source.slice(cursor), type: '' });
  return result;
}

const LanguageCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: '',
        parseHTML: (element) =>
          normalizeLanguage(
            element.firstElementChild?.className.match(/language-([\w#+-]+)/)?.[1] ||
              '',
          ),
        renderHTML: ({ language }) =>
          language ? { class: `language-${normalizeLanguage(language)}` } : {},
      },
    };
  },
});

const SyntaxHighlight = Extension.create({
  name: 'syntaxHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('syntaxHighlight'),
        props: {
          decorations(state) {
            const decorations = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'codeBlock' || !node.attrs.language) return;
              let offset = 0;
              codeTokens(node.textContent, node.attrs.language).forEach((token) => {
                if (token.type)
                  decorations.push(
                    Decoration.inline(
                      pos + 1 + offset,
                      pos + 1 + offset + token.text.length,
                      { class: `tok-${token.type}` },
                    ),
                  );
                offset += token.text.length;
              });
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

function styleMark(name, property, tag) {
  return Mark.create({
    name,
    addAttributes() {
      return {
        color: {
          default: null,
          parseHTML: (el) => el.style[property],
          renderHTML: ({ color }) => (color ? { style: `${tag}: ${color}` } : {}),
        },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'span[style]',
          getAttrs: (element) => (element.style[property] ? {} : false),
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', HTMLAttributes, 0];
    },
    addCommands() {
      return {
        [`set${name[0].toUpperCase() + name.slice(1)}`]:
          (attributes) =>
          ({ commands }) =>
            commands.setMark(name, attributes),
        [`unset${name[0].toUpperCase() + name.slice(1)}`]:
          () =>
          ({ commands }) =>
            commands.unsetMark(name),
      };
    },
  });
}

const TextColor = styleMark('textColor', 'color', 'color');
const TextHighlight = styleMark('textHighlight', 'backgroundColor', 'background-color');

function HighlightedCode({ language, children }) {
  return (
    <code className={language ? `language-${normalizeLanguage(language)}` : ''}>
      {codeTokens(String(children).replace(/\n$/, ''), language).map((token, i) => (
        <span className={token.type ? `tok-${token.type}` : undefined} key={i}>
          {token.text}
        </span>
      ))}
    </code>
  );
}

// ReactMarkdown intentionally ignores raw HTML. Convert only the two safe span
// styles emitted by our editor, leaving every other HTML fragment untouched.
function rehypeEditorStyles() {
  return (tree) => {
    const visit = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const raw = node.children[i];
        const match =
          raw.type === 'raw' &&
          raw.value.match(/^<span style="(color|background-color):\s*([^";]+)">$/i);
        if (!match) continue;
        const end = node.children.findIndex(
          (child, index) =>
            index > i && child.type === 'raw' && child.value === '</span>',
        );
        if (end < 0) continue;
        const styledChildren = node.children.slice(i + 1, end);
        node.children.splice(i, end - i + 1, {
          type: 'element',
          tagName: 'span',
          properties: { style: `${match[1]}: ${match[2]}` },
          children: styledChildren,
        });
      }
      node.children.forEach(visit);
    };
    visit(tree);
  };
}

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

function Tree({ items, onOpen, editor, onMoveFolder, onDeleteFolder, onShareFolder }) {
  return items.map((x) => (
    <div key={x.path} className={x.type === 'folder' ? 'treeFolder' : ''}>
      {x.type === 'folder' ? (
        <details>
          <summary>
            <ChevronRight className="folderChevron" size={14} />
            <Folder className="folderIcon" size={16} />
            <span>{x.name}</span>
            {editor && (
              <button
                className="treeAction"
                type="button"
                title="Поделиться папкой"
                aria-label={'Поделиться папкой «' + x.name + '»'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onShareFolder(x);
                }}
              >
                <Share2 size={14} />
              </button>
            )}
            {editor && (
              <button
                className="treeAction"
                type="button"
                title="Переместить папку"
                onClick={(e) => {
                  e.preventDefault();
                  onMoveFolder(x);
                }}
              >
                <MoveRight size={14} />
              </button>
            )}
            {editor && (
              <button
                className="treeAction"
                type="button"
                title="Удалить папку"
                aria-label={'Удалить папку «' + x.name + '»'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteFolder(x);
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </summary>
          <div className="nest">
            <Tree
              items={x.children}
              onOpen={onOpen}
              editor={editor}
              onMoveFolder={onMoveFolder}
              onDeleteFolder={onDeleteFolder}
              onShareFolder={onShareFolder}
            />
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

function folderOptions(items, depth = 0) {
  return items.flatMap((item) =>
    item.type === 'folder'
      ? [
          { path: item.path, label: `${'— '.repeat(depth)}${item.name}` },
          ...folderOptions(item.children, depth + 1),
        ]
      : [],
  );
}

function FolderDialog({
  title,
  folders,
  initialFolder = '',
  nameLabel,
  onClose,
  onSubmit,
}) {
  const [folder, setFolder] = useState(initialFolder);
  const [name, setName] = useState('');

  return (
    <div className="dialogBackdrop" onMouseDown={onClose}>
      <form
        className="folderDialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ folder, name: name.trim() });
        }}
      >
        <div className="dialogHead">
          <h2>{title}</h2>
          <button type="button" className="iconBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {nameLabel && (
          <label>
            {nameLabel}
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          Папка
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Корень</option>
            {folderOptions(folders).map((x) => (
              <option key={x.path} value={x.path}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <div className="dialogActions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" type="submit">
            Готово
          </button>
        </div>
      </form>
    </div>
  );
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

turndown.addRule('textColour', {
  filter: (node) => node.nodeName === 'SPAN' && !!node.style.color,
  replacement: (content, node) =>
    `<span style="color: ${node.style.color}">${content}</span>`,
});

turndown.addRule('textHighlight', {
  filter: (node) => node.nodeName === 'SPAN' && !!node.style.backgroundColor,
  replacement: (content, node) =>
    `<span style="background-color: ${node.style.backgroundColor}">${content}</span>`,
});

/* ------------------------------------------------------------------ */
/*  Rich editor                                                        */
/* ------------------------------------------------------------------ */

function RichEditor({ note, setNote, upload }) {
  const [slash, setSlash] = useState(false);
  const fileRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      LanguageCodeBlock,
      SyntaxHighlight,
      TextColor,
      TextHighlight,
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

  const codeLanguage = normalizeLanguage(
    editor.getAttributes('codeBlock').language || '',
  );

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
        <button
          className={editor.isActive('codeBlock') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          {'</>'}
        </button>
        <label className="languagePicker" title="Code language">
          <span>Language</span>
          <select
            value={codeLanguage}
            disabled={!editor.isActive('codeBlock')}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes('codeBlock', { language: e.target.value })
                .run()
            }
          >
            {CODE_LANGUAGES.map(([label, value]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="colorTool" title="Text colour">
          <span>A</span>
          <input
            type="color"
            defaultValue="#2563eb"
            onInput={(e) =>
              editor
                .chain()
                .focus()
                .setTextColor({ color: e.currentTarget.value })
                .run()
            }
          />
        </label>
        <button
          onClick={() => editor.chain().focus().unsetTextColor().run()}
          title="Remove text colour"
        >
          A×
        </button>
        <label className="colorTool highlightTool" title="Highlight colour">
          <span>▰</span>
          <input
            type="color"
            defaultValue="#fde68a"
            onInput={(e) =>
              editor
                .chain()
                .focus()
                .setTextHighlight({ color: e.currentTarget.value })
                .run()
            }
          />
        </label>
        <button
          onClick={() => editor.chain().focus().unsetTextHighlight().run()}
          title="Remove highlight"
        >
          ▰×
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

function ShareDialog({ note, onClose }) {
  const [links, setLinks] = useState({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const endpoint = '/shares?path=' + encodeURIComponent(note.path);
  useEffect(() => {
    api(endpoint)
      .then((x) => setLinks(x.links))
      .catch((e) => setMessage(e.message))
      .finally(() => setBusy(false));
  }, [endpoint]);
  const change = async (mode, method) => {
    if (
      links[mode] &&
      !confirm(
        method === 'DELETE'
          ? 'Отключить доступ по этой ссылке?'
          : 'Старая ссылка перестанет работать. Сбросить её?',
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const x = await api(endpoint, { method, body: JSON.stringify({ mode }) });
      setLinks(x.links);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const url = (token) => location.origin + '/notes#share=' + token;
  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(url(token));
      setMessage('Ссылка скопирована');
    } catch {
      setMessage('Выделите ссылку и скопируйте её вручную.');
    }
  };
  return (
    <div className="trashBackdrop" onMouseDown={onClose}>
      <div
        className="trashModal shareModal"
        role="dialog"
        aria-modal="true"
        aria-label={note.type === 'folder' ? 'Поделиться папкой' : 'Поделиться статьёй'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="trashHead">
          <div>
            <h2>Поделиться</h2>
            <p>{note.meta?.title || note.name}</p>
          </div>
          <button aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        {['view', 'edit'].map((mode) => (
          <section className="shareRow" key={mode}>
            <h3>{mode === 'view' ? 'Зритель' : 'Редактор'}</h3>
            {links[mode] ? (
              <>
                <input
                  aria-label={'Ссылка: ' + mode}
                  readOnly
                  value={url(links[mode])}
                  onFocus={(e) => e.target.select()}
                />
                <div className="shareActions">
                  <button disabled={busy} onClick={() => copy(links[mode])}>
                    Копировать
                  </button>
                  <button disabled={busy} onClick={() => change(mode, 'POST')}>
                    Сбросить
                  </button>
                  <button disabled={busy} onClick={() => change(mode, 'DELETE')}>
                    Отключить
                  </button>
                </div>
              </>
            ) : (
              <button disabled={busy} onClick={() => change(mode, 'POST')}>
                Создать ссылку
              </button>
            )}
          </section>
        ))}
        {message && <p role="status">{message}</p>}
      </div>
    </div>
  );
}

function Notes() {
  const [tree, setTree] = useState([]);
  const [note, setNote] = useState(null);
  const [role, setRole] = useState('visitor');
  const [shareToken, setShareToken] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get('share'),
  );
  useEffect(() => {
    const changed = () =>
      setShareToken(new URLSearchParams(location.hash.slice(1)).get('share'));
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const shared = !!shareToken;
  const member = !shared && (role === 'developer' || role === 'admin');
  const editor = shared ? note?.share_mode === 'edit' : member;
  const [sharing, setSharing] = useState(null);
  const [sharedFolder, setSharedFolder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const admin = role === 'admin';
  const [edit, setEdit] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [side, setSide] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(
    () => Number(localStorage.sidebarWidth) || 270,
  );

  let loadTree = () => {
    if (!shared) return api('/tree').then(setTree);
    if (!sharedFolder) return Promise.resolve();
    return api('/shared/' + encodeURIComponent(shareToken)).then((folder) => {
      setSharedFolder(folder);
      setTree(folder.tree);
    });
  };

  let open = (p) =>
    api(
      (shared
        ? '/shared/' + encodeURIComponent(shareToken) + '?path='
        : '/note?path=') + encodeURIComponent(p),
    ).then((n) => {
      setNote(n);
      setEdit(false);
      setSide(false);
    });

  useEffect(() => {
    setNote(null);
    setEdit(false);
    setSharing(false);
    setLoadError('');
    setTree([]);
    setSharedFolder(null);
    if (shareToken) {
      let active = true;
      api('/shared/' + encodeURIComponent(shareToken))
        .then((n) => {
          if (!active) return;
          if (n.type === 'folder') {
            setSharedFolder(n);
            setTree(n.tree);
          } else setNote(n);
        })
        .catch((e) => {
          if (active) setLoadError(e.message);
        });
      return () => {
        active = false;
      };
    }
    api('/me').then((x) => setRole(x.role));
    api('/tree').then(setTree);

    api('/start')
      .then((x) => {
        if (x.path) {
          return api('/note?path=' + encodeURIComponent(x.path)).then((n) => {
            setNote(n);
            setEdit(false);
            setSide(false);
          });
        }
      })
      .catch(() => {});
  }, [shareToken]);

  const saveFlag = async (field, value) => {
    if (savingFlag) return;
    const path = note.path;
    setSavingFlag(true);
    try {
      // Save only the flag, keeping unsaved editor content in the browser.
      const saved = await api('/note?path=' + encodeURIComponent(path));
      await api('/note', {
        method: 'PUT',
        body: JSON.stringify({
          ...saved,
          meta: { ...saved.meta, [field]: value },
        }),
      });
      setNote((current) =>
        current?.path === path
          ? { ...current, meta: { ...current.meta, [field]: value } }
          : current,
      );
      await loadTree();
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingFlag(false);
    }
  };

  let save = () =>
    api(shared ? '/shared/' + encodeURIComponent(shareToken) : '/note', {
      method: 'PUT',
      body: JSON.stringify(note),
    })
      .then(() => {
        setEdit(false);
        return loadTree();
      })
      .catch((e) => alert(e.message));

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

  const removeFolder = async (folder) => {
    if (!confirm(`Переместить папку «${folder.name}» и всё её содержимое в корзину?`))
      return;
    try {
      await api('/folder?path=' + encodeURIComponent(folder.path), {
        method: 'DELETE',
      });
      if (note?.path.startsWith(folder.path + '/')) {
        setNote(null);
        setEdit(false);
        setSharing(false);
      }
      await loadTree();
    } catch (e) {
      alert(e.message);
    }
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
      if (x.type !== 'folder') open(x.path);
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

  let create = ({ name, folder }) => {
    if (name) {
      api('/note', { method: 'POST', body: JSON.stringify({ title: name, folder }) })
        .then((x) => {
          setDialog(null);
          loadTree();
          open(x.path).then?.(() => setEdit(true));
          setTimeout(() => setEdit(true), 150);
        })
        .catch((e) => alert(e.message));
    }
  };

  let createFolder = ({ name, folder }) => {
    const path = [folder, name].filter(Boolean).join('/');
    api('/folder', { method: 'POST', body: JSON.stringify({ path }) })
      .then(() => {
        setDialog(null);
        loadTree();
      })
      .catch((e) => alert(e.message));
  };

  let move = (item, type) =>
    setDialog({
      title: `Переместить «${item.name || item.meta?.title || 'страницу'}»`,
      initialFolder:
        type === 'note'
          ? item.path.split('/').slice(0, -1).join('/')
          : item.path.split('/').slice(0, -1).join('/'),
      submit: ({ folder }) =>
        api('/move', {
          method: 'POST',
          body: JSON.stringify({ path: item.path, folder, type }),
        })
          .then((x) => {
            setDialog(null);
            loadTree();
            if (type === 'note') open(x.path);
          })
          .catch((e) => alert(e.message)),
    });

  let startResize = (event) => {
    event.preventDefault();
    const resize = (e) => setSidebarWidth(Math.max(220, Math.min(520, e.clientX)));
    const finish = (e) => {
      const width = Math.max(220, Math.min(520, e.clientX));
      setSidebarWidth(width);
      localStorage.sidebarWidth = width;
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', finish);
    };
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', finish);
  };

  let upload = async (f, append = true) => {
    let fd = new FormData();
    fd.append('file', f);
    let x = await api(
      shared ? '/shared/' + encodeURIComponent(shareToken) + '/upload' : '/upload',
      { method: 'POST', body: fd },
    );
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
    <div className="notes" style={{ '--sidebar-width': `${sidebarWidth}px` }}>
      <aside className={side ? 'show' : ''}>
        <div className="sideHead">
          <a href="/" className="brand">
            ED.
          </a>
          <div>
            <ThemeButton />
          </div>
        </div>

        {member && (
          <div className="tools">
            <button
              onClick={() =>
                setDialog({
                  title: 'Новая страница',
                  nameLabel: 'Название',
                  submit: create,
                })
              }
            >
              <Plus size={16} /> Page
            </button>
            <button
              onClick={() =>
                setDialog({
                  title: 'Новая папка',
                  nameLabel: 'Название',
                  submit: createFolder,
                })
              }
            >
              <FolderPlus size={16} />
            </button>
          </div>
        )}

        <Tree
          items={tree}
          onOpen={open}
          editor={member}
          onMoveFolder={(folder) => move(folder, 'folder')}
          onDeleteFolder={removeFolder}
          onShareFolder={setSharing}
        />

        <div className="sideBottom">
          {member && (
            <button className="trashOpenBtn" onClick={showTrash}>
              <Trash2 size={15} /> Корзина
            </button>
          )}

          {member ? (
            <button
              onClick={() =>
                api('/logout', { method: 'POST' }).then(() => location.reload())
              }
            >
              <LogOut size={15} /> Log out
            </button>
          ) : null}
        </div>
        <div
          className="sidebarResize"
          onMouseDown={startResize}
          title="Изменить ширину панели"
        />
      </aside>

      {side && (
        <button
          className="sideBackdrop"
          type="button"
          aria-label="Закрыть меню страниц"
          onClick={() => setSide(false)}
        />
      )}

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

              {editor && (
                <div className="adminbar">
                  <button onClick={() => setEdit(!edit)}>
                    {edit ? 'Done' : 'Edit'}
                  </button>

                  {edit && (
                    <button className="save" onClick={save} disabled={savingFlag}>
                      <Save size={15} /> Save
                    </button>
                  )}

                  {member && (
                    <>
                      <button
                        className="shareButton"
                        aria-label="Поделиться"
                        title="Поделиться"
                        onClick={() => setSharing(note)}
                      >
                        <Share2 size={18} />
                      </button>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!note.meta.published}
                          disabled={savingFlag}
                          onChange={(e) => saveFlag('published', e.target.checked)}
                        />{' '}
                        Published
                      </label>

                      {admin && (
                        <label title="Личные страницы видны только администратору">
                          <input
                            type="checkbox"
                            checked={!!note.meta.private}
                            disabled={savingFlag}
                            onChange={(e) => saveFlag('private', e.target.checked)}
                          />{' '}
                          Личная
                        </label>
                      )}

                      <label title="Эта страница откроется первой при переходе в заметки">
                        <input
                          type="checkbox"
                          checked={!!note.meta.start_page}
                          disabled={savingFlag}
                          onChange={(e) => saveFlag('start_page', e.target.checked)}
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
                      <button
                        onClick={() => move(note, 'note')}
                        title="Переместить страницу"
                      >
                        <MoveRight size={15} /> Переместить
                      </button>
                    </>
                  )}
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
                    rehypePlugins={[rehypeEditorStyles]}
                    components={{
                      a: ({ href, children }) => (
                        <LinkCard href={href}>{children}</LinkCard>
                      ),
                      code: ({ className = '', children }) => (
                        <HighlightedCode
                          language={className.match(/language-([\w#+-]+)/)?.[1] || ''}
                        >
                          {children}
                        </HighlightedCode>
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
            <h1>{loadError ? 'Доступ недоступен' : sharedFolder?.name || 'Notes'}</h1>
            <p>
              {loadError ||
                (sharedFolder
                  ? 'Выберите статью в меню.'
                  : shared
                    ? 'Загрузка…'
                    : 'Choose a page from the sidebar.')}
            </p>
          </div>
        )}
      </main>

      {sharing && (
        <ShareDialog
          key={sharing.path}
          note={sharing}
          onClose={() => setSharing(false)}
        />
      )}
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
      {dialog && (
        <FolderDialog
          title={dialog.title}
          folders={tree}
          initialFolder={dialog.initialFolder}
          nameLabel={dialog.nameLabel}
          onClose={() => setDialog(null)}
          onSubmit={dialog.submit}
        />
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
