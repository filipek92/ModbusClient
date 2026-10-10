//! Auto-update via GitHub Releases (`latest.json` produced by tauri-action).
//! Emits the same events the Electron build did, so the UI flow is unchanged:
//! check -> `update-available` -> download -> `update-downloaded` -> install & restart.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

use crate::send_log;

#[derive(Default)]
pub struct UpdaterState {
    pending: Mutex<Option<Update>>,
    downloaded: Mutex<Option<Vec<u8>>>,
}

fn report_error(app: &AppHandle, msg: impl std::fmt::Display) -> Value {
    let msg = msg.to_string();
    send_log(app, format!("Update error: {msg}"));
    let _ = app.emit("update-error", &msg);
    json!({ "error": msg })
}

/// On Linux only the AppImage can replace itself; .deb installs are updated by the package manager.
fn self_update_supported() -> bool {
    !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some()
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, state: State<'_, UpdaterState>) -> Result<Value, ()> {
    if !self_update_supported() {
        send_log(&app, "Updater: auto-update is available only for the AppImage build");
        return Ok(json!({ "updateInfo": null }));
    }

    send_log(&app, "Checking for update...");
    let update = match app.updater().map_err(|e| e.to_string()) {
        Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e),
    };

    Ok(match update {
        Ok(Some(update)) => {
            send_log(&app, format!("Update available: {}", update.version));
            let info = json!({
                "version": update.version,
                "releaseNotes": update.body,
                "releaseDate": update.date.map(|d| d.to_string()),
            });
            let _ = app.emit("update-available", &info);
            *state.pending.lock().await = Some(update);
            json!({ "updateInfo": info })
        }
        Ok(None) => {
            let version = app.package_info().version.to_string();
            send_log(&app, format!("Update not available: {version}"));
            let _ = app.emit("update-not-available", json!({ "version": version }));
            json!({ "updateInfo": null })
        }
        Err(e) => report_error(&app, e),
    })
}

#[tauri::command]
pub async fn download_update(app: AppHandle, state: State<'_, UpdaterState>) -> Result<Value, ()> {
    let pending = state.pending.lock().await;
    let Some(update) = pending.as_ref() else {
        return Ok(report_error(&app, "No update available, check for updates first"));
    };

    let mut transferred: u64 = 0;
    let progress_app = app.clone();
    let result = update
        .download(
            |chunk, total| {
                transferred += chunk as u64;
                let percent = total.map_or(0.0, |t| transferred as f64 * 100.0 / t.max(1) as f64);
                let _ = progress_app.emit(
                    "update-download-progress",
                    json!({ "percent": percent, "transferred": transferred, "total": total }),
                );
            },
            || {},
        )
        .await;

    Ok(match result {
        Ok(bytes) => {
            send_log(&app, format!("Update downloaded: {}", update.version));
            let _ = app.emit("update-downloaded", json!({ "version": update.version }));
            *state.downloaded.lock().await = Some(bytes);
            json!({ "success": true })
        }
        Err(e) => report_error(&app, e),
    })
}

#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, UpdaterState>) -> Result<(), ()> {
    let pending = state.pending.lock().await;
    let bytes = state.downloaded.lock().await.take();
    let (Some(update), Some(bytes)) = (pending.as_ref(), bytes) else {
        report_error(&app, "Update has not been downloaded");
        return Ok(());
    };

    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(e) => {
            report_error(&app, e);
            Ok(())
        }
    }
}
