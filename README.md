# Code Review Assistant & Humanizer

Desktop app by **PocketMind** for ingesting text and code, selecting up to five files, and running independent AI review or humanize jobs on each. Built with **Electron + React + TypeScript + Vite**. Packages to Windows **NSIS `.exe`**, portable `.exe`, and **MSIX/AppX**.

## What it does

1. **First launch** — a window asks for an API key (OpenAI, Anthropic, DeepSeek, Google Gemini, Mistral, or Groq).
2. **Ingest** — paste snippets, open a folder, or clone a GitHub repo. Folders and clones show as a hierarchical tree (GitHub files sit under the repo name).
3. **Select** — check up to **5** files in the tree.
4. **Review / Humanize / Edit** — each selected file is handled by its own AI job. File changes always require confirmation.
5. **Help** — opens support at **support.pocketmind@gmail.com**.

**Secrets:** AES-GCM encrypted files under Electron `userData` (no native keychain module — Store/AppX safe). Privacy policy: https://noumanshakeil.github.io/#privacy-policy ([PRIVACY.md](./PRIVACY.md)).

## Quick start

```bash
git clone https://github.com/noumanshakeil/code-review-assistant.git
cd code-review-assistant
npm install
npm run dev
```

`npm run dev` starts Vite on **http://127.0.0.1:43127** and launches Electron.

### API keys

1. On first open, pick a provider and paste its API key.
2. Click **Load models**, choose a model, then **Save & continue**.
3. Re-open anytime via **Models & keys**.

## Windows packaging (MSIX / Store)

```bash
npm run assets:brand   # sharp logos + Store rasters into build/ and store-assets/
npm run build:msix     # produces release/*.appx (run on Windows for Store upload)
```

Store listing images, feature graphic, logos, and Partner Center notes: [`store-assets/README.md`](./store-assets/README.md).

Before uploading to Partner Center, set `appx.publisher` in `electron-builder.yml` to your exact **Publisher ID** CN from the Microsoft developer account.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite development |
| `npm run build` | Typecheck + production build |
| `npm run build:win` | Windows NSIS + portable `.exe` |
| `npm run build:msix` | Windows AppX/MSIX |
| `npm run assets:brand` | Regenerate package + Store brand rasters |
| `npm run smoke` | Headless ingest / confirm-guard checks |

## Support

Email: [support.pocketmind@gmail.com](mailto:support.pocketmind@gmail.com)

## License

MIT
