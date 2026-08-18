import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRM_ROOT = path.resolve(__dirname, '../..');

export function runPlaywrightTests({
  headed = false,
  ui = false,
  debug = false,
  project = null,
  grep = null,
  updateSnapshots = false,
} = {}) {
  return new Promise((resolve, reject) => {
    const args = ['playwright', 'test'];
    if (ui) args.push('--ui');
    else if (headed) args.push('--headed');
    if (debug) args.push('--debug');
    if (project) args.push(`--project=${project}`);
    if (grep) args.push('-g', grep);
    if (updateSnapshots) args.push('--update-snapshots');

    const child = spawn('npx', args, {
      cwd: CRM_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_CAPTURE: '1',
      },
    });

    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, exitCode: 0 });
      else reject(new Error(`Playwright exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
