import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GpuBackend, LlmMessage, LlmResponse, LocalModelSettings } from '../../src/shared/types'

let activeJobs = 0

function waitForSlot(maxConcurrent: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (activeJobs < Math.max(1, maxConcurrent)) {
        activeJobs += 1
        resolve()
      } else {
        setTimeout(tick, 120)
      }
    }
    tick()
  })
}

function releaseSlot(): void {
  activeJobs = Math.max(0, activeJobs - 1)
}

function resolveThreads(settings: LocalModelSettings): number {
  const cores = os.cpus().length || 4
  // Cap to leave headroom so inference does not hard-lock the machine
  const safeMax = Math.max(1, cores - 1)
  return Math.max(1, Math.min(settings.cpuThreads || 2, safeMax, 12))
}

function resolveGpuLayers(settings: LocalModelSettings): number {
  if (settings.backend === 'cpu') return 0
  return Math.max(0, Math.min(settings.gpuLayers ?? 20, 99))
}

function envForBackend(backend: GpuBackend): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (backend === 'cpu') {
    env.CUDA_VISIBLE_DEVICES = ''
    env.GGML_VK_DISABLE = '1'
  } else if (backend === 'vulkan') {
    env.GGML_VK_VISIBLE_DEVICES = env.GGML_VK_VISIBLE_DEVICES || '0'
  } else if (backend === 'cuda') {
    env.CUDA_VISIBLE_DEVICES = env.CUDA_VISIBLE_DEVICES || '0'
  }
  return env
}

function messagesToPrompt(messages: LlmMessage[]): string {
  return messages.map((m) => `<|${m.role}|>\n${m.content}`).join('\n') + '\n<|assistant|>\n'
}

async function callOllama(settings: LocalModelSettings, messages: LlmMessage[]): Promise<LlmResponse> {
  const base = (settings.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const model = settings.ollamaModel || 'llama3.2'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          num_thread: resolveThreads(settings),
          num_gpu: settings.backend === 'cpu' ? 0 : resolveGpuLayers(settings),
          num_ctx: settings.contextSize || 4096,
        },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama error ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = (await res.json()) as { message?: { content?: string } }
    return {
      content: data.message?.content || '',
      provider: 'ollama',
      model,
      mocked: false,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function callLlamaCpp(settings: LocalModelSettings, messages: LlmMessage[]): Promise<LlmResponse> {
  const bin = settings.llamaCppBin || process.env.LLAMA_CPP_BIN || 'llama-cli'
  const model = settings.modelPath || process.env.LLAMA_CPP_MODEL
  if (!model || !fs.existsSync(model)) {
    throw new Error('llama.cpp model path is missing. Set Local Model path in Settings.')
  }
  if (!bin) throw new Error('llama.cpp binary path is missing.')

  const prompt = messagesToPrompt(messages)
  const promptFile = path.join(os.tmpdir(), `cra-prompt-${Date.now()}.txt`)
  fs.writeFileSync(promptFile, prompt, 'utf8')

  const args = [
    '-m',
    model,
    '-f',
    promptFile,
    '-n',
    '1024',
    '-c',
    String(settings.contextSize || 4096),
    '-t',
    String(resolveThreads(settings)),
    '-ngl',
    String(resolveGpuLayers(settings)),
    '--no-display-prompt',
  ]

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, {
        env: envForBackend(settings.backend),
        shell: false,
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('llama.cpp timed out'))
      }, 240_000)
      child.stdout.on('data', (d) => {
        stdout += String(d)
      })
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0 || stdout.trim()) resolve(stdout.trim())
        else reject(new Error(stderr.slice(0, 500) || `llama.cpp exited ${code}`))
      })
    })
    return { content, provider: 'llamacpp', model: path.basename(model), mocked: false }
  } finally {
    try {
      fs.unlinkSync(promptFile)
    } catch {
      /* ignore */
    }
  }
}

export async function runLocalInference(
  kind: 'ollama' | 'llamacpp',
  settings: LocalModelSettings,
  messages: LlmMessage[],
): Promise<LlmResponse> {
  await waitForSlot(settings.maxConcurrent ?? 1)
  try {
    if (kind === 'ollama') return await callOllama(settings, messages)
    return await callLlamaCpp(settings, messages)
  } finally {
    releaseSlot()
  }
}

export async function probeOllama(baseUrl: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const base = baseUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` }
    const data = (await res.json()) as { models?: { name: string }[] }
    return { ok: true, models: (data.models || []).map((m) => m.name) }
  } catch (err) {
    return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) }
  }
}
