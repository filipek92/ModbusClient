mod args;
mod decoders;
mod export;
mod modbus;
mod profiles;
mod tap;
mod updater;

use std::sync::Arc;

use tauri::{AppHandle, Emitter};

/// Sends a line to the frontend log console (which adds the timestamp).
pub(crate) fn send_log(app: &AppHandle, message: impl AsRef<str>) {
    let _ = app.emit("log-message", message.as_ref());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tap = Arc::new(tap::Tap::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup({
            let tap = Arc::clone(&tap);
            move |app| {
                let handle = app.handle().clone();
                tap.set_sink(move |frame| {
                    let _ = handle.emit("raw-frame", frame);
                });
                Ok(())
            }
        })
        .manage(modbus::ModbusState::new(Arc::clone(&tap)))
        .manage(modbus::FrameLog(tap))
        .manage(modbus::ScanCancel::default())
        .manage(updater::UpdaterState::default())
        .invoke_handler(tauri::generate_handler![
            modbus::connect_tcp,
            modbus::connect_rtu_tcp,
            modbus::connect_rtu,
            modbus::list_serial_ports,
            modbus::disconnect,
            modbus::read_modbus,
            modbus::write_modbus,
            modbus::scan_devices,
            modbus::cancel_scan,
            modbus::set_frame_log,
            modbus::scan_values,
            decoders::get_decoders,
            decoders::import_decoder,
            decoders::export_decoder,
            decoders::save_decoder,
            decoders::delete_decoder,
            decoders::download_decoder_pack,
            profiles::load_profiles,
            profiles::save_profiles,
            profiles::export_profile,
            profiles::import_profile,
            export::export_csv,
            updater::check_for_updates,
            updater::download_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
