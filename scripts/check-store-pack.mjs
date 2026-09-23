/**
 * Pre-certification guards for PocketMind AI Reviewer And Humanizer AppX.
 * Fails if launch hardening or Partner Center identity regresses.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const errors = []

function assert(cond, msg) {
  if (!cond) errors.push(msg)
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const pkg = JSON.parse(read('package.json'))
const builder = read('electron-builder.yml')
const mainSrc = read('electron/main.ts')

const REQUIRED_IDENTITY = 'PocketMind.PocketMindAIReviewerAndHumanizer'
const REQUIRED_PUBLISHER = 'CN=78BD2D1C-2460-451B-91FD-410288D37531'
const REQUIRED_APP_ID = 'PocketMindAIReviewerAndHumanizer'

assert(pkg.main === 'dist-electron/main.cjs', `package.json main must be dist-electron/main.cjs (got ${pkg.main})`)
assert(
  typeof pkg.version === 'string' && /^\d+\.\d+\.\d+$/.test(pkg.version),
  `package.json version must be semver x.y.z (got ${pkg.version})`,
)
assert(
  pkg.version !== '1.0.2' && pkg.version !== '1.0.1' && pkg.version !== '1.0.0',
  `version ${pkg.version} was already rejected or superseded — bump for Partner Center`,
)

assert(builder.includes(`identityName: ${REQUIRED_IDENTITY}`), 'electron-builder identityName mismatch')
assert(builder.includes(`publisher: ${REQUIRED_PUBLISHER}`), 'electron-builder publisher CN mismatch')
assert(builder.includes(`applicationId: ${REQUIRED_APP_ID}`), 'electron-builder applicationId mismatch')
assert(
  builder.includes('"!**/node_modules/**"') || builder.includes("'!**/node_modules/**'"),
  'electron-builder must exclude node_modules from AppX asar',
)

assert(mainSrc.includes('disableHardwareAcceleration()'), 'main must call disableHardwareAcceleration')
assert(mainSrc.includes("appendSwitch('disable-gpu')"), 'main must append --disable-gpu')
assert(
  mainSrc.includes("appendSwitch('disable-gpu-compositing')"),
  'main must append --disable-gpu-compositing',
)
assert(
  mainSrc.includes("appendSwitch('disable-direct-composition')"),
  'main must append --disable-direct-composition',
)
assert(
  mainSrc.includes("appendSwitch('use-angle', 'swiftshader')"),
  'main must force ANGLE SwiftShader',
)
assert(mainSrc.includes("appendSwitch('no-sandbox')"), 'main must append --no-sandbox for AppX')
assert(
  !mainSrc.includes("appendSwitch('in-process-gpu')"),
  'main must NOT use in-process-gpu with disable-gpu (blocks painting)',
)
assert(mainSrc.includes('setTimeout(reveal, 2500)'), 'main must reveal window on timeout fallback')
assert(mainSrc.includes("APP_USER_MODEL_ID = 'PocketMind.PocketMindAIReviewerAndHumanizer'"), 'AUMID mismatch')

const bundleScript = read('scripts/bundle-electron.mjs')
assert(bundleScript.includes("outfile: path.join(outDir, 'main.cjs')"), 'bundle must emit main.cjs')
assert(bundleScript.includes("throw new Error('keytar must not appear"), 'bundle must guard against keytar')

// If dist-electron already built, validate the artifact too.
const mainCjsPath = path.join(root, 'dist-electron', 'main.cjs')
if (fs.existsSync(mainCjsPath)) {
  const mainCjs = fs.readFileSync(mainCjsPath, 'utf8')
  assert(!mainCjs.trimStart().startsWith('import '), 'dist-electron/main.cjs must not be ESM')
  assert(!mainCjs.includes('keytar'), 'dist-electron/main.cjs must not reference keytar')
  assert(mainCjs.includes('disable-gpu'), 'bundled main must include disable-gpu switch')
  assert(!mainCjs.includes('in-process-gpu'), 'bundled main must not include in-process-gpu')
  assert(fs.existsSync(path.join(root, 'dist-electron', 'preload.cjs')), 'preload.cjs missing')
  assert(!fs.existsSync(path.join(root, 'dist-electron', 'main.js')), 'ESM main.js must not ship')
}

// Optional: if a local AppxManifest from a prior pack exists, check identity.
const releaseDir = path.join(root, 'release')
if (fs.existsSync(releaseDir)) {
  const manifests = []
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name === 'AppxManifest.xml') manifests.push(full)
    }
  }
  walk(releaseDir)
  for (const m of manifests) {
    const xml = fs.readFileSync(m, 'utf8')
    assert(xml.includes(`Name="${REQUIRED_IDENTITY}"`), `${m}: Identity Name mismatch`)
    assert(xml.includes(`Publisher='${REQUIRED_PUBLISHER}'`) || xml.includes(`Publisher="${REQUIRED_PUBLISHER}"`), `${m}: Publisher mismatch`)
  }
}

if (errors.length) {
  console.error('check-store-pack FAILED:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}

console.log('check-store-pack OK')
console.log(`  version=${pkg.version}`)
console.log(`  identity=${REQUIRED_IDENTITY}`)
console.log(`  publisher=${REQUIRED_PUBLISHER}`)
console.log('  GPU hardening switches present; in-process-gpu absent; node_modules excluded')
