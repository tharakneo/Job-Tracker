// Extract job data from the active tab, show in popup, and add to Job Tracker

const GENERIC_COMPANIES = ['jobs', 'careers', 'career', 'hiring', 'apply', 'job', 'boards', 'job-boards', 'workday', 'myworkdayjobs']

document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('loading')
    const formEl = document.getElementById('form')
    const statusBadge = document.getElementById('statusBadge')

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) throw new Error('No active tab')

        // Extract job data from the current page
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractJobFromPage,
        })

        const data = result?.result || {}
        const url = tab.url || ''
        const domain = extractDomain(url)

        // Fill in the form
        document.getElementById('title').value = data.title || ''
        document.getElementById('company').value = cleanCompany(data.company, domain) || ''
        document.getElementById('location').value = data.location || ''
        document.getElementById('urlDisplay').textContent = url
        document.getElementById('urlDisplay').title = url

        statusBadge.textContent = data.title ? 'Ready' : 'Manual entry'
        statusBadge.style.background = data.title ? 'rgba(80, 200, 120, 0.12)' : 'rgba(255, 200, 50, 0.12)'
        statusBadge.style.color = data.title ? '#50c878' : '#e8c840'

        loadingEl.style.display = 'none'
        formEl.style.display = 'block'

        // Add button handler
        document.getElementById('addBtn').addEventListener('click', async () => {
            const title = document.getElementById('title').value.trim()
            const company = document.getElementById('company').value.trim()
            const location = document.getElementById('location').value.trim()
            const status = document.getElementById('status').value

            if (!title) {
                showMessage('Please enter a job title', 'error')
                return
            }

            const job = {
                id: crypto.randomUUID(),
                title,
                company: company || 'Unknown',
                location,
                domain: domain || '',
                logoUrl: domain ? `https://logo.clearbit.com/${domain.replace(/^www\./, '')}` : '',
                fallbackLogoUrl: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : '',
                url,
                status,
                addedAt: Date.now(),
            }

            // Find Job Tracker tab and inject the job
            const allTabs = await chrome.tabs.query({})
            const trackerTab = allTabs.find(t =>
                t.title?.includes('Job Tracker') ||
                t.url?.includes('job-tracker') ||
                t.url?.includes('localhost:5173')
            )

            if (!trackerTab) {
                showMessage('Open your Job Tracker app first!', 'error')
                return
            }

            try {
                await chrome.scripting.executeScript({
                    target: { tabId: trackerTab.id },
                    func: addJobToTracker,
                    args: [job],
                })

                showMessage('Added to Job Tracker!', 'success')
                document.getElementById('addBtn').disabled = true
                document.getElementById('addBtn').textContent = '✓ Added'

                // Focus the Job Tracker tab
                chrome.tabs.update(trackerTab.id, { active: true })
                chrome.windows.update(trackerTab.windowId, { focused: true })
            } catch (err) {
                showMessage('Failed to add. Is the Job Tracker tab open?', 'error')
            }
        })

    } catch (err) {
        loadingEl.innerHTML = '<p style="color:#ff8888">Could not read this page</p>'
        statusBadge.textContent = 'Error'
        statusBadge.style.background = 'rgba(255, 100, 100, 0.12)'
        statusBadge.style.color = '#ff8888'
    }
})

// This runs IN the active tab to extract job data
function extractJobFromPage() {
    const meta = (name) =>
        document.querySelector(`meta[property="${name}"]`)?.content ||
        document.querySelector(`meta[name="${name}"]`)?.content || ''

    let title = ''
    let company = ''
    let location = ''

    // Try structured data (JSON-LD)
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (const s of ldScripts) {
        try {
            const data = JSON.parse(s.textContent)
            const job = data['@type'] === 'JobPosting' ? data :
                Array.isArray(data['@graph']) ? data['@graph'].find(i => i['@type'] === 'JobPosting') : null
            if (job) {
                title = job.title || ''
                company = job.hiringOrganization?.name || ''
                location = job.jobLocation?.address?.addressLocality
                    ? `${job.jobLocation.address.addressLocality}, ${job.jobLocation.address.addressRegion || ''}`
                    : ''
                if (title) return { title, company, location }
            }
        } catch { }
    }

    // Try Open Graph / meta tags
    title = meta('og:title') || meta('title') || document.title || ''
    company = meta('og:site_name') || ''

    // LinkedIn specific
    const host = window.location.hostname
    if (host.includes('linkedin.com')) {
        const h1 = document.querySelector('h1.top-card-layout__title, .job-details-jobs-unified-top-card__job-title, h1')
        if (h1) title = h1.textContent.trim()
        const compEl = document.querySelector('.topcard__org-name-link, .job-details-jobs-unified-top-card__company-name a, a[data-tracking-control-name="public_jobs_topcard-org-name"]')
        if (compEl) company = compEl.textContent.trim()
        const locEl = document.querySelector('.topcard__flavor--bullet, .job-details-jobs-unified-top-card__bullet, .top-card-layout__second-subline span')
        if (locEl) location = locEl.textContent.trim()
    }

    // Greenhouse
    if (host.includes('greenhouse.io')) {
        const h1 = document.querySelector('.app-title, h1')
        if (h1) title = h1.textContent.trim()
        const loc = document.querySelector('.location')
        if (loc) location = loc.textContent.trim()
    }

    // Lever
    if (host.includes('lever.co')) {
        const h2 = document.querySelector('.posting-headline h2')
        if (h2) title = h2.textContent.trim()
        const loc = document.querySelector('.posting-categories .sort-by-commitment, .posting-categories .location')
        if (loc) location = loc.textContent.trim()
        const comp = document.querySelector('.posting-headline .company-name')
        if (comp) company = comp.textContent.trim()
    }

    // Workday
    if (host.includes('workday') || host.includes('myworkdayjobs')) {
        const h2 = document.querySelector('[data-automation-id="jobPostingHeader"], h2')
        if (h2) title = h2.textContent.trim()
        const loc = document.querySelector('[data-automation-id="locations"] dd')
        if (loc) location = loc.textContent.trim()
    }

    // Generic location fallback — try common selectors if location is still empty
    if (!location) {
        const locMeta = meta('geo.placename') || meta('geo.region')
        if (locMeta) location = locMeta

        // Look for text like "Location: City, State" on the page
        if (!location) {
            const allEls = document.querySelectorAll('p, div, span, li, dd, td')
            for (const el of allEls) {
                const text = el.textContent.trim()
                const match = text.match(/^Location\s*[:.\-]\s*(.+)/i)
                if (match && match[1].length < 100 && match[1].length > 2) {
                    location = match[1].trim()
                    break
                }
            }
        }

        // Try common class selectors, skip inputs and search elements
        if (!location) {
            const locSelectors = [
                '[class*="job-location" i]', '[data-testid*="location" i]',
                '[class*="jobLocation" i]', '[itemprop="jobLocation"]',
            ]
            for (const sel of locSelectors) {
                try {
                    const el = document.querySelector(sel)
                    if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') {
                        const text = el.textContent.trim()
                        if (text && text.length < 100 && text.length > 2 && !text.toLowerCase().includes('search')) {
                            location = text.split('\n')[0].trim()
                            break
                        }
                    }
                } catch { }
            }
        }
    }

    // Clean up title — remove company suffix
    if (title && company && title.endsWith(company)) {
        title = title.slice(0, -company.length).trim().replace(/[-|–—]+$/, '').trim()
    }
    if (!company && title.includes(' at ')) {
        const parts = title.split(' at ')
        title = parts[0].trim()
        company = parts[1]?.trim() || ''
    }
    if (!company && title.includes(' - ')) {
        const parts = title.split(' - ')
        if (parts.length === 2) {
            title = parts[0].trim()
            company = parts[1].trim()
        }
    }

    return { title, company, location }
}

// This runs IN the Job Tracker tab to add the job
function addJobToTracker(job) {
    try {
        const existing = JSON.parse(localStorage.getItem('jt-jobs') || '[]')
        existing.unshift(job)
        localStorage.setItem('jt-jobs', JSON.stringify(existing))
        window.dispatchEvent(new CustomEvent('jt-update'))
    } catch (err) {
        throw new Error('Failed to save job')
    }
}

// Helper: extract domain
function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '')
    } catch {
        return null
    }
}

// Helper: clean company name
function cleanCompany(company, domain) {
    if (!company || GENERIC_COMPANIES.includes(company.toLowerCase().trim())) {
        if (!domain) return company || ''
        const parts = domain.split('.')
        // Skip generic first parts like 'jobs', 'careers' etc.
        let name = parts[0]
        if (GENERIC_COMPANIES.includes(name.toLowerCase()) && parts.length > 1) {
            name = parts[1]
        }
        return name.charAt(0).toUpperCase() + name.slice(1)
    }
    return company
}

// Helper: show message
function showMessage(text, type) {
    const el = document.getElementById('message')
    el.textContent = text
    el.className = `msg ${type}`
    if (type === 'success') {
        setTimeout(() => window.close(), 1500)
    }
}
