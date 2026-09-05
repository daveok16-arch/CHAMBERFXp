// Bootstraps the app before `npm start` when a platform (e.g. Render) only
// runs the start command and skips the install/build phases entirely.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname);
const hasModule = (name) => fs.existsSync(path.join(root, 'node_modules', name, 'package.json'));
const hasDistBundle = () => fs.existsSync(path.join(root, 'dist', 'server.cjs'));

try {
  // 1. Runtime deps (critical server-side packages. If any are missing, install everything.
  if (["express", "dotenv", "@google/genai"].some((name) => !hasModule(name))) {
    console.log('[prestart] node_modules incomplete - running npm ci (falls back to npm install)...');
    try {
      execSync('npm ci', { stdio: 'inherit', cwd: root, env: process.env });
    } catch {
      execSync('npm install', { stdio: 'inherit', cwd: root, env: process.env });
    }
  }

  // 2. Production bundle (in case the committed dist/ was pruned or rebuilt source changed.
  if (!hasDistBundle()) {
    console.log('[prestart] dist/server.cjs missing - running npm run build...');
    execSync('npm run build', { stdio: 'inherit', cwd: root, env: process.env });
  }
} catch (err) {
  console.error('[prestart] Bootstrap failed:', err && err.message ? err.message : err);
  process.exit(1);
}