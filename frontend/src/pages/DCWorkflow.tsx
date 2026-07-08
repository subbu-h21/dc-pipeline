import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { checkBlur } from '../utils/blur'
import { formatDate, toDateStr } from '../utils/dates'

interface Supplier { id: number; name: string }
interface Employee { id: number; name: string }
interface Photo { id: number; photo_type: string; file_path: string | null }

interface PhotoItem {
  file: File
  preview: string
  type: 'package' | 'invoice' | 'corrected'
  blurry: boolean
  checking: boolean
}

interface DCRecord {
  id: number
  dc_number: string
  supplier_id: number
  supplier_name: string
  status: string
  stage1_by: number | null
  stage1_by_name: string | null
  stage1_done_at: string | null
  stage2_by: number | null
  stage2_by_name: string | null
  stage2_done_at: string | null
  invoice_date: string | null
  num_items: number | null
  remarks: string[]
}

interface BrowseItem {
  id: number
  dc_number: string
  supplier_id: number
  supplier_name: string
  status: string
  invoice_date: string | null
  created_at: string
}

const REMARKS_OPTIONS = [
  { value: 'incorrect_qty',      label: 'Incorrect Quantity' },
  { value: 'incorrect_free_qty', label: 'Incorrect Free Quantity' },
  { value: 'incorrect_batch',    label: 'Incorrect Batch Number' },
  { value: 'missing_product',    label: 'Missing Product' },
  { value: 'near_expiry',        label: 'Near Expiry' },
]

type Screen = 'landing' | 'form' | 'success'
type LandingMode = 'choose' | 'search'

function SearchableSelect({
  items,
  value,
  placeholder,
  onSelect,
  disabled,
}: {
  items: { id: number; name: string }[]
  value: number | null
  placeholder: string
  onSelect: (id: number, name: string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const selectedName = items.find(i => i.id === value)?.name ?? ''

  useEffect(() => { if (!open) setQuery(selectedName) }, [open, selectedName])
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const DROPDOWN_MAX_HEIGHT = 240

  const updateCoords = () => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    // Flip upward when there isn't room below but there is above — avoids the
    // list rendering past the bottom of a short/mobile viewport with nothing
    // to scroll it into view.
    const openUpward = spaceBelow < DROPDOWN_MAX_HEIGHT + 6 && spaceAbove > spaceBelow
    setCoords({
      top: openUpward ? undefined : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
      left: rect.left,
      width: rect.width,
    })
  }

  // Dropdown is portaled to <body> (see below) so it can't be clipped by an
  // ancestor .card's `overflow: hidden` — reposition it on open/scroll/resize
  // since it's no longer a normal DOM child of this wrapper.
  useEffect(() => {
    if (!open) return
    updateCoords()
    const handler = () => updateCoords()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  if (disabled) {
    return <input type="text" value={selectedName} disabled />
  }

  const filtered = query ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase())) : items

  return (
    <div className="search-wrapper" ref={ref}>
      <input type="text"
        value={open ? query : selectedName}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); updateCoords() }}
        onChange={e => { setQuery(e.target.value); setOpen(true); updateCoords() }}
        onBlur={() => setOpen(false)}
        autoComplete="off"
      />
      {open && coords && createPortal(
        <div
          className="search-dropdown"
          style={{
            position: 'fixed',
            left: coords.left, width: coords.width, right: 'auto',
            ...(coords.top !== undefined ? { top: coords.top } : { bottom: coords.bottom }),
          }}
        >
          {filtered.slice(0, 60).map(item => (
            <div key={item.id}
              className={`search-dropdown-item${item.id === value ? ' selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); onSelect(item.id, item.name); setOpen(false) }}>
              {item.name}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="search-dropdown-item" style={{ color: 'var(--text-muted)' }}>No results</div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function DCWorkflow() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [landingMode, setLandingMode] = useState<LandingMode>('choose')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // Find DC search state
  const [findSupplierId, setFindSupplierId] = useState<number | null>(null)
  const [findSupplierName, setFindSupplierName] = useState('')
  const [findDcNumber, setFindDcNumber] = useState('')
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState('')
  const [browseList, setBrowseList] = useState<BrowseItem[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [pendingRecord, setPendingRecord] = useState<{ record: DCRecord; photos: Photo[] } | null>(null)

  // Form state — shared by New DC and Find DC
  const [isExisting, setIsExisting] = useState(false)
  const [record, setRecord] = useState<DCRecord | null>(null)
  const [existingPhotos, setExistingPhotos] = useState<Photo[]>([])
  const [photoActionError, setPhotoActionError] = useState('')

  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [supplierRawHint, setSupplierRawHint] = useState('')
  const [dcNumber, setDcNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [numItems, setNumItems] = useState('')
  const [checkedBy, setCheckedBy] = useState<number | null>(null)

  const [newPhotos, setNewPhotos] = useState<PhotoItem[]>([])
  const [remarks, setRemarks] = useState<string[]>([])
  const [touchedStage2, setTouchedStage2] = useState(false)
  const [verifiedBy, setVerifiedBy] = useState<number | null>(null)

  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractionModel, setExtractionModel] = useState('google/gemini-2.5-flash-lite')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [stage1Saved, setStage1Saved] = useState(false)

  const pkgInputRef = useRef<HTMLInputElement>(null)
  const invInputRef = useRef<HTMLInputElement>(null)
  const corInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/suppliers').then(r => r.json()).then(d => setSuppliers(d.suppliers ?? [])).catch(() => {})
    fetch('/employees').then(r => r.json()).then(d => setEmployees(d.employees ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (landingMode !== 'search') return
    setBrowseLoading(true)
    const url = findSupplierId ? `/stage2/list?supplier_id=${findSupplierId}` : '/stage2/list'
    fetch(url)
      .then(r => r.json())
      .then(d => setBrowseList(Array.isArray(d) ? d : []))
      .catch(() => setBrowseList([]))
      .finally(() => setBrowseLoading(false))
  }, [findSupplierId, landingMode])

  const resetForm = () => {
    newPhotos.forEach(p => URL.revokeObjectURL(p.preview))
    setIsExisting(false); setRecord(null); setExistingPhotos([])
    setSupplierId(null); setSupplierName(''); setSupplierRawHint('')
    setDcNumber(''); setInvoiceDate(toDateStr(new Date())); setNumItems(''); setCheckedBy(null)
    setNewPhotos([]); setRemarks([]); setTouchedStage2(false); setVerifiedBy(null)
    setExtractError(''); setSaveError(''); setPhotoActionError(''); setStage1Saved(false)
  }

  const runExtraction = async (file: File) => {
    setExtracting(true); setExtractError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('model', extractionModel)
      const res = await fetch('/stage1/extract', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail ?? `Error ${res.status}`)
      }
      const d = await res.json()
      setDcNumber(d.dc_number ?? '')
      setNumItems(d.item_count > 0 ? String(d.item_count) : '')
      if (d.supplier_id) {
        setSupplierId(d.supplier_id); setSupplierName(d.supplier_name); setSupplierRawHint('')
      } else {
        setSupplierId(null); setSupplierName(''); setSupplierRawHint(d.supplier_name_raw ?? '')
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Auto-fill failed')
    } finally {
      setExtracting(false)
    }
  }

  const addPhoto = useCallback(async (file: File, type: PhotoItem['type']) => {
    const preview = URL.createObjectURL(file)
    setNewPhotos(prev => [...prev, { file, preview, type, blurry: false, checking: true }])
    const blurry = await checkBlur(file)
    setNewPhotos(prev => prev.map(p => p.preview === preview ? { ...p, blurry, checking: false } : p))
  }, [])

  const remainingSlots = (type: PhotoItem['type']): number => {
    if (type === 'package') return Math.max(0, 3 - totalPkg)
    if (type === 'invoice') return Math.max(0, 3 - totalInv)
    return existingCorrected || newCorPhotos.length > 0 ? 0 : 1
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, type: PhotoItem['type']) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const remaining = remainingSlots(type)
    const toAdd = files.slice(0, remaining)
    if (toAdd.length < files.length) {
      setPhotoActionError(`Only added ${toAdd.length} of ${files.length} selected photo(s) — limit reached.`)
    }
    toAdd.forEach(f => addPhoto(f, type))
    // Only auto-fill from a brand-new record's very first invoice photo —
    // never re-run on a 2nd/3rd invoice page, and never for an existing record
    // (its fields are already confirmed).
    if (type === 'invoice' && !isExisting && newInvPhotos.length === 0) {
      const f = toAdd[0]
      if (f) runExtraction(f)
    }
  }

  const handleRemoveExistingPhoto = async (photoId: number) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return
    setPhotoActionError('')
    try {
      const res = await fetch(`/photos/${photoId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setExistingPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch {
      setPhotoActionError('Failed to delete photo. Please try again.')
    }
  }

  const removeNewPhoto = (preview: string) => {
    setNewPhotos(prev => {
      const p = prev.find(ph => ph.preview === preview)
      if (p) URL.revokeObjectURL(p.preview)
      return prev.filter(ph => ph.preview !== preview)
    })
  }

  const handleRemarkToggle = (value: string) => {
    setTouchedStage2(true)
    setRemarks(prev => prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value])
  }

  /* ── New DC ── */
  const handleNewDC = () => {
    resetForm()
    setScreen('form')
  }

  /* ── Find DC ── */
  const applyFound = (data: { record: DCRecord; photos: Photo[] }) => {
    const rec = data.record
    setIsExisting(true)
    setRecord(rec)
    setExistingPhotos(data.photos)
    setSupplierId(rec.supplier_id); setSupplierName(rec.supplier_name)
    setDcNumber(rec.dc_number)
    setInvoiceDate(rec.invoice_date ?? '')
    setNumItems(rec.num_items != null ? String(rec.num_items) : '')
    setCheckedBy(rec.stage1_by ?? null)
    setRemarks(rec.remarks ?? [])
    setTouchedStage2(false)
    setVerifiedBy(rec.stage2_by ?? null)
    setNewPhotos([])
    setSaveError(''); setExtractError(''); setPhotoActionError(''); setStage1Saved(false)
    setScreen('form')
  }

  const handleFoundResult = (
    data: { exists: boolean; record?: DCRecord; photos?: Photo[] },
    dcNum: string,
    supId: number,
    supName: string,
  ) => {
    if (data.exists && data.record) {
      if (data.record.stage2_done_at) {
        setPendingRecord({ record: data.record, photos: data.photos ?? [] })
        setShowWarning(true)
        return
      }
      applyFound({ record: data.record, photos: data.photos ?? [] })
    } else {
      // Not found — same blank form as New DC, but keep the searched supplier/dc_number.
      // supId/supName are passed in explicitly (not read from findSupplierId state) so
      // this can never show a stale supplier if search state changes elsewhere in between.
      resetForm()
      setSupplierId(supId)
      setSupplierName(supName)
      setDcNumber(dcNum)
      setScreen('form')
    }
  }

  const handleFind = async () => {
    if (!findSupplierId || !findDcNumber.trim()) {
      setFindError('Please select supplier and enter DC number.')
      return
    }
    setFinding(true); setFindError('')
    try {
      const res = await fetch(`/stage2/find?dc_number=${encodeURIComponent(findDcNumber.trim())}&supplier_id=${findSupplierId}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      handleFoundResult(data, findDcNumber.trim(), findSupplierId, findSupplierName)
    } catch {
      setFindError('Failed to search. Is the backend running?')
    } finally {
      setFinding(false)
    }
  }

  const handleBrowseClick = async (item: BrowseItem) => {
    setFindDcNumber(item.dc_number)
    setFindSupplierId(item.supplier_id)
    setFindSupplierName(item.supplier_name)
    try {
      const res = await fetch(`/stage2/find?dc_number=${encodeURIComponent(item.dc_number)}&supplier_id=${item.supplier_id}`)
      const data = await res.json()
      handleFoundResult(data, item.dc_number, item.supplier_id, item.supplier_name)
    } catch {
      setFindError('Failed to load record.')
    }
  }

  /* ── Derived photo groups ── */
  const newPkgPhotos = newPhotos.filter(p => p.type === 'package')
  const newInvPhotos = newPhotos.filter(p => p.type === 'invoice')
  const newCorPhotos = newPhotos.filter(p => p.type === 'corrected')
  const hasBlurry = newPhotos.some(p => p.blurry)
  const isChecking = newPhotos.some(p => p.checking)

  const existingPkg = existingPhotos.filter(p => p.photo_type === 'package')
  const existingInv = existingPhotos.filter(p => p.photo_type === 'invoice')
  const existingCorrected = existingPhotos.some(p => p.photo_type === 'corrected')

  const totalPkg = existingPkg.length + newPkgPhotos.length
  const totalInv = existingInv.length + newInvPhotos.length

  const hasNewCorrected = newCorPhotos.length > 0
  const showVerifiedBy = hasNewCorrected || existingCorrected
  const verifiedByLocked = existingCorrected // already verified previously — name can't be reassigned

  const canSave =
    !saving && !hasBlurry && !isChecking &&
    supplierId !== null && dcNumber.trim() !== '' &&
    invoiceDate !== '' && numItems !== '' && checkedBy !== null &&
    totalPkg >= 1 && totalInv >= 1 &&
    (!hasNewCorrected || verifiedBy !== null)

  const handleSave = async () => {
    setSaving(true); setSaveError('')
    try {
      // Skip re-sending stage1 once it's already succeeded this visit — so
      // retrying after a stage2 failure doesn't re-upload the same package/
      // invoice photos and create duplicate dc_photos rows.
      if (!stage1Saved) {
        const fd1 = new FormData()
        fd1.append('dc_number', dcNumber.trim())
        fd1.append('supplier_id', String(supplierId))
        fd1.append('stage1_by', String(checkedBy))
        fd1.append('invoice_date', invoiceDate)
        fd1.append('num_items', numItems)
        newPhotos.filter(p => p.type !== 'corrected').forEach(p => {
          fd1.append('photos', p.file)
          fd1.append('photo_types', p.type)
        })
        const res1 = await fetch('/stage1/save', { method: 'POST', body: fd1 })
        if (!res1.ok) {
          const d = await res1.json().catch(() => ({}))
          throw new Error(d.detail ?? `Error ${res1.status}`)
        }
        setStage1Saved(true)
      }

      if (hasNewCorrected || touchedStage2) {
        const fd2 = new FormData()
        fd2.append('dc_number', dcNumber.trim())
        fd2.append('supplier_id', String(supplierId))
        if (hasNewCorrected) fd2.append('stage2_by', String(verifiedBy))
        fd2.append('remarks', JSON.stringify(remarks))
        newCorPhotos.forEach(p => {
          fd2.append('photos', p.file)
          fd2.append('photo_types', 'corrected')
        })
        const res2 = await fetch('/stage2/save', { method: 'POST', body: fd2 })
        if (!res2.ok) {
          const d = await res2.json().catch(() => ({}))
          throw new Error(d.detail ?? `Error ${res2.status}`)
        }
      }

      setScreen('success')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const backToLanding = () => {
    resetForm()
    setFindDcNumber(''); setFindError('')
    setScreen('landing'); setLandingMode('choose')
  }

  /* ── Warning modal ── */
  const warningModal = showWarning && pendingRecord && (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div className="modal-body">
          <p className="modal-title">Warning</p>
          <p className="modal-message">This DC already exists and has been verified.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => { setShowWarning(false); setPendingRecord(null) }}>
              Close
            </button>
            <button className="btn btn-warning" onClick={() => {
              applyFound(pendingRecord)
              setShowWarning(false); setPendingRecord(null)
            }}>Edit</button>
          </div>
        </div>
      </div>
    </div>
  )

  /* ── Success screen ── */
  if (screen === 'success') {
    return (
      <div className="page">
        <Header title="DC Checking & Verification" />
        <div className="content">
          <div className="success-screen">
            <div className="check-circle">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.02em' }}>
                Saved!
              </p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 }}>
                {dcNumber} — {supplierName}
              </p>
            </div>
            <button className="btn btn-primary" style={{ maxWidth: 240 }} onClick={backToLanding}>
              + New DC
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Form screen (New DC and Find DC both land here) ── */
  if (screen === 'form') {
    return (
      <div className="page">
        {warningModal}
        <Header title="DC Checking & Verification" onBack={backToLanding} />
        <div className="content">

          <div className="dc-info-bar" style={{ marginBottom: 14 }}>
            {dcNumber ? `DC ${dcNumber}` : 'New DC'} {supplierName && `· ${supplierName}`}
          </div>

          {isExisting && record?.stage1_by_name && (
            <div className="banner banner-info" style={{ marginBottom: 14 }}>
              Checked by: <strong>{record.stage1_by_name}</strong>
              {record.stage1_done_at && ` on ${formatDate(record.stage1_done_at)}`}
            </div>
          )}

          {!isExisting && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="field-label">Extraction Model</label>
              <select
                value={extractionModel}
                onChange={e => setExtractionModel(e.target.value)}
              >
                <option value="google/gemini-2.5-flash-lite">google/gemini-2.5-flash-lite</option>
                <option value="xiaomi/mimo-v2.5">xiaomi/mimo-v2.5</option>
              </select>
            </div>
          )}

          {photoActionError && (
            <div className="banner banner-error" style={{ marginBottom: 14 }}>{photoActionError}</div>
          )}

          {/* Package Photos */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              Package Photos
              <span className="card-header-meta">{totalPkg} / 3</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(existingPkg.length > 0 || newPkgPhotos.length > 0) && (
                <div className="photo-grid">
                  {existingPkg.map(p => (
                    <ReadOnlyPhoto key={p.id} photo={p} onRemove={() => handleRemoveExistingPhoto(p.id)} />
                  ))}
                  <PhotoThumbs photos={newPkgPhotos} onRemove={removeNewPhoto} />
                </div>
              )}
              {totalPkg < 3 && (
                <>
                  <input ref={pkgInputRef} type="file" accept="image/*" capture="environment"
                    multiple style={{ display: 'none' }} onChange={e => handleFileInput(e, 'package')} />
                  <button className="upload-area" onClick={() => pkgInputRef.current?.click()}>
                    <svg className="upload-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    <p>Take / upload package photo</p>
                    <span className="upload-hint">Min 1 · Max 3</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Invoice Photo */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              Invoice Photo
              <span className="card-header-meta">{totalInv} / 3</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(existingInv.length > 0 || newInvPhotos.length > 0) && (
                <div className="photo-grid">
                  {existingInv.map(p => (
                    <ReadOnlyPhoto key={p.id} photo={p} onRemove={() => handleRemoveExistingPhoto(p.id)} />
                  ))}
                  <PhotoThumbs photos={newInvPhotos} onRemove={removeNewPhoto} />
                </div>
              )}
              {totalInv < 3 && (
                <>
                  <input ref={invInputRef} type="file" accept="image/*" capture="environment"
                    style={{ display: 'none' }} onChange={e => handleFileInput(e, 'invoice')} />
                  <button className="upload-area" onClick={() => invInputRef.current?.click()}>
                    <svg className="upload-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <p>Take / upload invoice photo</p>
                    <span className="upload-hint">
                      {extracting ? 'Reading invoice…' : 'Min 1 · Max 3 · first one auto-fills the fields below'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">DC Details</div>
            <div className="card-body">

              {extractError && (
                <div className="banner banner-error" style={{ marginBottom: 14 }}>
                  Auto-fill failed ({extractError}). Please fill in the fields manually.
                </div>
              )}
              {!extractError && supplierRawHint && (
                <div className="banner banner-error" style={{ marginBottom: 14 }}>
                  Could not auto-match supplier "{supplierRawHint}" — please select manually.
                </div>
              )}

              <div className="form-group">
                <label className="field-label">Supplier *</label>
                <SearchableSelect
                  items={suppliers}
                  value={supplierId}
                  placeholder="Search supplier…"
                  disabled={isExisting}
                  onSelect={(id, name) => { setSupplierId(id); setSupplierName(name) }}
                />
              </div>

              <div className="form-group">
                <label className="field-label">DC Number *</label>
                <input type="text" placeholder="e.g. 12045" value={dcNumber}
                  disabled={isExisting}
                  onChange={e => setDcNumber(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="field-label">Invoice Date *</label>
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="field-label">No. of Items *</label>
                <input type="number" min="1" placeholder="e.g. 25" value={numItems}
                  onChange={e => setNumItems(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="field-label">Checked By *</label>
                <SearchableSelect items={employees} value={checkedBy}
                  placeholder="Select staff…" disabled={isExisting}
                  onSelect={id => setCheckedBy(id)} />
              </div>
            </div>
          </div>

          <div className="divider-row" style={{
            display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            Optional
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Corrected DC Photo */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">Corrected DC Photo</div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {existingCorrected && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Already verified with a corrected photo on file.</p>
              )}
              {newCorPhotos.length > 0 && (
                <div className="photo-grid">
                  <PhotoThumbs photos={newCorPhotos} onRemove={removeNewPhoto} />
                </div>
              )}
              {!existingCorrected && newCorPhotos.length === 0 && (
                <>
                  <input ref={corInputRef} type="file" accept="image/*" capture="environment"
                    style={{ display: 'none' }} onChange={e => handleFileInput(e, 'corrected')} />
                  <button className="upload-area" onClick={() => corInputRef.current?.click()}>
                    <svg className="upload-icon" width="26" height="26" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <p>Upload corrected DC photo</p>
                    <span className="upload-hint">Optional — can save without it</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Verified By + Remarks — both hidden until a corrected photo is attached */}
          {showVerifiedBy && (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-body" style={{ paddingTop: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="field-label">Verified By *</label>
                    {verifiedByLocked ? (
                      <input type="text" value={record?.stage2_by_name ?? ''} disabled />
                    ) : (
                      <SearchableSelect items={employees} value={verifiedBy}
                        placeholder="Select staff…" onSelect={id => setVerifiedBy(id)} />
                    )}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-header">Remarks</div>
                <div className="card-body">
                  <div className="checkbox-group">
                    {REMARKS_OPTIONS.map(opt => (
                      <label key={opt.value} className="checkbox-item">
                        <input type="checkbox"
                          checked={remarks.includes(opt.value)}
                          onChange={() => handleRemarkToggle(opt.value)} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {hasBlurry && (
            <div className="banner banner-error" style={{ marginBottom: 14 }}>
              ⚠ One or more photos are blurry — please retake them.
            </div>
          )}

          {saveError && (
            <div className="banner banner-error" style={{ marginBottom: 14 }}>
              {saveError}
            </div>
          )}

          <button className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
            {saving ? <><span className="spinner" /> Saving…</> : 'Save DC'}
          </button>

          {!canSave && !saving && !hasBlurry && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              Need: supplier, DC number, invoice date, no. of items, checked by
              {totalPkg === 0 && ' + package photo'}
              {totalInv === 0 && ' + invoice photo'}
              {hasNewCorrected && ' + verified by'}
            </p>
          )}
        </div>
      </div>
    )
  }

  /* ── Landing screen ── */
  return (
    <div className="page">
      {warningModal}
      <Header title="DC Checking & Verification" onBack={landingMode === 'search' ? () => setLandingMode('choose') : undefined} />
      <div className="content">

        {landingMode === 'choose' && (
          <div className="hub-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className="hub-card" onClick={handleNewDC} style={{ font: 'inherit' }}>
              <div className="hub-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span className="hub-sub">Create</span>
              <span className="hub-title">New DC</span>
            </button>
            <button className="hub-card" onClick={() => setLandingMode('search')} style={{ font: 'inherit' }}>
              <div className="hub-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <span className="hub-sub">Look up</span>
              <span className="hub-title">Find DC</span>
            </button>
          </div>
        )}

        {landingMode === 'search' && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">Find DC</div>
              <div className="card-body">
                <div className="form-group">
                  <label className="field-label">Supplier</label>
                  <SearchableSelect items={suppliers} value={findSupplierId}
                    placeholder="Search supplier…"
                    onSelect={(id, name) => { setFindSupplierId(id); setFindSupplierName(name) }} />
                </div>
                <div className="form-group">
                  <label className="field-label">DC Number</label>
                  <input type="text" placeholder="e.g. 12045" value={findDcNumber}
                    onChange={e => setFindDcNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFind()} />
                </div>
                {findError && (
                  <div className="banner banner-error" style={{ marginBottom: 14 }}>{findError}</div>
                )}
                <button className="btn btn-primary" disabled={finding} onClick={handleFind}>
                  {finding ? <><span className="spinner" /> Searching…</> : 'Find DC'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                {findSupplierId ? `DCs for ${findSupplierName}` : 'Recent DCs (latest 20)'}
                {browseLoading && (
                  <span style={{ float: 'right', fontWeight: 400, fontSize: 13, color: 'var(--text-muted)' }}>
                    loading…
                  </span>
                )}
              </div>
              {browseList.length === 0 && !browseLoading ? (
                <div className="card-body">
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {findSupplierId ? 'No DCs found for this supplier.' : 'No DCs recorded yet.'}
                  </p>
                </div>
              ) : (
                <div className="browse-list">
                  {browseList.map(item => (
                    <div key={item.id} className="browse-item" onClick={() => handleBrowseClick(item)}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{item.dc_number}</span>
                        {!findSupplierId && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {item.supplier_name}
                          </span>
                        )}
                        {item.invoice_date && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {formatDate(item.invoice_date)}
                          </span>
                        )}
                      </div>
                      <span className={`pill ${item.status === 'stage2' ? 'pill-success' : 'pill-accent'}`}>
                        {item.status === 'stage2' ? 'Verified' : 'Checked'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="page-header">
      {onBack ? (
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : (
        <Link to="/" className="back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
      )}
      <h1>{title}</h1>
    </header>
  )
}

function PhotoThumbs({ photos, onRemove }: { photos: PhotoItem[]; onRemove: (preview: string) => void }) {
  return (
    <>
      {photos.map(p => (
        <div key={p.preview} className={`photo-thumb${p.blurry ? ' blurry' : ''}`}>
          <img src={p.preview} alt="" />
          <button className="remove-btn" onClick={() => onRemove(p.preview)}>×</button>
          {p.checking && <div className="blur-badge" style={{ background: 'rgba(0,0,0,.6)' }}>checking…</div>}
          {!p.checking && p.blurry && <div className="blur-badge">BLURRY</div>}
        </div>
      ))}
    </>
  )
}

function ReadOnlyPhoto({ photo, onRemove }: { photo: Photo; onRemove?: () => void }) {
  if (!photo.file_path) {
    return (
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
        {onRemove && <button className="remove-btn" onClick={onRemove}>×</button>}
      </div>
    )
  }
  return (
    <div className="photo-thumb">
      <img src={`/photos/${photo.id}`} alt="" loading="lazy" />
      {onRemove && <button className="remove-btn" onClick={onRemove}>×</button>}
    </div>
  )
}
