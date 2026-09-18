# Code Review Assistant & Humanizer

AI-powered desktop app for ingesting code, reviewing it, humanizing style/identifiers, and proposing write/edit/delete mutations — **every mutation requires explicit confirmation**.

Built with **Electron + React + TypeScript + Vite**. Packages to Windows **NSIS `.exe`**, portable `.exe`, and **MSIX/AppX** (Microsoft Store path).

## Features

| Mode | Behavior |
|------|----------|
| **Ingest & wait** | Paste code or upload a folder (ignores `node_modules`, `.git`, `dist`, `build`, `vendor`, caches, binaries, …). App sits idle until you act. |
| **GitHub clone** | Clone public repos; private repos need a GitHub token. Same post-ingest idle flow. |
| **Review** | Multi-language code review via your configured provider. |
| **Humanize** | Rename/simplify identifiers and rewrite style to better pass common AI-detection heuristics; apply only after confirm. |
| **Write / edit / delete** | AI proposes mutations; nothing is applied until you confirm each change (native dialog + in-app confirm). |

**Languages:** JavaScript/TypeScript, Python, Go, Rust, Java, C/C++, C#, Kotlin, Swift, Ruby, PHP, Scala, Lua, Shell, SQL, HTML/CSS, JSON, YAML, Markdown, and plaintext fallback.

**Providers:** OpenAI, Anthropic, DeepSeek, Google Gemini, Mistral, Groq, Ollama, llama.cpp (GGUF with CUDA/Vulkan/CPU offload controls), plus optional **Cursor / Claude Code / Codex** CLIs when installed on PATH. Without keys, a real mock provider keeps flows usable.

**Secrets:** Stored via OS keychain (`keytar`) with AES-GCM encrypted file fallback under `~/.code-review-assistant/`. Never commit keys.

## Requirements

- Node.js 20+
- npm 10+
- For packaging Windows installers: Windows host (or CI) with [electron-builder](https://www.electron.build/) prerequisites
- Optional: Ollama or llama.cpp, and/or agent CLIs (`cursor` / `claude` / `codex`)

## Quick start

```bash
git clone <your-repo-url>
cd <repo>
cp .env.example .env   # optional env fallbacks for keys
npm install
npm run dev
```

`npm run dev` starts Vite on **http://127.0.0.1:43127** and launches the Electron shell with the desktop bridge.

### Configure keys

1. Open **Models & keys** in the app.
2. Choose a provider and model.
3. Paste API keys (stored securely on device).
4. Or set env vars from `.env.example` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`, …).
5. For local models: point Ollama URL/model or llama.cpp binary + GGUF path; tune GPU layers, CPU threads, and max concurrent jobs.

### Agent CLIs (optional keys)

If `cursor` / `cursor-agent`, `claude`, or `codex` are on your PATH, select them as the active provider. API keys become optional for those paths.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite development |
| `npm run build` | Typecheck + production renderer/main build |
| `npm run build:win` | Windows NSIS + portable `.exe` |
| `npm run build:msix` | Windows AppX/MSIX (Store packaging) |
| `npm run build:electron` | Package for current platform |
| `npm run smoke` | Headless ingest/review/humanize/mutate confirmation checks |
| `npm start` | Run packaged `dist-electron` main against `dist` |

Packaging config: [`electron-builder.yml`](./electron-builder.yml). Output lands in `release/`.

### Microsoft Store / MSIX notes

1. Update `appx.identityName`, `publisher`, and signing identity in `electron-builder.yml` to match your Partner Center account.
2. Run `npm run build:msix` on Windows.
3. Sign the AppX/MSIX with your Store certificate before upload.

## Architecture

```
electron/           Main process (ingest, git, LLM, secure store, IPC)
  services/         GitHub clone, review, humanize, mutate, local models, agent CLIs
src/                React UI
  shared/types.ts   Shared contracts
```

Mutations always go through `mutate:apply` with `confirmed: true` plus a native confirmation dialog — silent file changes are rejected.

## Security

- Do not commit `.env`, key files, or `~/.code-review-assistant/`
- Prefer short-lived GitHub PATs with `repo` scope only when cloning private repos
- Review humanized/mutated diffs before confirming apply

## License

MIT
