// The shared editor is TipTap, whose editor object changes in place; desktop runs it without the React Compiler,
// so mobile compiles only its own code.
module.exports = (api) => {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        { 'react-compiler': { sources: (f) => !f.includes('/packages/editor/') } }
      ]
    ]
  }
}
