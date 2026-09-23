# Build PocketMind 1.0.3 MSIX on Windows (Store resubmission)

Product ID: `9PJ1N2T0PK00`

## Why
Microsoft rejected **1.0.2.0** for **10.1.2.10** (crash at launch). Windows Event Log on cert machine WAW-DL08:

- Exception **`0xc0000005` (ACCESS_VIOLATION)**
- Faulting app: `PocketMindAIReviewerAndHumanizer.exe`

That is a **native Electron GPU/ANGLE crash** under the Store AppX container — not a JS main-process dialog (and not the receptionist asar-cwd spawn bug).

Version **1.0.3** hardens launch with SwiftShader ANGLE + GPU disable switches (**without** `in-process-gpu`), keeps window reveal fallbacks, and excludes `node_modules` from the asar.

## Build on your PC

```powershell
git clone https://github.com/noumanshakeil/code-review-assistant.git
Set-Location code-review-assistant
git checkout main
git pull origin main

# Node 20+ required
node -v
npm ci
npm run check:store
npm run assets:brand
npm run build:msix

# Upload this file in Partner Center → Packages:
#    release\PocketMindAIReviewerAndHumanizer-1.0.3-x64.appx
```

## After upload
- Keep the same identity / publisher CN (already set in `electron-builder.yml`)
- Delete the rejected **1.0.2** package from the submission
- Resubmit certification for product `9PJ1N2T0PK00`

## Fix summary
- Electron main is CommonJS `dist-electron/main.cjs`
- No native `keytar`
- Secrets + prefs under Electron `userData`
- Paths via `app.getAppPath()`
- Windows Store GPU path: `disableHardwareAcceleration` + `--disable-gpu` + `--disable-direct-composition` + `--use-angle=swiftshader` + `--no-sandbox` (no `in-process-gpu`)
- Window reveal fallbacks if compositor never paints
- AppX asar excludes `node_modules`
