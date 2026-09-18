import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import type { AgentCliStatus, LlmMessage, LlmResponse, ProviderId } from '../../src/shared/types'

const CANDIDATES: Record<AgentCliStatus['id'], { name: string; bins: string[] }> = {
  'cursor-cli': { name: 'Cursor Agent CLI', bins: ['cursor-agent', 'cursor', 'agent'] },
  'claude-code': { name: 'Claude Code', bins: ['claude', 'claude-code'] },
  codex: { name: 'OpenAI Codex CLI', bins: ['codex'] },
}

async function which(bin: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const child = spawn(cmd, [bin], { shell: false })
    let out = ''
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.on('close', (code) => {
      if (code === 0) {
        const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
        resolve(first)
      } else resolve(undefined)
    })
    child.on('error', () => resolve(undefined))
  })
}

async function versionOf(binPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(binPath, ['--version'], { shell: false })
    let out = ''
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.stderr.on('data', (d) => {
      out += String(d)
    })
    child.on('close', () => {
      const line = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      resolve(line?.slice(0, 80))
    })
    child.on('error', () => resolve(undefined))
  })
}

export async function detectAgentClis(): Promise<AgentCliStatus[]> {
  const results: AgentCliStatus[] = []
  for (const [id, meta] of Object.entries(CANDIDATES) as [AgentCliStatus['id'], (typeof CANDIDATES)[AgentCliStatus['id']]][]) {
    let found: string | undefined
    for (const bin of meta.bins) {
      found = await which(bin)
      if (found) {
        try {
          await access(found, constants.X_OK)
        } catch {
          found = undefined
          continue
        }
        break
      }
    }
    results.push({
      id,
      name: meta.name,
      available: Boolean(found),
      path: found,
      version: found ? await versionOf(found) : undefined,
    })
  }
  return results
}

function messagesToPrompt(messages: LlmMessage[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join('\n\n')
}

async function runCli(bin: string, args: string[], input?: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: false,
      env: { ...process.env },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)
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
      if (code === 0 || stdout.trim()) resolve(stdout.trim() || stderr.trim())
      else reject(new Error(stderr.trim() || `CLI exited with code ${code}`))
    })
    if (input) {
      child.stdin.write(input)
      child.stdin.end()
    } else {
      child.stdin.end()
    }
  })
}

export async function invokeAgentCli(
  provider: Extract<ProviderId, 'cursor-cli' | 'claude-code' | 'codex'>,
  messages: LlmMessage[],
): Promise<LlmResponse> {
  const status = (await detectAgentClis()).find((s) => s.id === provider)
  if (!status?.available || !status.path) {
    throw new Error(`${provider} CLI not found on PATH. Install it or choose another provider.`)
  }
  const prompt = messagesToPrompt(messages)
  let content = ''
  if (provider === 'claude-code') {
    content = await runCli(status.path, ['-p', prompt, '--output-format', 'text'])
  } else if (provider === 'codex') {
    content = await runCli(status.path, ['exec', '--skip-git-repo-check', prompt])
  } else {
    // cursor-agent / cursor: try non-interactive print modes, fall back to stdin prompt
    try {
      content = await runCli(status.path, ['agent', '-p', prompt, '--output-format', 'text'])
    } catch {
      content = await runCli(status.path, ['-p', prompt], prompt)
    }
  }
  return { content, provider, model: status.name, mocked: false }
}
