import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'api',
      'coverage',
      'node_modules',
      'load-test-results',
      // Phase 27.4.2 Rule-3 fix: legacy parallel-executor worktrees under
      // .claude/worktrees/agent-*/ contain stale snapshots of source files
      // (e.g. older `any` casts, pre-Plan-03 prefer-const violations) that
      // pre-date current cleanup. They are dev tooling — eslint glob-matching
      // them inflates the error count (62 of 62 errors lived here pre-fix)
      // and would corrupt locked git worktrees if --fix touched them.
      // Mirrors Plan 01's vite.config.ts test.exclude and Plan 03's
      // .prettierignore precedents for the same locked-worktree pollution.
      '.claude/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Standard convention: _-prefixed identifiers are intentionally unused
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // Phase 28.1 W7 sub-6: enforce a consistent import order across src/ + server/.
      // Starts at 'warn' so a future phase can flip to 'error' once 0 sustains.
      'import/order': [
        'warn',
        {
          groups: [
            'builtin', // node:* etc.
            'external', // npm packages
            'internal', // @/ alias
            'parent', // ../
            'sibling', // ./
            'index',
            'object',
            'type',
          ],
          pathGroups: [{ pattern: '@/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  // Test files: relax `any` rules — fixtures and mocks legitimately need `any`
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
      'src/test/**/*.{ts,tsx}',
      'server/__tests__/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  prettier,
);
