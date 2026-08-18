import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

function slug(name: string) {
  return name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
}

export async function captureStep(page: Page, stepName: string, opts?: { fullPage?: boolean }) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SCREENSHOT_DIR, `${ts}_${slug(stepName)}.png`);
  await page.screenshot({ path: file, fullPage: opts?.fullPage ?? true });
  return file;
}

export function writeScreenshotIndex(entries: { step: string; file: string; ok: boolean }[]) {
  const indexPath = path.join(SCREENSHOT_DIR, 'index.json');
  const prev = (() => {
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      return { runs: [] };
    }
  })();

  prev.runs = prev.runs || [];
  prev.runs.unshift({
    capturedAt: new Date().toISOString(),
    entries,
  });
  prev.latest = entries;
  fs.writeFileSync(indexPath, JSON.stringify(prev, null, 2));
  return indexPath;
}
