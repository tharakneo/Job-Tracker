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
    function findLabelValue(labelText) {
        const lower = labelText.toLowerCase();
        // dt/th → next sibling
        for (const el of document.querySelectorAll("dt, th")) {
            if (el.textContent.trim().toLowerCase() === lower) {
                const sib = el.nextElementSibling;
                if (sib) return sib.textContent.trim();
            }
        }
        // Walk leaf elements looking for exact label text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
            const el = walker.currentNode;
            if (el.children.length > 2) continue;
            if (el.textContent.trim().toLowerCase() === lower) {
                const next = el.nextElementSibling;
                if (next && next.textContent.trim().length > 0) return next.textContent.trim();
                const parentNext = el.parentElement?.nextElementSibling;
                if (parentNext && parentNext.textContent.trim().length > 0)
                    return parentNext.textContent.trim();
            }
        }
        return "";
    }

    // 1. JSON-LD structured data
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
            const raw = JSON.parse(script.textContent);
            const items = Array.isArray(raw) ? raw : [raw];
            const job = items.find((d) => d["@type"] === "JobPosting");
            if (job) {
                const loc = job.jobLocation;
                const city = loc?.address?.addressLocality || "";
                const region = loc?.address?.addressRegion || "";
                const location =
                    typeof loc === "string" ? loc : [city, region].filter(Boolean).join(", ");
                return {
                    title: (job.title || "").trim(),
                    company: (job.hiringOrganization?.name || "").trim(),
                    location: location.trim() || findLabelValue("location"),
                };
            }
        } catch {}
    }

    // 2. Find best h1 — skip nav/header elements and nav-like text
    function getBestH1() {
        for (const h1 of document.querySelectorAll("h1")) {
            if (h1.closest("nav, header")) continue;
            const text = h1.textContent.trim().replace(/\s+/g, " ");
            if (!text || text.length < 4 || text.length > 200) continue;
            if (/skip\s+to|main\s+content|navigation|homepage/i.test(text)) continue;
            return text;
        }
        return "";
    }

    function isTagline(text) {
        // Taglines look like sentences — contain verbs/prepositions or are long
        return /\b(your|our|we|for|by|with|at\s+\w|the|build|join|find|explore|discover|get|make|create|career)\b/i.test(text)
            || text.split(" ").length > 4;
    }

    const og = (p) => document.querySelector(`meta[property="${p}"]`)?.content?.trim() || "";
    const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content?.trim() || "";

    // Title: h1 from content area > og:title > document.title
    const h1Text = getBestH1();
    let title = h1Text || og("og:title") || meta("title") || document.title || "";

    // Company: og:site_name only if it's a clean short name, not a tagline
    const siteName = og("og:site_name");
    let company = (siteName && !isTagline(siteName)) ? siteName : "";

    // 3. Visible "Location" label on page
    let location = findLabelValue("Location") || findLabelValue("location");

    // 4. Parse "Title at Company" pattern from title
    if (!company && title) {
        const m = title.match(/^(.+?)\s+at\s+([\w\s&.,'-]+?)(?:\s*[|–—-]|$)/i);
        if (m) {
            title = m[1].trim();
            company = m[2].trim();
        }
    }

    // Strip trailing " | Site" or " - Site" suffixes from title
    title = title.replace(/\s*[|–—]\s*.+$/, "").replace(/\s+-\s+[A-Z].+$/, "").trim();

    return { title, company, location };
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
        console.warn("[Job Tracker] Could not extract from page:", err.message);
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
                url: tab.url,
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
