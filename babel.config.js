module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    'react-native-worklets/plugin',  // <- Changed from 'react-native-reanimated/plugin'
  ],
}