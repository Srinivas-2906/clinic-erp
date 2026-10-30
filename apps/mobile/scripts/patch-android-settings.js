#!/usr/bin/env node
/**
 * npm workspaces: Gradle plugin path + AGP resolution for CI.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '../..');
const settingsPath = path.join(mobileDir, 'android/settings.gradle');
const rootGradlePath = path.join(mobileDir, 'android/build.gradle');

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

let settings = fs.readFileSync(settingsPath, 'utf8');
settings = settings.replace(/\n    includeBuild\(new File\(\["node".*expo-module-gradle-plugin.*\)\)\n/g, '\n');
settings = settings.replace(/\n    includeBuild\(".*expo-module-gradle-plugin"\)\n/g, '\n');

if (!settings.includes('expo-module-gradle-plugin')) {
  const includeLine = `    includeBuild("${pluginDir.replace(/\\/g, '/')}")`;
  settings = settings.replace(/^pluginManagement \{\n/m, `pluginManagement {\n${includeLine}\n`);
}

const agpHook = `
gradle.beforeProject { proj ->
  proj.buildscript {
    repositories {
      google()
      mavenCentral()
    }
    configurations.classpath {
      resolutionStrategy {
        force 'com.android.tools.build:gradle:8.5.2'
      }
    }
  }
  proj.configurations.all { conf ->
    conf.resolutionStrategy {
      force 'io.github.lukmccall.pika:pika-compiler:0.3.2'
    }
  }
}
`;

if (!settings.includes('force \'com.android.tools.build:gradle:8.5.2\'')) {
  settings += agpHook;
}

fs.writeFileSync(settingsPath, settings);

if (fs.existsSync(rootGradlePath)) {
  let rootGradle = fs.readFileSync(rootGradlePath, 'utf8');
  rootGradle = rootGradle.replace(
    "classpath('com.android.tools.build:gradle')",
    "classpath('com.android.tools.build:gradle:8.5.2')",
  );
  fs.writeFileSync(rootGradlePath, rootGradle);
}

console.log('Patched Android Gradle settings ->', pluginDir);
