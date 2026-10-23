import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/.expo',
      '**/expo-env.d.ts',
      'apps/mobile/{android,ios}'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    // Core also runs on React Native, where these browser globals don't exist.
    files: ['packages/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'DOMParser'].map(
          (name) => ({ name, message: 'Not available on mobile: pass it in from the app instead.' })
        )
      ]
    }
  },
  {
    // TipTap is web-only: native mobile code may import the editor's types, never its code (it would land in the
    // React Native bundle). Only the DOM components under src/dom run it.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/dom/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@daily-status/editor', '@daily-status/editor/*', '@tiptap/*'],
              allowTypeImports: true,
              message: 'Web-only: use it from a DOM component in apps/mobile/src/dom.'
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
