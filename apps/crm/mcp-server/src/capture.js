import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildScreens, E2E_CREDENTIALS } from './catalog.js';

const DEFAULT_BASE = process.env.CLINIC_BASE_URL || 'http://localhost:5185';
const DEFAULT_OUT = process.env.CLINIC_SCREENSHOT_DIR
  || path.resolve(process.cwd(), 'screenshots');

const TAB_LABELS = {
  overview: 'Home',
  today: 'Today',
  patients: 'Patients',
  book: 'Book',
  payments: 'Payments',
  reports: 'Reports',
  team: 'Team',
};

function slug(id) {
  return id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

async function login(page, baseUrl) {
  const tenant = E2E_CREDENTIALS.tenant;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?tenant=${tenant}`);
  await page.locator('#lUser').fill(E2E_CREDENTIALS.email);
  await page.locator('#lPass').fill(E2E_CREDENTIALS.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.locator('.clinic-app').waitFor({ state: 'visible', timeout: 25_000 });
}

async function goToTab(page, tab) {
  const label = TAB_LABELS[tab];
  const sidebar = page.locator('.clinic-sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('button', { name: label }).click();
  } else {
    await page.locator('.bottom-nav').getByRole('button', { name: label }).click();
  }
  await page.waitForTimeout(800);
}

export async function captureScreenshots({
  baseUrl = DEFAULT_BASE,
  outputDir = DEFAULT_OUT,
  storageStatePath = process.env.CLINIC_STORAGE_STATE,
  screenIds = null,
  headed = process.env.CLINIC_HEADED === '1',
  slowMo = Number(process.env.CLINIC_SLOW_MO || 0),
  viewport = { width: 1280, height: 900 },
  waitMs = 1200,
} = {}) {
  const screens = buildScreens();
  const selected = screenIds?.length
    ? screens.filter((s) => screenIds.includes(s.id))
    : screens;

  if (!selected.length) {
    throw new Error(`No matching screens. Available: ${screens.map((s) => s.id).join(', ')}`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed, slowMo });
  const contextOptions = { viewport };
  if (storageStatePath) {
    try {
      await fs.access(storageStatePath);
      contextOptions.storageState = storageStatePath;
    } catch {
      /* login below */
    }
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const results = [];
  let loggedIn = false;

  for (const screen of selected) {
    const filename = `${slug(screen.id)}.png`;
    const filePath = path.join(outputDir, filename);

    try {
      if (screen.authRequired && !loggedIn && !storageStatePath) {
        await login(page, baseUrl);
        loggedIn = true;
      } else if (!screen.authRequired) {
        await page.goto(`${baseUrl.replace(/\/$/, '')}${screen.path}`);
      }

      if (screen.tab) {
        if (!loggedIn && !storageStatePath) {
          await login(page, baseUrl);
          loggedIn = true;
        }
        await goToTab(page, screen.tab);
      }

      await page.waitForTimeout(waitMs);
      await page.screenshot({ path: filePath, fullPage: true });
      results.push({ id: screen.id, name: screen.name, screenshot: filePath, ok: true });
    } catch (err) {
      results.push({
        id: screen.id,
        name: screen.name,
        ok: false,
        error: err?.message || String(err),
      });
    }
  }

  if (loggedIn) {
    const authPath = storageStatePath || path.join(outputDir, 'clinic-auth.json');
    await context.storageState({ path: authPath });
  }

  await browser.close();

  const indexPath = path.join(outputDir, 'index.json');
  await fs.writeFile(indexPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    baseUrl,
    results,
  }, null, 2));

  return { outputDir, indexPath, results };
}

export async function saveAuthState({
  baseUrl = DEFAULT_BASE,
  outputPath = process.env.CLINIC_STORAGE_STATE || path.resolve(process.cwd(), 'clinic-auth.json'),
} = {}) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await login(page, baseUrl);
  console.error('Logged in — press Enter to save auth state…');
  await new Promise((resolve) => { process.stdin.once('data', resolve); });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await context.storageState({ path: outputPath });
  await browser.close();
  return outputPath;
}
