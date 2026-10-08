import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`Build step failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

const sourceFiles = collectJsFiles(srcDir).sort();

if (sourceFiles.length === 0) {
  console.error('No JavaScript source files found under src/.');
  process.exit(1);
}

for (const file of sourceFiles) {
  runCommand('node', ['--check', file], `syntax-check:${path.relative(rootDir, file)}`);
}

runCommand('node', ['scripts/run-migrations.js', '--check'], 'migration-check');

console.log(`API_BUILD_OK (${sourceFiles.length} source files validated)`);
