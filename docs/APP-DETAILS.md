# PocketMind AI: Reviewer And Humanizer — App Details

Complete reference for the product, Store submission, packages, and every image asset.

**Current package version for Store resubmission:** `1.0.2` (launch-crash fix)

---

## 1. Product overview

| Field | Value |
|--------|--------|
| **Product name** | PocketMind AI: Reviewer And Humanizer |
| **Publisher** | PocketMind |
| **Version** | 1.0.0 |
| **Platform** | Windows 10/11 desktop (Electron + React + TypeScript + Vite) |
| **Package** | MSIX / AppX (`runFullTrust` Desktop Bridge) |
| **Support email** | support.pocketmind@gmail.com |
| **Privacy policy** | https://noumanshakeil.github.io/#privacy-policy |
| **Website** | https://noumanshakeil.github.io/ |
| **Source repo** | https://github.com/noumanshakeil/code-review-assistant |
| **Release (MSIX + assets)** | https://github.com/noumanshakeil/code-review-assistant/releases/tag/v1.0.1 |

### What the app does

1. **First launch** — dialog asks for an API key (OpenAI, Anthropic, DeepSeek, Google Gemini, Mistral, or Groq).
2. **Load models** — after a key is saved, that provider’s model list is shown for selection.
3. **Ingest** — paste text/code, open a folder, or clone a GitHub repo.
4. **File tree** — hierarchical display; GitHub clones appear under a folder named after the repo.
5. **Select** — up to **5** files at a time.
6. **Review / Humanize / Edit** — each selected file runs as its own AI job (parallel, capped concurrency). File writes require confirmation.
7. **Help** — opens support email and privacy policy link.

No offline/mock provider. No agent CLIs. No Ollama/local GPU UI.

---

## 2. Microsoft Store package identity

Must match Partner Center exactly:

| Field | Value |
|--------|--------|
| Identity name | `PocketMind.PocketMindAIReviewerAndHumanizer` |
| Publisher CN | `CN=78BD2D1C-2460-451B-91FD-410288D37531` |
| Publisher display name | PocketMind |
| Display name | PocketMind AI: Reviewer And Humanizer |
| Application ID | `PocketMindAIReviewerAndHumanizer` |
| Capability | `runFullTrust` (required for Electron desktop) |

**MSIX file name:** `PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx`

---

## 3. Where everything lives

### A) In the GitHub repo (after `git clone`)

```
code-review-assistant/
├── store-assets/          ← Store listing images (upload these to Partner Center)
├── build/
│   ├── icon.png           ← Master app icon (1024×1024)
│   ├── icon.ico           ← Windows installer / exe icon
│   └── appx/              ← Icons baked into the MSIX package
├── PRIVACY.md
├── release/               ← Local MSIX if built (gitignored; get from Releases)
└── docs/APP-DETAILS.md    ← This document
```

### B) GitHub Release download (easiest on your PC)

https://github.com/noumanshakeil/code-review-assistant/releases/tag/v1.0.1

| Asset | Contents |
|--------|-----------|
| `PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx` | Store / sideload package (~182 MB) |
| `cra-store-assets.zip` | All listing images + package icons + privacy text |

### C) On this Cloud Agent machine

| Path | What |
|------|------|
| `/workspace/store-assets/` | Listing images |
| `/workspace/build/` + `build/appx/` | Package icons |
| `/workspace/release/PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx` | Built MSIX |
| `/opt/cursor/artifacts/store-listing/` | Copy of listing images + zip |

### D) Get everything onto your D: drive

```powershell
New-Item -ItemType Directory -Force -Path "D:\code-review-assistant" | Out-Null
Set-Location "D:\code-review-assistant"

git clone https://github.com/noumanshakeil/code-review-assistant.git app

New-Item -ItemType Directory -Force -Path "D:\code-review-assistant\downloads" | Out-Null
Invoke-WebRequest -Uri "https://github.com/noumanshakeil/code-review-assistant/releases/download/v1.0.1/PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx" `
  -OutFile "D:\code-review-assistant\downloads\PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx"
Invoke-WebRequest -Uri "https://github.com/noumanshakeil/code-review-assistant/releases/download/v1.0.1/cra-store-assets.zip" `
  -OutFile "D:\code-review-assistant\downloads\cra-store-assets.zip"
Expand-Archive -Path "D:\code-review-assistant\downloads\cra-store-assets.zip" `
  -DestinationPath "D:\code-review-assistant\downloads\store-assets" -Force
```

Then:

- App + images in repo: `D:\code-review-assistant\app\store-assets\`
- Unzipped kit: `D:\code-review-assistant\downloads\store-assets\`
- MSIX: `D:\code-review-assistant\downloads\PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx`
- This doc: `D:\code-review-assistant\app\docs\APP-DETAILS.md`

---

## 4. Image inventory (every file)

### Store listing images — `store-assets/`

Upload these in Partner Center → Store listings.

| File | Size | Partner Center field |
|------|------|----------------------|
| `screenshot-01-review-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `screenshot-02-humanize-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `screenshot-03-models-keys-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `screenshot-04-github-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `feature-graphic-1920x1080.png` | 1920×1080 | **16:9 Super hero art** (no title text) |
| `feature-graphic-3840x2160.png` | 3840×2160 | Optional 4K super hero art |
| `store-tile-icon-300.png` | 300×300 | **1:1 App tile icon** |
| `poster-art-720x1080.png` | 720×1080 | **9:16 Poster art** |
| `poster-art-1440x2160.png` | 1440×2160 | Optional hi-res poster |
| `box-art-1080.png` | 1080×1080 | **1:1 Box art** |
| `logo-1024.png` | 1024×1024 | Master logo source |
| `logo-512.png` / `logo-256.png` | 512 / 256 | Extra logo sizes |

Skip Xbox-only art and trailers unless you target Xbox.

### Package / MSIX icons — `build/`

Already embedded when you build the `.appx`. You normally do **not** re-upload these as listing screenshots.

| File | Size | Role |
|------|------|------|
| `build/icon.png` | 1024×1024 | Source icon |
| `build/icon.ico` | multi-size | Windows `.exe` / installer |
| `build/appx/StoreLogo.png` | 50×50 | Store logo in package |
| `build/appx/Square44x44Logo.png` | 44×44 | Taskbar / small tile |
| `build/appx/Square150x150Logo.png` | 150×150 | Medium tile |
| `build/appx/Wide310x150Logo.png` | 310×150 | Wide tile |
| `build/appx/LargeTile.png` | 310×310 | Large tile |
| `build/appx/SmallTile.png` | 71×71 | Small tile |
| `build/appx/BadgeLogo.png` | 24×24 | Lock-screen badge |
| `build/appx/SplashScreen.png` | 620×300 | Splash |

Regenerate icons anytime:

```bash
npm run assets:brand
# or: python3 scripts/generate-brand-assets.py
```

---

## 5. Store listing text (ready to paste)

### Description

```
PocketMind AI: Reviewer And Humanizer helps developers review and rewrite code or text with their own AI API keys. Paste snippets, open a folder, or clone a GitHub repo, then select up to five files and run independent review or humanize jobs on each.

Add a provider key once (OpenAI, Anthropic, DeepSeek, Google Gemini, Mistral, or Groq), pick a model, and work from a clear hierarchical file tree. Changes are never written until you confirm. Keys stay on your device.

Support: support.pocketmind@gmail.com
Privacy: https://noumanshakeil.github.io/#privacy-policy
```

### Short description

```
Review and humanize code or text with your own AI keys. Ingest folders or GitHub repos, select up to five files, and run independent AI jobs—changes apply only after you confirm.
```

### Features

1. Paste, folder, or GitHub ingest with a hierarchical file tree  
2. Select up to 5 files and run independent AI review jobs  
3. Humanize text or code with confirm-before-apply  
4. Propose edits with explicit confirmation  
5. Works with OpenAI, Anthropic, DeepSeek, Gemini, Mistral, and Groq  
6. API keys stored locally on your device  

### Keywords

`code review` · `AI humanizer` · `developer tools` · `GitHub` · `code assistant` · `API keys` · `desktop app`

### Short title

`PocketMind AI Reviewer`

### Copyright

`© PocketMind. All rights reserved.`

### Developed by

`PocketMind`

---

## 6. Privacy & age rating (summary)

| Question | Answer |
|----------|--------|
| Access/collect/transmit personal info? | **Yes** → privacy URL above |
| Ratings content in package? | No |
| User-to-user sharing? | No |
| Online / generated AI content? | **Yes** |
| Age-restricted sales? | No |
| Share precise location? | No |
| Digital goods purchases? | No |
| Crypto / NFT rewards? | No |
| Browser / search engine? | No |
| Primarily news/education? | No |
| Physical media / board ratings? | No |

### Product declarations

- **Check:** Install to alternate drives; Incorporates generative AI  
- **Uncheck:** External purchases; Accessibility tested; OneDrive backups; Broadcast/recording; Pen/ink  

### System requirements

- Minimum / recommended: Keyboard, Mouse  
- Memory: 4 GB min / 8 GB recommended  
- Processor: x64  

### Restricted capability (`runFullTrust`)

Required for Electron Desktop Bridge. Justify as full-trust desktop shell for local files, secure key storage, GitHub clone, and user-initiated AI HTTPS calls.

---

## 7. Run / rebuild locally

```bash
git clone https://github.com/noumanshakeil/code-review-assistant.git
cd code-review-assistant
npm install
npm run dev          # Electron + Vite on http://127.0.0.1:43127
npm run build:msix   # Windows only — produces release/*.appx
```

Or rebuild MSIX via GitHub Actions: **Actions → Build MSIX → Run workflow**.

---

## 8. Quick checklist for Partner Center

1. Upload MSIX: `PocketMindAIReviewerAndHumanizer-1.0.0-x64.appx` from release **v1.0.1**  
2. Upload 4 screenshots + feature graphic + 300×300 tile + poster + box art from `store-assets/`  
3. Paste description, features, keywords, privacy URL  
4. Save and submit  

Privacy live URL: https://noumanshakeil.github.io/#privacy-policy
