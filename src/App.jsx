import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'


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

function timeAgo(dateString, status) {
  const label = status || 'Saved'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return `${label} sometime ago`
  const diff = Date.now() - date.getTime()
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

const ProfileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21a8 8 0 0 0-16 0" />
    <circle cx="12" cy="8" r="4" />
  </svg>
)

const AUTOFILL_STORAGE_KEY = 'jt-autofill'
const AUTOFILL_MODULES = [
  { id: 'personal',    label: 'Personal' },
  { id: 'work_auth',  label: 'Work Auth' },
  { id: 'eeo',        label: 'EEO' },
  { id: 'background', label: 'Background' },
]

function defaultAutofillData() {
  return {
    // Section 1 — Personal Info
    firstName: '', lastName: '', email: '', phone: '',
    linkedin: '', portfolio: '', github: '',
    addressLine1: '', city: '', state: '', zip: '', country: 'United States',
    // Section 2 — Work Authorization
    workAuthorized: true,
    requiresSponsorshipNow: false,
    requiresSponsorshipFuture: true,
    visaType: '',
    // Section 3 — EEO / Demographics
    gender: 'Prefer not to say',
    race: 'Prefer not to say',
    veteranStatus: 'Prefer not to say',
    disabilityStatus: 'Prefer not to say',
    // Section 4 — Background Questions
    heardFrom: 'LinkedIn',
    is18OrOlder: true,
    willingToRelocate: false,
    workPreference: 'Hybrid',
  }
}

function parseStoredJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

function normalizeAutofillData(raw) {
  const base = defaultAutofillData()
  const data = raw && typeof raw === 'object' ? raw : {}
  const merged = { ...base, ...data }
  // Coerce booleans — DB may return true/false, old storage may have "Yes"/"No"
  const coerceBool = (val, fallback) => {
    if (typeof val === 'boolean') return val
    if (val === 'Yes' || val === 'true') return true
    if (val === 'No' || val === 'false') return false
    return fallback
  }
  merged.workAuthorized = coerceBool(merged.workAuthorized, base.workAuthorized)
  merged.requiresSponsorshipNow = coerceBool(merged.requiresSponsorshipNow, base.requiresSponsorshipNow)
  merged.requiresSponsorshipFuture = coerceBool(merged.requiresSponsorshipFuture, base.requiresSponsorshipFuture)
  merged.is18OrOlder = coerceBool(merged.is18OrOlder, base.is18OrOlder)
  merged.willingToRelocate = coerceBool(merged.willingToRelocate, base.willingToRelocate)
  return merged
}

function countFilled(values) {
  return values.filter(value => {
    if (typeof value === 'boolean') return true
    return String(value || '').trim().length > 0
  }).length
}

function getAutofillModuleCounts(data) {
  const personalCount = countFilled([
    data.firstName, data.lastName, data.email, data.phone,
    data.linkedin, data.city, data.state, data.zip,
  ])
  const eeoFilled = [data.gender, data.race, data.veteranStatus, data.disabilityStatus]
    .filter(v => v && v !== 'Prefer not to say').length

  return {
    personal:    `${personalCount}/8`,
    work_auth:   data.visaType ? '✓' : '—',
    eeo:         eeoFilled > 0 ? `${eeoFilled}/4` : '—',
    background:  data.workPreference || '—',
  }
}

function mergeProfileRowIntoAutofill(prev, row) {
  const next = { ...prev }
  Object.entries(row || {}).forEach(([col, val]) => {
    const key = DB_TO_AUTOFILL[col]
    if (key && val != null) next[key] = val
  })
  return normalizeAutofillData(next)
}

function buildProfileRowFromAutofill(data, userId) {
  const dbRow = { id: userId }
  Object.entries(AUTOFILL_TO_DB).forEach(([key, col]) => {
    if (data[key] !== undefined) dbRow[col] = data[key]
  })
  return dbRow
}


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
  const [jobs, setJobs] = useState([])
  const [activeStatus, setActiveStatus] = useState('Applied')
  const [activeAutofillModule, setActiveAutofillModule] = useState('personal')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)
  const [showFab, setShowFab] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState(new Set())
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [activePanel, setActivePanel] = useState(null) // 'autofill' | null
  const [autofillData, setAutofillData] = useState(() => normalizeAutofillData(parseStoredJSON(AUTOFILL_STORAGE_KEY, {})))
  const [autofillSaving, setAutofillSaving] = useState(false)
  const profileMenuRef = useRef(null)
  const schemaWarningShown = useRef(false)
  const profileSchemaWarningShown = useRef(false)

  function requireSignedInUser(action = 'continue') {
    if (user?.id) return user.id
    showToastMsg(`Sign in with Google to ${action}`)
    return null
  }

  function isMissingJobsUserIdColumn(error) {
    return Boolean(error?.message?.includes("Could not find the 'user_id' column of 'jobs'"))
  }

  function isMissingProfilesColumn(error) {
    return Boolean(error?.message?.includes('profiles'))
  }

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!showProfileMenu) return
    const handler = (e) => {
      if (!profileMenuRef.current?.contains(e.target)) setShowProfileMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfileMenu])

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    setShowProfileMenu(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setShowProfileMenu(false)
    setActivePanel(null)
  }

  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt-notes') || '[]') } catch { return [] }
  })
  const [images, setImages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt-images') || '[]') } catch { return [] }
  })

  useEffect(() => { localStorage.setItem('jt-notes', JSON.stringify(notes)) }, [notes])
  useEffect(() => { localStorage.setItem('jt-images', JSON.stringify(images)) }, [images])

  useEffect(() => {
    if (activePanel !== 'autofill') return
    setShowModal(false)
    setShowFab(false)
    setOpenMenu(null)
    setSelectMode(false)
    // Always reset to first module when opening autofill panel
    setActiveAutofillModule(prev =>
      AUTOFILL_MODULES.some(m => m.id === prev) ? prev : 'personal'
    )
  }, [activePanel])

  useEffect(() => {
    if (activePanel !== 'autofill' || !user?.id) return

    let cancelled = false
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data: row, error }) => {
      if (cancelled) return
      if (error) {
        if (!profileSchemaWarningShown.current && isMissingProfilesColumn(error)) {
          profileSchemaWarningShown.current = true
          showToastMsg('Some profile fields are not in Supabase yet. Core autofill fields will still save.')
        }
        return
      }
      if (row) setAutofillData(prev => mergeProfileRowIntoAutofill(prev, row))
    })

    return () => { cancelled = true }
  }, [activePanel, user?.id])

  async function saveAutofillWorkspace() {
    localStorage.setItem(AUTOFILL_STORAGE_KEY, JSON.stringify(autofillData))

    if (!user?.id) {
      showToastMsg('Autofill saved locally. Sign in with Google to sync it with the extension.')
      return
    }

    setAutofillSaving(true)
    try {
      const dbRow = buildProfileRowFromAutofill(autofillData, user.id)
      const { error } = await supabase.from('profiles').upsert(dbRow, { onConflict: 'id' })
      if (error) throw error
      showToastMsg('Autofill details saved')
    } catch (error) {
      showToastMsg(error.message || 'Could not save autofill details')
    } finally {
      setAutofillSaving(false)
    }
  }

  // Fetch jobs from Supabase
  async function fetchJobs() {
    if (!authReady) return
    if (!user?.id) {
      setJobs([])
      return
    }
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })
    if (error) {
      if (!schemaWarningShown.current && isMissingJobsUserIdColumn(error)) {
        schemaWarningShown.current = true
        showToastMsg('Supabase is missing jobs.user_id. Run supabase/account_jobs_migration.sql in the SQL Editor.')
      }
      return
    }
    if (data) {
      setJobs(data.map(j => ({
        id: j.id, title: j.title, company: j.company, location: j.location,
        url: j.url, domain: j.domain, logoUrl: j.logo_url,
        fallbackLogoUrl: j.fallback_logo_url, status: j.status, addedAt: j.added_at
      })))
    }
  }

  useEffect(() => {
    if (!authReady) return
    fetchJobs()
  }, [authReady, user?.id])

  // Re-fetch when tab becomes visible (catches jobs added from extension)
  useEffect(() => {
    if (!authReady) return
    const onVisible = () => { if (document.visibilityState === 'visible') fetchJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [authReady, user?.id])

  // Realtime: update jobs list instantly when extension adds/moves/removes a job
  useEffect(() => {
    if (!authReady) return
    const mapRow = j => ({
      id: j.id, title: j.title, company: j.company, location: j.location,
      url: j.url, domain: j.domain, logoUrl: j.logo_url,
      fallbackLogoUrl: j.fallback_logo_url, status: j.status, addedAt: j.added_at
    })
    if (!user?.id) return
    const channel = supabase.channel('jobs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, ({ new: j }) => {
        setJobs(prev => prev.find(x => x.id === j.id) ? prev : [mapRow(j), ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, ({ new: j }) => {
        setJobs(prev => prev.map(x => x.id === j.id ? { ...x, ...mapRow(j) } : x))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, ({ old: j }) => {
        setJobs(prev => prev.filter(x => x.id !== j.id))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [authReady, user?.id])

  useEffect(() => {
    if (openMenu === null) return
    const handler = () => setOpenMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenu])



  useEffect(() => {
    if (!showModal) return
    const handler = (e) => {
      if (e.target.closest('.side-panel') || e.target.closest('.btn-add-wrap')) return
      setShowModal(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModal])


  const counts = {}
  STATUSES.forEach(s => { counts[s] = 0 })
  jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++ })
  const autofillModuleCounts = getAutofillModuleCounts(autofillData)

  const filtered = jobs.filter(j => {
    if (j.status !== activeStatus) return false
    const q = search.toLowerCase()
    if (!q) return true
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location?.toLowerCase().includes(q)
  })

  async function deleteJob(id) {
    if (!user?.id) return
    setJobs(prev => prev.filter(j => j.id !== id))
    setOpenMenu(null)
    await supabase.from('jobs').delete().eq('id', id).eq('user_id', user.id)
  }

  async function moveJob(id, newStatus) {
    if (!user?.id) return
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j))
    setOpenMenu(null)
    showToastMsg(`Moved to ${newStatus}`)
    await supabase.from('jobs').update({ status: newStatus }).eq('id', id).eq('user_id', user.id)
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

  async function bulkDeleteSelected() {
    if (!user?.id) return
    const idsToDelete = Array.from(selectedJobs)
    setJobs(prev => prev.filter(j => !selectedJobs.has(j.id)))
    setSelectedJobs(new Set())
    showToastMsg(`Removed ${idsToDelete.length} jobs`)
    await supabase.from('jobs').delete().in('id', idsToDelete).eq('user_id', user.id)
  }

  async function bulkMoveSelected(newStatus) {
    if (!user?.id) return
    const idsToMove = Array.from(selectedJobs)
    setJobs(prev => prev.map(j => selectedJobs.has(j.id) ? { ...j, status: newStatus } : j))
    setSelectedJobs(new Set())
    showToastMsg(`Moved ${idsToMove.length} jobs to ${newStatus}`)
    await supabase.from('jobs').update({ status: newStatus }).in('id', idsToMove).eq('user_id', user.id)
  }

  async function addJob(job) {
    const userId = requireSignedInUser('save jobs')
    if (!userId) return

    // Generate UUID if not provided by crypto (though crypto should work)
    const newId = crypto.randomUUID()
    const jobToInsert = { ...job, id: newId }
    
    // Optimistic UI update
    setJobs(prev => [jobToInsert, ...prev])
    showToastMsg(`Added "${job.title}"`)

    // Save to Supabase
    await supabase.from('jobs').insert([{
      id: newId,
      user_id: userId,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      domain: job.domain,
      logo_url: job.logoUrl,
      fallback_logo_url: job.fallbackLogoUrl,
      status: job.status
    }])
  }

  async function bulkAdd(newJobs) {
    const userId = requireSignedInUser('import jobs')
    if (!userId) return

    // Optimistic UI update
    setJobs(prev => [...newJobs, ...prev])
    showToastMsg(`Imported ${newJobs.length} jobs`)

    // Map to snake_case for Supabase
    const supabaseJobs = newJobs.map(j => ({
      id: j.id,
      user_id: userId,
      title: j.title,
      company: j.company,
      location: j.location,
      url: j.url,
      domain: j.domain,
      logo_url: j.logoUrl,
      fallback_logo_url: j.fallbackLogoUrl,
      status: j.status
    }))

    await supabase.from('jobs').insert(supabaseJobs)
  }

  function showToastMsg(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }


  useEffect(() => {
    if (!showFab) return
    const handler = (e) => {
      if (e.target.closest('.btn-add-wrap')) return
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
      {/* Absolute Logo */}
      <span className="brand absolute-brand"><span className="brand-jt">job tracker</span></span>

      <div className="top-right-actions" ref={profileMenuRef}>
        <button
          className="profile-avatar-btn"
          type="button"
          aria-label="Profile"
          onClick={() => setShowProfileMenu(v => !v)}
        >
          {user?.user_metadata?.avatar_url
            ? <img className="profile-avatar-img" src={user.user_metadata.avatar_url} alt="" />
            : <span className="profile-avatar-icon"><ProfileIcon /></span>
          }
        </button>

        {showProfileMenu && (
          <div className="profile-dropdown">
            {user ? (
              <>
                <div className="profile-dropdown-header">
                  <strong>{user.user_metadata?.full_name || 'Account'}</strong>
                  <span>{user.email}</span>
                </div>
                <div className="dropdown-divider" />
                <button onClick={() => { setActiveAutofillModule('profile'); setActivePanel('autofill'); setShowProfileMenu(false) }}>Autofill</button>
                <div className="dropdown-divider" />
                <button className="destructive" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <>
                <div className="profile-dropdown-header">
                  <strong>Welcome</strong>
                  <span>Sign in to save your data</span>
                </div>
                <div className="dropdown-divider" />
                <button onClick={signInWithGoogle}>Sign in with Google</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Left sidebar */}
      <div className="sidebar">
        {activePanel === 'autofill' ? (
          <>
            <nav className="sidebar-nav">
              {AUTOFILL_MODULES.map(module => (
                <button
                  key={module.id}
                  className={`sidebar-item${activeAutofillModule === module.id ? ' active' : ''}`}
                  onClick={() => setActiveAutofillModule(module.id)}
                >
                  <span className="sidebar-item-label">{module.label}</span>
                  <span className="sidebar-item-count">{autofillModuleCounts[module.id]}</span>
                </button>
              ))}
            </nav>
          </>
        ) : (
          <nav className="sidebar-nav">
            {STATUSES.map(s => (
              <button
                key={s}
                className={`sidebar-item${activeStatus === s ? ' active' : ''}`}
                onClick={() => { setActivePanel(null); setActiveStatus(s); setSelectMode(false); setSelectedJobs(new Set()); setSearch(''); }}
              >
                <span className="sidebar-item-label">{s}</span>
                <span className="sidebar-item-count">{counts[s]}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Main panel */}
      <div className="main">
        <div className="jobs-card">
          {activePanel === 'autofill' ? (
            <AutofillWorkspace
              data={autofillData}
              setData={setAutofillData}
              activeModule={activeAutofillModule}
              onClose={() => setActivePanel(null)}
              onSave={saveAutofillWorkspace}
              saving={autofillSaving}
            />
          ) : (
            <>
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
                    <div className="btn-add-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button className="btn-add" onClick={() => { setShowFab(!showFab); setShowModal(false); }}>
                        <PlusIcon /> Add
                      </button>
                      {showFab && (
                        <div className="fab-dropdown" onClick={e => e.stopPropagation()} style={{ top: 'calc(100% + 8px)', right: 0 }}>
                          <button onClick={() => { setShowModal(true); setShowFab(false); }}>Job</button>
                          <button onClick={addNote}>Note</button>
                          <button onClick={addImage}>Image</button>
                        </div>
                      )}
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
                        <div className="job-posted">{timeAgo((job.addedAt || new Date()).toString(), job.status)}</div>
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
            </>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}


      {activePanel !== 'autofill' && notes.map(note => (
        <StickyNote
          key={note.id}
          note={note}
          onUpdate={(u) => updateNote(note.id, u)}
          onDelete={() => deleteNote(note.id)}
        />
      ))}


      {activePanel !== 'autofill' && images.map(img => (
        <PolaroidImage
          key={img.id}
          image={img}
          onUpdate={(u) => updateImage(img.id, u)}
          onDelete={() => deleteImage(img.id)}
        />
      ))}


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

// Map website camelCase keys to Supabase profiles column names
const AUTOFILL_TO_DB = {
  firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone',
  addressLine1: 'address_line1',
  linkedin: 'linkedin_url', github: 'github_url', portfolio: 'portfolio_url',
  city: 'city', state: 'state', zip: 'zip_code', country: 'country',
  workAuthorized: 'work_authorized',
  requiresSponsorshipNow: 'requires_sponsorship_now',
  requiresSponsorshipFuture: 'requires_sponsorship_future',
  visaType: 'visa_type',
  gender: 'gender', race: 'race',
  veteranStatus: 'veteran_status', disabilityStatus: 'disability_status',
  heardFrom: 'heard_from',
  is18OrOlder: 'is_18_or_older',
  willingToRelocate: 'willing_to_relocate',
  workPreference: 'work_preference',
}
const DB_TO_AUTOFILL = Object.fromEntries(Object.entries(AUTOFILL_TO_DB).map(([k, v]) => [v, k]))

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      className={`af-toggle${value ? ' af-toggle-on' : ''}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
    >
      <span className="af-toggle-thumb" />
    </button>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="af-toggle-row">
      <span className="af-toggle-label">{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function AutofillWorkspace({ data, setData, activeModule: activeModuleProp, onClose, onSave, saving }) {
  // Fall back to 'personal' if an unrecognised module id is passed (e.g. stale HMR state)
  const activeModule = AUTOFILL_MODULES.some(m => m.id === activeModuleProp)
    ? activeModuleProp
    : 'personal'

  function set(key, value) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  const moduleLabel = AUTOFILL_MODULES.find(m => m.id === activeModule)?.label || 'Personal'

  return (
    <>
      <div className="jobs-topbar">
        <span className="autofill-topbar-title">{moduleLabel}</span>
        <div style={{ flex: 1 }} />
        <button className="btn-cancel" onClick={onClose}>Close</button>
        <button className="btn-save" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
      </div>

      <div className="jobs-list autofill-form">

        {activeModule === 'personal' && (
          <>
            <div className="form-row">
              <div className="form-group"><label>First Name</label><input value={data.firstName} onChange={e => set('firstName', e.target.value)} placeholder="First" /></div>
              <div className="form-group"><label>Last Name</label><input value={data.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Last" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Email</label><input value={data.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" /></div>
              <div className="form-group"><label>Phone</label><input value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" /></div>
            </div>
            <div className="form-group"><label>LinkedIn URL</label><input value={data.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/in/yourname" /></div>
            <div className="form-row">
              <div className="form-group"><label>Portfolio / Website</label><input value={data.portfolio} onChange={e => set('portfolio', e.target.value)} placeholder="yourwebsite.com" /></div>
              <div className="form-group"><label>GitHub URL</label><input value={data.github} onChange={e => set('github', e.target.value)} placeholder="github.com/yourname" /></div>
            </div>
            <div className="form-group"><label>Address Line 1</label><input value={data.addressLine1 || ''} onChange={e => set('addressLine1', e.target.value)} placeholder="123 Main St" /></div>
            <div className="form-row">
              <div className="form-group"><label>City</label><input value={data.city} onChange={e => set('city', e.target.value)} placeholder="City" /></div>
              <div className="form-group"><label>State</label><input value={data.state} onChange={e => set('state', e.target.value)} placeholder="State" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Zip Code</label><input value={data.zip} onChange={e => set('zip', e.target.value)} placeholder="10001" /></div>
              <div className="form-group"><label>Country</label><input value={data.country} onChange={e => set('country', e.target.value)} placeholder="United States" /></div>
            </div>
          </>
        )}

        {activeModule === 'work_auth' && (
          <>
            <ToggleRow label="Authorized to work in US?" value={data.workAuthorized} onChange={v => set('workAuthorized', v)} />
            <ToggleRow label="Require sponsorship now?" value={data.requiresSponsorshipNow} onChange={v => set('requiresSponsorshipNow', v)} />
            <ToggleRow label="Require sponsorship in future?" value={data.requiresSponsorshipFuture} onChange={v => set('requiresSponsorshipFuture', v)} />
            <div className="form-group" style={{ marginTop: '20px' }}>
              <label>Visa Type</label>
              <input value={data.visaType || ''} onChange={e => set('visaType', e.target.value)} placeholder="e.g. F-1 OPT, H-1B" />
            </div>
          </>
        )}

        {activeModule === 'eeo' && (
          <>
            <div className="form-group"><label>Gender</label>
              <select value={data.gender} onChange={e => set('gender', e.target.value)}>
                <option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
              </select>
            </div>
            <div className="form-group"><label>Race / Ethnicity</label>
              <select value={data.race} onChange={e => set('race', e.target.value)}>
                <option>Asian</option>
                <option>White</option>
                <option>Hispanic or Latino</option>
                <option>Black or African American</option>
                <option>Two or more races</option>
                <option>Prefer not to say</option>
              </select>
            </div>
            <div className="form-group"><label>Veteran Status</label>
              <select value={data.veteranStatus} onChange={e => set('veteranStatus', e.target.value)}>
                <option>I am not a protected veteran</option>
                <option>I am a protected veteran</option>
                <option>Prefer not to say</option>
              </select>
            </div>
            <div className="form-group"><label>Disability Status</label>
              <select value={data.disabilityStatus} onChange={e => set('disabilityStatus', e.target.value)}>
                <option>No, I do not have a disability</option>
                <option>Yes, I have a disability</option>
                <option>Prefer not to say</option>
              </select>
            </div>
          </>
        )}

        {activeModule === 'background' && (
          <>
            <div className="form-group"><label>How did you hear about us?</label>
              <select value={data.heardFrom} onChange={e => set('heardFrom', e.target.value)}>
                <option>LinkedIn</option><option>Indeed</option><option>Handshake</option>
                <option>Company Website</option><option>Referral</option><option>Other</option>
              </select>
            </div>
            <div className="form-group"><label>Work Preference</label>
              <select value={data.workPreference} onChange={e => set('workPreference', e.target.value)}>
                <option>Remote</option><option>Hybrid</option><option>On-site</option>
              </select>
            </div>
            <ToggleRow label="Are you 18 or older?" value={data.is18OrOlder} onChange={v => set('is18OrOlder', v)} />
            <ToggleRow label="Willing to relocate?" value={data.willingToRelocate} onChange={v => set('willingToRelocate', v)} />
          </>
        )}

      </div>
    </>
  )
}
