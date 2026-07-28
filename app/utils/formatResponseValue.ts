/**
 * Render a stored question answer for display in the dashboard.
 *
 * Answers are JSONB, so the shape follows the question type: string, string[],
 * number, boolean, or — for `rating` grids — a { row label → score } map.
 */
export function formatResponseValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '—'
    return entries.map(([row, score]) => `${row}: ${score}`).join(' · ')
  }
  return String(value)
}
