// content.js — Autofill orchestrator
// Only fills forms when manually triggered from the popup (no auto-fill on load).

// Helper used by adapters for custom question blocks
window.fillCustomQuestion = async function (block, profile) {
    const labelEl = block.querySelector("label, .label, .question-label, legend");
    const label = labelEl?.textContent?.trim();
    if (!label) return;

    const input = block.querySelector("input:not([type='radio']):not([type='checkbox']), textarea");
    const select = block.querySelector("select");
    const radios = block.querySelectorAll("input[type='radio']");
    const options = select
        ? Array.from(select.options).map((o) => o.text)
        : radios.length
            ? Array.from(radios).map((r) => {
                const lbl = document.querySelector(`label[for="${r.id}"]`);
                return lbl?.textContent?.trim() || r.value;
            })
            : undefined;

    const result = await sendToBackground({
        type: "CLASSIFY_FIELD",
        data: { label, input_type: select ? "select" : radios.length ? "radio" : input?.type || "text", options },
    });

    if (!result || result.confidence < 0.45) return;

    if (result.field_key === "open_ended" && input?.tagName === "TEXTAREA") {
        const draft = await sendToBackground({ type: "ANSWER_OPEN_ENDED", data: { question: label } });
        if (draft?.answer) { nativeFill(input, draft.answer); markAsFilled(input); }
    } else if (select && result.answer) {
        nativeSelect(select, String(result.answer)); markAsFilled(select);
    } else if (radios.length && result.answer) {
        nativeClickOption(Array.from(radios), String(result.answer)); radios.forEach(markAsFilled);
    } else if (input && result.answer != null) {
        nativeFill(input, String(result.answer)); markAsFilled(input);
    }
};

// Listen for manual trigger from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TRIGGER_FILL") {
        doFill()
            .then(() => sendResponse({ success: true }))
            .catch((err) => {
                console.error("[Job Tracker] Fill error:", err.message);
                sendResponse({ error: err.message });
            });
        return true; // keep channel open for async response
    }
});

async function doFill() {
    const { token } = await sendToBackground({ type: "GET_TOKEN" });
    if (!token) throw new Error("Not signed in — open the extension and sign in");

    const profile = await sendToBackground({ type: "GET_PROFILE" });
    if (!profile || Object.keys(profile).length === 0) {
        throw new Error("No profile data — save your info on the website first");
    }

    const adapters = [WorkdayAdapter, GreenhouseAdapter, LeverAdapter, GenericAdapter];
    const adapter = adapters.find((a) => a.detect());
    if (!adapter) throw new Error("Could not detect form type on this page");

    console.log(`[Job Tracker] Filling with ${adapter.name} adapter`);
    await adapter.fill(profile);
    console.log("[Job Tracker] Fill complete — review fields before submitting");
}
