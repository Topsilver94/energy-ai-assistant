/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    // Demo 项目不做 PropTypes 校验，类型边界由 JSDoc 注释承担
    'react/prop-types': 'off',
  },
}
