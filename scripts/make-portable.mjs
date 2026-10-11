// Packs the Windows portable build: modbus-client.exe + default decoders + a `.portable` marker
// (disables the NSIS-based self-update) into dist/tauri/Modbus.Client_<version>_x64_portable.zip.
// Run after `tauri build` on Windows; prints the zip path on the last line.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') {
  console.log('Portable build is Windows-only, skipping');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const exe = join('src-tauri', 'target', 'release', 'modbus-client.exe');
const outDir = join('dist', 'tauri');
const name = `Modbus.Client_${version}_x64_portable`;
const stageDir = join(outDir, name);
const zip = join(outDir, `${name}.zip`);

if (!existsSync(exe)) {
  console.error(`Executable not found: ${exe}`);
  process.exit(1);
}

rmSync(stageDir, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(stageDir, { recursive: true });

cpSync(exe, join(stageDir, 'Modbus Client.exe'));
// On Windows Tauri's resource_dir() is the exe directory, so resources sit next to it
cpSync(join('src-tauri', 'resources', 'default-decoders'), join(stageDir, 'default-decoders'), { recursive: true });
writeFileSync(join(stageDir, '.portable'), '');

// bsdtar ships with Windows 10+; -a picks the zip format from the extension
execFileSync('tar', ['-a', '-c', '-f', `${name}.zip`, name], { cwd: outDir, stdio: 'inherit' });
rmSync(stageDir, { recursive: true, force: true });

console.log(zip);
