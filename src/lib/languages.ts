import type { LanguageId } from '@/shared/types'

export const LANGUAGE_OPTIONS: { id: LanguageId; label: string; ext: string }[] = [
  { id: 'javascript', label: 'JavaScript', ext: 'js' },
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'go', label: 'Go', ext: 'go' },
  { id: 'rust', label: 'Rust', ext: 'rs' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'c', label: 'C', ext: 'c' },
  { id: 'cpp', label: 'C++', ext: 'cpp' },
  { id: 'csharp', label: 'C#', ext: 'cs' },
  { id: 'kotlin', label: 'Kotlin', ext: 'kt' },
  { id: 'swift', label: 'Swift', ext: 'swift' },
  { id: 'ruby', label: 'Ruby', ext: 'rb' },
  { id: 'php', label: 'PHP', ext: 'php' },
  { id: 'scala', label: 'Scala', ext: 'scala' },
  { id: 'lua', label: 'Lua', ext: 'lua' },
  { id: 'shell', label: 'Shell', ext: 'sh' },
  { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'html', label: 'HTML', ext: 'html' },
  { id: 'css', label: 'CSS', ext: 'css' },
  { id: 'json', label: 'JSON', ext: 'json' },
  { id: 'yaml', label: 'YAML', ext: 'yml' },
  { id: 'markdown', label: 'Markdown', ext: 'md' },
  { id: 'plaintext', label: 'Plain text', ext: 'txt' },
]

export const SUPPORTED_LANGUAGES: LanguageId[] = LANGUAGE_OPTIONS.map((l) => l.id)

export function extensionForLanguage(language: LanguageId): string {
  return LANGUAGE_OPTIONS.find((l) => l.id === language)?.ext ?? 'txt'
}

export function labelForLanguage(language: LanguageId): string {
  return LANGUAGE_OPTIONS.find((l) => l.id === language)?.label ?? language
}

/** Monaco editor language ids */
export function monacoLanguage(language: LanguageId): string {
  switch (language) {
    case 'csharp':
      return 'csharp'
    case 'plaintext':
      return 'plaintext'
    case 'shell':
      return 'shell'
    default:
      return language
  }
}
