# Microsoft Store listing assets

Ready-to-upload art for Partner Center. All files are PNG.

## Required / strongly recommended

| File | Size | Partner Center field |
|------|------|----------------------|
| `store-tile-icon-300.png` | 300×300 | 1:1 App tile icon |
| `feature-graphic-1920x1080.png` | 1920×1080 | 16:9 Super hero art (**no text**, Store rule) |
| `feature-graphic-3840x2160.png` | 3840×2160 | Optional 4K super hero art |
| `screenshot-01-review-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `screenshot-02-humanize-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `screenshot-03-models-keys-1920x1080.png` | 1920×1080 | Desktop screenshot |
| `screenshot-04-github-1920x1080.png` | 1920×1080 | Desktop screenshot |

## Optional Store logos

| File | Size | Field |
|------|------|-------|
| `poster-art-720x1080.png` | 720×1080 | 2:3 Poster art |
| `poster-art-1440x2160.png` | 1440×2160 | 2:3 Poster art (hi-res) |
| `box-art-1080.png` | 1080×1080 | 1:1 box art |
| `logo-1024.png` | 1024×1024 | Master logo source |

## Package icons (already wired for MSIX)

AppX tile assets live in `../build/appx/` (`StoreLogo`, `Square150x150Logo`, `Square44x44Logo`, `Wide310x150Logo`, splash, scale & targetsize variants). Windows installer icon: `../build/icon.ico`.

**MSIX build requires Windows** (electron-builder AppX target). On a Windows machine or via `.github/workflows/build-msix.yml`:

```bash
npm ci
npm run assets:brand
npm run build:msix
```

Output: `release/Code Review Assistant-*-x64.appx`

## Suggested listing copy

**Title:** Code Review Assistant  
**Publisher:** PocketMind  
**Support contact:** support.pocketmind@gmail.com  

**Short description (≤300 chars):**  
Review and humanize code or text with your own AI keys. Ingest folders or GitHub repos, select up to five files, and run independent review or rewrite jobs — changes apply only after you confirm.

**Features (bullets):**
- Paste, folder, or GitHub ingest with a hierarchical file tree
- Select up to 5 files; each runs as its own AI job
- Code review findings with severity and suggestions
- Humanize with confirm-before-apply
- OpenAI, Anthropic, DeepSeek, Gemini, Mistral, Groq
- Keys stored locally (OS keychain / encrypted fallback)

**Privacy policy:** include `PRIVACY.md` content (or host it and paste the URL in Partner Center).

## Store compliance checklist

- [x] Custom package logos (not Electron defaults)
- [x] Super hero art without title text
- [x] ≥4 desktop screenshots at ≥1366×768 (we ship 1920×1080)
- [x] 300×300 app tile icon
- [x] In-app Help → support email
- [x] Privacy policy document
- [ ] Set `appx.publisher` CN to your Partner Center Publisher ID before upload
- [ ] Complete age ratings questionnaire in Partner Center
- [ ] Declare internet client capability usage (AI + GitHub) in submission
- [ ] Run Windows App Certification Kit on a Windows machine before final submit

## Regenerate brand rasters

```bash
python3 scripts/generate-brand-assets.py
```
