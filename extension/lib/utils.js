// Shared utilities used by all adapters and the content script

/**
 * Fill a native input element in a way that React/Angular/Vue
 * internal state machines will register the change.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} value
 */
function nativeFill(el, value) {
    el.focus();

    // Override React's internal value tracker
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )?.set;
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
    )?.set;

    const setter =
        el.tagName === "TEXTAREA" ? nativeTextAreaValueSetter : nativeInputValueSetter;

    if (setter) {
        setter.call(el, value);
    } else {
        el.value = value;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
}

/**
 * Select an option in a native <select> element.
 *
 * @param {HTMLSelectElement} el
 * @param {string} value - The option text or value to match
 */
function nativeSelect(el, value) {
    el.focus();
    const targetLower = value.toLowerCase();

    // Try matching by text content first, then by value attribute
    for (const option of el.options) {
        const optText = option.text.toLowerCase();
        const optValue = option.value.toLowerCase();
        if (optText.includes(targetLower) || targetLower.includes(optText) || optValue === targetLower) {
            el.value = option.value;
            break;
        }
    }

    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
}

/**
 * Click a radio button or checkbox by value or label text.
 *
 * @param {NodeList|Array} options - List of input[type=radio] or input[type=checkbox] elements
 * @param {string} value - The value or label text to match
 */
function nativeClickOption(options, value) {
    const targetLower = value.toLowerCase();

    for (const input of options) {
        const inputValue = (input.value || "").toLowerCase();
        // Also check the associated label
        const label = document.querySelector(`label[for="${input.id}"]`);
        const labelText = (label?.textContent || "").toLowerCase();

        if (
            inputValue.includes(targetLower) ||
            targetLower.includes(inputValue) ||
            labelText.includes(targetLower)
        ) {
            input.click();
            return;
        }
    }
}

/**
 * Add a visual highlight to indicate the field was auto-filled.
 *
 * @param {HTMLElement} el
 */
function markAsFilled(el) {
    el.style.outline = "2px solid #22c55e";
    el.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.2)";
    el.setAttribute("data-autofill-pro", "true");
    el.title = "Auto-filled by AutoFill Pro — review before submitting";
}

/**
 * Send a message to the background service worker.
 *
 * @param {object} message
 * @returns {Promise<any>}
 */
function sendToBackground(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Levenshtein distance between two strings (for fuzzy label matching fallback).
 */
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] =
                a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/**
 * Get label text associated with an input element.
 */
function getLabelText(el) {
    if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent.trim();
    }
    // Walk up the DOM to find a wrapping label
    let parent = el.parentElement;
    while (parent) {
        if (parent.tagName === "LABEL") return parent.textContent.trim();
        parent = parent.parentElement;
    }
    // aria-label fallback
    return el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
}
