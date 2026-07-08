import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { thisWeekRange, formatDate } from '../utils/dates'

const PIN_KEY = 'dc_pipeline_pin'

const REMARKS_OPTIONS = [
  { value: 'incorrect_qty',      label: 'Incorrect Qty' },
  { value: 'incorrect_free_qty', label: 'Incorrect Free Qty' },
  { value: 'incorrect_batch',    label: 'Incorrect Batch' },
  { value: 'missing_product',    label: 'Missing Product' },
  { value: 'near_expiry',        label: 'Near Expiry' },
]

const REMARK_LABEL: Record<string, string> = Object.fromEntries(
  REMARKS_OPTIONS.map(o => [o.value, o.label])
)

interface Supplier { id: number; name: string }
interface Employee { id: number; name: string }

interface FilterRecord {
  id: number
  dc_number: string
  supplier_name: string
  invoice_date: string | null
  num_items: number | null
  status: string
  stage1_skipped: number
  remarks: string[]
  stage1_by_name: string | null
  stage2_by_name: string | null
  created_at: string
}

export default function Filters() {
  const pin = sessionStorage.getItem(PIN_KEY) ?? ''

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  const [fromDate, setFromDate] = useState(() => thisWeekRange()[0])
  const [toDate, setToDate] = useState(() => thisWeekRange()[1])
  const [dcNumber, setDcNumber] = useState('')
  const [selectedRemarks, setSelectedRemarks] = useState<string[]>([])
  const [supplierId, setSupplierId] = useState<string>('')
  const [status, setStatus] = useState<string>('all')
  const [stage1Skipped, setStage1Skipped] = useState<string>('all')
  const [employeeId, setEmployeeId] = useState<string>('')

  const [results, setResults] = useState<FilterRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  useEffect(() => {
    if (!pin) return
    fetch('/suppliers').then(r => r.json()).then(d => setSuppliers(d.suppliers ?? [])).catch(() => {})
    fetch('/employees').then(r => r.json()).then(d => setEmployees(d.employees ?? [])).catch(() => {})
  }, [pin])

  if (!pin) {
    return (
      <div className="page">
        <Header />
        <div className="content" style={{ paddingTop: 40, textAlign: 'center' }}>
          <div className="banner banner-warning" style={{ justifyContent: 'center', marginBottom: 20 }}>
            Please unlock the Dashboard first.
          </div>
          <Link to="/dashboard" className="btn btn-primary" style={{ maxWidth: 200 }}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const handleRemarkToggle = (v: string) => {
    setSelectedRemarks(prev => prev.includes(v) ? prev.filter(r => r !== v) : [...prev, v])
  }

  const buildUrl = () => {
    const params = new URLSearchParams({ pin, from: fromDate, to: toDate })
    if (dcNumber.trim()) params.set('dc_number', dcNumber.trim())
    if (status !== 'all') params.set('status', status)
    if (stage1Skipped !== 'all') params.set('stage1_skipped', stage1Skipped === 'yes' ? 'true' : 'false')
    if (supplierId) params.set('supplier_id', supplierId)
    if (employeeId) params.set('employee_id', employeeId)
    selectedRemarks.forEach(r => params.append('remark', r))
    return `/dashboard/filters?${params.toString()}`
  }

  const handleSearch = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(buildUrl())
      if (res.status === 403) { setError('Invalid PIN — please re-authenticate.'); return }
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setResults(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      const res = await fetch(
        `/dashboard/dc/${id}?pin=${encodeURIComponent(pin)}`,
        { method: 'DELETE' }
      )
      if (res.status === 403) { setError('Invalid PIN.'); return }
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setResults(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="page">
      <Header />

      <div className="dashboard-content">

        {/* Filters panel */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">Filters</div>
          <div className="card-body">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              marginBottom: 16,
            }}>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label">DC Number</label>
                <input
                  type="text"
                  placeholder="e.g. 18409"
                  value={dcNumber}
                  onChange={e => setDcNumber(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label" style={{ color: dcNumber ? 'var(--text-muted)' : undefined }}>
                  From {dcNumber && <span style={{ fontWeight: 400 }}>(ignored)</span>}
                </label>
                <input type="date" value={fromDate} disabled={!!dcNumber} onChange={e => setFromDate(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label" style={{ color: dcNumber ? 'var(--text-muted)' : undefined }}>
                  To {dcNumber && <span style={{ fontWeight: 400 }}>(ignored)</span>}
                </label>
                <input type="date" value={toDate} disabled={!!dcNumber} onChange={e => setToDate(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label">Supplier</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                  <option value="">All suppliers</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="all">All</option>
                  <option value="stage1">Checking done</option>
                  <option value="stage2">Verified</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label">Stage 1 Skipped</label>
                <select value={stage1Skipped} onChange={e => setStage1Skipped(e.target.value)}>
                  <option value="all">All</option>
                  <option value="yes">Yes (skipped)</option>
                  <option value="no">No (done)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="field-label">Employee</label>
                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                  <option value="">All employees</option>
                  {employees.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
                </select>
              </div>
            </div>

            {/* Remarks filter */}
            <div>
              <label className="field-label" style={{ display: 'block', marginBottom: 8 }}>
                Remark type (any of selected)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {REMARKS_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      border: `1.5px solid ${selectedRemarks.includes(opt.value) ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      background: selectedRemarks.includes(opt.value) ? 'var(--accent-light)' : 'var(--surface)',
                      color: selectedRemarks.includes(opt.value) ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'all var(--t)',
                      userSelect: 'none',
                      minHeight: 36,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRemarks.includes(opt.value)}
                      onChange={() => handleRemarkToggle(opt.value)}
                      style={{ display: 'none' }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? <><span className="spinner" /> Searching…</> : 'Search'}
            </button>
          </div>
        </div>

        {error && <div className="banner banner-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Results */}
        {results.length > 0 && (
          <div className="card">
            <div className="card-header">
              Results
              <span className="card-header-meta">
                {results.length} record{results.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>DC#</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'center' }}>Items</th>
                    <th>Stage 1 by</th>
                    <th>Stage 2 by</th>
                    <th>Remarks</th>
                    <th style={{ textAlign: 'center' }}>S1 skip</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        <Link
                          to={`/dashboard/dc/${row.id}`}
                          style={{ color: 'var(--accent)', textDecoration: 'none' }}
                        >
                          {row.dc_number}
                        </Link>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 160, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.supplier_name}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {formatDate(row.invoice_date)}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{row.num_items ?? '—'}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.stage1_by_name ?? '—'}
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.stage2_by_name ?? '—'}
                      </td>
                      <td>
                        <div className="remark-chips">
                          {(row.remarks ?? []).map(r => (
                            <span key={r} className="remark-chip">
                              {REMARK_LABEL[r] ?? r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.stage1_skipped
                          ? <span className="pill pill-warning">Yes</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`pill ${row.status === 'stage2' ? 'pill-success' : 'pill-accent'}`}>
                          {row.status === 'stage2' ? 'Verified' : 'Checking'}
                        </span>
                      </td>
                      <td>
                        {confirmDeleteId === row.id ? (
                          <div style={{ display: 'flex', gap: 4, whiteSpace: 'nowrap' }}>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={deletingId === row.id}
                              onClick={() => handleDelete(row.id)}
                            >
                              {deletingId === row.id ? '…' : 'Confirm'}
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDeleteId(row.id)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && results.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '48px 0',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ margin: '0 auto', display: 'block', color: 'var(--border-strong)' }}>
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            Run a search to see results
          </div>
        )}
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="page-header">
      <Link to="/dashboard" className="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Link>
      <h1>Filter Records</h1>
    </header>
  )
}
