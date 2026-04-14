import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import http from 'http'
import ModbusRTU from 'modbus-serial'

const execFileAsync = promisify(execFile)

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

let mainWindow: InstanceType<typeof BrowserWindow> | undefined | null
const client = new ModbusRTU()
let connectionStatus = 'disconnected'
let connectionMode: 'tcp' | 'rtu' = 'tcp'
const trafficStats = {
  txBytes: 0,
  rxBytes: 0,
  txMsg: 0,
  rxMsg: 0
}

// --- Auto Updater Configuration ---

autoUpdater.autoDownload = false // Let user decide when to download
autoUpdater.logger = {
  info: (msg) => sendLog(`Updater: ${msg}`),
  warn: (msg) => sendLog(`Updater WARN: ${msg}`),
  error: (msg) => sendLog(`Updater ERROR: ${msg}`)
}

autoUpdater.on('checking-for-update', () => {
  sendLog('Checking for update...')
})

autoUpdater.on('update-available', (info) => {
  sendLog(`Update available: ${info.version}`)
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info)
  }
})

autoUpdater.on('update-not-available', (info) => {
  sendLog(`Update not available: ${info.version}`)
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', info)
  }
})

autoUpdater.on('error', (err) => {
  sendLog(`Update error: ${err}`)
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message)
  }
})

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj)
  }
})

autoUpdater.on('update-downloaded', (info) => {
  sendLog(`Update downloaded: ${info.version}`)
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info)
  }
})

ipcMain.handle('check-for-updates', async () => {
  try {
    return await autoUpdater.checkForUpdates()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
})

ipcMain.handle('download-update', async () => {
  try {
    return await autoUpdater.downloadUpdate()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
})

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})

class Mutex {
  private _queue: (() => void)[] = []
  private _locked = false

  async acquire () {
    if (this._locked) {
      await new Promise<void>(resolve => this._queue.push(resolve))
    }
    this._locked = true
    return () => this.release()
  }

  async runExclusive<T>(callback: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire()
    try {
      return await callback()
    } finally {
      release()
    }
  }

  private release () {
    if (this._queue.length > 0) {
      const resolve = this._queue.shift()
      if (resolve) resolve()
    } else {
      this._locked = false
    }
  }
}

const clientMutex = new Mutex()

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

function sendStats() {
  if (mainWindow) {
    mainWindow.webContents.send('traffic-stats', trafficStats)
  }
}

function sendScanProgress(currentId: number) {
  if (mainWindow) {
    mainWindow.webContents.send('scan-progress', currentId)
  }
}

function sendValueScanProgress(progress: number) {
  if (mainWindow) {
    mainWindow.webContents.send('value-scan-progress', progress)
  }
}

function resetStats() {
  trafficStats.txBytes = 0
  trafficStats.rxBytes = 0
  trafficStats.txMsg = 0
  trafficStats.rxMsg = 0
  sendStats()
}

function updateStats(tx: number, rx: number) {
  trafficStats.txMsg += 1
  trafficStats.rxMsg += 1
  trafficStats.txBytes += tx
  trafficStats.rxBytes += rx
  sendStats()
}

function createWindow () {
  const iconResource = platform === 'win32'
    ? 'icons/icon.ico'
    : 'icons/linux-512x512.png'

  const iconPath = process.env.DEBUGGING
    ? path.resolve(__dirname, '../../src-electron', iconResource)
    : path.resolve(process.resourcesPath, iconResource)

  mainWindow = new BrowserWindow({
    icon: iconPath,
    width: 1000,
    height: 800,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD as string)
    }
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.loadURL(process.env.APP_URL as string)

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools()
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
    
    // Check for updates automatically in production
    mainWindow.webContents.once('did-finish-load', () => {
      autoUpdater.checkForUpdatesAndNotify()
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

ipcMain.handle('scan-devices', async (event, { startId, endId, timeout }) => {
  return await clientMutex.runExclusive(async () => {
    const found: number[] = []
    
    // Save current timeout to restore later if connected
    let originalTimeout = 1000
    try {
        originalTimeout = client.getTimeout()
    } catch {
        // ignore
    }

    try {
      if (!client.isOpen) {
        throw new Error('Port not open')
      }
      
      sendLog(`Starting scan from ID ${startId} to ${endId} with timeout ${timeout}ms...`)
      client.setTimeout(timeout)

      for (let id = startId; id <= endId; id++) {
        sendScanProgress(id)
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
            attempts++;
            try {
              client.setID(id)
              // Try to read Holding Register 0. 
              // If the device exists, it will either reply with data OR an exception (e.g. Illegal Address).
              // Both mean the device is there. Only timeout means it's likely not there.
              await client.readHoldingRegisters(0, 1)
              found.push(id)
              sendLog(`Found device at ID: ${id}`)
              success = true;
            } catch (e: unknown) {
               const err = e as { name?: string, message?: string }
               const msg = err.message || ''
               
               // Handle timeouts -> device not found (usually)
               if (msg.includes('Timed out') || msg.includes('timeout') || err.name === 'TransactionTimedOutError') {
                 // not found, stop retrying for this ID to save time
                 break;
               } 
               // Handle SLAVE DEVICE BUSY (Exception Code 06)
               else if (msg.includes('Slave device busy') || msg.includes('Code: 6') || msg.includes('Code 6')) {
                   sendLog(`Device BUSY at ID: ${id}, retrying (${attempts}/3)...`)
                   await new Promise(r => setTimeout(r, 200)); // wait a bit before retry
                   continue;
               }
               // Other errors (Illegal Address, etc.) -> Device IS there
               else {
                 found.push(id)
                 sendLog(`Found device at ID: ${id} (responded with error: ${msg})`)
                 success = true; 
               }
            }
        }

        // Allow UI updates/other events to breathe slightly and avoid overwhelming the bus/gateway
        // Increased delay to prevent "Device busy" errors from gateways with full queues
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      sendLog(`Scan complete. Found ${found.length} devices.`)
      // restore timeout
      client.setTimeout(originalTimeout)
      return found
    } catch (e) {
      sendLog(`Scan failed: ${e}`)
      return []
    }
  })
})

ipcMain.handle('scan-values', async (event, { startAddr, count, value, types }) => {
  return await clientMutex.runExclusive(async () => {
    const matches: { address: number, type: 'holding' | 'input', value: number }[] = []
    
    // Chunk size 100 to reduce total requests (Modbus limit is typically ~120-125 registers)
    const CHUNK = 100
    // Types to check
    const checkHolding = types.includes('holding')
    const checkInput = types.includes('input')

    if (!client.isOpen) {
        throw new Error('Not connected')
    }

    const targetVal = parseInt(String(value))
    const start = parseInt(String(startAddr))
    const total = parseInt(String(count))
    const end = start + total

    sendLog(`Scanning ${count} registers starting at ${startAddr} for value ${targetVal}...`)

    for (let addr = start; addr < end; addr += CHUNK) {
        const len = Math.min(CHUNK, end - addr)
        
        // Scan Holding
        if (checkHolding) {
            try {
                // Try bulk read
                const res = await client.readHoldingRegisters(addr, len)
                for (let i = 0; i < res.data.length; i++) {
                    const val = res.data[i]
                    if (val === targetVal) {
                        matches.push({ address: addr + i, type: 'holding', value: val })
                        sendLog(`Match found! Holding Register ${addr+i} = ${val}`)
                    }
                }
            } catch {
                // Fallback to single read if chunk fails (e.g. gaps in map)
                for(let i=0; i<len; i++) {
                    const singleAddr = addr + i;
                    try {
                        const resSing = await client.readHoldingRegisters(singleAddr, 1);
                         if (resSing.data[0] === targetVal) {
                            matches.push({ address: singleAddr, type: 'holding', value: resSing.data[0] })
                            sendLog(`Match found! Holding Register ${singleAddr} = ${resSing.data[0]}`)
                        }
                    } catch { /* ignore single error */ }
                    // Delay to prevent flooding proxy/gateway
                    await new Promise(r => setTimeout(r, 20))
                }
            }
        }

        // Scan Input
        if (checkInput) {
             try {
                const res = await client.readInputRegisters(addr, len)
                for (let i = 0; i < res.data.length; i++) {
                    const val = res.data[i]
                    if (val === targetVal) {
                        matches.push({ address: addr + i, type: 'input', value: val })
                        sendLog(`Match found! Input Register ${addr+i} = ${val}`)
                    }
                }
            } catch {
                 // Fallback
                 for(let i=0; i<len; i++) {
                    const singleAddr = addr + i;
                    try {
                        const resSing = await client.readInputRegisters(singleAddr, 1);
                         if (resSing.data[0] === targetVal) {
                            matches.push({ address: singleAddr, type: 'input', value: resSing.data[0] })
                            sendLog(`Match found! Input Register ${singleAddr} = ${resSing.data[0]}`)
                        }
                    } catch { /* ignore */ }
                    // Delay to prevent flooding proxy/gateway
                    await new Promise(r => setTimeout(r, 20))
                }
            }
        }
        
        // Let UI breathe and respect proxy
        await new Promise(r => setTimeout(r, 50))
        
        // Calculate and send progress (0-100)
        const progress = Math.min(100, Math.round(((addr + len - start) / total) * 100))
        sendValueScanProgress(progress)
    }

    sendLog(`Scan complete. Found ${matches.length} matches.`)
    return matches
  })
})

ipcMain.handle('connect-tcp', async (event, { host, port }) => {
  return clientMutex.runExclusive(async () => {
    try {
      sendLog(`Connecting to TCP: ${host}:${port}...`)
      if (client.isOpen) client.close()
      
      await client.connectTCP(host, { port: parseInt(port) })
      client.setID(1) // Default ID, can be changed per request
      client.setTimeout(2000)
      
      connectionMode = 'tcp'
      resetStats()

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
})

ipcMain.handle('connect-rtu', async (event, { path, baudRate, parity, dataBits, stopBits }) => {
  return clientMutex.runExclusive(async () => {
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
})

ipcMain.handle('disconnect', async () => {
  return clientMutex.runExclusive(async () => {
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
})

ipcMain.handle('read-modbus', async (event, { type, id, start, length }) => {
  return clientMutex.runExclusive(async () => {
    try {
      if (connectionStatus !== 'connected') {
        sendLog('Cannot read: Not connected')
        throw new Error('Not connected')
      }
    
      client.setID(parseInt(id))
      const s = parseInt(start)
      const l = parseInt(length)
      let data
      
      // Approx overheads
      const isTcp = connectionMode === 'tcp'
      const reqBase = isTcp ? 12 : 8 // TCP:7+5, RTU:1+5+2
      let resDataLen = 0

      switch (type) {
        case 'holding':
          data = await client.readHoldingRegisters(s, l)
          resDataLen = 2 * l
          break
        case 'input':
          data = await client.readInputRegisters(s, l)
          resDataLen = 2 * l
          break
        case 'coil':
          data = await client.readCoils(s, l)
          resDataLen = Math.ceil(l / 8)
          break
        case 'discrete':
          data = await client.readDiscreteInputs(s, l)
          resDataLen = Math.ceil(l / 8)
          break
        default:
          throw new Error(`Unknown register type: ${type}`)
      }

      const resBase = isTcp ? 7 + 2 + resDataLen : 1 + 2 + resDataLen + 2
      updateStats(reqBase, resBase)

      return { success: true, data: data.data }
    } catch (e) {
      let msg: string
      if (e instanceof Error) {
        msg = e.message
      } else if (typeof e === 'object' && e !== null) {
        try {
          msg = JSON.stringify(e)
        } catch {
          msg = String(e)
        }
      } else {
        msg = String(e)
      }

      sendLog(`Read Error (${type}, ID:${id}, Addr:${start}, Size: ${length}): ${msg}`)
      return { success: false, error: msg }
    }
  })
})

ipcMain.handle('write-modbus', async (event, { type, id, address, values, strategy }) => {
  return clientMutex.runExclusive(async () => {
    try {
      if (connectionStatus !== 'connected') {
        sendLog('Cannot write: Not connected')
        throw new Error('Not connected')
      }

      client.setID(parseInt(id))
      const addr = parseInt(address)
      
      // Ensure arrays
      const valArray = Array.isArray(values) ? values : [values];

      const isForcedMultiple = strategy === 'multiple';
      // If forcedMultiple is true, we treat it as multiple write even if length is 1
      const useMultipleFunction = isForcedMultiple || valArray.length > 1;

      if (type === 'coil') {
        // Coils (FC05/FC15)
        const boolValues = valArray.map((v: string | number | boolean) => {
          if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
          return !!v;
        });

        if (useMultipleFunction) {
          sendLog(`Writing Multiple Coils (FC15) ID:${id} Addr:${addr} Vals:[${boolValues}]`)
          await client.writeCoils(addr, boolValues)
        } else {
          sendLog(`Writing Single Coil (FC05) ID:${id} Addr:${addr} Val:${boolValues[0]}`)
          await client.writeCoil(addr, boolValues[0])
        }

      } else {
        // Holding Registers (FC06/FC16)
        const numValues = valArray.map((v: string | number) => parseInt(String(v)))
        
        if (useMultipleFunction) {
            sendLog(`Writing Multiple Regs (FC16) ID:${id} Addr:${addr} Vals:[${numValues}]`)
            await client.writeRegisters(addr, numValues)
        } else {
            sendLog(`Writing Single Reg (FC06) ID:${id} Addr:${addr} Val:${numValues[0]}`)
            await client.writeRegister(addr, numValues[0])
        }
      }

      // Calc Stats for Write
      const isTcp = connectionMode === 'tcp'
      let txBytes = 0
      let rxBytes = 0
      const count = valArray.length;

      if (type === 'coil') {
        if (useMultipleFunction) {
          const dataBytes = Math.ceil(count / 8)
          // FC15 Req: Func(1) + Start(2) + Qty(2) + ByteCount(1) + Data(N)
          const reqPdu = 1 + 2 + 2 + 1 + dataBytes
          // RTU: Addr(1) + PDU + CRC(2)
          // TCP: Header(7) + PDU
          txBytes = isTcp ? 7 + reqPdu : 1 + reqPdu + 2
          
          // FC15 Res: Func(1) + Start(2) + Qty(2) = 5 bytes PDU
          rxBytes = isTcp ? 7 + 5 : 1 + 5 + 2 
        } else {
          // FC05 Req: Func(1) + Addr(2) + Val(2) = 5 bytes PDU
          const reqPdu = 1 + 2 + 2
          txBytes = isTcp ? 7 + reqPdu : 1 + reqPdu + 2
          
          // FC05 Res: Echo Req
          rxBytes = txBytes 
        }
      } else {
        // Holding
        if (useMultipleFunction) {
            // FC16 Req: Func(1) + Start(2) + Qty(2) + ByteCount(1) + Data(N*2)
            const reqPdu = 1 + 2 + 2 + 1 + 2 * count
            txBytes = isTcp ? 7 + reqPdu : 1 + reqPdu + 2
            
            // FC16 Res: Func(1) + Start(2) + Qty(2) = 5 bytes PDU
            rxBytes = isTcp ? 7 + 5 : 1 + 5 + 2 
        } else {
            // FC06 Req: Func(1) + Addr(2) + Val(2) = 5 bytes PDU
            const reqPdu = 1 + 2 + 2
            txBytes = isTcp ? 7 + reqPdu : 1 + reqPdu + 2
            
            // FC06 Res: Echo Req
            rxBytes = txBytes 
        }
      }
      updateStats(txBytes, rxBytes)

      return { success: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendLog(`Write Error (${type}, ID:${id}, Addr:${address}): ${msg}`)
      return { success: false, error: msg }
    }
  })
})

// --- Decoder File Management ---

function getDefaultDecodersPath(): string {
  // In dev: src-electron/default-decoders
  // In production (packager): resources/default-decoders  
  // In production (builder): resources/default-decoders
  if (process.env.DEBUGGING) {
    return path.resolve(__dirname, '../../src-electron/default-decoders')
  }
  return path.resolve(process.resourcesPath, 'default-decoders')
}

function getUserDecodersPath(): string {
  const p = path.join(app.getPath('userData'), 'decoders')
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true })
  }
  return p
}

interface DecoderFile {
  id: string;
  name: string;
  defaultSlaveId: number;
  fields: Array<{
    address: number;
    type: string;
    name: string;
    dataType: string;
    unit?: string;
    scale?: number;
    precision?: number;
    wordOrder?: string;
    transform?: string;
    map?: Record<string, string>;
  }>;
}

function readDecoderFile(filePath: string): DecoderFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const obj = JSON.parse(raw) as DecoderFile
    if (!obj.id || !obj.name || !Array.isArray(obj.fields)) {
      return null
    }
    return obj
  } catch {
    return null
  }
}

function loadDecodersFromDir(dirPath: string): DecoderFile[] {
  const result: DecoderFile[] = []
  if (!fs.existsSync(dirPath)) return result
  
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'))
  for (const file of files) {
    const decoder = readDecoderFile(path.join(dirPath, file))
    if (decoder) result.push(decoder)
  }
  return result
}

// Get all decoders: defaults + user (user overrides defaults with same id)
ipcMain.handle('get-decoders', async () => {
  try {
    const defaults = loadDecodersFromDir(getDefaultDecodersPath())
    const user = loadDecodersFromDir(getUserDecodersPath())
    
    // Merge: user decoders override defaults with same id
    const merged = new Map<string, DecoderFile & { isDefault: boolean }>()
    for (const d of defaults) {
      merged.set(d.id, { ...d, isDefault: true })
    }
    for (const d of user) {
      merged.set(d.id, { ...d, isDefault: false })
    }
    
    return { success: true, data: Array.from(merged.values()) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Import decoder from file (user picks a JSON file)
ipcMain.handle('import-decoder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Import Device Decoder',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile', 'multiSelections']
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' }
    }
    
    const imported: string[] = []
    const errors: string[] = []
    const userDir = getUserDecodersPath()
    
    for (const filePath of result.filePaths) {
      const decoder = readDecoderFile(filePath)
      if (decoder) {
        const targetPath = path.join(userDir, `${decoder.id}.json`)
        fs.copyFileSync(filePath, targetPath)
        imported.push(decoder.name)
        sendLog(`Imported decoder: ${decoder.name} (${decoder.id})`)
      } else {
        errors.push(path.basename(filePath))
      }
    }
    
    return { success: true, imported, errors }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Export decoder to file (user picks save location)
ipcMain.handle('export-decoder', async (_event, { decoderId }: { decoderId: string }) => {
  try {
    // Find decoder in user dir first, then defaults
    let decoderData: DecoderFile | null = null
    const userPath = path.join(getUserDecodersPath(), `${decoderId}.json`)
    const defaultPath = path.join(getDefaultDecodersPath(), `${decoderId}.json`)
    
    if (fs.existsSync(userPath)) {
      decoderData = readDecoderFile(userPath)
    } else if (fs.existsSync(defaultPath)) {
      decoderData = readDecoderFile(defaultPath)
    }
    
    if (!decoderData) {
      return { success: false, error: 'Decoder not found' }  
    }
    
    const result = await dialog.showSaveDialog({
      title: 'Export Device Decoder',
      defaultPath: `${decoderData.id}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' }
    }
    
    fs.writeFileSync(result.filePath, JSON.stringify(decoderData, null, 2), 'utf-8')
    sendLog(`Exported decoder: ${decoderData.name} → ${result.filePath}`)
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Save/update a decoder to user directory
ipcMain.handle('save-decoder', async (_event, { decoder }: { decoder: DecoderFile }) => {
  try {
    if (!decoder.id || !decoder.name || !Array.isArray(decoder.fields)) {
      return { success: false, error: 'Invalid decoder format' }
    }
    const userDir = getUserDecodersPath()
    const targetPath = path.join(userDir, `${decoder.id}.json`)
    fs.writeFileSync(targetPath, JSON.stringify(decoder, null, 2), 'utf-8')
    sendLog(`Saved decoder: ${decoder.name} (${decoder.id})`)
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Delete a user decoder
ipcMain.handle('delete-decoder', async (_event, { decoderId }: { decoderId: string }) => {
  try {
    const userPath = path.join(getUserDecodersPath(), `${decoderId}.json`)
    if (fs.existsSync(userPath)) {
      fs.unlinkSync(userPath)
      sendLog(`Deleted user decoder: ${decoderId}`)
      return { success: true }
    }
    return { success: false, error: 'Decoder not found in user directory' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// Download decoder pack from URL (tar.gz containing JSON files)
const DECODER_PACK_URL = 'https://github.com/example/modbus-decoders/releases/latest/download/decoders.tar.gz'

ipcMain.handle('download-decoder-pack', async (_event, { url }: { url?: string }) => {
  const downloadUrl = url || DECODER_PACK_URL
  const tmpDir = path.join(app.getPath('temp'), 'modbus-decoder-pack-' + Date.now())
  const archivePath = path.join(tmpDir, 'decoders.tar.gz')
  const extractDir = path.join(tmpDir, 'extracted')

  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.mkdirSync(extractDir, { recursive: true })
    sendLog(`Downloading decoder pack from: ${downloadUrl}`)

    // Download using https/http (follow redirects)
    await new Promise<void>((resolve, reject) => {
      const getModule = (targetUrl: string) => targetUrl.startsWith('https') ? https : http
      const download = (targetUrl: string, redirects = 0) => {
        if (redirects > 5) { reject(new Error('Too many redirects')); return }
        const mod = getModule(targetUrl)
        mod.get(targetUrl, { headers: { 'User-Agent': 'ModbusClient' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers?.location) {
            download(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const file = fs.createWriteStream(archivePath)
          res.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
          file.on('error', reject)
        }).on('error', reject)
      }
      download(downloadUrl, 0)
    })

    sendLog('Download complete, extracting...')

    // Extract tar.gz
    await execFileAsync('tar', ['xzf', archivePath, '-C', extractDir])

    // Find all JSON files recursively
    const jsonFiles: string[] = []
    const findJsonFiles = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) findJsonFiles(full)
        else if (entry.name.endsWith('.json')) jsonFiles.push(full)
      }
    }
    findJsonFiles(extractDir)

    const userDir = getUserDecodersPath()
    const imported: string[] = []
    const errors: string[] = []

    for (const jsonFile of jsonFiles) {
      const decoder = readDecoderFile(jsonFile)
      if (decoder) {
        const targetPath = path.join(userDir, `${decoder.id}.json`)
        fs.copyFileSync(jsonFile, targetPath)
        imported.push(decoder.name)
        sendLog(`Pack: imported ${decoder.name} (${decoder.id})`)
      } else {
        errors.push(path.basename(jsonFile))
      }
    }

    // Cleanup temp
    fs.rmSync(tmpDir, { recursive: true, force: true })

    sendLog(`Decoder pack: imported ${imported.length} decoders, ${errors.length} errors`)
    return { success: true, imported, errors }
  } catch (e) {
    // Cleanup temp on error
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : String(e)
    sendLog(`Decoder pack download failed: ${msg}`)
    return { success: false, error: msg }
  }
})
