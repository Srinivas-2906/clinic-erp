const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

function firstExistingModuleDir(...candidates) {
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'react-native', 'package.json'))) {
      return dir;
    }
  }
  return candidates[0];
}

const mobileModules = path.resolve(projectRoot, 'node_modules');
const workspaceModules = path.resolve(workspaceRoot, 'node_modules');
const resolvedModules = firstExistingModuleDir(mobileModules, workspaceModules);

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [resolvedModules, workspaceModules].filter(
  (p, i, arr) => arr.indexOf(p) === i
);
config.resolver.unstable_enablePackageExports = false;
config.resolver.extraNodeModules = {
  'react-native': path.join(resolvedModules, 'react-native'),
};

const virtualViewPattern = /[\\/]virtualview[\\/]VirtualView\.js$/;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (virtualViewPattern.test(moduleName) || moduleName.includes('virtualview/VirtualView')) {
    return {
      filePath: path.resolve(projectRoot, 'shims/VirtualView.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
