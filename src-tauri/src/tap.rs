//! Optional capture of the raw bytes sent and received on the Modbus transport,
//! shown as hex frames in the log console. Costs nothing but an atomic load while disabled.

use std::{
    fmt,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    task::{Context, Poll},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFrame {
    /// "tx" or "rx"
    pub dir: &'static str,
    pub bytes: Vec<u8>,
    /// Wall clock time in ms since the Unix epoch (TX: when written, RX: when the request finished)
    pub ts: u64,
    /// RX only: time from the request being written to the end of the request
    pub elapsed_ms: Option<u64>,
    /// "tcp" (MBAP header) or "rtu" (address + PDU + CRC)
    pub proto: &'static str,
    pub note: Option<&'static str>,
}

type Sink = Box<dyn Fn(RawFrame) + Send + Sync>;

#[derive(Default)]
struct Pending {
    mbap: bool,
    tx: Vec<u8>,
    rx: Vec<u8>,
    sent: Option<(Instant, u64)>,
}

/// Shared between the transport wrapper ([`Tapped`]) and the code issuing requests,
/// which calls [`Tap::finish`] once a request completes or times out.
#[derive(Default)]
pub struct Tap {
    enabled: AtomicBool,
    pending: Mutex<Pending>,
    sink: OnceLock<Sink>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

impl Tap {
    pub fn set_sink(&self, sink: impl Fn(RawFrame) + Send + Sync + 'static) {
        let _ = self.sink.set(Box::new(sink));
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        if !enabled {
            let mut p = self.pending.lock().unwrap();
            p.tx.clear();
            p.rx.clear();
            p.sent = None;
        }
    }

    fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    /// Called on (re)connect: drops leftovers of the previous connection.
    pub fn reset(&self, mbap: bool) {
        *self.pending.lock().unwrap() = Pending { mbap, ..Pending::default() };
    }

    fn on_write(&self, data: &[u8]) {
        if !self.is_enabled() || data.is_empty() {
            return;
        }
        let mut p = self.pending.lock().unwrap();
        p.sent.get_or_insert_with(|| (Instant::now(), now_ms()));
        p.tx.extend_from_slice(data);
    }

    fn on_read(&self, data: &[u8]) {
        if self.is_enabled() && !data.is_empty() {
            self.pending.lock().unwrap().rx.extend_from_slice(data);
        }
    }

    /// Emits what was sent and received during the request that just ended.
    pub fn finish(&self) {
        if !self.is_enabled() {
            return;
        }
        let Some(sink) = self.sink.get() else { return };
        let (mbap, tx, rx, sent) = {
            let mut p = self.pending.lock().unwrap();
            (p.mbap, std::mem::take(&mut p.tx), std::mem::take(&mut p.rx), p.sent.take())
        };
        if tx.is_empty() && rx.is_empty() {
            return;
        }
        let proto = if mbap { "tcp" } else { "rtu" };
        let end = now_ms();
        let elapsed_ms = sent.map(|(at, _)| at.elapsed().as_millis() as u64);
        let frame = |dir, bytes, ts, elapsed_ms, note| RawFrame { dir, bytes, ts, elapsed_ms, proto, note };

        let txn = (tx.len() >= 2).then(|| [tx[0], tx[1]]);
        if !tx.is_empty() {
            sink(frame("tx", tx, sent.map_or(end, |(_, ts)| ts), None, None));
        }
        if rx.is_empty() {
            sink(frame("rx", Vec::new(), end, elapsed_ms, Some("no response")));
            return;
        }
        if !mbap {
            sink(frame("rx", rx, end, elapsed_ms, None));
            return;
        }
        // A TCP read can hold several frames, e.g. a late reply to an earlier request
        let mut rest = rx.as_slice();
        while !rest.is_empty() {
            let len = if rest.len() >= 6 { 6 + usize::from(u16::from_be_bytes([rest[4], rest[5]])) } else { usize::MAX };
            if len > rest.len() {
                sink(frame("rx", rest.to_vec(), end, elapsed_ms, Some("incomplete frame")));
                break;
            }
            let (f, tail) = rest.split_at(len);
            let late = txn.is_some_and(|t| f[..2] != t);
            sink(frame("rx", f.to_vec(), end, elapsed_ms, late.then_some("transaction ID mismatch, ignored")));
            rest = tail;
        }
    }
}

/// Transport wrapper recording every byte that passes through it into a [`Tap`].
pub struct Tapped<T> {
    inner: T,
    tap: Arc<Tap>,
}

impl<T> Tapped<T> {
    pub fn new(inner: T, tap: Arc<Tap>) -> Self {
        Self { inner, tap }
    }
}

impl<T: fmt::Debug> fmt::Debug for Tapped<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Tapped").field("inner", &self.inner).finish_non_exhaustive()
    }
}

impl<T: AsyncRead + Unpin> AsyncRead for Tapped<T> {
    fn poll_read(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        let before = buf.filled().len();
        let res = Pin::new(&mut this.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = res {
            this.tap.on_read(&buf.filled()[before..]);
        }
        res
    }
}

impl<T: AsyncWrite + Unpin> AsyncWrite for Tapped<T> {
    fn poll_write(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<std::io::Result<usize>> {
        let this = self.get_mut();
        let res = Pin::new(&mut this.inner).poll_write(cx, buf);
        if let Poll::Ready(Ok(n)) = res {
            this.tap.on_write(&buf[..n]);
        }
        res
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().inner).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().inner).poll_shutdown(cx)
    }
}
