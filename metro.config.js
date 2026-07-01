const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Block the nested react-native@0.86 that npm auto-installs as a peer dep
// of @react-native/debugger-shell inside react-native@0.81's node_modules.
config.resolver.blockList = [
  /node_modules\/react-native\/node_modules\/react-native\/.*/,
];

module.exports = withNativeWind(config, { input: './global.css' });
