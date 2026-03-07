import { useState, useEffect, useRef } from 'react'


function getLogoUrl(domain) {
  const clean = domain.replace(/^www\./, '')
  return `https://logo.clearbit.com/${clean}`
}
function getFallbackLogoUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
}

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url)
    return u.hostname.replace('www.', '')
  } catch {
    return null
  }
}

async function fetchJobData(url) {
  const domain = extractDomain(url)
  if (!domain) throw new Error('Invalid URL')

  let title = '', company = '', location = ''

  // Greenhouse: direct public API
  const ghMatch = url.match(/greenhouse\.io\/([^/]+)\/jobs\/(\d+)/)
  if (ghMatch) {
    try {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs/${ghMatch[2]}`, { signal: AbortSignal.timeout(8000) })
      const data = await res.json()
      title = data.title || ''
      company = ghMatch[1].charAt(0).toUpperCase() + ghMatch[1].slice(1)
      location = data.location?.name || ''
      if (title) return { title, company, location, domain, logoUrl: getLogoUrl(domain), fallbackLogoUrl: getFallbackLogoUrl(domain), url }
    } catch { }
  }

  // Lever: direct public API
  const leverMatch = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/)
  if (leverMatch) {
    try {
      const res = await fetch(`https://api.lever.co/v0/postings/${leverMatch[1]}/${leverMatch[2]}`, { signal: AbortSignal.timeout(8000) })
      const data = await res.json()
      title = data.text || ''
      company = data.categories?.team || leverMatch[1].charAt(0).toUpperCase() + leverMatch[1].slice(1)
      location = data.categories?.location || ''
      if (title) return { title, company, location, domain, logoUrl: getLogoUrl(domain), fallbackLogoUrl: getFallbackLogoUrl(domain), url }
    } catch { }
  }

  // Fallback: try CORS proxies for HTML scraping
  const proxies = [
    (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ]

  let html = ''
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) })
      if (proxy === proxies[0]) {
        const data = await res.json()
        html = data.contents || ''
      } else {
        html = await res.text()
      }
      if (html.length > 200) break
    } catch { continue }
  }

  if (html) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    const meta = (name) =>
      doc.querySelector(`meta[property="${name}"]`)?.content ||
      doc.querySelector(`meta[name="${name}"]`)?.content || ''

    title = meta('og:title') || meta('title') || doc.title || ''
    company = meta('og:site_name') || ''
    location = ''

    if (domain.includes('linkedin.com')) {
      const titleEl = doc.querySelector('h1.top-card-layout__title, .job-details-jobs-unified-top-card__job-title, h1')
      if (titleEl) title = titleEl.textContent.trim()
      const companyEl = doc.querySelector('.topcard__org-name-link, .job-details-jobs-unified-top-card__company-name a, .top-card-layout__first-subline a')
      if (companyEl) company = companyEl.textContent.trim()
      const locationEl = doc.querySelector('.topcard__flavor--bullet, .job-details-jobs-unified-top-card__bullet, .top-card-layout__first-subline .topcard__flavor')
      if (locationEl) location = locationEl.textContent.trim()
    }
  }

  if (title && company && title.endsWith(company)) {
    title = title.slice(0, -company.length).trim().replace(/[-|]+$/, '').trim()
  }
  if (!company && title.includes(' at ')) {
    const parts = title.split(' at ')
    title = parts[0].trim()
    company = parts[1]?.trim() || ''
  }
  if (!company) {
    company = domain.split('.')[0]
    company = company.charAt(0).toUpperCase() + company.slice(1)
  }

  return {
    title: title || 'Unknown Position',
    company: company || domain,
    location: location || '',
    domain,
    logoUrl: getLogoUrl(domain),
    fallbackLogoUrl: getFallbackLogoUrl(domain),
    url,
  }
}

const STATUSES = ['Saved', 'In Progress', 'Applied', 'Interview', 'Rejected']

function timeAgo(ts, status) {
  const label = status || 'Saved'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return `${label} just now`
  if (mins < 60) return `${label} ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${label} ${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${label} ${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${label} ${weeks}w ago`
}


const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const DotsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
)

const CsvIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)



function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('position') || h.includes('role'))
  const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('employer') || h.includes('organization'))
  const locationIdx = headers.findIndex(h => h.includes('location') || h.includes('city'))
  const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('link'))

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.match(/("[^"]*"|[^,]+)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || []
    const title = (titleIdx >= 0 ? cols[titleIdx] : cols[0]) || 'Unknown Position'
    const company = (companyIdx >= 0 ? cols[companyIdx] : cols[1]) || 'Unknown'
    const location = locationIdx >= 0 ? (cols[locationIdx] || '') : ''
    const url = urlIdx >= 0 ? (cols[urlIdx] || '') : ''
    const domain = url ? extractDomain(url) : company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
    return {
      id: crypto.randomUUID(),
      title, company, location, url, domain,
      logoUrl: getLogoUrl(domain),
      fallbackLogoUrl: getFallbackLogoUrl(domain),
      status: 'Saved',
      addedAt: Date.now(),
    }
  })
}

export default function App() {
  const [jobs, setJobs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt-jobs') || '[]') } catch { return [] }
  })
  const [activeStatus, setActiveStatus] = useState('Applied')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)
  const [showFab, setShowFab] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState(new Set())


  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt-notes') || '[]') } catch { return [] }
  })
  const [images, setImages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt-images') || '[]') } catch { return [] }
  })

  useEffect(() => { localStorage.setItem('jt-jobs', JSON.stringify(jobs)) }, [jobs])
  useEffect(() => { localStorage.setItem('jt-notes', JSON.stringify(notes)) }, [notes])
  useEffect(() => { localStorage.setItem('jt-images', JSON.stringify(images)) }, [images])

  // Listen for jobs added by the Chrome extension
  useEffect(() => {
    const handler = () => {
      try { setJobs(JSON.parse(localStorage.getItem('jt-jobs') || '[]')) } catch { }
    }
    window.addEventListener('jt-update', handler)
    return () => window.removeEventListener('jt-update', handler)
  }, [])

  useEffect(() => {
    if (openMenu === null) return
    const handler = () => setOpenMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenu])



  useEffect(() => {
    if (!showModal) return
    const handler = (e) => {
      if (e.target.closest('.side-panel') || e.target.closest('.btn-add')) return
      setShowModal(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModal])


  const counts = {}
  STATUSES.forEach(s => { counts[s] = 0 })
  jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++ })

  const filtered = jobs.filter(j => {
    if (j.status !== activeStatus) return false
    const q = search.toLowerCase()
    if (!q) return true
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location?.toLowerCase().includes(q)
  })

  function deleteJob(id) { setJobs(prev => prev.filter(j => j.id !== id)); setOpenMenu(null) }

  function moveJob(id, newStatus) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j))
    setOpenMenu(null)
    showToastMsg(`Moved to ${newStatus}`)
  }

  function copyLink(job) {
    if (job.url) navigator.clipboard.writeText(job.url)
    setOpenMenu(null)
    showToastMsg(job.url ? 'Link copied' : 'No link available')
  }

  function toggleSelect(id) {
    const next = new Set(selectedJobs)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedJobs(next)
  }

  function toggleSelectAll() {
    if (selectedJobs.size === filtered.length) {
      setSelectedJobs(new Set())
    } else {
      setSelectedJobs(new Set(filtered.map(j => j.id)))
    }
  }

  function bulkDeleteSelected() {
    setJobs(prev => prev.filter(j => !selectedJobs.has(j.id)))
    setSelectedJobs(new Set())
    showToastMsg(`Removed ${selectedJobs.size} jobs`)
  }

  function bulkMoveSelected(newStatus) {
    setJobs(prev => prev.map(j => selectedJobs.has(j.id) ? { ...j, status: newStatus } : j))
    setSelectedJobs(new Set())
    showToastMsg(`Moved ${selectedJobs.size} jobs to ${newStatus}`)
  }

  function addJob(job) { setJobs(prev => [job, ...prev]); showToastMsg(`Added "${job.title}"`) }

  function bulkAdd(newJobs) { setJobs(prev => [...newJobs, ...prev]); showToastMsg(`Imported ${newJobs.length} jobs`) }

  function showToastMsg(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }


  useEffect(() => {
    if (!showFab) return
    const handler = (e) => {
      if (e.target.closest('.fab-wrap')) return
      setShowFab(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFab])

  function addNote() {
    setNotes(prev => [...prev, {
      id: crypto.randomUUID(),
      text: '',
      x: 500 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      noteColor: 'transparent',
    }])
    setShowFab(false)
  }

  function addImage() {
    setImages(prev => [...prev, {
      id: crypto.randomUUID(),
      src: null,
      x: 550 + Math.random() * 200,
      y: 120 + Math.random() * 200,
    }])
    setShowFab(false)
  }

  function updateNote(id, updates) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
  }

  function deleteNote(id) { setNotes(prev => prev.filter(n => n.id !== id)) }

  function updateImage(id, updates) {
    setImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img))
  }

  function deleteImage(id) { setImages(prev => prev.filter(img => img.id !== id)) }

  return (
    <div className="app">
      {/* Left sidebar */}
      <div className="sidebar">
        <span className="brand"><span className="brand-neo">neo.</span><br /><span className="brand-jt">job tracker</span></span>
        <nav className="sidebar-nav">
          {STATUSES.map(s => (
            <button
              key={s}
              className={`sidebar-item${activeStatus === s ? ' active' : ''}`}
              onClick={() => { setActiveStatus(s); setSelectMode(false); setSelectedJobs(new Set()); setSearch(''); }}
            >
              <span className="sidebar-item-label">{s}</span>
              <span className="sidebar-item-count">{counts[s]}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main panel */}
      <div className="main">
        <div className="jobs-card">
          {/* Top bar inside the card */}
          <div className="jobs-topbar">
            {selectMode ? (
              <div className="bulk-bar">
                <label className="checkbox-container" onClick={e => e.stopPropagation()} style={{ marginRight: '4px' }}>
                  <input
                    type="checkbox"
                    checked={selectedJobs.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                  <span className="checkmark"></span>
                </label>
                <span className="bulk-label">Select All</span>
                <span className="bulk-count">{selectedJobs.size} selected</span>
                <div className="bulk-spacer" />
                <select className="bulk-move" onChange={e => { if (e.target.value) { bulkMoveSelected(e.target.value); setSelectMode(false); } }} value="">
                  <option value="" disabled>Move to...</option>
                  {STATUSES.filter(s => s !== activeStatus).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button className="bulk-remove" onClick={() => { bulkDeleteSelected(); setSelectMode(false); }} disabled={selectedJobs.size === 0}>Remove</button>
                <button className="bulk-done" onClick={() => { setSelectMode(false); setSelectedJobs(new Set()); }}>Done</button>
              </div>
            ) : (
              <>
                <div className="search-wrap">
                  <SearchIcon />
                  <input
                    className="search-input"
                    placeholder="Search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="btn-add" onClick={() => setShowModal(!showModal)}>
                    <PlusIcon /> Add Job
                  </button>
                  {showModal && (
                    <div className="side-panel" onClick={e => e.stopPropagation()}>
                      <AddJobPanel
                        onClose={() => setShowModal(false)}
                        onAdd={addJob}
                        onBulkAdd={bulkAdd}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Job list */}
          <div className="jobs-list">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <p>No {activeStatus.toLowerCase()} jobs</p>
                <p>Click "+ Add Job" to get started</p>
              </div>
            ) : (
              filtered.map(job => (
                <div className={`job-item${selectedJobs.has(job.id) ? ' selected' : ''}`} key={job.id}>
                  {selectMode && (
                    <label className="checkbox-container job-checkbox" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedJobs.has(job.id)}
                        onChange={() => toggleSelect(job.id)}
                      />
                      <span className="checkmark"></span>
                    </label>
                  )}
                  <div className="job-info">
                    {job.url ? (
                      <a className="job-title" href={job.url} target="_blank" rel="noopener noreferrer">{job.title}</a>
                    ) : (
                      <div className="job-title">{job.title}</div>
                    )}
                    <div className="job-company">{job.company}</div>
                    {job.location && <div className="job-location">{job.location}</div>}
                    <div className="job-posted">{timeAgo(job.addedAt, job.status)}</div>
                  </div>
                  <div className="job-right" style={{ position: 'relative' }}>
                    <button
                      className="job-dots"
                      onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === job.id ? null : job.id) }}
                    >
                      <DotsIcon />
                    </button>
                    {openMenu === job.id && (
                      <div className="job-dropdown">
                        <button onClick={() => copyLink(job)}>Copy link</button>
                        <div className="dropdown-divider" />
                        <button onClick={() => { setSelectMode(true); setSelectedJobs(new Set([job.id])); setOpenMenu(null); }}>Select</button>
                        <div className="dropdown-divider" />
                        {STATUSES.filter(s => s !== job.status).map(s => (
                          <button key={s} onClick={() => moveJob(job.id, s)}>Move to {s}</button>
                        ))}
                        <div className="dropdown-divider" />
                        <button className="destructive" onClick={() => deleteJob(job.id)}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {toast && <div className="toast">{toast}</div>}


      {notes.map(note => (
        <StickyNote
          key={note.id}
          note={note}
          onUpdate={(u) => updateNote(note.id, u)}
          onDelete={() => deleteNote(note.id)}
        />
      ))}


      {images.map(img => (
        <PolaroidImage
          key={img.id}
          image={img}
          onUpdate={(u) => updateImage(img.id, u)}
          onDelete={() => deleteImage(img.id)}
        />
      ))}


      <div className="fab-wrap">
        <button className="fab-btn" onClick={() => setShowFab(!showFab)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {showFab && (
          <div className="fab-dropdown">
            <button onClick={addNote}>Note</button>
            <button onClick={addImage}>Image</button>
          </div>
        )}
      </div>
    </div>
  )
}

function AddJobPanel({ onClose, onAdd, onBulkAdd }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('Applied')
  const [loading, setLoading] = useState(false)
  const [csvParsed, setCsvParsed] = useState([])
  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!url.trim()) return

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await fetchJobData(url.trim())
        if (data.title && data.title !== 'Unknown Position') setTitle(data.title)
        if (data.company) setCompany(data.company)
        if (data.location) setLocation(data.location)
      } catch {
        const domain = extractDomain(url.trim())
        if (domain && !company) {
          setCompany(domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1))
        }
      } finally { setLoading(false) }
    }, 900)

    return () => clearTimeout(debounceRef.current)
  }, [url])

  function handleAdd() {
    if (!title.trim()) return
    const domain = extractDomain(url.trim()) || company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      company: company.trim() || 'Unknown',
      location: location.trim(),
      domain,
      logoUrl: getLogoUrl(domain),
      fallbackLogoUrl: getFallbackLogoUrl(domain),
      url: url.trim(),
      status, addedAt: Date.now(),
    })
    onClose()
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setCsvParsed(parseCSV(ev.target.result)) }
    reader.readAsText(file)
  }

  function handleBulkImport() {
    if (csvParsed.length === 0) return
    onBulkAdd(csvParsed)
    onClose()
  }

  return (
    <>
      <label className="modal-label">Job URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
      <input ref={inputRef} className="modal-input" placeholder="Paste a job link..." value={url} onChange={e => setUrl(e.target.value)} />

      {loading && <div className="modal-loading"><div className="spinner" />Fetching...</div>}

      <label className="modal-label">Job Title</label>
      <input className="modal-input" placeholder="e.g. Software Engineer" value={title} onChange={e => setTitle(e.target.value)} />

      <label className="modal-label">Company</label>
      <input className="modal-input" placeholder="e.g. Google" value={company} onChange={e => setCompany(e.target.value)} />

      <label className="modal-label">Location <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
      <input className="modal-input" placeholder="e.g. New York, NY" value={location} onChange={e => setLocation(e.target.value)} />

      <label className="modal-label">Status</label>
      <select className="modal-select" value={status} onChange={e => setStatus(e.target.value)}>
        {STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="modal-file-input" />

      {csvParsed.length > 0 && (
        <div className="csv-preview">
          <p className="csv-count">{csvParsed.length} jobs found</p>
          <div className="csv-list">
            {csvParsed.slice(0, 5).map((j, i) => (
              <div key={i} className="csv-item">
                <span className="csv-item-title">{j.title}</span>
                <span className="csv-item-company">{j.company}</span>
              </div>
            ))}
            {csvParsed.length > 5 && <div className="csv-item" style={{ color: 'var(--text-muted)' }}>...and {csvParsed.length - 5} more</div>}
          </div>
        </div>
      )}

      <div className="modal-footer">
        <button className="btn-csv-import" onClick={() => fileRef.current?.click()} title="Import CSV">
          <CsvIcon />
        </button>
        <div className="modal-footer-right">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          {csvParsed.length > 0 ? (
            <button className="btn-save" onClick={handleBulkImport}>Import {csvParsed.length} Jobs</button>
          ) : (
            <button className="btn-save" onClick={handleAdd} disabled={!title.trim() || loading}>Add Job</button>
          )}
        </div>
      </div>
    </>
  )
}


function useDrag(initialX, initialY, onUpdate) {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  function onMouseDown(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return
    e.preventDefault()
    dragging.current = true
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }

    function onMove(ev) {
      if (!dragging.current) return
      const nx = ev.clientX - offset.current.x
      const ny = ev.clientY - offset.current.y
      setPos({ x: nx, y: ny })
    }
    function onUp() {
      dragging.current = false
      setPos(p => { onUpdate({ x: p.x, y: p.y }); return p })
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return { pos, onMouseDown }
}


const NOTE_COLORS = [
  { name: 'default', bg: 'transparent' },
  { name: 'white', bg: 'rgba(255,255,255,0.12)' },
  { name: 'beige', bg: 'rgba(210,180,140,0.18)' },
  { name: 'blue', bg: 'rgba(100,160,255,0.15)' },
  { name: 'red', bg: 'rgba(255,100,100,0.15)' },
  { name: 'pink', bg: 'rgba(255,140,200,0.15)' },
]

function StickyNote({ note, onUpdate, onDelete }) {
  const { pos, onMouseDown } = useDrag(note.x, note.y, onUpdate)
  const activeBg = NOTE_COLORS.find(c => c.name === note.noteColor)?.bg || 'transparent'

  return (
    <div
      className="sticky-note"
      style={{ left: pos.x, top: pos.y, background: activeBg }}
      onContextMenu={e => { e.preventDefault(); onDelete() }}
    >
      <div className="sticky-handle" onMouseDown={onMouseDown}>
        <div className="note-colors">
          {NOTE_COLORS.map(c => (
            <button
              key={c.name}
              className={`note-color-dot${note.noteColor === c.name ? ' active' : ''}`}
              style={{ background: c.name === 'default' ? 'rgba(255,255,255,0.06)' : c.bg }}
              onClick={() => onUpdate({ noteColor: c.name })}
            />
          ))}
        </div>
        <button className="sticky-delete" onClick={onDelete}>&times;</button>
      </div>
      <textarea
        className="sticky-text"
        value={note.text}
        onChange={e => onUpdate({ text: e.target.value })}
        placeholder="Type here..."
      />
    </div>
  )
}


function PolaroidImage({ image, onUpdate, onDelete }) {
  const { pos, onMouseDown } = useDrag(image.x, image.y, onUpdate)
  const fileRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onUpdate({ src: ev.target.result })
    reader.readAsDataURL(file)
  }

  return (
    <div
      className="polaroid"
      style={{ left: pos.x, top: pos.y, transform: `rotate(${(image.id.charCodeAt(0) % 7) - 3}deg)` }}
      onContextMenu={e => { e.preventDefault(); onDelete() }}
    >
      <div className="polaroid-handle" onMouseDown={onMouseDown}>
        <button className="polaroid-delete" onClick={onDelete}>&times;</button>
      </div>
      <div className="polaroid-image-area">
        {image.src ? (
          <img src={image.src} alt="" />
        ) : (
          <button className="polaroid-add" onClick={() => fileRef.current?.click()}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
