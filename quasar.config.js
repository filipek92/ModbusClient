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
      bundler: 'builder', // Changed from packager
      
      builder: {
        appId: 'modbus-client',
        publish: [
          {
            provider: 'github',
            owner: 'filipek92',
            repo: 'ModbusClient'
          }
        ],
        extraResources: [
          {
            from: 'src-electron/default-decoders',
            to: 'default-decoders'
          },
          {
            from: 'src-electron/icons',
            to: 'icons'
          }
        ],
        linux: {
          target: ['AppImage', 'deb'],
          category: 'Utility',
          icon: 'src-electron/icons-linux'
        },
        win: {
          target: ['nsis'],
          icon: 'src-electron/icons/icon.ico'
        },
        mac: {
          icon: 'src-electron/icons/icon.icns'
        }
      },
      // IMPORTANT: Initialization of the Main Process
      extendElectronMainConf (cfg) {
        // do something with cfg
      }
    }
  }
});
