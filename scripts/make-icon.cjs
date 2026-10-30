/**
 * Generates the app icon from the same bubble face the UI draws
 * (src/renderer/src/components/ui/BotFace.tsx), so the packaged app, the
 * dock, and the rail all wear one logo.
 *
 * Electron does the rasterising because it is the only renderer this repo
 * already depends on; sips and iconutil ship with macOS.
 *
 * Run with: npm run icons
 */
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('child_process')
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const ROOT = join(__dirname, '..')
const BUILD = join(ROOT, 'build')
const RESOURCES = join(ROOT, 'resources')

/** Neutral ink, matching the app's zero-chroma surfaces. */
const INK_TOP = '#2A2A2A'
const INK_BOTTOM = '#030303'
const FACE = '#FFFFFF'

/* Mirrors FaceGlyph in BotFace.tsx: the bubble on a 24-unit grid, pill eyes
 * glancing right (glance 1). Keep the two in step. */
const BUBBLE =
  'M10 5H14A6 6 0 0 1 20 11V12A6 6 0 0 1 14 18H10.6L7.4 20.6C6.9 21 6.2 20.6 6.3 20L6.7 17.2A6 6 0 0 1 4 12V11A6 6 0 0 1 10 5Z'
const EYES_X = [10.4, 15.6]
const EYES_MID_X = (EYES_X[0] + EYES_X[1]) / 2
const EYE_Y = 11.4
const EYE_WIDTH = 2.3
const EYE_HEIGHT = 4.4

/** Optical centre of the glyph: the body's middle, nudged down for the tail. */
const GLYPH_CENTER = { x: 12, y: 12.6 }

/**
 * Below ~48px the eyes close up into one blot, so the small slots draw the face
 * larger with wider-set, bigger eyes. Same character, readable at 16px.
 */
const VARIANTS = {
  full: { scale: 28, eyeScale: 1 },
  medium: { scale: 29.5, eyeScale: 1.1 },
  simple: { scale: 32, eyeScale: 1.25 }
}

/**
 * Apple's icon grid: an 824pt superellipse centred in a 1024pt canvas. n=5
 * approximates the continuous-curvature squircle far better than a rounded
 * rect's circular corners.
 */
function squirclePath(center, half, exponent = 5, steps = 720) {
  const points = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x = center + half * Math.sign(cos) * Math.abs(cos) ** (2 / exponent)
    const y = center + half * Math.sign(sin) * Math.abs(sin) ** (2 / exponent)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}

/* Eyes are punched out of the bubble, as in the UI, so the tile shows through. */
function eyeHoles(eyeScale) {
  const width = EYE_WIDTH * eyeScale
  const height = EYE_HEIGHT * eyeScale
  // Spread the centres with the eyes, or bigger eyes would close the gap between them.
  const centers = EYES_X.map((x) => EYES_MID_X + (x - EYES_MID_X) * eyeScale)
  return centers
    .map(
      (x) =>
        `<rect x="${(x - width / 2).toFixed(3)}" y="${(EYE_Y - height / 2).toFixed(3)}" width="${width.toFixed(3)}" height="${height.toFixed(3)}" rx="${(width / 2).toFixed(3)}" fill="#000000" />`
    )
    .join('')
}

function iconMarkup({ scale, eyeScale }) {
  const size = 1024
  const center = size / 2
  const tile = squirclePath(center, 412)
  const glyph = `translate(${(center - GLYPH_CENTER.x * scale).toFixed(2)} ${(center - GLYPH_CENTER.y * scale).toFixed(2)}) scale(${scale})`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK_TOP}" />
      <stop offset="1" stop-color="${INK_BOTTOM}" />
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10" />
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>
    <filter id="cast" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="11" flood-color="#000000" flood-opacity="0.28" />
    </filter>
    <mask id="face">
      <g transform="${glyph}">
        <path d="${BUBBLE}" fill="#FFFFFF" />
        ${eyeHoles(eyeScale)}
      </g>
    </mask>
  </defs>
  <g filter="url(#cast)">
    <path d="${tile}" fill="url(#ink)" />
    <path d="${tile}" fill="url(#sheen)" />
    <path d="${tile}" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2.5" />
  </g>
  <rect x="0" y="0" width="${size}" height="${size}" fill="${FACE}" mask="url(#face)" />
</svg>`
}

const page = (markup) =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${markup}`

/** One window, reused: transparent windows are slow to create and racy to churn. */
async function createCanvas() {
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true
  })
  window.setPosition(0, 0)
  return window
}

/** Captured at 1024 CSS px; on a Retina display the bitmap comes back larger, which only helps. */
async function capture(window, work, name, options) {
  const html = join(work, `${name}.html`)
  writeFileSync(html, page(iconMarkup(options)))

  await window.loadFile(html)
  // One frame of slack: loadFile resolves before the first composite.
  await new Promise((resolve) => setTimeout(resolve, 400))

  const image = await window.webContents.capturePage()
  const png = join(work, `${name}.png`)
  writeFileSync(png, image.toPNG())
  return png
}

const sips = (args) => execFileSync('/usr/bin/sips', args, { stdio: 'pipe' })

const resize = (source, size, destination) => {
  sips(['-z', String(size), String(size), source, '--out', destination])
  return destination
}

/**
 * ICO with PNG payloads — the format Vista onward reads, and the only one that
 * carries a 256px entry.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const directory = entries.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.data)])
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'claude-gui-icon-'))
  const canvas = await createCanvas()
  const large = await capture(canvas, work, 'master', VARIANTS.full)
  const medium = await capture(canvas, work, 'master-medium', VARIANTS.medium)
  const small = await capture(canvas, work, 'master-small', VARIANTS.simple)
  canvas.destroy()

  const iconset = join(work, 'icon.iconset')
  mkdirSync(iconset)

  // Each master feeds the sizes it was drawn for.
  const slices = [
    [16, small, ['icon_16x16.png']],
    [32, small, ['icon_16x16@2x.png', 'icon_32x32.png']],
    [64, medium, ['icon_32x32@2x.png']],
    [128, large, ['icon_128x128.png']],
    [256, large, ['icon_128x128@2x.png', 'icon_256x256.png']],
    [512, large, ['icon_256x256@2x.png', 'icon_512x512.png']],
    [1024, large, ['icon_512x512@2x.png']]
  ]

  for (const [size, source, names] of slices) {
    const first = resize(source, size, join(iconset, names[0]))
    for (const name of names.slice(1)) copyFileSync(first, join(iconset, name))
  }

  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(BUILD, 'icon.icns')])

  // electron-builder wants a 512px PNG for Linux; the main process loads the
  // resources copy as the window icon.
  copyFileSync(join(iconset, 'icon_512x512.png'), join(BUILD, 'icon.png'))
  copyFileSync(join(iconset, 'icon_512x512.png'), join(RESOURCES, 'icon.png'))

  const masterFor = (size) => (size <= 48 ? small : size <= 64 ? medium : large)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoEntries = icoSizes.map((size) => ({
    size,
    data: readFileSync(resize(masterFor(size), size, join(work, `ico-${size}.png`)))
  }))
  writeFileSync(join(BUILD, 'icon.ico'), buildIco(icoEntries))

  rmSync(work, { recursive: true, force: true })
  console.log('wrote build/icon.icns, build/icon.ico, build/icon.png, resources/icon.png')
  app.exit(0)
}

app.whenReady().then(() =>
  main().catch((error) => {
    console.error('icon generation failed:', error)
    app.exit(1)
  })
)
