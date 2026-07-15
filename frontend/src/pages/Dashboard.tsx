import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { todayRange, thisWeekRange, thisMonthRange, toDateStr } from '../utils/dates'

const PIN_KEY = 'dc_pipeline_pin'

interface LeaderboardEntry {
  name: string
  stage1_pts: number
  stage2_pts: number
  stage3_pts: number
  total_pts: number
}

interface SupplierRow {
  supplier: string
  total_dcs: number
  dcs_with_remarks: number
  rate_pct: number
}

interface Summary {
  total_dcs: number
  dcs_with_remarks: number
  stage1_skipped_count: number
  active_employees: number
  employee_leaderboard: LeaderboardEntry[]
  supplier_correction_rate: SupplierRow[]
}

type RangeKey = 'today' | 'week' | 'month' | 'custom'

export default function Dashboard() {
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [authenticated, setAuthenticated] = useState(() => !!sessionStorage.getItem(PIN_KEY))

  const [rangeKey, setRangeKey] = useState<RangeKey>('week')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))

  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const getRange = (): [string, string] => {
    if (rangeKey === 'today') return todayRange()
    if (rangeKey === 'week') return thisWeekRange()
    if (rangeKey === 'month') return thisMonthRange()
    return [customFrom, customTo]
  }

  const fetchSummary = useCallback(async (p: string) => {
    setLoading(true); setError('')
    const [from, to] = getRange()
    try {
      const res = await fetch(
        `/dashboard/summary?pin=${encodeURIComponent(p)}&from=${from}&to=${to}`
      )
      if (res.status === 403) {
        sessionStorage.removeItem(PIN_KEY)
        setAuthenticated(false)
        setPin('')
        setPinError('Invalid PIN.')
        return
      }
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setSummary(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [rangeKey, customFrom, customTo])

  useEffect(() => {
    if (authenticated && pin) fetchSummary(pin)
  }, [authenticated, pin, rangeKey, customFrom, customTo])

  const handlePinSubmit = () => {
    if (pinInput.length !== 6) { setPinError('Enter a 6-digit PIN.'); return }
    sessionStorage.setItem(PIN_KEY, pinInput)
    setPin(pinInput)
    setAuthenticated(true)
    setPinError('')
    fetchSummary(pinInput)
  }

  /* ── PIN gate ── */
  if (!authenticated) {
    return (
      <div className="pin-gate">
        <div className="pin-box">
          <div className="pin-box-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2>Dashboard</h2>
          <p>Enter your 6-digit PIN to continue</p>
          <input
            className="pin-input"
            type="password"
            maxLength={6}
            inputMode="numeric"
            placeholder="••••••"
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
            autoFocus
          />
          {pinError && (
            <div className="banner banner-error" style={{ marginBottom: 4, width: '100%' }}>{pinError}</div>
          )}
          <button className="btn btn-primary" onClick={handlePinSubmit}>Unlock</button>
        </div>
      </div>
    )
  }

  const [from, to] = getRange()

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1>Dashboard</h1>
        <Link to="/dashboard/filters"
          style={{
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 600,
            textDecoration: 'none',
            marginLeft: 'auto',
            padding: '6px 0',
          }}>
          Filters →
        </Link>
      </header>

      <div className="dashboard-content">

        {/* Date range tabs */}
        <div className="range-tabs" style={{ marginBottom: 20 }}>
          {(['today', 'week', 'month', 'custom'] as RangeKey[]).map(k => (
            <button
              key={k}
              className={`range-tab${rangeKey === k ? ' active' : ''}`}
              onClick={() => setRangeKey(k)}
            >
              {k === 'today' ? 'Today' : k === 'week' ? 'This Week' : k === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>

        {rangeKey === 'custom' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ width: 'auto', flex: '1 1 140px' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ width: 'auto', flex: '1 1 140px' }} />
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 56 }}>
            <span className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        )}

        {error && <div className="banner banner-error" style={{ marginBottom: 20 }}>{error}</div>}

        {!loading && summary && (
          <>
            {/* Stat cards */}
            <div className="stats-grid">
              <StatCard
                value={summary.total_dcs}
                label="Total DCs"
                sub={`${from} → ${to}`}
                accentColor="var(--accent)"
              />
              <StatCard
                value={summary.dcs_with_remarks}
                label="With Discrepancies"
                sub={summary.total_dcs > 0
                  ? `${Math.round(summary.dcs_with_remarks / summary.total_dcs * 100)}% of total`
                  : '0% of total'}
                color="var(--warning)"
                accentColor="var(--warning)"
              />
              <StatCard
                value={summary.stage1_skipped_count}
                label="Stage 1 Skipped"
                color="var(--error)"
                accentColor="var(--error)"
              />
              <StatCard
                value={summary.active_employees}
                label="Active Staff"
                color="var(--success)"
                accentColor="var(--success)"
              />
            </div>

            {/* Employee leaderboard */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">Employee Leaderboard</div>
              {summary.employee_leaderboard.length === 0 ? (
                <div className="card-body">
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity in this period.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Name</th>
                        <th style={{ textAlign: 'center' }}>Stage 1</th>
                        <th style={{ textAlign: 'center' }}>Stage 2</th>
                        <th style={{ textAlign: 'center' }}>Stage 3</th>
                        <th style={{ textAlign: 'center' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.employee_leaderboard.map((row, i) => (
                        <tr key={row.name}>
                          <td style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 14 }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                          </td>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {row.stage1_pts}
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {row.stage2_pts}
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {row.stage3_pts}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong style={{ color: 'var(--accent)', fontSize: 15 }}>
                              {row.total_pts}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Supplier correction rate */}
            <div className="card" style={{ marginBottom: 32 }}>
              <div className="card-header">Supplier Correction Rate</div>
              {summary.supplier_correction_rate.length === 0 ? (
                <div className="card-body">
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data in this period.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Supplier</th>
                        <th style={{ textAlign: 'center' }}>Total DCs</th>
                        <th style={{ textAlign: 'center' }}>With Issues</th>
                        <th style={{ textAlign: 'center' }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.supplier_correction_rate.map((row, i) => (
                        <tr key={row.supplier}>
                          <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ fontWeight: 500 }}>{row.supplier}</td>
                          <td style={{ textAlign: 'center' }}>{row.total_dcs}</td>
                          <td style={{ textAlign: 'center' }}>{row.dcs_with_remarks}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`pill ${
                              row.rate_pct >= 50 ? 'pill-error' :
                              row.rate_pct >= 20 ? 'pill-warning' : 'pill-success'
                            }`}>
                              {row.rate_pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Lock */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => {
                  sessionStorage.removeItem(PIN_KEY)
                  setAuthenticated(false)
                  setPin('')
                  setPinInput('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontFamily: 'inherit',
                }}
              >
                Lock dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({
  value,
  label,
  sub,
  color,
  accentColor,
}: {
  value: number
  label: string
  sub?: string
  color?: string
  accentColor?: string
}) {
  return (
    <div className="stat-card" style={accentColor ? { borderTopColor: accentColor } : {}}>
      <div className="stat-value" style={color ? { color } : {}}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
