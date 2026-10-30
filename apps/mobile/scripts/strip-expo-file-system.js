#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const settings = path.join(path.dirname(fileURLToPath(import.meta.url)), '../android/settings.gradle');
if (!fs.existsSync(settings)) process.exit(0);
let text = fs.readFileSync(settings, 'utf8');
const next = text
  .split('\n')
  .filter((line) => !line.includes('expo-file-system'))
  .join('\n');
if (next !== text) {
  fs.writeFileSync(settings, next);
  console.log('Removed expo-file-system from settings.gradle');
}
