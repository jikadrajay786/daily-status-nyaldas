// Renders every app icon from the logo artwork. Run from the repo root: npx electron brand/render.cjs
// Electron is already a dependency and draws SVG exactly like the apps do, so no image tool is needed.
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ACCENT = '#4f46e5'
const TINT = '#c7d2fe'
const root = path.resolve(__dirname, '..')
const out = (p) => path.join(root, p)

// The calendar page with its tick, drawn on a 512 grid; `ring` is the rings' outline colour.
const page = (ring = ACCENT, band = TINT) => `
  <rect x="128" y="146" width="256" height="238" rx="40" fill="#fff"/>
  <path d="M128 186a40 40 0 0 1 40-40h176a40 40 0 0 1 40 40v30H128z" fill="${band}"/>
  <rect x="181" y="112" width="30" height="70" rx="15" fill="#fff" stroke="${ring}" stroke-width="12"/>
  <rect x="301" y="112" width="30" height="70" rx="15" fill="#fff" stroke="${ring}" stroke-width="12"/>
  <path d="M196 296l42 42 80-86" fill="none" stroke="${ACCENT}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>`
const svg = (body, view = '0 0 512 512') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`

const ART = {
  // App stores and launchers mask the corners themselves, so these stay square and opaque.
  square: svg(`<rect width="512" height="512" fill="${ACCENT}"/>${page()}`),
  rounded: svg(`<rect width="512" height="512" rx="116" fill="${ACCENT}"/>${page()}`),
  // macOS icons sit inside a margin on a 1024 canvas.
  mac: svg(
    `<rect x="50" y="50" width="412" height="412" rx="92" fill="${ACCENT}"/><g transform="translate(50 50) scale(.805)">${page()}</g>`
  ),
  // Android draws the background separately and crops the foreground to a circle or squircle.
  foreground: svg(`<g transform="translate(64 64) scale(.75)">${page()}</g>`),
  background: svg(`<rect width="512" height="512" fill="${ACCENT}"/>`),
  // Android tints this one; only its shape counts, so the tick is cut out of the page.
  monochrome:
    svg(`<defs><mask id="m"><rect width="512" height="512" fill="#fff"/><path d="M196 296l42 42 80-86" fill="none" stroke="#000" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>
    <g transform="translate(64 64) scale(.75)"><g mask="url(#m)"><rect x="128" y="146" width="256" height="238" rx="40" fill="#fff"/></g>
    <rect x="181" y="112" width="30" height="70" rx="15" fill="#fff"/><rect x="301" y="112" width="30" height="70" rx="15" fill="#fff"/></g>`)
}

const JOBS = [
  ['apps/mobile/assets/images/icon.png', 'square', 1024],
  ['apps/mobile/assets/images/splash-icon.png', 'rounded', 512],
  ['apps/mobile/assets/images/android-icon-foreground.png', 'foreground', 512],
  ['apps/mobile/assets/images/android-icon-background.png', 'background', 512],
  ['apps/mobile/assets/images/android-icon-monochrome.png', 'monochrome', 512],
  ['apps/desktop/build/icon.png', 'mac', 1024],
  ['apps/desktop/resources/icon.png', 'mac', 512]
]

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.dock?.hide()

// One offscreen window for every size: the artwork is swapped in and the top-left square captured.
let win
const render = async (art, size) => {
  if (!win) {
    win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 1024,
      transparent: true,
      frame: false,
      useContentSize: true,
      webPreferences: { offscreen: true }
    })
    await win.loadURL('data:text/html,<body style="margin:0;background:transparent"></body>')
  }
  const src = `data:image/svg+xml;base64,${Buffer.from(ART[art]).toString('base64')}`
  await win.webContents.executeJavaScript(`(async () => {
    document.body.innerHTML = '<img width="${size}" height="${size}" style="display:block">'
    const img = document.body.firstChild
    img.src = '${src}'
    await img.decode()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })()`)
  return (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).toPNG()
}

// ICO with embedded PNGs: a 6-byte header, a 16-byte entry per image, then the images.
const ico = (pngs) => {
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(pngs.length, 4)
  let offset = head.length
  pngs.forEach(([size, png], i) => {
    const e = 6 + 16 * i
    head.writeUInt8(size >= 256 ? 0 : size, e)
    head.writeUInt8(size >= 256 ? 0 : size, e + 1)
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(png.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([head, ...pngs.map(([, png]) => png)])
}

app.whenReady().then(async () => {
  for (const [file, art, size] of JOBS) {
    fs.writeFileSync(out(file), await render(art, size))
    console.log('wrote', file)
  }
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
  const macs = Object.fromEntries(
    await Promise.all(sizes.map(async (s) => [s, await render('mac', s)]))
  )
  fs.writeFileSync(
    out('apps/desktop/build/icon.ico'),
    ico([16, 32, 48, 64, 128, 256].map((s) => [s, macs[s]]))
  )
  console.log('wrote apps/desktop/build/icon.ico')
  const set = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')) + '/icon.iconset'
  fs.mkdirSync(set)
  for (const s of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(`${set}/icon_${s}x${s}.png`, macs[s])
    fs.writeFileSync(`${set}/icon_${s}x${s}@2x.png`, macs[s * 2])
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', out('apps/desktop/build/icon.icns')])
  console.log('wrote apps/desktop/build/icon.icns')
  // The layered Liquid Glass icon (iOS 26+, macOS 26+) is hand-made in brand/AppIcon.icon; each app keeps a copy.
  for (const dir of ['apps/mobile/assets', 'apps/desktop/build']) {
    fs.cpSync(out('brand/AppIcon.icon'), out(`${dir}/AppIcon.icon`), { recursive: true })
    console.log(`wrote ${dir}/AppIcon.icon`)
  }
  app.quit()
})
