// Background service worker — handles auth + Supabase API calls

const SUPABASE_URL = "https://eidlattoxpvyobbhetch.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dXBzGULEfcbKWWoWHcdXLQ_TfXuTzQ4";

// ── Storage ──────────────────────────────────────────────────────────────────

async function setTokens(access, refresh) {
    await chrome.storage.local.set({
        autofill_token: access,
        autofill_refresh: refresh || null,
        autofill_token_ts: Date.now(),
    });
}

async function getTokens() {
    const d = await chrome.storage.local.get(["autofill_token", "autofill_refresh"]);
    return { access: d.autofill_token || null, refresh: d.autofill_refresh || null };
}

async function clearSession() {
    await chrome.storage.local.remove([
        "autofill_token", "autofill_refresh", "autofill_user_id", "autofill_token_ts",
    ]);
}

// Returns a usable access token, refreshing if expired
async function getValidToken() {
    const { access, refresh } = await getTokens();
    if (!access) return null;

    // Check JWT expiry
    try {
        const payload = JSON.parse(atob(access.split(".")[1]));
        if (payload.exp && payload.exp > Date.now() / 1000 + 30) {
            return access; // still valid
        }
    } catch {
        return access; // not a standard JWT, just use it
    }

    // Token expired — try refresh
    if (!refresh) {
        await clearSession();
        return null;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) throw new Error("refresh failed");
        const data = await res.json();
        if (!data.access_token) throw new Error("no token in response");
        await setTokens(data.access_token, data.refresh_token || refresh);
        if (data.user?.id) {
            await chrome.storage.local.set({ autofill_user_id: data.user.id });
        }
        return data.access_token;
    } catch {
        await clearSession();
        return null;
    }
}

// ── Supabase fetch ───────────────────────────────────────────────────────────

async function supabaseFetch(path, options = {}) {
    const token = await getValidToken();
    if (!token) {
        throw new Error("Not signed in — open extension and sign in with Google");
    }

    const res = await fetch(`${SUPABASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
        const msg = data?.message || data?.error_description || data?.error || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url) {
    try {
        return new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace("www.", "");
    } catch {
        return null;
    }
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch((err) => {
            console.error("[Job Tracker]", err.message);
            sendResponse({ error: err.message });
        });
    return true;
});

async function handleMessage(message) {
    const { type } = message;

    if (type === "GOOGLE_LOGIN") {
        const redirect = chrome.identity.getRedirectURL();
        const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;

        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectUrl) => {
                if (chrome.runtime.lastError || !redirectUrl) {
                    return reject(new Error(chrome.runtime.lastError?.message || "Login cancelled"));
                }
                try {
                    const hash = redirectUrl.includes("#")
                        ? redirectUrl.split("#")[1]
                        : redirectUrl.split("?")[1] || "";
                    const params = new URLSearchParams(hash);

                    if (params.get("error")) {
                        return reject(new Error(params.get("error_description") || params.get("error")));
                    }

                    const accessToken = params.get("access_token");
                    const refreshToken = params.get("refresh_token");
                    if (!accessToken) {
                        return reject(new Error("No access token returned"));
                    }

                    const payload = JSON.parse(atob(accessToken.split(".")[1]));
                    await setTokens(accessToken, refreshToken);
                    await chrome.storage.local.set({ autofill_user_id: payload.sub });
                    resolve({ success: true });
                } catch (e) {
                    reject(new Error("Login failed: " + e.message));
                }
            });
        });
    }

    if (type === "LOGOUT") {
        await clearSession();
        return { success: true };
    }

    if (type === "GET_TOKEN") {
        const token = await getValidToken();
        return { token };
    }

    if (type === "GET_PROFILE") {
        const { autofill_user_id } = await chrome.storage.local.get("autofill_user_id");
        if (!autofill_user_id) return {};
        const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${autofill_user_id}&select=*`);
        return (rows && rows.length > 0) ? rows[0] : {};
    }

    if (type === "ADD_JOB") {
        const j = message.data;
        const domain = extractDomain(j.url);
        const insertData = {
            id: crypto.randomUUID(),
            title: j.title || "Unknown",
            company: j.company || "Unknown",
            location: j.location || "",
            url: j.url || "",
            domain: domain || "",
            logo_url: domain ? `https://logo.clearbit.com/${domain}` : "",
            fallback_logo_url: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : "",
            status: j.status || "Applied",
            added_at: new Date().toISOString(),
        };

        await supabaseFetch("/rest/v1/jobs", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(insertData),
        });
        return { success: true };
    }

    // Content script message types — return empty (no AI backend)
    if (type === "CLASSIFY_FIELD") return { field_key: null, confidence: 0, answer: null };
    if (type === "ANSWER_OPEN_ENDED") return { answer: null };

    throw new Error(`Unknown message: ${type}`);
}
