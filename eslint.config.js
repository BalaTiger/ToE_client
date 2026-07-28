import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    'dist-h5/**',
    'coverage/**',
    'public/socket.io.min.js',
  ]),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __TOE_PUBLIC_BASE__: 'readonly',
        __TOE_H5_BUILD__: 'readonly',
        __TOE_RUNTIME_TARGET__: 'readonly',
        __TOE_H5_SERVER_URL__: 'readonly',
        __TOE_H5_SOCKET_PATH__: 'readonly',
        __TOE_WEB_SERVER_URL__: 'readonly',
        __TOE_WEB_SOCKET_PATH__: 'readonly',
        __TOE_DEV_SERVER_URL__: 'readonly',
        __TOE_DEV_SOCKET_PATH__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['src/**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    files: [
      'eslint.config.js',
      'vite.config.js',
      'temp_extract_inspection.js',
      'scripts/**/*.{js,mjs}',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['public/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },
])
