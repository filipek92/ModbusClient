//! Device decoder JSON files: bundled defaults + user directory (user overrides defaults by id).

use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::sync::oneshot;

use crate::send_log;

const DECODER_PACK_URL: &str = "https://github.com/example/modbus-decoders/releases/latest/download/decoders.tar.gz";

type Decoder = Map<String, Value>;

pub(crate) fn ok_with(extra: Value) -> Value {
    let mut v = json!({ "success": true });
    if let (Value::Object(base), Value::Object(extra)) = (&mut v, extra) {
        base.extend(extra);
    }
    v
}

pub(crate) fn fail(msg: impl std::fmt::Display) -> Value {
    json!({ "success": false, "error": msg.to_string() })
}

fn default_decoders_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map(|p| p.join("default-decoders"))
        .map_err(|e| e.to_string())
}

/// Same location the Electron build used (`userData/decoders`), so existing user decoders are kept.
fn user_decoders_path(app: &AppHandle) -> Result<PathBuf, String> {
    let p = app
        .path()
        .config_dir()
        .map_err(|e| e.to_string())?
        .join("ModbusClient")
        .join("decoders");
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

fn parse_decoder(raw: &str) -> Option<Decoder> {
    let obj: Decoder = serde_json::from_str(raw).ok()?;
    let has_str = |k: &str| obj.get(k).and_then(Value::as_str).is_some_and(|s| !s.is_empty());
    let fields_ok = obj.get("fields").is_some_and(Value::is_array);
    (has_str("id") && has_str("name") && fields_ok).then_some(obj)
}

fn read_decoder_file(path: &Path) -> Option<Decoder> {
    parse_decoder(&fs::read_to_string(path).ok()?)
}

fn str_field<'a>(d: &'a Decoder, key: &str) -> &'a str {
    d.get(key).and_then(Value::as_str).unwrap_or_default()
}

/// Rejects ids that could escape the decoder directory when used as a file name.
fn decoder_file_name(id: &str) -> Result<String, String> {
    if id.is_empty() || id.contains(['/', '\\']) || id.starts_with('.') {
        return Err(format!("Invalid decoder id: {id}"));
    }
    Ok(format!("{id}.json"))
}

fn load_decoders_from_dir(dir: &Path) -> Vec<Decoder> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
        .collect();
    paths.sort();
    paths.iter().filter_map(|p| read_decoder_file(p)).collect()
}

#[tauri::command]
pub async fn get_decoders(app: AppHandle) -> Result<Value, ()> {
    let result = (|| -> Result<Vec<Decoder>, String> {
        let mut merged: BTreeMap<String, Decoder> = BTreeMap::new();
        let mut order = Vec::new();
        let sources = [(default_decoders_path(&app)?, true), (user_decoders_path(&app)?, false)];
        for (dir, is_default) in sources {
            for mut d in load_decoders_from_dir(&dir) {
                let id = str_field(&d, "id").to_owned();
                d.insert("isDefault".into(), Value::Bool(is_default));
                if !merged.contains_key(&id) {
                    order.push(id.clone());
                }
                merged.insert(id, d);
            }
        }
        Ok(order.into_iter().filter_map(|id| merged.remove(&id)).collect())
    })();

    Ok(match result {
        Ok(data) => ok_with(json!({ "data": data })),
        Err(e) => fail(e),
    })
}

/// Copies valid decoder files into the user directory; returns (imported names, rejected file names).
fn import_files(app: &AppHandle, files: &[PathBuf], log_prefix: &str) -> Result<(Vec<String>, Vec<String>), String> {
    let user_dir = user_decoders_path(app)?;
    let mut imported = Vec::new();
    let mut errors = Vec::new();
    for file in files {
        let display_name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let parsed = read_decoder_file(file).and_then(|d| decoder_file_name(str_field(&d, "id")).ok().map(|f| (d, f)));
        match parsed {
            Some((d, target)) => {
                fs::copy(file, user_dir.join(target)).map_err(|e| e.to_string())?;
                let (name, id) = (str_field(&d, "name"), str_field(&d, "id"));
                send_log(app, format!("{log_prefix}{name} ({id})"));
                imported.push(name.to_owned());
            }
            None => errors.push(display_name),
        }
    }
    Ok((imported, errors))
}

#[tauri::command]
pub async fn import_decoder(app: AppHandle) -> Result<Value, ()> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import Device Decoder")
        .add_filter("JSON Files", &["json"])
        .pick_files(move |paths| {
            let _ = tx.send(paths);
        });

    let files: Vec<PathBuf> = rx
        .await
        .ok()
        .flatten()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p: FilePath| p.into_path().ok())
        .collect();
    if files.is_empty() {
        return Ok(fail("Cancelled"));
    }

    Ok(match import_files(&app, &files, "Imported decoder: ") {
        Ok((imported, errors)) => ok_with(json!({ "imported": imported, "errors": errors })),
        Err(e) => fail(e),
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecoderIdArgs {
    decoder_id: String,
}

#[tauri::command]
pub async fn export_decoder(app: AppHandle, args: DecoderIdArgs) -> Result<Value, ()> {
    let result: Result<Option<Decoder>, String> = (|| {
        let file = decoder_file_name(&args.decoder_id)?;
        // Find decoder in user dir first, then defaults
        let user_path = user_decoders_path(&app)?.join(&file);
        let default_path = default_decoders_path(&app)?.join(&file);
        Ok(if user_path.exists() {
            read_decoder_file(&user_path)
        } else {
            read_decoder_file(&default_path)
        })
    })();

    let decoder = match result {
        Ok(Some(d)) => d,
        Ok(None) => return Ok(fail("Decoder not found")),
        Err(e) => return Ok(fail(e)),
    };

    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Export Device Decoder")
        .set_file_name(format!("{}.json", str_field(&decoder, "id")))
        .add_filter("JSON Files", &["json"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    let Some(target) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(fail("Cancelled"));
    };

    let content = serde_json::to_string_pretty(&decoder).unwrap_or_default();
    Ok(match fs::write(&target, content) {
        Ok(()) => {
            send_log(&app, format!("Exported decoder: {} → {}", str_field(&decoder, "name"), target.display()));
            ok_with(json!({}))
        }
        Err(e) => fail(e),
    })
}

#[derive(serde::Deserialize)]
pub struct SaveDecoderArgs {
    decoder: Value,
}

#[tauri::command]
pub async fn save_decoder(app: AppHandle, args: SaveDecoderArgs) -> Result<Value, ()> {
    let Some(decoder) = parse_decoder(&args.decoder.to_string()) else {
        return Ok(fail("Invalid decoder format"));
    };
    let result = (|| -> Result<(), String> {
        let target = user_decoders_path(&app)?.join(decoder_file_name(str_field(&decoder, "id"))?);
        let content = serde_json::to_string_pretty(&decoder).map_err(|e| e.to_string())?;
        fs::write(target, content).map_err(|e| e.to_string())
    })();

    Ok(match result {
        Ok(()) => {
            send_log(&app, format!("Saved decoder: {} ({})", str_field(&decoder, "name"), str_field(&decoder, "id")));
            ok_with(json!({}))
        }
        Err(e) => fail(e),
    })
}

#[tauri::command]
pub async fn delete_decoder(app: AppHandle, args: DecoderIdArgs) -> Result<Value, ()> {
    let result = (|| -> Result<bool, String> {
        let path = user_decoders_path(&app)?.join(decoder_file_name(&args.decoder_id)?);
        if !path.exists() {
            return Ok(false);
        }
        fs::remove_file(path).map_err(|e| e.to_string())?;
        Ok(true)
    })();

    Ok(match result {
        Ok(true) => {
            send_log(&app, format!("Deleted user decoder: {}", args.decoder_id));
            ok_with(json!({}))
        }
        Ok(false) => fail("Decoder not found in user directory"),
        Err(e) => fail(e),
    })
}

#[derive(serde::Deserialize)]
pub struct PackArgs {
    url: Option<String>,
}

/// Extracts every `*.json` entry of a .tar.gz archive in memory.
fn extract_json_files(archive: &[u8]) -> Result<Vec<(String, String)>, String> {
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(archive));
    let mut out = Vec::new();
    for entry in tar.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry.path().map_err(|e| e.to_string())?.into_owned();
        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let mut content = String::new();
        match entry.read_to_string(&mut content) {
            Ok(_) => out.push((name, content)),
            Err(_) => out.push((name, String::new())),
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn download_decoder_pack(app: AppHandle, args: PackArgs) -> Result<Value, ()> {
    let url = args.url.filter(|u| !u.is_empty()).unwrap_or_else(|| DECODER_PACK_URL.to_owned());
    send_log(&app, format!("Downloading decoder pack from: {url}"));

    let result: Result<(Vec<String>, Vec<String>), String> = async {
        let client = reqwest::Client::builder()
            .user_agent("ModbusClient")
            .build()
            .map_err(|e| e.to_string())?;
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status().as_u16()));
        }
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;

        send_log(&app, "Download complete, extracting...");
        let files = tokio::task::spawn_blocking(move || extract_json_files(&bytes))
            .await
            .map_err(|e| e.to_string())??;

        let user_dir = user_decoders_path(&app)?;
        let mut imported = Vec::new();
        let mut errors = Vec::new();
        for (file_name, content) in files {
            let parsed = parse_decoder(&content).and_then(|d| decoder_file_name(str_field(&d, "id")).ok().map(|f| (d, f)));
            match parsed {
                Some((d, target)) => {
                    fs::write(user_dir.join(target), &content).map_err(|e| e.to_string())?;
                    send_log(&app, format!("Pack: imported {} ({})", str_field(&d, "name"), str_field(&d, "id")));
                    imported.push(str_field(&d, "name").to_owned());
                }
                None => errors.push(file_name),
            }
        }
        Ok((imported, errors))
    }
    .await;

    Ok(match result {
        Ok((imported, errors)) => {
            send_log(&app, format!("Decoder pack: imported {} decoders, {} errors", imported.len(), errors.len()));
            ok_with(json!({ "imported": imported, "errors": errors }))
        }
        Err(e) => {
            send_log(&app, format!("Decoder pack download failed: {e}"));
            fail(e)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_decoders() {
        assert!(parse_decoder(r#"{"id":"a","name":"A","fields":[]}"#).is_some());
        assert!(parse_decoder(r#"{"id":"a","name":"A"}"#).is_none());
        assert!(parse_decoder(r#"{"id":"","name":"A","fields":[]}"#).is_none());
        assert!(parse_decoder("not json").is_none());
    }

    #[test]
    fn rejects_path_traversal_ids() {
        assert!(decoder_file_name("../evil").is_err());
        assert!(decoder_file_name("a/b").is_err());
        assert!(decoder_file_name("a\\b").is_err());
        assert_eq!(decoder_file_name("solax-control").unwrap(), "solax-control.json");
    }

    #[test]
    fn bundled_decoders_are_valid() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/default-decoders");
        let count = fs::read_dir(&dir).unwrap().count();
        assert!(count > 0);
        assert_eq!(load_decoders_from_dir(&dir).len(), count);
    }

    #[test]
    fn extracts_json_from_tar_gz() {
        let mut tar = tar::Builder::new(flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default()));
        for (path, body) in [("pack/x.json", r#"{"id":"x","name":"X","fields":[]}"#), ("pack/readme.txt", "hi")] {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, path, body.as_bytes()).unwrap();
        }
        let gz = tar.into_inner().unwrap().finish().unwrap();
        let files = extract_json_files(&gz).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "x.json");
        assert!(parse_decoder(&files[0].1).is_some());
    }
}
