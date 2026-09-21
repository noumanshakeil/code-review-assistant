# Build PocketMind 1.0.2 MSIX on Windows (Store resubmission)

Product ID: `9PJ1N2T0PK00`

## Why
Microsoft rejected the previous package for **10.1.2.10** (crash at launch on Surface Laptop 5).
This source tree contains the launch-crash fix (CJS main, no keytar, userData paths, GPU hardening).

## Build on your PC

```powershell
# 1) Unpack the source zip somewhere, e.g.:
Expand-Archive -Path "D:\code-review-assistant\downloads\PocketMind-1.0.2-source.zip" `
  -DestinationPath "D:\code-review-assistant\app-1.0.2" -Force
Set-Location "D:\code-review-assistant\app-1.0.2"

# 2) Node 20+ required
node -v
npm ci
npm run assets:brand
npm run build:msix

# 3) Upload this file in Partner Center → Packages:
#    release\PocketMindAIReviewerAndHumanizer-1.0.2-x64.appx
```

## After upload
- Keep the same identity / publisher CN (already set in `electron-builder.yml`)
- Resubmit certification for product `9PJ1N2T0PK00`

## Fix summary
- Electron main is CommonJS `dist-electron/main.cjs` (ESM-from-asar removed)
- No native `keytar`
- Secrets + prefs under Electron `userData`
- Paths via `app.getAppPath()`
- Windows GPU hardening for Store/Surface
