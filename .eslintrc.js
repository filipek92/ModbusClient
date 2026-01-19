module.exports = {
  root: true,
  parserOptions: {
    parser: require.resolve('@typescript-eslint/parser'),
    extraFileExtensions: [ '.vue' ]
  },
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-essential'
  ],
  plugins: [
    '@typescript-eslint',
    'vue'
  ],
  globals: {
    ga: 'readonly', 
    cordova: 'readonly',
    __statics: 'readonly',
    __QUASAR_SSR__: 'readonly',
    __QUASAR_SSR_SERVER__: 'readonly',
    __QUASAR_SSR_CLIENT__: 'readonly',
    __QUASAR_SSR_PWA__: 'readonly',
    process: 'readonly',
    Capacitor: 'readonly',
    chrome: 'readonly'
  },
  rules: {
    'prefer-promise-reject-errors': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'vue/multi-word-component-names': 'off'
  }
}
