/**
 * Rich-text (Markdown subset) rendering for email templates.
 *
 * Template bodies are stored as plain text with lightweight Markdown:
 *   **bold**   *italic* / _italic_   [label](https://link)   bare URLs
 *   # / ## / ### headings   - bullet lists   1. numbered lists
 *
 * `renderEmailMarkdown` turns that into email-client-safe HTML: input is
 * HTML-escaped first (never trust template content), links are restricted to
 * http/https, and all styling is inline. Pure — shared by the server email
 * builders and the client-side template previews.
 */

const LINK_STYLE = 'color:#2563eb;text-decoration:underline;'

/** Placeholder delimiter for stashed link HTML; stripped from input first. */
const TOKEN_DELIM = '\u0000'

export function escapeEmailHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Inline formatting for one already-escaped line: links, bold, italic. */
function renderInline(escaped: string): string {
  // Pull links out as placeholder tokens so bold/italic passes can't mangle
  // URLs (e.g. underscores inside a URL becoming <em>).
  const tokens: string[] = []
  const stash = (html: string): string => {
    tokens.push(html)
    return `${TOKEN_DELIM}${tokens.length - 1}${TOKEN_DELIM}`
  }

  let out = escaped
  // [label](https://url) — http/https only. The text is already escaped, so a
  // quote in the URL arrives as &quot; and can't break out of the attribute.
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) =>
    stash(`<a href="${url}" target="_blank" rel="noopener noreferrer" style="${LINK_STYLE}">${label}</a>`))
  // Bare URLs (trailing punctuation stays outside the link).
  out = out.replace(/https?:\/\/[^\s<\u0000]*[^\s<.,;:!?)\u0000]/g, url =>
    stash(`<a href="${url}" target="_blank" rel="noopener noreferrer" style="${LINK_STYLE}word-break:break-all;">${url}</a>`))

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')

  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => tokens[Number(i)]!)
}

/** Render a template body (Markdown subset) to email-safe HTML. */
export function renderEmailMarkdown(text: string): string {
  // Strip the placeholder delimiter so user text can never collide with it.
  const cleaned = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n')
  const lines = escapeEmailHtml(cleaned).split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean, items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p style="margin:0 0 12px;">${paragraph.join('<br />')}</p>`)
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul'
      const items = list.items.map(i => `<li style="margin:0 0 4px;">${i}</li>`).join('')
      // list-style inline so markers survive CSS resets (app preview included).
      blocks.push(`<${tag} style="margin:0 0 12px;padding-left:24px;list-style:${list.ordered ? 'decimal' : 'disc'};">${items}</${tag}>`)
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)

    if (!line.trim()) {
      flushParagraph()
      flushList()
    }
    else if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1]!.length
      const size = level === 1 ? 20 : level === 2 ? 17 : 15
      blocks.push(`<h${level} style="margin:0 0 12px;font-size:${size}px;font-weight:600;color:#09090b;">${renderInline(heading[2]!)}</h${level}>`)
    }
    else if (bullet || numbered) {
      flushParagraph()
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push(renderInline((bullet ?? numbered)![1]!))
    }
    else {
      flushList()
      paragraph.push(renderInline(line))
    }
  }
  flushParagraph()
  flushList()

  return blocks.join('\n')
}
