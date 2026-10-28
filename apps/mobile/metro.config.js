// Metro loads this file with require(), so it stays CommonJS.
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)
// react-aria (under gluestack) exports .mjs files, which Expo's default source extensions leave out.
config.resolver.sourceExts.push('mjs')

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
  // light and dark are built in; these must match THEMES in packages/core/src/palettes.ts.
  extraThemes: ['midnight']
})
