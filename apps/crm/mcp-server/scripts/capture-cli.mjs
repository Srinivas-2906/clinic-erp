import { captureScreenshots } from '../src/capture.js';

const screenIds = process.argv.slice(2).filter(Boolean);
const headed = process.argv.includes('--headed');

const result = await captureScreenshots({ screenIds: screenIds.length ? screenIds : null, headed });
console.log(JSON.stringify(result, null, 2));
