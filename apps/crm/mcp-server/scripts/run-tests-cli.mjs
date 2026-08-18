import { runPlaywrightTests } from '../src/runTests.js';

const args = process.argv.slice(2);
await runPlaywrightTests({
  ui: args.includes('--ui'),
  headed: args.includes('--headed'),
  debug: args.includes('--debug'),
  project: args.find((a) => a.startsWith('--project='))?.split('=')[1],
  grep: args.find((a) => a.startsWith('--grep='))?.split('=')[1],
});
