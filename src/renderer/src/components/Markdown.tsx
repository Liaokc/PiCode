import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { JSX } from 'react'

/**
 * Markdown rendering for assistant text parts (screenshot 04: rich markdown
 * with highlighted code). Streams render incrementally — partial markdown is
 * simply re-parsed on each delta. While `streaming`, a blinking caret follows
 * the last rendered block (CSS ::after).
 */
export default function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }): JSX.Element {
  return (
    <div className={streaming ? 'md md-streaming' : 'md'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
