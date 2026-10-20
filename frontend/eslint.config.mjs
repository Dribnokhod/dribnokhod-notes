import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.venv/**',
      '**/venv/**',
      '**/env/**',
      '**/ENV/**',
      '**/__pycache__/**',
      '**/.cache/**',
      '**/.codex/**',
      '**/.aws/**',
      '**/obsidian-vault/**',
      '**/docker-data/**',
      '**/volumes/**',
      '**/exports/**',
      '**/backups/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/data/**',
      '**/uploads/**',
      '**/secrets/**',
      '**/Microsoft/**',
      '**/.env*',
      '**/.git/**',
    ],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['*.config.{js,mjs,cjs}', 'tests/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: js.configs.recommended.rules,
  },
];
