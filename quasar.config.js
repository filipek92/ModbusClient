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
        node: 'node16'
      },
      vueRouterMode: 'hash', 
    },
    devServer: {
      open: true 
    },
    framework: {
      config: {},
      plugins: [
        'Notify'
      ]
    },
    animations: [],
    ssr: {
      pwa: false,
      prodPort: 3000, 
    },
    pwa: {
      workboxPluginMode: 'GenerateSW', 
      workboxOptions: {}, 
      manifest: {
        name: 'Modbus Client',
        short_name: 'Modbus Client',
        description: 'Modbus Client with Electron, Vue and Quasar',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#027be3',
        icons: []
      }
    },
    cordova: {},
    capacitor: {
      hideSplashscreen: true
    },
    electron: {
      inspectPort: 5858,
      bundler: 'packager', 
      packager: {},
      builder: {
        appId: 'modbus-client'
      },
      // IMPORTANT: Initialization of the Main Process
      extendElectronMainConf (cfg) {
        // do something with cfg
      }
    }
  }
});
