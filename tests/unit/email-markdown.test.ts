import { describe, it, expect } from 'vitest'
import { renderEmailMarkdown } from '../../shared/email-markdown'

describe('renderEmailMarkdown', () => {
  it('escapes HTML in the source text', () => {
    const html = renderEmailMarkdown('<script>alert(1)</script> & "quotes"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('renders bold and italic', () => {
    const html = renderEmailMarkdown('a **bold** and *italic* and _also italic_ word')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<em>also italic</em>')
  })

  it('renders markdown links, http/https only', () => {
    const html = renderEmailMarkdown('See [our site](https://example.com/a) and [bad](javascript:alert(1))')
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('>our site</a>')
    expect(html).not.toContain('href="javascript:')
  })

  it('autolinks bare URLs without letting italic mangle underscores', () => {
    const html = renderEmailMarkdown('Book here: https://x.test/a_b_c today')
    expect(html).toContain('href="https://x.test/a_b_c"')
    expect(html).not.toContain('<em>b</em>')
  })

  it('keeps template placeholders intact', () => {
    const html = renderEmailMarkdown('Dear {{candidateFirstName}},')
    expect(html).toContain('{{candidateFirstName}}')
  })

  it('renders headings', () => {
    const html = renderEmailMarkdown('# Big\n## Medium\n### Small')
    expect(html).toContain('<h1')
    expect(html).toContain('>Big</h1>')
    expect(html).toContain('>Medium</h2>')
    expect(html).toContain('>Small</h3>')
  })

  it('renders bullet and numbered lists', () => {
    const html = renderEmailMarkdown('- one\n- two\n\n1. first\n2. second')
    expect(html).toContain('<ul')
    expect(html).toContain('<li style="margin:0 0 4px;">one</li>')
    expect(html).toContain('<ol')
    expect(html).toContain('<li style="margin:0 0 4px;">first</li>')
  })

  it('separates paragraphs on blank lines and keeps single line breaks', () => {
    const html = renderEmailMarkdown('line one\nline two\n\nnext para')
    expect(html).toContain('line one<br />line two')
    expect((html.match(/<p /g) ?? []).length).toBe(2)
  })

  it('leaves plain numbers alone (no token collisions)', () => {
    const html = renderEmailMarkdown('You have 3 days and 0 excuses: https://x.test/y')
    expect(html).toContain('You have 3 days and 0 excuses')
    expect(html).toContain('href="https://x.test/y"')
  })

  it('renders the built-in interview template shape sensibly', () => {
    const html = renderEmailMarkdown('Interview Details:\n- Date: {{interviewDate}}\n- Time: {{interviewTime}}\n\nBest regards,\n{{organizationName}}')
    expect(html).toContain('<li style="margin:0 0 4px;">Date: {{interviewDate}}</li>')
    expect(html).toContain('Best regards,<br />{{organizationName}}')
  })
})
