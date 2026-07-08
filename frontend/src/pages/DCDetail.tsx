import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDate, formatDateTime } from '../utils/dates'

const PIN_KEY = 'dc_pipeline_pin'

const REMARK_LABEL: Record<string, string> = {
  incorrect_qty:      'Incorrect Quantity',
  incorrect_free_qty: 'Incorrect Free Quantity',
  incorrect_batch:    'Incorrect Batch Number',
  missing_product:    'Missing Product',
  near_expiry:        'Near Expiry',
}

interface DCRecord {
  id: number
  dc_number: string
  supplier_name: string
  status: string
  stage1_skipped: number
  invoice_date: string | null
  num_items: number | null
  stage1_by_name: string | null
  stage1_done_at: string | null
  stage2_by_name: string | null
  stage2_done_at: string | null
  remarks: string[]
  created_at: string
}

interface Photo {
  id: number
  photo_type: string
  file_path: string | null
  uploaded_at: string
  uploaded_by_name: string | null
}

const PHOTO_TYPE_LABEL: Record<string, string> = {
  package:   'Package',
  invoice:   'Invoice',
  corrected: 'Corrected DC',
}

export default function DCDetail() {
  const { id } = useParams<{ id: string }>()
  const pin = sessionStorage.getItem(PIN_KEY) ?? ''

  const [record, setRecord] = useState<DCRecord | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pin || !id) return
    setLoading(true)
    setError('')
    fetch(`/dashboard/dc/${id}?pin=${encodeURIComponent(pin)}`)
      .then(async res => {
        if (res.status === 403) throw new Error('Invalid PIN — go back and unlock the dashboard.')
        if (res.status === 404) throw new Error('DC record not found.')
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.json()
      })
      .then(data => {
        setRecord(data.record)
        setPhotos(data.photos ?? [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id, pin])

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

  return (
    <div className="page">
      <Header />
      <div className="dashboard-content" style={{ maxWidth: 640 }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 56 }}>
            <span className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        )}

        {error && (
          <div className="banner banner-error">{error}</div>
        )}

        {!loading && record && (
          <>
            {/* DC header */}
            <div className="dc-info-bar" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>DC {record.dc_number} &nbsp;·&nbsp; {record.supplier_name}</span>
              <span className={`pill ${record.status === 'stage2' ? 'pill-success' : 'pill-accent'}`}>
                {record.status === 'stage2' ? 'Verified' : 'Checking done'}
              </span>
            </div>

            {/* DC Info */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">DC Info</div>
              <div className="card-body" style={{ padding: '8px 16px' }}>
                <InfoRow label="Invoice Date" value={formatDate(record.invoice_date)} />
                <InfoRow label="No. of Items" value={record.num_items != null ? String(record.num_items) : '—'} />
                <InfoRow label="Created" value={formatDateTime(record.created_at)} last />
              </div>
            </div>

            {/* Stage 1 */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                Stage 1 — Item Checking
                {!!record.stage1_skipped && (
                  <span className="pill pill-warning">Skipped</span>
                )}
              </div>
              <div className="card-body" style={{ padding: '8px 16px' }}>
                {record.stage1_skipped ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
                    Stage 1 was skipped.
                  </p>
                ) : record.stage1_by_name ? (
                  <>
                    <InfoRow label="Checked By" value={record.stage1_by_name} />
                    <InfoRow label="Done At" value={formatDateTime(record.stage1_done_at)} last />
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
                    Not completed yet.
                  </p>
                )}
              </div>
            </div>

            {/* Stage 2 */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">Stage 2 — Item Verification</div>
              <div className="card-body" style={{ padding: '8px 16px' }}>
                {record.stage2_by_name ? (
                  <>
                    <InfoRow label="Verified By" value={record.stage2_by_name} />
                    <InfoRow label="Done At" value={formatDateTime(record.stage2_done_at)} last />
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
                    Not completed yet.
                  </p>
                )}
              </div>
            </div>

            {/* Remarks */}
            {record.remarks.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">Remarks</div>
                <div className="card-body">
                  <div className="remark-chips">
                    {record.remarks.map(r => (
                      <span key={r} className="remark-chip">{REMARK_LABEL[r] ?? r}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Photos */}
            <div className="card" style={{ marginBottom: 32 }}>
              <div className="card-header">
                Photos
                <span className="card-header-meta">{photos.length} total</span>
              </div>
              {photos.length === 0 ? (
                <div className="card-body">
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No photos on record.</p>
                </div>
              ) : (
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {(['package', 'invoice', 'corrected'] as const).map(type => {
                    const group = photos.filter(p => p.photo_type === type)
                    if (group.length === 0) return null
                    return (
                      <div key={type}>
                        <p style={{
                          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
                        }}>
                          {PHOTO_TYPE_LABEL[type]}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                          {group.map(p => (
                            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                              {p.file_path ? (
                                <div className="photo-thumb">
                                  <img src={`/photos/${p.id}`} alt="" loading="lazy" />
                                </div>
                              ) : (
                                <div className="photo-thumb" style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--surface-2)',
                                }}>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
                                    textAlign: 'center', padding: '0 6px',
                                  }}>
                                    EXPIRED
                                  </span>
                                </div>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                                {formatDate(p.uploaded_at)}
                              </span>
                              {p.uploaded_by_name && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {p.uploaded_by_name}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="page-header">
      <Link to="/dashboard/filters" className="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Link>
      <h1>DC Detail</h1>
    </header>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
