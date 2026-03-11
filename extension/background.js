// Background service worker – manages auth token and proxies API calls
// so the content script never needs to handle auth directly.

const API_BASE = "http://localhost:8000";

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getToken() {
    const { autofill_token } = await chrome.storage.local.get("autofill_token");
    return autofill_token || null;
}

async function setToken(token) {
    await chrome.storage.local.set({ autofill_token: token });
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
    const token = await getToken();
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`API ${path} failed (${res.status}): ${err}`);
    }
    return res.json();
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
            const body = new URLSearchParams({ username: email, password });
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                body,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            if (!res.ok) throw new Error("Login failed. Check your credentials.");
            const data = await res.json();
            await setToken(data.access_token);
            return { success: true };
        }

        case "REGISTER": {
            const { email, password } = message;
            const data = await apiFetch("/auth/register", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            await setToken(data.access_token);
            return { success: true };
        }

        case "LOGOUT": {
            await chrome.storage.local.remove("autofill_token");
            return { success: true };
        }

        case "GET_TOKEN": {
            const token = await getToken();
            return { token };
        }

        // Profile
        case "GET_PROFILE": {
            return apiFetch("/profile");
        }

        case "UPDATE_PROFILE": {
            return apiFetch("/profile", {
                method: "PATCH",
                body: JSON.stringify(message.data),
            });
        }

        // AI
        case "CLASSIFY_FIELD": {
            return apiFetch("/ai/classify", {
                method: "POST",
                body: JSON.stringify(message.data),
            });
        }

        case "ANSWER_OPEN_ENDED": {
            return apiFetch("/ai/answer-open-ended", {
                method: "POST",
                body: JSON.stringify(message.data),
            });
        }

        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}
