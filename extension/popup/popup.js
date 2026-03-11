// popup.js — Controls all popup UI interactions

const $ = (id) => document.getElementById(id);

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        const targetTab = tab.dataset.tab;
        const parentView = tab.closest(".view");

        parentView.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        // content divs are id="tab-{name}"
        parentView.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        const content = parentView.querySelector(`#tab-${targetTab}`);
        if (content) content.classList.add("active");
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(elId, msg) {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
}

function hideError(elId) {
    $(elId)?.classList.add("hidden");
}

function showSaved(elId) {
    const el = $(elId);
    if (!el) return;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 2000);
}

function sendMsg(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (res?.error) reject(new Error(res.error));
            else resolve(res);
        });
    });
}

function getFormData(form) {
    const data = {};
    new FormData(form).forEach((val, key) => {
        // Cast booleans stored as strings
        if (val === "true") data[key] = true;
        else if (val === "false") data[key] = false;
        else if (val !== "") data[key] = val;
    });
    return data;
}

function populateForm(form, profile) {
    for (const [key, value] of Object.entries(profile)) {
        const el = form.querySelector(`[name="${key}"]`);
        if (!el || value === null || value === undefined) continue;
        if (el.tagName === "SELECT") {
            // Boolean profile values stored as true/false, select has "true"/"false" option values
            el.value = String(value);
        } else {
            el.value = String(value);
        }
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    const { token } = await sendMsg({ type: "GET_TOKEN" });

    if (!token) {
        $("auth-view").classList.remove("hidden");
    } else {
        $("main-view").classList.remove("hidden");
        await loadProfile();
    }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// Toggle between login and register labels
const authTabs = document.querySelectorAll("#auth-view .tab");
let authMode = "login";
authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        authMode = tab.dataset.tab;
        $("auth-submit").textContent = authMode === "login" ? "Login" : "Create Account";
        hideError("auth-error");
    });
});

$("auth-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("auth-error");
    const email = $("auth-email").value;
    const password = $("auth-password").value;

    try {
        await sendMsg({ type: authMode === "login" ? "LOGIN" : "REGISTER", email, password });
        $("auth-view").classList.add("hidden");
        $("main-view").classList.remove("hidden");
        await loadProfile();
    } catch (err) {
        showError("auth-error", err.message);
    }
});

$("google-login-btn")?.addEventListener("click", async () => {
    hideError("auth-error");
    try {
        await sendMsg({ type: "GOOGLE_LOGIN" });
        $("auth-view").classList.add("hidden");
        $("main-view").classList.remove("hidden");
        await loadProfile();
    } catch (err) {
        showError("auth-error", err.message);
    }
});

$("logout-btn")?.addEventListener("click", async () => {
    await sendMsg({ type: "LOGOUT" });
    $("main-view").classList.add("hidden");
    $("auth-view").classList.remove("hidden");
});

// ── Profile loading ───────────────────────────────────────────────────────────

async function loadProfile() {
    try {
        const profile = await sendMsg({ type: "GET_PROFILE" });
        populateForm($("profile-form"), profile);
        populateForm($("eeo-form"), profile);
        populateForm($("settings-form"), profile);
    } catch (err) {
        showError("main-error", "Could not load profile. Is the backend running?");
    }
}

// ── Profile save ──────────────────────────────────────────────────────────────

$("profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("main-error");
    try {
        await sendMsg({ type: "UPDATE_PROFILE", data: getFormData($("profile-form")) });
        showSaved("profile-saved");
    } catch (err) {
        showError("main-error", err.message);
    }
});

$("eeo-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("main-error");
    try {
        await sendMsg({ type: "UPDATE_PROFILE", data: getFormData($("eeo-form")) });
        showSaved("eeo-saved");
    } catch (err) {
        showError("main-error", err.message);
    }
});

$("settings-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("main-error");
    try {
        await sendMsg({ type: "UPDATE_PROFILE", data: getFormData($("settings-form")) });
        showSaved("settings-saved");
    } catch (err) {
        showError("main-error", err.message);
    }
});

// ── Fill button ───────────────────────────────────────────────────────────────

$("fill-btn")?.addEventListener("click", async () => {
    const btn = $("fill-btn");
    btn.textContent = "Filling…";
    btn.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FILL" });
        btn.textContent = "✓ Done! Review green fields";
        btn.style.background = "linear-gradient(135deg, #16a34a, #15803d)";
    } catch {
        btn.textContent = "⚡ Auto-Fill This Page";
        btn.disabled = false;
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
