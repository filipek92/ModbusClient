//! Workspace persistence: the last session and named profiles live in one JSON file next to
//! the user decoders. The content is owned by the frontend, the backend only stores it.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::{
    decoders::{fail, ok_with},
    send_log,
};

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let p = app.path().config_dir().map_err(|e| e.to_string())?.join("ModbusClient");
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("profiles.json"))
}

/// Reads the store file. A missing file yields `None`; an unreadable one is moved aside to
/// `*.bak` (so the next save does not silently destroy it) and also yields `None`.
fn read_store(path: &Path) -> Result<Option<Value>, String> {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) if v.is_object() => Ok(Some(v)),
        _ => {
            fs::rename(path, path.with_extension("json.bak")).map_err(|e| e.to_string())?;
            Err("Profile file was corrupted, moved to profiles.json.bak".into())
        }
    }
}

/// Writes through a temporary file so a crash mid-write cannot truncate the store.
fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_profiles(app: AppHandle) -> Result<Value, ()> {
    let result = profiles_path(&app).and_then(|p| read_store(&p));
    Ok(match result {
        Ok(data) => ok_with(json!({ "data": data })),
        Err(e) => {
            send_log(&app, format!("Loading profiles failed: {e}"));
            fail(e)
        }
    })
}

#[derive(serde::Deserialize)]
pub struct SaveProfilesArgs {
    data: Value,
}

#[tauri::command]
pub async fn save_profiles(app: AppHandle, args: SaveProfilesArgs) -> Result<Value, ()> {
    if !args.data.is_object() {
        return Ok(fail("Invalid profile data"));
    }
    let result = profiles_path(&app).and_then(|p| {
        let content = serde_json::to_string_pretty(&args.data).map_err(|e| e.to_string())?;
        write_atomic(&p, &content)
    });
    Ok(match result {
        Ok(()) => ok_with(json!({})),
        Err(e) => fail(e),
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProfileArgs {
    profile: Value,
    file_name: String,
}

#[tauri::command]
pub async fn export_profile(app: AppHandle, args: ExportProfileArgs) -> Result<Value, ()> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Export Profile")
        .set_file_name(&args.file_name)
        .add_filter("JSON Files", &["json"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    let Some(target) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(fail("Cancelled"));
    };

    let content = serde_json::to_string_pretty(&args.profile).unwrap_or_default();
    Ok(match fs::write(&target, content) {
        Ok(()) => {
            send_log(&app, format!("Exported profile → {}", target.display()));
            ok_with(json!({}))
        }
        Err(e) => fail(e),
    })
}

#[tauri::command]
pub async fn import_profile(app: AppHandle) -> Result<Value, ()> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import Profile")
        .add_filter("JSON Files", &["json"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });

    let Some(file) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(fail("Cancelled"));
    };

    let parsed = fs::read_to_string(&file)
        .map_err(|e| e.to_string())
        .and_then(|raw| serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string()));
    Ok(match parsed {
        Ok(data) if data.is_object() => ok_with(json!({ "data": data })),
        Ok(_) => fail("Not a profile file"),
        Err(e) => fail(e),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("modbus-profiles-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_is_empty() {
        let dir = temp_dir("missing");
        assert_eq!(read_store(&dir.join("profiles.json")).unwrap(), None);
    }

    #[test]
    fn round_trips_through_atomic_write() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("profiles.json");
        write_atomic(&path, r#"{"version":1,"profiles":[]}"#).unwrap();
        assert_eq!(read_store(&path).unwrap(), Some(json!({ "version": 1, "profiles": [] })));
        assert!(!dir.join("profiles.json.tmp").exists());
    }

    #[test]
    fn corrupted_file_is_moved_aside() {
        let dir = temp_dir("corrupt");
        let path = dir.join("profiles.json");
        fs::write(&path, "{ not json").unwrap();
        assert!(read_store(&path).is_err());
        assert!(!path.exists());
        assert_eq!(fs::read_to_string(dir.join("profiles.json.bak")).unwrap(), "{ not json");
    }
}
