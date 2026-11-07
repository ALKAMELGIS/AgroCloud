/**
 * ESLint for the whole repo. Rules are chosen to catch real defects, not style:
 * - frontend: React hook rules (a violation is a bug), plus correctness checks TypeScript leaves out
 * - backend (plain JS, no type checker): undefined names, unreachable code, unused imports/vars
 * Formatting is not linted here.
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'docs/**',
      'assets/**',
      'frontend/dev-dist/**',
      'frontend/public/**',
      '**/coverage/**',
      'backend/cache/**',
      'backend/data/**',
      '**/*.min.js',
    ],
  },

  // Backend: Node ESM, no type checker — let ESLint catch what tsc would.
  {
    files: ['backend/**/*.js', 'scripts/**/*.mjs', 'core/tools/**/*.mjs', 'server.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Frontend: TypeScript + React.
  {
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/config/**/*.ts'],
    // Existing disable comments name rules this config does not enable (e.g. exhaustive-deps).
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    extends: [tseslint.configs.base],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-binary-expression': 'error',
      'no-sparse-arrays': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
)
