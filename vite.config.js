import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Version label shown small in the navbar (owner, 2026-11-25): package version · build date · commit,
// so testers can tell which build they have. Netlify passes the commit as COMMIT_REF.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = (process.env.COMMIT_REF ?? '').slice(0, 7);
if (!commit) {
  try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { commit = 'dev'; }
}
const built = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' }).replaceAll('-', '.');

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} · ${built} · ${commit}`),
  },
  server: { port: 3000, host: '127.0.0.1' },
  preview: { port: 3000 },
  build: { outDir: 'build' },
});
