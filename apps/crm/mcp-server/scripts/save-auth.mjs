import { saveAuthState } from '../src/capture.js';

const out = process.argv[2];
await saveAuthState({ outputPath: out });
console.log('Saved auth state');
