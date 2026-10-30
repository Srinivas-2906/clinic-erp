const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

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
