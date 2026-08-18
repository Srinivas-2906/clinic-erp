#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFullCatalog, buildScreens, FEATURES, E2E_CREDENTIALS } from './catalog.js';
import { captureScreenshots, saveAuthState } from './capture.js';
import { runPlaywrightTests } from './runTests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = new Server(
  { name: 'clinic-desk-playwright', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'clinic_get_catalog',
      description: 'Full Clinic Desk feature list, E2E credentials, and capturable screens.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'clinic_list_screens',
      description: 'List all capturable Clinic Desk screens (login, home, today, patients, book, payments, reports, team).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'clinic_get_test_credentials',
      description: 'Returns E2E test login credentials (seeded via clinic-api/scripts/seed-e2e-user.js).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'clinic_capture_screenshots',
      description:
        'Capture PNG screenshots of Clinic Desk using Playwright. Logs in with E2E credentials. Set CLINIC_HEADED=1 for visible browser.',
      inputSchema: {
        type: 'object',
        properties: {
          baseUrl: { type: 'string', description: 'CRM URL (default http://localhost:5185)' },
          outputDir: { type: 'string', description: 'Screenshot output folder' },
          screenIds: { type: 'array', items: { type: 'string' }, description: 'Subset of screen ids' },
          headed: { type: 'boolean', description: 'Show browser window (interactive)' },
          slowMo: { type: 'number', description: 'Slow motion ms between actions' },
        },
      },
    },
    {
      name: 'clinic_run_e2e_tests',
      description:
        'Run Playwright E2E test suite. Use ui=true for interactive Playwright UI, headed=true to watch tests run.',
      inputSchema: {
        type: 'object',
        properties: {
          ui: { type: 'boolean', description: 'Open Playwright UI mode (best for interactive)' },
          headed: { type: 'boolean', description: 'Run with visible browser' },
          debug: { type: 'boolean', description: 'Playwright debug mode' },
          project: { type: 'string', description: 'chromium-desktop or chromium-mobile' },
          grep: { type: 'string', description: 'Filter tests by name regex' },
        },
      },
    },
    {
      name: 'clinic_get_features',
      description: 'Grouped Clinic Desk product capabilities.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'clinic://catalog',
      name: 'Clinic Desk catalog',
      description: 'Features, screens, E2E credentials',
      mimeType: 'application/json',
    },
    {
      uri: 'clinic://screenshots/index',
      name: 'Latest screenshots index',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'clinic://catalog') {
    return {
      contents: [{
        uri: 'clinic://catalog',
        mimeType: 'application/json',
        text: JSON.stringify(getFullCatalog(), null, 2),
      }],
    };
  }

  if (request.params.uri === 'clinic://screenshots/index') {
    const dir = process.env.CLINIC_SCREENSHOT_DIR || path.resolve(process.cwd(), 'screenshots');
    try {
      const text = await fs.readFile(path.join(dir, 'index.json'), 'utf8');
      return { contents: [{ uri: 'clinic://screenshots/index', mimeType: 'application/json', text }] };
    } catch {
      return {
        contents: [{
          uri: 'clinic://screenshots/index',
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'No screenshots yet. Run clinic_capture_screenshots.' }),
        }],
      };
    }
  }

  throw new Error(`Unknown resource: ${request.params.uri}`);
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'clinic_get_catalog') {
    return { content: [{ type: 'text', text: JSON.stringify(getFullCatalog(), null, 2) }] };
  }

  if (name === 'clinic_list_screens') {
    return { content: [{ type: 'text', text: JSON.stringify(buildScreens(), null, 2) }] };
  }

  if (name === 'clinic_get_test_credentials') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...E2E_CREDENTIALS,
          loginUrl: `${process.env.CLINIC_BASE_URL || 'http://localhost:5185'}?tenant=${E2E_CREDENTIALS.tenant}`,
          seedCommand: 'cd clinic-api && npm run seed:e2e',
        }, null, 2),
      }],
    };
  }

  if (name === 'clinic_get_features') {
    return { content: [{ type: 'text', text: JSON.stringify(FEATURES, null, 2) }] };
  }

  if (name === 'clinic_capture_screenshots') {
    try {
      if (args.headed) process.env.CLINIC_HEADED = '1';
      if (args.slowMo) process.env.CLINIC_SLOW_MO = String(args.slowMo);
      const result = await captureScreenshots({
        baseUrl: args.baseUrl,
        outputDir: args.outputDir,
        screenIds: args.screenIds,
        headed: args.headed,
        slowMo: args.slowMo,
      });
      const summary = result.results.map((r) => (
        r.ok ? `✓ ${r.id}: ${r.screenshot}` : `✗ ${r.id}: ${r.error}`
      )).join('\n');
      return {
        content: [{
          type: 'text',
          text: [
            `Captured ${result.results.filter((r) => r.ok).length}/${result.results.length}`,
            `Output: ${result.outputDir}`,
            '',
            summary,
          ].join('\n'),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Capture failed: ${err?.message || err}` }], isError: true };
    }
  }

  if (name === 'clinic_run_e2e_tests') {
    try {
      await runPlaywrightTests({
        ui: args.ui,
        headed: args.headed,
        debug: args.debug,
        project: args.project,
        grep: args.grep,
      });
      return {
        content: [{
          type: 'text',
          text: 'All Playwright tests passed. Screenshots: clinic-crm/e2e/screenshots/',
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Tests failed: ${err?.message || err}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Clinic Desk Playwright MCP running on stdio');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
