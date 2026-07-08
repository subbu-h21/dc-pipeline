export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function todayRange(): [string, string] {
  const t = toDateStr(new Date())
  return [t, t]
}

export function thisWeekRange(): [string, string] {
  const today = new Date()
  const day = today.getDay() // 0=Sun
  const daysFromMon = day === 0 ? 6 : day - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMon)
  return [toDateStr(monday), toDateStr(today)]
}

export function thisMonthRange(): [string, string] {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  return [toDateStr(first), toDateStr(today)]
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
