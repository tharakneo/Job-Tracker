const $ = (id) => document.getElementById(id);

function sendMsg(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (res?.error) reject(new Error(res.error));
            else resolve(res);
        });
    });
}

function showView(id) {
    ["auth-view", "main-view", "add-job-view"].forEach((v) => {
        $(v).classList.toggle("hidden", v !== id);
    });
}

function isRestrictedPage(url) {
    return /^(chrome|chrome-extension|edge|about|brave):\/\//i.test(url || "");
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
    try {
        const { token } = await sendMsg({ type: "GET_TOKEN" });
        showView(token ? "main-view" : "auth-view");
    } catch {
        showView("auth-view");
    }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

$("google-login-btn").addEventListener("click", async () => {
    $("auth-error").classList.add("hidden");
    $("google-login-btn").textContent = "Signing in...";
    $("google-login-btn").disabled = true;
    try {
        await sendMsg({ type: "GOOGLE_LOGIN" });
        showView("main-view");
    } catch (err) {
        $("auth-error").textContent = err.message;
        $("auth-error").classList.remove("hidden");
    } finally {
        $("google-login-btn").textContent = "Continue with Google";
        $("google-login-btn").disabled = false;
    }
});

$("logout-btn").addEventListener("click", async () => {
    await sendMsg({ type: "LOGOUT" });
    showView("auth-view");
});

// ── Job extraction (runs inside the target page via scripting API) ───────────

function extractJobFromPage() {
    const clean = (value) =>
        String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const textOf = (el) => clean(el?.textContent || "");

    const isVisible = (el) => {
        if (!el || !(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    const uniq = (items) => [...new Set(items.map(clean).filter(Boolean))];

    function findLabelValue(labelText) {
        const lower = clean(labelText).toLowerCase();
        // dt/th → next sibling
        for (const el of document.querySelectorAll("dt, th")) {
            if (textOf(el).toLowerCase() === lower) {
                const sib = el.nextElementSibling;
                if (sib) return textOf(sib);
            }
        }
        // Walk leaf elements looking for exact label text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
            const el = walker.currentNode;
            if (el.children.length > 2) continue;
            if (textOf(el).toLowerCase() === lower) {
                const next = el.nextElementSibling;
                if (next && textOf(next).length > 0) return textOf(next);
                const parentNext = el.parentElement?.nextElementSibling;
                if (parentNext && textOf(parentNext).length > 0) return textOf(parentNext);
            }
        }
        return "";
    }

    function findByType(node, type, results = []) {
        if (!node) return results;
        if (Array.isArray(node)) {
            node.forEach((item) => findByType(item, type, results));
            return results;
        }
        if (typeof node !== "object") return results;

        const nodeType = Array.isArray(node["@type"]) ? node["@type"].join(" ") : node["@type"];
        if (typeof nodeType === "string" && nodeType.toLowerCase().includes(type.toLowerCase())) {
            results.push(node);
        }

        Object.values(node).forEach((value) => findByType(value, type, results));
        return results;
    }

    function locationFromValue(value) {
        if (!value) return "";
        if (typeof value === "string") return clean(value);
        if (Array.isArray(value)) {
            return uniq(value.map(locationFromValue)).join(" / ");
        }

        const address = value.address || value.jobLocation?.address || value;
        const parts = [
            address.streetAddress,
            address.addressLocality,
            address.addressRegion,
            address.postalCode,
            address.addressCountry?.name || address.addressCountry,
        ];

        return clean(parts.filter(Boolean).join(", "));
    }

    // 1. JSON-LD structured data
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
            const raw = JSON.parse(script.textContent);
            const job = findByType(raw, "JobPosting")[0];
            if (job) {
                const location =
                    locationFromValue(job.jobLocation) ||
                    locationFromValue(job.applicantLocationRequirements) ||
                    findLabelValue("location");
                return {
                    title: clean(job.title || job.name),
                    company: clean(job.hiringOrganization?.name || job.hiringOrganization),
                    location,
                };
            }
        } catch {}
    }

    function parseTitleFromUrl() {
        const parts = decodeURIComponent(window.location.pathname)
            .split("/")
            .map((part) => clean(part))
            .filter(Boolean);

        const marker = parts.findIndex((part) =>
            /^(jobs?|job|positions?|openings?|opportunities?|roles?)$/i.test(part)
        );

        const candidates = marker >= 0 ? parts.slice(marker + 1) : parts.slice(-2);
        for (const part of candidates) {
            if (!/[a-z]/i.test(part)) continue;
            if (/^\d+$/.test(part)) continue;
            if (/^(search|apply|details?|careers?)$/i.test(part)) continue;

            const normalized = clean(
                part
                    .replace(/[-_]+/g, " ")
                    .replace(/\b(req|job)\s*\d+\b/gi, "")
                    .replace(/\b\d{5,}\b/g, "")
            );
            if (normalized) return normalized;
        }
        return "";
    }

    function isBadTitle(text) {
        const t = clean(text);
        if (!t || t.length < 3 || t.length > 140) return true;
        if (/skip\s+to|main\s+content|navigation|homepage/i.test(t)) return true;
        if (/^(job|jobs|careers?|opportunities|openings)$/i.test(t)) return true;
        if (/\b(build|grow|explore|start|shape|find|discover|join|launch)\b.*\b(career|future|team)\b/i.test(t)) return true;
        if (/\b(search|browse|view)\b.*\bjobs?\b/i.test(t)) return true;
        if (/apply now|learn more|working at|life at/i.test(t)) return true;
        return false;
    }

    function isBadCompany(text) {
        const t = clean(text);
        if (!t || t.length > 80) return true;
        if (/\b(careers?|jobs?|apply|search|talent|opportunities|portal)\b/i.test(t)) return true;
        if (/\b(build|join|discover|grow)\b.*\b(career|team|future)\b/i.test(t)) return true;
        return false;
    }

    function looksLikeLocation(text) {
        const t = clean(text);
        if (!t || t.length > 120) return false;
        return (
            /\b(remote|hybrid|on[- ]site|onsite|worldwide|anywhere)\b/i.test(t) ||
            /\b[a-z .'-]+,\s*[A-Z]{2}\b/.test(t) ||
            /\b[a-z .'-]+,\s*[a-z .'-]+\b/i.test(t)
        );
    }

    function scoreTitle(text, bonus = 0) {
        const t = clean(text);
        if (isBadTitle(t)) return -1;

        let score = bonus;
        const words = t.split(" ").length;

        if (words >= 2 && words <= 8) score += 2;
        if (words <= 12) score += 1;
        if (/\b(engineer|developer|manager|designer|analyst|scientist|architect|consultant|coordinator|specialist|recruiter|director|lead|principal|staff|intern|technician|administrator|product|sales|marketing|finance|operations|legal|support)\b/i.test(t)) {
            score += 4;
        }
        if (/[()/]/.test(t) || /\b(ii|iii|iv|senior|sr\.?|junior|jr\.?|lead|principal|staff)\b/i.test(t)) {
            score += 1;
        }
        if (/\b(career|team|future|search|opportunities)\b/i.test(t)) score -= 3;

        return score;
    }

    const og = (p) => clean(document.querySelector(`meta[property="${p}"]`)?.content);
    const meta = (n) => clean(document.querySelector(`meta[name="${n}"]`)?.content);

    const titleCandidates = [];
    const pushTitle = (value, bonus = 0) => {
        const text = clean(value);
        if (!text) return;
        titleCandidates.push({ value: text, score: scoreTitle(text, bonus) });
    };

    const titleSelectors = [
        ["[data-automation-id='jobPostingHeader'] h1", 8],
        ["[data-automation-id='jobPostingHeader'] h2", 8],
        ["[data-testid='job-title']", 8],
        ["[data-testid*='job-title']", 7],
        ["[class*='job-title']", 7],
        ["[class*='jobTitle']", 7],
        [".posting-headline h1", 7],
        [".posting-headline h2", 7],
        ["main article h1", 6],
        ["main h1", 5],
        ["article h1", 5],
        ["h1", 3],
        ["h2", 1],
    ];

    for (const [selector, bonus] of titleSelectors) {
        for (const el of document.querySelectorAll(selector)) {
            if (!isVisible(el) || el.closest("nav, header, footer")) continue;
            pushTitle(textOf(el), bonus);
        }
    }

    pushTitle(og("og:title"), 4);
    pushTitle(meta("title"), 2);

    clean(document.title)
        .split(/[|–—]/)
        .map((part) => clean(part))
        .forEach((part, index) => pushTitle(part, index === 0 ? 3 : 0));

    pushTitle(parseTitleFromUrl(), 2);

    const title =
        [...titleCandidates]
            .sort((a, b) => b.score - a.score || a.value.length - b.value.length)
            .find((candidate) => candidate.score >= 0)?.value || "";

    const companyCandidates = [];
    const pushCompany = (value, bonus = 0) => {
        const text = clean(value);
        if (!text || isBadCompany(text)) return;
        companyCandidates.push({ value: text, score: bonus + (text.split(" ").length <= 4 ? 2 : 0) });
    };

    const host = window.location.hostname.replace(/^www\./, "");
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (/jobs\.lever\.co$/i.test(host) && pathParts[0]) {
        pushCompany(pathParts[0].replace(/[-_]+/g, " "), 6);
    }
    if (/greenhouse\.io$/i.test(host) && pathParts[0]) {
        pushCompany(pathParts[0].replace(/[-_]+/g, " "), 6);
    }

    [
        ["[data-automation-id='companyName']", 8],
        ["[data-testid='company-name']", 7],
        ["[data-testid*='company']", 6],
        [".company-name", 6],
        [".posting-categories .sort-by-team", 3],
        ["a[href*='/company/']", 5],
        ["main a", 1],
    ].forEach(([selector, bonus]) => {
        for (const el of document.querySelectorAll(selector)) {
            if (!isVisible(el)) continue;
            pushCompany(textOf(el), bonus);
        }
    });

    pushCompany(og("og:site_name"), 5);

    const fallbackCompany = clean(
        host
            .split(".")
            .find((part) => !/^(www|boards|jobs|careers|apply|myworkdayjobs|wd\d+)$/i.test(part)) || ""
    ).replace(/[-_]+/g, " ");

    pushCompany(fallbackCompany, 2);

    let company =
        [...companyCandidates]
            .sort((a, b) => b.score - a.score || a.value.length - b.value.length)
            .find((candidate) => candidate.score >= 0)?.value || "";

    const locationCandidates = [];
    const pushLocation = (value, bonus = 0) => {
        const text = clean(value);
        if (!text || !looksLikeLocation(text)) return;
        locationCandidates.push({ value: text, score: bonus });
    };

    [
        ["[data-automation-id='locations']", 8],
        ["[data-automation-id='primaryLocation']", 8],
        ["[data-automation-id*='location']", 6],
        ["[data-testid='job-location']", 7],
        ["[data-testid*='location']", 6],
        [".sort-by-location", 6],
        [".job-location", 6],
        ["[class*='location']", 2],
    ].forEach(([selector, bonus]) => {
        for (const el of document.querySelectorAll(selector)) {
            if (!isVisible(el)) continue;
            pushLocation(textOf(el), bonus);
        }
    });

    pushLocation(findLabelValue("Location"), 5);
    pushLocation(findLabelValue("Job Location"), 5);
    pushLocation(og("og:locality"), 3);

    const location =
        [...locationCandidates]
            .sort((a, b) => b.score - a.score || a.value.length - b.value.length)
            .find((candidate) => candidate.score >= 0)?.value || "";

    // Parse "Title at Company" pattern from title/meta
    if (!company && title) {
        const m = title.match(/^(.+?)\s+at\s+([\w\s&.,'-]+?)(?:\s*[|–—-]|$)/i);
        if (m) {
            company = clean(m[2]);
        }
    }

    const cleanedTitle = clean(
        title
            .replace(/\s*[|–—]\s*.+$/, "")
            .replace(/\s+-\s+[A-Z][A-Za-z0-9 '&.-]+$/, "")
            .replace(/\s+at\s+[\w\s&.,'-]+$/i, "")
    );

    return { title: cleanedTitle, company, location };
}

// ── Add Job flow ─────────────────────────────────────────────────────────────

$("add-job-btn").addEventListener("click", async () => {
    showView("add-job-view");
    $("parse-loading").classList.remove("hidden");
    $("add-job-form").classList.add("hidden");
    $("add-job-error").classList.add("hidden");

    let job = { title: "", company: "", location: "" };

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.url || isRestrictedPage(tab.url)) {
            throw new Error("Open a job posting in a normal website tab to extract details automatically.");
        }

        // Extract job data directly from the page DOM
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractJobFromPage,
        });

        if (injection?.result) {
            job = injection.result;
        }

        // If no company found, use the domain name
        if (!job.company && tab.url) {
            try {
                const hostname = new URL(tab.url).hostname.replace("www.", "");
                job.company = hostname.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
            } catch {}
        }
    } catch (err) {
        $("add-job-error").textContent = err.message;
        $("add-job-error").classList.remove("hidden");
    }

    $("job-title").value = job.title || "";
    $("job-company").value = job.company || "";
    $("job-location").value = job.location || "";
    $("job-status").value = "Applied";

    $("parse-loading").classList.add("hidden");
    $("add-job-form").classList.remove("hidden");
    $("job-title").focus();
});

$("back-btn").addEventListener("click", () => showView("main-view"));

$("add-job-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("add-job-error").classList.add("hidden");

    const title = $("job-title").value.trim();
    if (!title) {
        $("add-job-error").textContent = "Job title is required";
        $("add-job-error").classList.remove("hidden");
        return;
    }

    const btn = $("save-job-btn");
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await sendMsg({
            type: "ADD_JOB",
            data: {
                title,
                company: $("job-company").value.trim(),
                location: $("job-location").value.trim(),
                status: $("job-status").value,
                url: isRestrictedPage(tab?.url) ? "" : tab.url,
            },
        });
        btn.textContent = "Saved";
        btn.style.color = "#5b9df5";
        setTimeout(() => showView("main-view"), 800);
    } catch (err) {
        $("add-job-error").textContent = err.message;
        $("add-job-error").classList.remove("hidden");
        btn.textContent = "Save to Tracker";
        btn.disabled = false;
    }
});

// ── Autofill ─────────────────────────────────────────────────────────────────

$("fill-btn").addEventListener("click", async () => {
    const btn = $("fill-btn");
    btn.textContent = "Filling...";
    btn.disabled = true;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FILL" });
        btn.textContent = "Done — review fields";
        setTimeout(() => {
            btn.textContent = "Autofill";
            btn.disabled = false;
        }, 2500);
    } catch {
        btn.textContent = "Autofill";
        btn.disabled = false;
    }
});

init();
