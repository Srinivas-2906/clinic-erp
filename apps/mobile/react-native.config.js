/** Block native modules not required for Clinic ERP mobile (CI + lean APK). */
module.exports = {
  dependencies: {
    'expo-file-system': {
      platforms: { android: null, ios: null },
    },
    'expo-asset': {
      platforms: { android: null, ios: null },
    },
  },
};
