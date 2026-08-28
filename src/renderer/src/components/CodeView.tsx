import { memo, type JSX } from 'react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/**
 * Source view for the File Preview tab (screenshot 08): one line per row with
 * a line-number gutter and the app's highlight.js theme. Registered languages
 * cover the extensions coding agents actually touch; anything else renders as
 * plain text. Line highlighting is memoized per row so "Show more" only pays
 * for the newly revealed lines (large-file policy).
 */

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('go', go)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('php', php)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  diff: 'diff',
  patch: 'diff'
}

/** Highlight.js language for a filename, or null for plain text. */
export function languageForName(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot === -1 || dot === name.length - 1) return name === 'Dockerfile' ? 'bash' : null
  return EXTENSION_LANGUAGE[name.slice(dot + 1).toLowerCase()] ?? null
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** HTML for one source line — escaped plain text when no language matches. */
function highlightLine(text: string, language: string | null): string {
  if (text === '') return ''
  if (language === null) return escapeHtml(text)
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(text)
  }
}

const CodeLine = memo(function CodeLine({ number, text, language }: { number: number; text: string; language: string | null }): JSX.Element {
  return (
    <div className="code-line">
      <span className="code-gutter">{number}</span>
      <code className="code-text" dangerouslySetInnerHTML={{ __html: highlightLine(text, language) }} />
    </div>
  )
})

interface CodeViewProps {
  text: string
  name: string
  /** How many lines to render (large-file window from the tab state). */
  visibleLines: number
  totalLines: number
  /** Soft-wrap long lines; false = truncate with horizontal scroll. */
  wrap: boolean
}

export default function CodeView({ text, name, visibleLines, totalLines, wrap }: CodeViewProps): JSX.Element {
  const language = languageForName(name)
  // Same trailing-newline convention as the reader's totalLines: a final
  // newline does not open an extra row, and the empty file has no rows.
  const lines = text === '' ? [] : (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
  const visible = Math.min(visibleLines, lines.length)

  return (
    <div className={wrap ? 'code-view code-view-wrap' : 'code-view'} role="figure" aria-label={`Source of ${name}`}>
      {lines.slice(0, visible).map((line, index) => (
        <CodeLine key={index + 1} number={index + 1} text={line} language={language} />
      ))}
      {totalLines > visible && (
        <div className="code-view-footer">
          Showing {visible} of {totalLines} lines
        </div>
      )}
    </div>
  )
}
