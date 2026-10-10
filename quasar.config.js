/* eslint-env node */

const { configure } = require('quasar/wrappers');

module.exports = configure(function (/* ctx */) {
  return {
    supportTS: true, // Enable TypeScript support
    eslint: {
      warnings: true,
      errors: true
    },
    boot: [
      'tauri-api'
    ],
    css: [
      'app.scss'
    ],
    extras: [
      'roboto-font',
      'material-icons'
    ],
    build: {
      target: {
        browser: [ 'es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1' ],
      },
      vueRouterMode: 'hash',
      extendViteConf (viteConf) {
        viteConf.plugins = viteConf.plugins || [];
        viteConf.plugins.push({
          name: 'md-raw',
          transform (code, id) {
            if (id.endsWith('.md')) {
              return `export default ${JSON.stringify(code)}`;
            }
          }
        });
      }
    },
    devServer: {
      // Tauri opens the window itself; port must match devUrl in src-tauri/tauri.conf.json
      open: false,
      port: 9000,
      strictPort: true
    },
    framework: {
      config: {},
      plugins: [
        'Notify'
      ]
    },
    animations: []
  }
});
