# Modbus Client

This is a Modbus client application built with Quasar, Vue 3, TypeScript, and Electron. It allows you to connect to Modbus devices, read and write data, and manage devices.

## Technologies Used

*   **Quasar Framework:** A high-performance Vue.js framework for building responsive websites, PWAs, SSR, mobile and desktop apps.
*   **Vue.js 3:** A progressive JavaScript framework for building user interfaces.
*   **TypeScript:** A typed superset of JavaScript that compiles to plain JavaScript.
*   **Electron:** A framework for building desktop applications with web technologies.
*   **Pinia:** A state management library for Vue.js.
*   **Modbus Serial:** A library for communicating with Modbus devices over a serial port.
*   **Serialport:** A library for accessing serial ports.

## Project Structure

The project is structured as a standard Quasar project with the addition of an `src-electron` directory for the Electron main process.

*   `src`: Contains the Vue.js application source code.
    *   `assets`: Static assets like images and fonts.
    *   `boot`: Quasar boot files.
    *   `components`: Vue components.
    *   `css`: CSS and SCSS files.
    *   `decoders`: Decoders for different Modbus devices.
    *   `layouts`: Layout components.
    *   `pages`: Page components.
    *   `router`: Vue Router configuration.
    *   `stores`: Pinia store modules.
*   `src-electron`: Contains the Electron main process source code.
    *   `electron-main.ts`: The main process entry point.
    *   `electron-preload.ts`: The preload script.
*   `public`: Static assets that are not processed by webpack.
*   `dist`: The production build output.

## Available Scripts

*   `npm run lint`: Lints the code.
*   `npm run test`: Runs the tests.
*   `npm run dev`: Starts the development server with Electron.
*   `npm run build`: Builds the application for production.

## Main Features

*   **Connection Settings:** Configure the serial port connection to the Modbus device.
*   **Device Manager:** Add, remove, and manage Modbus devices.
*   **Manual Query:** Manually send Modbus queries to a device.
*   **Regular Collectors:** Set up regular data collection from devices.
*   **Log Console:** View logs from the application and the Modbus communication.

## Development

1.  Clone the repository.
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

## Building for Production

You can build the application for Linux and Windows.

### Linux

To build the application for Linux, run the following command:

```bash
npm run build
```

This will create a `dist/electron/linux-unpacked` directory with the application files.

### Windows

To build the application for Windows, run the following command:

```bash
npm run build:win
```

This will create a `dist/electron/win-unpacked` directory with the application files.
