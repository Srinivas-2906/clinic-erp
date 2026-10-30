#!/usr/bin/env node
/**
 * Expo prebuild in npm workspaces: ensure expo-module-gradle-plugin is on the composite build path.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.join(__dirname, '../android/settings.gradle');

if (!fs.existsSync(settingsPath)) {
  console.error('android/settings.gradle not found — run expo prebuild first');
  process.exit(1);
}

let text = fs.readFileSync(settingsPath, 'utf8');
if (text.includes('expo-module-gradle-plugin')) {
  console.log('settings.gradle already patched');
  process.exit(0);
}

const includeLine = `    includeBuild(new File(["node", "--print", "require.resolve('expo-modules-core/package.json', { paths: [require.resolve('expo/package.json')] })"].execute(null, rootDir).text.trim(), "../expo-module-gradle-plugin"))`;

text = text.replace(/^pluginManagement \{\n/m, `pluginManagement {\n${includeLine}\n`);
fs.writeFileSync(settingsPath, text);
console.log('Patched settings.gradle for expo-module-gradle-plugin');
