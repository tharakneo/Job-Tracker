// Background service worker – communicates directly with Supabase API

const SUPABASE_URL = "https://eidlattoxpvyobbhetch.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dXBzGULEfcbKWWoWHcdXLQ_TfXuTzQ4";

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getToken() {
    const { autofill_token } = await chrome.storage.local.get("autofill_token");
    return autofill_token || null;
}

async function setToken(token) {
    await chrome.storage.local.set({ autofill_token: token });
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function supabaseFetch(path, options = {}) {
    const token = await getToken();
    const headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }),
        ...(options.headers || {}),
    };
    const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    
    // Some endpoints may return empty response (like 204 No Content for updates/deletes)
    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = text;
    }

    if (!res.ok) {
        throw new Error(data?.message || data?.error_description || data?.error || `API ${path} failed (${res.status})`);
    }
    return data;
}

// ── Message handler (called by content script & popup) ────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
        console.error("[AutoFill Background]", err);
        sendResponse({ error: err.message });
    });
    return true; // keep port open for async response
});

async function handleMessage(message) {
    switch (message.type) {
        // Auth
        case "LOGIN": {
            const { email, password } = message;
            const data = await supabaseFetch("/auth/v1/token?grant_type=password", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });
            await setToken(data.access_token);
            // Save user id too so we can fetch their specific row
            await chrome.storage.local.set({ autofill_user_id: data.user.id });
            return { success: true };
        }

        case "REGISTER": {
            const { email, password } = message;
            const data = await supabaseFetch("/auth/v1/signup", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            
            if (data.session) {
                // Some signups auto-confirm
                await setToken(data.session.access_token);
                await chrome.storage.local.set({ autofill_user_id: data.user.id });
                
                // Initialize empty profile row
                await supabaseFetch("/rest/v1/profiles", {
                    method: "POST",
                    headers: { "Prefer": "return=minimal" },
                    body: JSON.stringify({ id: data.user.id, email: email })
                });
            } else {
                throw new Error("Registration succeeded but requires email confirmation.");
            }
            return { success: true };
        }

        case "GOOGLE_LOGIN": {
            // Initiate Supabase OAuth flow via Chrome Identity API
            // URL format: https://[PROJECT_ID].supabase.co/auth/v1/authorize?provider=google
            const manifest = chrome.runtime.getManifest();
            const providerUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${chrome.identity.getRedirectURL()}`;
            
            return new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({
                    url: providerUrl,
                    interactive: true
                }, async (redirectUrl) => {
                    if (chrome.runtime.lastError || !redirectUrl) {
                        return reject(new Error(chrome.runtime.lastError?.message || "Login cancelled"));
                    }

                    // redirectUrl contains the hash fragments: #access_token=...&refresh_token=...
                    // Supabase sends tokens in the URL fragment.
                    try {
                        const url = new URL(redirectUrl.replace('#', '?')); // hack to parse hash as search params
                        const accessToken = url.searchParams.get("access_token");
                        
                        if (!accessToken) {
                            return reject(new Error("No access token found in redirect URL"));
                        }

                        // Save the token
                        await setToken(accessToken);

                        // Fetch the user object to get their user ID
                        const userData = await supabaseFetch("/auth/v1/user", {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });

                        const userId = userData.id;
                        await chrome.storage.local.set({ autofill_user_id: userId });
                        
                        // Check if profile exists, if not, create it
                        const profileData = await supabaseFetch(`/rest/v1/profiles?id=eq.${userId}&select=id`);
                        if (!profileData || profileData.length === 0) {
                            await supabaseFetch("/rest/v1/profiles", {
                                method: "POST",
                                headers: { "Prefer": "return=minimal" },
                                body: JSON.stringify({ id: userId, email: userData.email })
                            });
                        }

                        resolve({ success: true });
                    } catch (e) {
                        reject(new Error("Failed to parse login response: " + e.message));
                    }
                });
            });
        }

        case "LOGOUT": {
            await chrome.storage.local.remove(["autofill_token", "autofill_user_id"]);
            return { success: true };
        }

        case "GET_TOKEN": {
            const token = await getToken();
            return { token };
        }

        // Profile
        case "GET_PROFILE": {
            const { autofill_user_id } = await chrome.storage.local.get("autofill_user_id");
            if (!autofill_user_id) throw new Error("No user ID found");
            
            const data = await supabaseFetch(`/rest/v1/profiles?id=eq.${autofill_user_id}&select=*`);
            if (!data || data.length === 0) {
                return {}; // empty profile
            }
            return data[0];
        }

        case "UPDATE_PROFILE": {
            const { autofill_user_id } = await chrome.storage.local.get("autofill_user_id");
            if (!autofill_user_id) throw new Error("No user ID found");

            return supabaseFetch(`/rest/v1/profiles?id=eq.${autofill_user_id}`, {
                method: "PATCH",
                headers: { "Prefer": "return=minimal" },
                body: JSON.stringify(message.data),
            });
        }

        // Add a job from the extension directly to Supabase
        case "ADD_JOB": {
            // We can just use anon public key to insert jobs, as configured in RLS
            const jobData = message.data;
            const insertData = {
                title: jobData.title,
                company: jobData.company || extractDomain(jobData.url),
                location: jobData.location,
                url: jobData.url,
                domain: extractDomain(jobData.url),
                logo_url: getLogoUrl(extractDomain(jobData.url)),
                fallback_logo_url: getFallbackLogoUrl(extractDomain(jobData.url)),
                status: "Applied"
            };

            await supabaseFetch("/rest/v1/jobs", {
                method: "POST",
                headers: { "Prefer": "return=minimal" },
                body: JSON.stringify(insertData)
            });
            return { success: true };
        }

        // AI (Stubbed out for now until we add edge functions)
        case "CLASSIFY_FIELD": {
            return { field_key: null, confidence: 0, answer: null };
        }

        case "ANSWER_OPEN_ENDED": {
            return { answer: null };
        }

        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}

// Helpers for ADD_JOB
function getLogoUrl(domain) {
    if (!domain) return "";
    const clean = domain.replace(/^www\./, "");
    return `https://logo.clearbit.com/${clean}`;
}

function getFallbackLogoUrl(domain) {
    if (!domain) return "";
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

function extractDomain(url) {
    try {
        const u = new URL(url.startsWith("http") ? url : "https://" + url);
        return u.hostname.replace("www.", "");
    } catch {
        return null;
    }
}
