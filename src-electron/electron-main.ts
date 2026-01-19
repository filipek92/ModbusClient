import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import ModbusRTU from 'modbus-serial'

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

let mainWindow: BrowserWindow | undefined | null
const client = new ModbusRTU()
let connectionStatus = 'disconnected'

function sendLog(message: string) {
  if (mainWindow) {
    const timestamp = new Date().toLocaleTimeString()
    mainWindow.webContents.send('log-message', `[${timestamp}] ${message}`)
  }
}

function sendStatus(status: string) {
  connectionStatus = status
  if (mainWindow) {
    mainWindow.webContents.send('status-change', status)
  }
}

function createWindow () {
  mainWindow = new BrowserWindow({
    icon: path.resolve(__dirname, 'icons/icon.png'), // tray icon
    width: 1000,
    height: 800,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD as string)
    }
  })

  mainWindow.loadURL(process.env.APP_URL as string)

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools()
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// --- Modbus Logic ---

ipcMain.handle('connect-tcp', async (event, { host, port }) => {
  try {
    sendLog(`Connecting to TCP: ${host}:${port}...`)
    if (client.isOpen) client.close()
    
    await client.connectTCP(host, { port: parseInt(port) })
    client.setID(1) // Default ID, can be changed per request
    client.setTimeout(2000)
    
    sendStatus('connected')
    sendLog(`Connected to ${host}:${port}`)
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendLog(`Error connecting TCP: ${msg}`)
    sendStatus('error')
    return { success: false, error: msg }
  }
})

ipcMain.handle('connect-rtu', async (event, { path, baudRate, parity, dataBits, stopBits }) => {
  try {
    sendLog(`Connecting to RTU: ${path} @ ${baudRate}...`)
    if (client.isOpen) client.close()
    
    await client.connectRTUBuffered(path, { 
      baudRate: parseInt(baudRate),
      parity: parity || 'none',
      dataBits: parseInt(dataBits) || 8,
      stopBits: parseInt(stopBits) || 1
    })
    client.setID(1)
    client.setTimeout(2000)
    
    sendStatus('connected')
    sendLog(`Connected to RTU ${path}`)
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendLog(`Error connecting RTU: ${msg}`)
    sendStatus('error')
    return { success: false, error: msg }
  }
})

ipcMain.handle('disconnect', async () => {
  try {
    client.close()
    sendStatus('disconnected')
    sendLog('Disconnected')
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('read-modbus', async (event, { type, id, start, length }) => {
  if (connectionStatus !== 'connected') {
    sendLog('Cannot read: Not connected')
    throw new Error('Not connected')
  }
  
  try {
    client.setID(parseInt(id))
    const s = parseInt(start)
    const l = parseInt(length)
    let data

    switch (type) {
      case 'holding':
        data = await client.readHoldingRegisters(s, l)
        break
      case 'input':
        data = await client.readInputRegisters(s, l)
        break
      case 'coil':
        data = await client.readCoils(s, l)
        break
      case 'discrete':
        data = await client.readDiscreteInputs(s, l)
        break
      default:
        throw new Error(`Unknown register type: ${type}`)
    }

    return { success: true, data: data.data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendLog(`Read Error (${type}, ID:${id}, Addr:${start}): ${msg}`)
    return { success: false, error: msg }
  }
})

ipcMain.handle('write-modbus', async (event, { type, id, address, values }) => {
  if (connectionStatus !== 'connected') {
    sendLog('Cannot write: Not connected')
    throw new Error('Not connected')
  }

  try {
    client.setID(parseInt(id))
    const addr = parseInt(address)
    
    // Check if we are writing one or multiple
    const isMultiple = Array.isArray(values) && values.length > 1;

    if (type === 'coil') {
       // Coils (FC05/FC15)
       // Expecting boolean-like values (0/1, true/false)
       const boolValues = (Array.isArray(values) ? values : [values]).map((v: any) => {
         if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
         return !!v;
       });

       if (isMultiple) {
         sendLog(`Writing Multiple Coils ID:${id} Addr:${addr} Vals:[${boolValues}]`)
         await client.writeCoils(addr, boolValues)
       } else {
         sendLog(`Writing Single Coil ID:${id} Addr:${addr} Val:${boolValues[0]}`)
         await client.writeCoil(addr, boolValues[0])
       }

    } else {
       // Holding Registers (FC06/FC16)
       // Ensure values are numbers
       const numValues = (Array.isArray(values) ? values : [values]).map((v: string | number) => parseInt(String(v)))
       
       if (isMultiple) {
          sendLog(`Writing Multiple Regs ID:${id} Addr:${addr} Vals:[${numValues}]`)
          await client.writeRegisters(addr, numValues)
       } else {
          sendLog(`Writing Single Reg ID:${id} Addr:${addr} Val:${numValues[0]}`)
          await client.writeRegister(addr, numValues[0])
       }
    }

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendLog(`Write Error (${type}, ID:${id}, Addr:${address}): ${msg}`)
    return { success: false, error: msg }
  }
})
