# Code Review Assistant & Humanizer

Desktop app for ingesting text and code, selecting up to five files, and running independent AI review or humanize jobs on each. Built with **Electron + React + TypeScript + Vite**. Packages to Windows **NSIS `.exe`**, portable `.exe`, and **MSIX/AppX**.

## What it does

1. **First launch** — a window asks for an API key (OpenAI, Anthropic, DeepSeek, Google Gemini, Mistral, or Groq).
2. **Ingest** — paste snippets, open a folder, or clone a GitHub repo. Folders and clones show as a hierarchical tree (GitHub files sit under the repo name).
3. **Select** — check up to **5** files in the tree.
4. **Review / Humanize / Edit** — each selected file is handled by its own AI job (parallel, capped concurrency). File changes always require confirmation.

**Languages:** JavaScript/TypeScript, Python, Go, Rust, Java, C/C++, C#, Kotlin, Swift, Ruby, PHP, Scala, Lua, Shell, SQL, HTML/CSS, JSON, YAML, Markdown, and plaintext.

**Secrets:** OS keychain (`keytar`) with AES-GCM encrypted file fallback under `~/.code-review-assistant/`.

## Requirements

- Node.js 20+
- npm 10+
- An API key from one of the supported providers
- For Windows installers: a Windows host (or CI) with [electron-builder](https://www.electron.build/) prerequisites

## Quick start

```bash
git clone https://github.com/noumanshakeil/code-review-assistant.git
cd code-review-assistant
npm install
npm run dev
```

Or one shot:

```bash
bash scripts/install.sh
```

`npm run dev` starts Vite on **http://127.0.0.1:43127** and launches Electron.

### API keys

1. On first open, pick a provider and paste its API key.
2. Click **Load models**, choose a model, then **Save & continue**.
3. Re-open anytime via **Models & keys**.
4. Optional env fallbacks: copy `.env.example` → `.env`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite development |
| `npm run build` | Typecheck + production build |
| `npm run build:win` | Windows NSIS + portable `.exe` |
| `npm run build:msix` | Windows AppX/MSIX |
| `npm run smoke` | Headless ingest / confirm-guard checks |
| `npm start` | Run packaged build |

## Layout

```
electron/           Main process (ingest, git, LLM, secure store, IPC)
src/                React UI (file tree, modes, Models & keys dialog)
  shared/types.ts   Shared contracts
```

Mutations go through `mutate:apply` with explicit confirmation — silent file writes are rejected.

## License

MIT
