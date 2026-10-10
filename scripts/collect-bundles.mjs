// Copies finished installers (and updater signatures) from src-tauri/target/release/bundle
// into dist/tauri, so build outputs end up next to the project instead of deep inside src-tauri.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const bundleDir = join('src-tauri', 'target', 'release', 'bundle');
const outDir = join('dist', 'tauri');

if (!existsSync(bundleDir)) {
  console.error(`No bundles found in ${bundleDir}`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const kind of readdirSync(bundleDir)) {
  const kindDir = join(bundleDir, kind);
  if (!statSync(kindDir).isDirectory()) continue;
  for (const name of readdirSync(kindDir)) {
    const src = join(kindDir, name);
    // Only files: skip intermediate directories such as *.AppDir or unpacked deb trees
    if (!statSync(src).isFile()) continue;
    cpSync(src, join(outDir, name));
    console.log(`  ${join(outDir, name)}`);
  }
}
