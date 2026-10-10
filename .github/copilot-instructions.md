# Modbus Client Project Instructions

## Tech Stack & Architecture
- **Framework**: Quasar v2 (Vue 3, Vite) frontend inside a Tauri v2 shell.
- **Language**: TypeScript in the frontend (`src`), Rust in the backend (`src-tauri`).
- **State Management**: Pinia (`src/stores/`).
- **Communication**: Tauri commands (`invoke`) and events (`emit`/`listen`).
  - **Backend**: `src-tauri/src/modbus.rs` handles hardware (`tokio-modbus`, `tokio-serial`).
  - **Bridge**: `src/boot/tauri-api.ts` builds `window.myAPI` from `invoke`/`listen`.
  - **Frontend**: Uses `window.myAPI` defined in `src/my-api.d.ts`.

## Core Workflows
1.  **Running the App**:
    - Use `npm run dev` (runs `tauri dev`, which starts the Quasar dev server on port 9000).
    - Backend tests: `npm test` (runs `cargo test` in `src-tauri`).
2.  **Modifying Modbus Logic**:
    - **Step 1 (Backend)**: Add a `#[tauri::command]` in `src-tauri/src/modbus.rs` and register it in `generate_handler!` in `src-tauri/src/lib.rs`.
    - **Step 2 (Bridge)**: Expose the method in `src/boot/tauri-api.ts` via `invoke('command_name', { args: {...} })`.
    - **Step 3 (Types)**: Update `src/my-api.d.ts` (`IModbusAPI`).
    - **Step 4 (Store)**: Call `window.myAPI.method()` in `src/stores/modbus-store.ts`.

## Project Conventions
- **UI Components**: Exclusively use Quasar components (`q-btn`, `q-input`, `q-select`, `q-card`).
  - Prefer `dense` and `outlined` props for inputs.
  - Use `q-btn-toggle` for mode switching.
- **Type Safety**:
  - Command arguments are passed as a single `args` object; numeric fields use the lenient
    `lenient_int` deserializers (`src-tauri/src/args.rs`), because the UI may send numbers as strings.
  - Commands return `{ success, error? }` JSON like the original IPC handlers; errors are not thrown to JS.
  - Do NOT use `any` in try/catch blocks (`catch (e: any)`). Use `unknown` or handle safely with type checks (`instanceof Error`).
  - Ensure `my-api.d.ts` matches `src/boot/tauri-api.ts` exactly (the bridge is typed as `IModbusAPI`).
- **Reactive State**:
  - Store connection state and logs in Pinia (`modbus-store.ts`).
  - Components should read from Store via computed properties or directly.

## Key Files
- `src-tauri/src/modbus.rs`: Modbus connection management, reads/writes, scanners.
- `src-tauri/src/decoders.rs`: Decoder files (bundled defaults + user directory).
- `src-tauri/src/updater.rs`: Auto-update.
- `src/boot/tauri-api.ts`: Frontend bridge to the backend.
- `src/my-api.d.ts`: Typings for the bridge.
- `src/stores/modbus-store.ts`: Central business logic and API consumer.
