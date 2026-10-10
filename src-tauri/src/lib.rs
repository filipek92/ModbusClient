mod args;
mod decoders;
mod modbus;
mod updater;

use tauri::{AppHandle, Emitter};

/// Sends a timestamped line to the frontend log console.
pub(crate) fn send_log(app: &AppHandle, message: impl AsRef<str>) {
    let timestamp = chrono::Local::now().format("%H:%M:%S");
    let _ = app.emit("log-message", format!("[{timestamp}] {}", message.as_ref()));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(modbus::ModbusState::default())
        .manage(updater::UpdaterState::default())
        .invoke_handler(tauri::generate_handler![
            modbus::connect_tcp,
            modbus::connect_rtu_tcp,
            modbus::connect_rtu,
            modbus::disconnect,
            modbus::read_modbus,
            modbus::write_modbus,
            modbus::scan_devices,
            modbus::scan_values,
            decoders::get_decoders,
            decoders::import_decoder,
            decoders::export_decoder,
            decoders::save_decoder,
            decoders::delete_decoder,
            decoders::download_decoder_pack,
            updater::check_for_updates,
            updater::download_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
