#!/usr/bin/env node
/**
 * npm workspaces: point Gradle at expo-module-gradle-plugin (nested under expo).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '../..');
const settingsPath = path.join(mobileDir, 'android/settings.gradle');

if (!fs.existsSync(settingsPath)) {
  console.error('android/settings.gradle not found — run expo prebuild first');
  process.exit(1);
}

const candidates = [
  path.join(repoRoot, 'node_modules/expo/node_modules/expo-modules-core/expo-module-gradle-plugin'),
  path.join(mobileDir, 'node_modules/expo/node_modules/expo-modules-core/expo-module-gradle-plugin'),
];

const pluginDir = candidates.find((c) => fs.existsSync(c));
if (!pluginDir) {
  console.error('expo-module-gradle-plugin not found. Checked:\n', candidates.join('\n'));
  process.exit(1);
}

let text = fs.readFileSync(settingsPath, 'utf8');
text = text.replace(/\n    includeBuild\(new File\(\["node".*expo-module-gradle-plugin.*\)\)\n/g, '\n');
text = text.replace(/\n    includeBuild\(".*expo-module-gradle-plugin"\)\n/g, '\n');

if (!text.includes('expo-module-gradle-plugin')) {
  const includeLine = `    includeBuild("${pluginDir.replace(/\\/g, '/')}")`;
  text = text.replace(/^pluginManagement \{\n/m, `pluginManagement {\n${includeLine}\n`);
}

fs.writeFileSync(settingsPath, text);
console.log('Patched settings.gradle includeBuild ->', pluginDir);
