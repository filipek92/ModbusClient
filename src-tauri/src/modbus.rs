//! Modbus connection handling (TCP, RTU, RTU over TCP), reads/writes and scanners.

use std::{
    fmt,
    future::Future,
    io,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio::{net::TcpStream, sync::Mutex, time::sleep};
use tokio_modbus::{
    client::{rtu, tcp, Client, Context, Reader, Writer},
    prelude::SlaveContext,
    ExceptionCode, Slave,
};
use tokio_serial::{DataBits, Parity, SerialStream, StopBits};

use crate::args::{lenient_int, lenient_int_opt, to_i64};
use crate::send_log;

const DEFAULT_TIMEOUT: Duration = Duration::from_millis(2000);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Tcp,
    Rtu,
    RtuOverTcp,
}

#[derive(Default, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrafficStats {
    tx_bytes: u64,
    rx_bytes: u64,
    tx_msg: u64,
    rx_msg: u64,
}

struct Conn {
    ctx: Option<Context>,
    /// Last addressed slave; the value scanner (which has no ID argument) reuses it.
    slave: u8,
    mode: Mode,
    status: &'static str,
    timeout: Duration,
    stats: TrafficStats,
}

impl Default for Conn {
    fn default() -> Self {
        Self {
            ctx: None,
            slave: 1,
            mode: Mode::Tcp,
            status: "disconnected",
            timeout: DEFAULT_TIMEOUT,
            stats: TrafficStats::default(),
        }
    }
}

/// All Modbus traffic goes through this mutex, so requests never interleave on the wire.
#[derive(Default)]
pub struct ModbusState(Mutex<Conn>);

/// Set by `cancel_scan`; kept outside the connection mutex, which a running scan holds.
#[derive(Default)]
pub struct ScanCancel(AtomicBool);

#[derive(Debug)]
enum ReqError {
    Timeout,
    Exception(ExceptionCode),
    /// Malformed / unexpected response: something is there, but it did not answer cleanly.
    Protocol(String),
    /// Connection-level failure (broken pipe, port closed, ...).
    Transport(String),
}

impl fmt::Display for ReqError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReqError::Timeout => write!(f, "Timed out"),
            ReqError::Exception(code) => write!(f, "Modbus exception {}: {code}", u8::from(*code)),
            ReqError::Protocol(msg) | ReqError::Transport(msg) => write!(f, "{msg}"),
        }
    }
}

async fn run<T>(
    timeout: Duration,
    fut: impl Future<Output = tokio_modbus::Result<T>>,
) -> Result<T, ReqError> {
    match tokio::time::timeout(timeout, fut).await {
        Err(_) => Err(ReqError::Timeout),
        Ok(Err(tokio_modbus::Error::Transport(e))) if e.kind() == io::ErrorKind::TimedOut => {
            Err(ReqError::Timeout)
        }
        Ok(Err(tokio_modbus::Error::Transport(e))) => Err(ReqError::Transport(e.to_string())),
        Ok(Err(e)) => Err(ReqError::Protocol(e.to_string())),
        Ok(Ok(Err(code))) => Err(ReqError::Exception(code)),
        Ok(Ok(Ok(v))) => Ok(v),
    }
}

impl Conn {
    fn ctx_for(&mut self, slave: u8) -> Result<&mut Context, ReqError> {
        self.slave = slave;
        let ctx = self
            .ctx
            .as_mut()
            .ok_or_else(|| ReqError::Transport("Port not open".into()))?;
        ctx.set_slave(Slave(slave));
        Ok(ctx)
    }

    async fn read_registers(&mut self, slave: u8, holding: bool, addr: u16, cnt: u16) -> Result<Vec<u16>, ReqError> {
        let t = self.timeout;
        let ctx = self.ctx_for(slave)?;
        if holding {
            run(t, ctx.read_holding_registers(addr, cnt)).await
        } else {
            run(t, ctx.read_input_registers(addr, cnt)).await
        }
    }

    async fn close(&mut self) {
        if let Some(mut ctx) = self.ctx.take() {
            let _ = ctx.disconnect().await;
        }
    }

    fn is_tcp(&self) -> bool {
        // RTU and RTU-over-TCP share the same address+PDU+CRC frame, no MBAP header
        self.mode == Mode::Tcp
    }

    fn reset_stats(&mut self, app: &AppHandle) {
        self.stats = TrafficStats::default();
        let _ = app.emit("traffic-stats", self.stats);
    }

    fn update_stats(&mut self, app: &AppHandle, tx: u64, rx: u64) {
        self.stats.tx_msg += 1;
        self.stats.rx_msg += 1;
        self.stats.tx_bytes += tx;
        self.stats.rx_bytes += rx;
        let _ = app.emit("traffic-stats", self.stats);
    }

    fn set_status(&mut self, app: &AppHandle, status: &'static str) {
        self.status = status;
        let _ = app.emit("status-change", status);
    }
}

fn ok() -> Value {
    json!({ "success": true })
}

fn fail(msg: impl fmt::Display) -> Value {
    json!({ "success": false, "error": msg.to_string() })
}

// --- Connection ---

#[derive(Deserialize)]
pub struct TcpArgs {
    host: String,
    #[serde(deserialize_with = "lenient_int")]
    port: u16,
}

/// Modbus TCP transport that drops response frames whose transaction ID does not match
/// the last request sent. Without it, a reply arriving after our timeout is read by the
/// next request, tokio-modbus fails with "mismatching headers" and every following
/// request stays one reply behind (modbus-serial in the Electron version ignored them).
#[derive(Debug)]
struct MbapFilter<T> {
    inner: T,
    /// Outgoing bytes of the frame currently being written (until its header is complete).
    wbuf: Vec<u8>,
    /// Remaining bytes of the outgoing frame after its header was seen.
    wremaining: usize,
    expected: Option<[u8; 2]>,
    /// Raw incoming bytes not yet split into frames.
    rbuf: Vec<u8>,
    /// Accepted frames waiting to be handed to the codec.
    ready: Vec<u8>,
}

impl<T> MbapFilter<T> {
    fn new(inner: T) -> Self {
        Self { inner, wbuf: Vec::new(), wremaining: 0, expected: None, rbuf: Vec::new(), ready: Vec::new() }
    }

    fn track_written(&mut self, mut data: &[u8]) {
        while !data.is_empty() {
            if self.wremaining > 0 {
                let n = self.wremaining.min(data.len());
                self.wremaining -= n;
                data = &data[n..];
                continue;
            }
            let n = (6 - self.wbuf.len()).min(data.len());
            self.wbuf.extend_from_slice(&data[..n]);
            data = &data[n..];
            if self.wbuf.len() == 6 {
                self.expected = Some([self.wbuf[0], self.wbuf[1]]);
                self.wremaining = usize::from(u16::from_be_bytes([self.wbuf[4], self.wbuf[5]]));
                self.wbuf.clear();
            }
        }
    }

    fn split_frames(&mut self) {
        while self.rbuf.len() >= 6 {
            let len = usize::from(u16::from_be_bytes([self.rbuf[4], self.rbuf[5]]));
            if !(2..=254).contains(&len) {
                // Not a sane MBAP frame, let the codec report the error
                self.ready.append(&mut self.rbuf);
                return;
            }
            if self.rbuf.len() < 6 + len {
                return;
            }
            let frame: Vec<u8> = self.rbuf.drain(..6 + len).collect();
            if self.expected.is_none_or(|txn| frame[..2] == txn) {
                self.ready.extend_from_slice(&frame);
            }
        }
    }
}

impl<T: tokio::io::AsyncRead + Unpin> tokio::io::AsyncRead for MbapFilter<T> {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        use std::task::Poll;
        let this = self.get_mut();
        while this.ready.is_empty() {
            let mut tmp = [0u8; 512];
            let mut rb = tokio::io::ReadBuf::new(&mut tmp);
            match std::pin::Pin::new(&mut this.inner).poll_read(cx, &mut rb) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(Err(e)) => return Poll::Ready(Err(e)),
                Poll::Ready(Ok(())) if rb.filled().is_empty() => return Poll::Ready(Ok(())), // EOF
                Poll::Ready(Ok(())) => {
                    this.rbuf.extend_from_slice(rb.filled());
                    this.split_frames();
                }
            }
        }
        let n = this.ready.len().min(buf.remaining());
        buf.put_slice(&this.ready[..n]);
        this.ready.drain(..n);
        Poll::Ready(Ok(()))
    }
}

impl<T: tokio::io::AsyncWrite + Unpin> tokio::io::AsyncWrite for MbapFilter<T> {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<io::Result<usize>> {
        let this = self.get_mut();
        let res = std::pin::Pin::new(&mut this.inner).poll_write(cx, buf);
        if let std::task::Poll::Ready(Ok(n)) = res {
            this.track_written(&buf[..n]);
        }
        res
    }

    fn poll_flush(self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<io::Result<()>> {
        std::pin::Pin::new(&mut self.get_mut().inner).poll_flush(cx)
    }

    fn poll_shutdown(self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<io::Result<()>> {
        std::pin::Pin::new(&mut self.get_mut().inner).poll_shutdown(cx)
    }
}

async fn open_tcp(host: &str, port: u16) -> io::Result<TcpStream> {
    tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port)))
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "Connection timed out"))?
}

async fn connect_over_tcp(app: AppHandle, state: State<'_, ModbusState>, args: TcpArgs, mode: Mode) -> Value {
    let mut conn = state.0.lock().await;
    let label = if mode == Mode::Tcp { "TCP" } else { "RTU over TCP" };
    send_log(&app, format!("Connecting to {label}: {}:{}...", args.host, args.port));
    conn.close().await;

    match open_tcp(&args.host, args.port).await {
        Ok(stream) => {
            let _ = stream.set_nodelay(true);
            conn.slave = 1;
            conn.ctx = Some(if mode == Mode::Tcp {
                tcp::attach(MbapFilter::new(stream))
            } else {
                rtu::attach(stream)
            });
            conn.timeout = DEFAULT_TIMEOUT;
            conn.mode = mode;
            conn.reset_stats(&app);
            conn.set_status(&app, "connected");
            let suffix = if mode == Mode::Tcp { "" } else { " (RTU over TCP)" };
            send_log(&app, format!("Connected to {}:{}{suffix}", args.host, args.port));
            ok()
        }
        Err(e) => {
            send_log(&app, format!("Error connecting {label}: {e}"));
            conn.set_status(&app, "error");
            fail(e)
        }
    }
}

#[tauri::command]
pub async fn connect_tcp(app: AppHandle, state: State<'_, ModbusState>, args: TcpArgs) -> Result<Value, ()> {
    Ok(connect_over_tcp(app, state, args, Mode::Tcp).await)
}

#[tauri::command]
pub async fn connect_rtu_tcp(app: AppHandle, state: State<'_, ModbusState>, args: TcpArgs) -> Result<Value, ()> {
    Ok(connect_over_tcp(app, state, args, Mode::RtuOverTcp).await)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RtuArgs {
    path: String,
    #[serde(deserialize_with = "lenient_int")]
    baud_rate: u32,
    parity: Option<String>,
    #[serde(default, deserialize_with = "lenient_int_opt")]
    data_bits: Option<u8>,
    #[serde(default, deserialize_with = "lenient_int_opt")]
    stop_bits: Option<u8>,
}

fn open_serial(args: &RtuArgs) -> Result<SerialStream, String> {
    let parity = match args.parity.as_deref().unwrap_or("none") {
        "none" | "" => Parity::None,
        "even" => Parity::Even,
        "odd" => Parity::Odd,
        other => return Err(format!("Unsupported parity: {other}")),
    };
    let data_bits = match args.data_bits.filter(|&b| b != 0).unwrap_or(8) {
        5 => DataBits::Five,
        6 => DataBits::Six,
        7 => DataBits::Seven,
        8 => DataBits::Eight,
        other => return Err(format!("Unsupported data bits: {other}")),
    };
    let stop_bits = match args.stop_bits.filter(|&b| b != 0).unwrap_or(1) {
        1 => StopBits::One,
        2 => StopBits::Two,
        other => return Err(format!("Unsupported stop bits: {other}")),
    };
    let builder = tokio_serial::new(&args.path, args.baud_rate)
        .parity(parity)
        .data_bits(data_bits)
        .stop_bits(stop_bits);
    SerialStream::open(&builder).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct SerialPortEntry {
    path: String,
    description: Option<String>,
}

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortEntry>, String> {
    let ports = tokio_serial::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        .map(|p| {
            let description = match p.port_type {
                tokio_serial::SerialPortType::UsbPort(usb) => {
                    let parts: Vec<String> = [usb.manufacturer, usb.product].into_iter().flatten().collect();
                    Some(if parts.is_empty() { format!("USB {:04x}:{:04x}", usb.vid, usb.pid) } else { parts.join(" ") })
                }
                tokio_serial::SerialPortType::BluetoothPort => Some("Bluetooth".into()),
                tokio_serial::SerialPortType::PciPort => Some("PCI".into()),
                tokio_serial::SerialPortType::Unknown => None,
            };
            SerialPortEntry { path: p.port_name, description }
        })
        .collect())
}

#[tauri::command]
pub async fn connect_rtu(app: AppHandle, state: State<'_, ModbusState>, args: RtuArgs) -> Result<Value, ()> {
    let mut conn = state.0.lock().await;
    send_log(&app, format!("Connecting to RTU: {} @ {}...", args.path, args.baud_rate));
    conn.close().await;

    match open_serial(&args) {
        Ok(port) => {
            conn.slave = 1;
            conn.ctx = Some(rtu::attach(port));
            conn.timeout = DEFAULT_TIMEOUT;
            conn.mode = Mode::Rtu;
            conn.reset_stats(&app);
            conn.set_status(&app, "connected");
            send_log(&app, format!("Connected to RTU {}", args.path));
            Ok(ok())
        }
        Err(e) => {
            send_log(&app, format!("Error connecting RTU: {e}"));
            conn.set_status(&app, "error");
            Ok(fail(e))
        }
    }
}

#[tauri::command]
pub async fn disconnect(app: AppHandle, state: State<'_, ModbusState>) -> Result<Value, ()> {
    let mut conn = state.0.lock().await;
    conn.close().await;
    conn.set_status(&app, "disconnected");
    send_log(&app, "Disconnected");
    Ok(ok())
}

// --- Read / Write ---

#[derive(Deserialize)]
pub struct ReadArgs {
    #[serde(rename = "type")]
    kind: String,
    #[serde(deserialize_with = "lenient_int")]
    id: u8,
    #[serde(deserialize_with = "lenient_int")]
    start: u16,
    #[serde(deserialize_with = "lenient_int")]
    length: u16,
}

#[tauri::command]
pub async fn read_modbus(app: AppHandle, state: State<'_, ModbusState>, args: ReadArgs) -> Result<Value, ()> {
    let mut conn = state.0.lock().await;
    if conn.status != "connected" {
        send_log(&app, "Cannot read: Not connected");
        send_log(&app, format!("Read Error ({}, ID:{}, Addr:{}, Size: {}): Not connected", args.kind, args.id, args.start, args.length));
        return Ok(fail("Not connected"));
    }

    let (s, l) = (args.start, args.length);
    let t = conn.timeout;
    let result: Result<(Value, u64), ReqError> = async {
        let ctx = conn.ctx_for(args.id)?;
        Ok(match args.kind.as_str() {
            "holding" => (json!(run(t, ctx.read_holding_registers(s, l)).await?), 2 * u64::from(l)),
            "input" => (json!(run(t, ctx.read_input_registers(s, l)).await?), 2 * u64::from(l)),
            "coil" => (json!(run(t, ctx.read_coils(s, l)).await?), u64::from(l).div_ceil(8)),
            "discrete" => (json!(run(t, ctx.read_discrete_inputs(s, l)).await?), u64::from(l).div_ceil(8)),
            other => return Err(ReqError::Protocol(format!("Unknown register type: {other}"))),
        })
    }
    .await;

    match result {
        Ok((data, res_data_len)) => {
            let is_tcp = conn.is_tcp();
            let req = if is_tcp { 12 } else { 8 }; // TCP:7+5, RTU:1+5+2
            let res = if is_tcp { 7 + 2 + res_data_len } else { 1 + 2 + res_data_len + 2 };
            conn.update_stats(&app, req, res);
            Ok(json!({ "success": true, "data": data }))
        }
        Err(e) => {
            send_log(&app, format!("Read Error ({}, ID:{}, Addr:{}, Size: {}): {e}", args.kind, args.id, args.start, args.length));
            Ok(fail(e))
        }
    }
}

#[derive(Deserialize)]
pub struct WriteArgs {
    #[serde(rename = "type")]
    kind: String,
    #[serde(deserialize_with = "lenient_int")]
    id: u8,
    #[serde(deserialize_with = "lenient_int")]
    address: u16,
    values: Value,
    strategy: Option<String>,
}

fn to_coil(v: &Value) -> bool {
    match v {
        Value::String(s) => s.eq_ignore_ascii_case("true") || s == "1",
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        _ => false,
    }
}

/// Accepts both unsigned (0..=65535) and signed (-32768..=-1) 16-bit values.
fn to_word(v: &Value) -> Result<u16, String> {
    match to_i64(v) {
        Some(n @ 0..=65535) => Ok(n as u16),
        Some(n @ -32768..=-1) => Ok(n as i16 as u16),
        Some(n) => Err(format!("Value {n} out of 16-bit range")),
        None => Err(format!("Invalid register value: {v}")),
    }
}

fn join<T: fmt::Display>(items: &[T]) -> String {
    items.iter().map(T::to_string).collect::<Vec<_>>().join(",")
}

#[tauri::command]
pub async fn write_modbus(app: AppHandle, state: State<'_, ModbusState>, args: WriteArgs) -> Result<Value, ()> {
    let mut conn = state.0.lock().await;
    let (id, addr) = (args.id, args.address);
    let err = |e: &dyn fmt::Display| {
        send_log(&app, format!("Write Error ({}, ID:{}, Addr:{}): {e}", args.kind, id, addr));
        fail(e)
    };

    if conn.status != "connected" {
        send_log(&app, "Cannot write: Not connected");
        return Ok(err(&"Not connected"));
    }

    let values: Vec<Value> = match args.values {
        Value::Array(a) => a,
        other => vec![other],
    };
    if values.is_empty() {
        return Ok(err(&"No values to write"));
    }
    // If strategy is 'multiple', we use the multiple-write function even for a single value
    let multiple = args.strategy.as_deref() == Some("multiple") || values.len() > 1;
    let count = values.len() as u64;
    let t = conn.timeout;

    let result = if args.kind == "coil" {
        // Coils (FC05/FC15)
        let coils: Vec<bool> = values.iter().map(to_coil).collect();
        let ctx = match conn.ctx_for(id) {
            Ok(c) => c,
            Err(e) => return Ok(err(&e)),
        };
        if multiple {
            send_log(&app, format!("Writing Multiple Coils (FC15) ID:{id} Addr:{addr} Vals:[{}]", join(&coils)));
            run(t, ctx.write_multiple_coils(addr, &coils)).await
        } else {
            send_log(&app, format!("Writing Single Coil (FC05) ID:{id} Addr:{addr} Val:{}", coils[0]));
            run(t, ctx.write_single_coil(addr, coils[0])).await
        }
    } else {
        // Holding Registers (FC06/FC16)
        let words = match values.iter().map(to_word).collect::<Result<Vec<u16>, _>>() {
            Ok(w) => w,
            Err(e) => return Ok(err(&e)),
        };
        let ctx = match conn.ctx_for(id) {
            Ok(c) => c,
            Err(e) => return Ok(err(&e)),
        };
        if multiple {
            send_log(&app, format!("Writing Multiple Regs (FC16) ID:{id} Addr:{addr} Vals:[{}]", join(&words)));
            run(t, ctx.write_multiple_registers(addr, &words)).await
        } else {
            send_log(&app, format!("Writing Single Reg (FC06) ID:{id} Addr:{addr} Val:{}", words[0]));
            run(t, ctx.write_single_register(addr, words[0])).await
        }
    };

    if let Err(e) = result {
        return Ok(err(&e));
    }

    // Calc Stats for Write
    // RTU: Addr(1) + PDU + CRC(2), TCP: Header(7) + PDU
    let is_tcp = conn.is_tcp();
    let frame = |pdu: u64| if is_tcp { 7 + pdu } else { 1 + pdu + 2 };
    let (tx, rx) = if multiple {
        // FC15/FC16 Req: Func(1) + Start(2) + Qty(2) + ByteCount(1) + Data(N)
        let data_bytes = if args.kind == "coil" { count.div_ceil(8) } else { 2 * count };
        // FC15/FC16 Res: Func(1) + Start(2) + Qty(2) = 5 bytes PDU
        (frame(1 + 2 + 2 + 1 + data_bytes), frame(5))
    } else {
        // FC05/FC06 Req: Func(1) + Addr(2) + Val(2) = 5 bytes PDU, response echoes request
        (frame(5), frame(5))
    };
    conn.update_stats(&app, tx, rx);

    Ok(ok())
}

// --- Scanners ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDevicesArgs {
    #[serde(deserialize_with = "lenient_int")]
    start_id: u8,
    #[serde(deserialize_with = "lenient_int")]
    end_id: u8,
    #[serde(deserialize_with = "lenient_int")]
    timeout: u64,
}

#[tauri::command]
pub async fn scan_devices(
    app: AppHandle,
    state: State<'_, ModbusState>,
    cancel: State<'_, ScanCancel>,
    args: ScanDevicesArgs,
) -> Result<Vec<u8>, ()> {
    cancel.0.store(false, Ordering::Relaxed);
    let mut conn = state.0.lock().await;
    let mut found = Vec::new();

    if conn.ctx.is_none() {
        send_log(&app, "Scan failed: Port not open");
        return Ok(found);
    }

    send_log(&app, format!("Starting scan from ID {} to {} with timeout {}ms...", args.start_id, args.end_id, args.timeout));
    let original_timeout = conn.timeout;
    conn.timeout = Duration::from_millis(args.timeout);

    'ids: for id in args.start_id..=args.end_id {
        let _ = app.emit("scan-progress", id);

        for attempt in 1..=3 {
            // Checked between requests only: dropping one mid-flight could leave its late reply on the wire
            if cancel.0.load(Ordering::Relaxed) {
                send_log(&app, format!("Scan aborted at ID {id}."));
                break 'ids;
            }
            // Try to read Holding Register 0.
            // If the device exists, it will either reply with data OR an exception (e.g. Illegal Address).
            // Both mean the device is there. Only timeout means it's likely not there.
            match conn.read_registers(id, true, 0, 1).await {
                Ok(_) => {
                    found.push(id);
                    send_log(&app, format!("Found device at ID: {id}"));
                }
                // not found, stop retrying for this ID to save time
                Err(ReqError::Timeout) => {}
                // A TCP->RTU gateway answering for the device: nothing responded on its bus
                Err(ReqError::Exception(
                    ExceptionCode::GatewayTargetDevice | ExceptionCode::GatewayPathUnavailable,
                )) => {}
                Err(ReqError::Exception(ExceptionCode::ServerDeviceBusy)) => {
                    send_log(&app, format!("Device BUSY at ID: {id}, retrying ({attempt}/3)..."));
                    sleep(Duration::from_millis(200)).await;
                    continue;
                }
                Err(ReqError::Transport(e)) => {
                    send_log(&app, format!("Scan failed: {e}"));
                    break 'ids;
                }
                // Other errors (Illegal Address, etc.) -> Device IS there
                Err(e) => {
                    found.push(id);
                    send_log(&app, format!("Found device at ID: {id} (responded with error: {e})"));
                }
            }
            break;
        }

        // Avoid overwhelming the bus/gateway (prevents "Device busy" errors from gateways with full queues)
        sleep(Duration::from_millis(50)).await;
    }

    conn.timeout = original_timeout;
    send_log(&app, format!("Scan complete. Found {} devices.", found.len()));
    Ok(found)
}

/// Stops a running `scan_devices` after its current request; it then returns what it found so far.
#[tauri::command]
pub fn cancel_scan(cancel: State<'_, ScanCancel>) {
    cancel.0.store(true, Ordering::Relaxed);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanValuesArgs {
    #[serde(deserialize_with = "lenient_int")]
    start_addr: u32,
    #[serde(deserialize_with = "lenient_int")]
    count: u32,
    #[serde(deserialize_with = "lenient_int")]
    value: i64,
    types: Vec<String>,
}

#[derive(Serialize)]
pub struct ValueMatch {
    address: u16,
    #[serde(rename = "type")]
    kind: &'static str,
    value: u16,
}

#[tauri::command]
pub async fn scan_values(app: AppHandle, state: State<'_, ModbusState>, args: ScanValuesArgs) -> Result<Vec<ValueMatch>, String> {
    // Chunk size 100 to reduce total requests (Modbus limit is typically ~120-125 registers)
    const CHUNK: u32 = 100;

    let mut conn = state.0.lock().await;
    if conn.ctx.is_none() {
        return Err("Not connected".into());
    }

    let start = args.start_addr.min(0xFFFF);
    let end = (start + args.count).min(0x1_0000);
    let total = (end - start).max(1);
    let target = args.value;
    let slave = conn.slave;
    let mut matches = Vec::new();

    send_log(&app, format!("Scanning {} registers starting at {} for value {target}...", args.count, args.start_addr));

    let kinds = [("holding", true), ("input", false)]
        .into_iter()
        .filter(|(name, _)| args.types.iter().any(|t| t == name))
        .collect::<Vec<_>>();
    let label = |holding: bool| if holding { "Holding" } else { "Input" };

    let mut addr = start;
    while addr < end {
        let len = CHUNK.min(end - addr);

        for &(kind, holding) in &kinds {
            match conn.read_registers(slave, holding, addr as u16, len as u16).await {
                Ok(data) => {
                    for (i, &val) in data.iter().enumerate() {
                        if i64::from(val) == target {
                            let a = addr as u16 + i as u16;
                            matches.push(ValueMatch { address: a, kind, value: val });
                            send_log(&app, format!("Match found! {} Register {a} = {val}", label(holding)));
                        }
                    }
                }
                Err(_) => {
                    // Fallback to single reads if chunk fails (e.g. gaps in map)
                    for a in addr..addr + len {
                        if let Ok(data) = conn.read_registers(slave, holding, a as u16, 1).await {
                            if data.first().is_some_and(|&v| i64::from(v) == target) {
                                matches.push(ValueMatch { address: a as u16, kind, value: data[0] });
                                send_log(&app, format!("Match found! {} Register {a} = {}", label(holding), data[0]));
                            }
                        }
                        // Delay to prevent flooding proxy/gateway
                        sleep(Duration::from_millis(20)).await;
                    }
                }
            }
        }

        // Respect proxy/gateway
        sleep(Duration::from_millis(50)).await;

        let progress = (((addr + len - start) as f64 / total as f64) * 100.0).round().min(100.0) as u8;
        let _ = app.emit("value-scan-progress", progress);
        addr += len;
    }

    send_log(&app, format!("Scan complete. Found {} matches.", matches.len()));
    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_conversion() {
        assert_eq!(to_word(&json!(0)), Ok(0));
        assert_eq!(to_word(&json!(65535)), Ok(65535));
        assert_eq!(to_word(&json!(-1)), Ok(0xFFFF));
        assert_eq!(to_word(&json!(-32768)), Ok(0x8000));
        assert_eq!(to_word(&json!("123")), Ok(123));
        assert!(to_word(&json!(65536)).is_err());
        assert!(to_word(&json!("abc")).is_err());
    }

    // --- Fake Modbus server ---
    // Unit 1 answers holding registers with value == address, unit 2 replies with
    // "Illegal data address", unit 3 never answers, unit 4 is busy on the first request.

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn crc16(data: &[u8]) -> u16 {
        let mut crc: u16 = 0xFFFF;
        for &b in data {
            crc ^= u16::from(b);
            for _ in 0..8 {
                crc = if crc & 1 != 0 { (crc >> 1) ^ 0xA001 } else { crc >> 1 };
            }
        }
        crc
    }

    /// Returns the response PDU for a request PDU, or None for "no answer".
    fn respond(unit: u8, pdu: &[u8], busy_once: &mut bool) -> Option<Vec<u8>> {
        let fc = pdu[0];
        match unit {
            2 => return Some(vec![fc | 0x80, 0x02]),
            3 => return None,
            4 if *busy_once => {
                *busy_once = false;
                return Some(vec![fc | 0x80, 0x06]);
            }
            _ => {}
        }
        let addr = u16::from_be_bytes([pdu[1], pdu[2]]);
        let cnt = u16::from_be_bytes([pdu[3], pdu[4]]);
        match fc {
            0x03 | 0x04 => {
                let mut out = vec![fc, (cnt * 2) as u8];
                for a in addr..addr + cnt {
                    out.extend_from_slice(&a.to_be_bytes());
                }
                Some(out)
            }
            0x06 => Some(pdu[..5].to_vec()),
            0x10 => Some(pdu[..5].to_vec()),
            _ => Some(vec![fc | 0x80, 0x01]),
        }
    }

    async fn fake_server(rtu: bool) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut busy_once = true;
            loop {
                if rtu {
                    // Requests used in tests are fixed 8-byte frames (FC03/04/06)
                    let mut req = [0u8; 8];
                    if sock.read_exact(&mut req).await.is_err() {
                        return;
                    }
                    assert_eq!(crc16(&req[..6]).to_le_bytes(), [req[6], req[7]], "bad request CRC");
                    if let Some(pdu) = respond(req[0], &req[1..6], &mut busy_once) {
                        let mut frame = vec![req[0]];
                        frame.extend(pdu);
                        let crc = crc16(&frame);
                        frame.extend_from_slice(&crc.to_le_bytes());
                        sock.write_all(&frame).await.unwrap();
                    }
                } else {
                    let mut header = [0u8; 7];
                    if sock.read_exact(&mut header).await.is_err() {
                        return;
                    }
                    let len = u16::from_be_bytes([header[4], header[5]]) as usize;
                    let mut pdu = vec![0u8; len - 1];
                    sock.read_exact(&mut pdu).await.unwrap();
                    if header[6] == 5 {
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                    if let Some(res) = respond(header[6], &pdu, &mut busy_once) {
                        let mut frame = header[..4].to_vec();
                        frame.extend_from_slice(&((res.len() + 1) as u16).to_be_bytes());
                        frame.push(header[6]);
                        frame.extend(res);
                        sock.write_all(&frame).await.unwrap();
                    }
                }
            }
        });
        port
    }

    async fn connected(mode: Mode) -> Conn {
        let port = fake_server(mode == Mode::RtuOverTcp).await;
        let stream = open_tcp("127.0.0.1", port).await.unwrap();
        Conn {
            ctx: Some(if mode == Mode::Tcp { tcp::attach(MbapFilter::new(stream)) } else { rtu::attach(stream) }),
            mode,
            status: "connected",
            timeout: Duration::from_millis(300),
            ..Conn::default()
        }
    }

    async fn exercise(mode: Mode) {
        let mut conn = connected(mode).await;

        assert_eq!(conn.read_registers(1, true, 100, 3).await.ok(), Some(vec![100, 101, 102]));
        assert_eq!(conn.read_registers(1, false, 7, 1).await.ok(), Some(vec![7]));

        match conn.read_registers(2, true, 0, 1).await {
            Err(e @ ReqError::Exception(ExceptionCode::IllegalDataAddress)) => {
                assert_eq!(e.to_string(), "Modbus exception 2: Illegal data address");
            }
            other => panic!("expected exception, got {:?}", other.err().map(|e| e.to_string())),
        }

        assert!(matches!(conn.read_registers(3, true, 0, 1).await, Err(ReqError::Timeout)));

        assert!(matches!(
            conn.read_registers(4, true, 0, 1).await,
            Err(ReqError::Exception(ExceptionCode::ServerDeviceBusy))
        ));
        // Busy only once, the retry succeeds
        assert_eq!(conn.read_registers(4, true, 5, 1).await.ok(), Some(vec![5]));

        let t = conn.timeout;
        let ctx = conn.ctx_for(1).unwrap();
        assert!(run(t, ctx.write_single_register(10, 0xFFFF)).await.is_ok());
        assert_eq!(conn.slave, 1);
    }

    #[tokio::test]
    async fn modbus_tcp_against_fake_server() {
        exercise(Mode::Tcp).await;
    }

    #[tokio::test]
    async fn modbus_tcp_ignores_late_response() {
        let mut conn = connected(Mode::Tcp).await;
        // Unit 5 answers after the client timeout; its late reply must not break later requests
        assert!(matches!(conn.read_registers(5, true, 0, 1).await, Err(ReqError::Timeout)));
        for i in 0..3 {
            assert_eq!(conn.read_registers(1, true, 20 + i, 2).await.ok(), Some(vec![20 + i, 21 + i]));
        }
    }

    #[tokio::test]
    async fn rtu_over_tcp_against_fake_server() {
        exercise(Mode::RtuOverTcp).await;
    }

    #[test]
    fn coil_conversion() {
        assert!(to_coil(&json!("TRUE")));
        assert!(to_coil(&json!("1")));
        assert!(!to_coil(&json!("0")));
        assert!(to_coil(&json!(1)));
        assert!(!to_coil(&json!(0)));
        assert!(to_coil(&json!(true)));
    }
}
