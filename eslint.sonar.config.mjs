import { createRequire } from 'node:module';
const require = createRequire(new URL('./frontend/package.json', import.meta.url));
const sonar = require('eslint-plugin-sonarjs');
const parser = require('@typescript-eslint/parser');
const react = require('eslint-plugin-react');
const a11y = require('eslint-plugin-jsx-a11y');

export default [{
  ignores: ['**/node_modules/**', '**/dist/**', '**/tests/**', '**/test/**', '**/scripts/**']
}, {
  files: ['backend/src/**/*.js', 'frontend/src/**/*.{ts,tsx}', 'tela cliente/src/**/*.{ts,tsx}'],
  languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
  plugins: { sonarjs: sonar, react, 'jsx-a11y': a11y },
  settings: { react: { version: '18.3' } },
  rules: {
    'sonarjs/cognitive-complexity': ['error', 15],
    'sonarjs/no-nested-conditional': 'error',
    'sonarjs/no-ignored-exceptions': 'error',
    'sonarjs/no-redundant-assignments': 'error',
    'sonarjs/no-dead-store': 'error',
    'sonarjs/super-linear-regex': 'error',
    'react/no-array-index-key': 'error',
    'react/jsx-no-comment-textnodes': 'error',
    'jsx-a11y/label-has-associated-control': 'error',
    'jsx-a11y/prefer-tag-over-role': 'error',
    'jsx-a11y/no-noninteractive-element-interactions': 'error',
    'jsx-a11y/anchor-is-valid': 'error'
  }
}];
