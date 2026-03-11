// content.js — Main orchestrator
// Injected into every page. Detects the platform and kicks off the right adapter.
// All API communication flows through background.js (never directly from here).

(async () => {
    // Small helper used by all adapters to fill custom question blocks
    // (defined here so it's available in the shared scope after all adapter scripts load)
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
            data: {
                label,
                input_type: select ? "select" : radios.length ? "radio" : input?.type || "text",
                options,
            },
        });

        if (!result || result.confidence < 0.45) return;

        if (result.field_key === "open_ended" && input?.tagName === "TEXTAREA") {
            const draft = await sendToBackground({
                type: "ANSWER_OPEN_ENDED",
                data: { question: label },
            });
            if (draft?.answer) {
                nativeFill(input, draft.answer);
                markAsFilled(input);
            }
        } else if (select && result.answer) {
            nativeSelect(select, String(result.answer));
            markAsFilled(select);
        } else if (radios.length && result.answer) {
            nativeClickOption(Array.from(radios), String(result.answer));
            radios.forEach(markAsFilled);
        } else if (input && result.answer !== null && result.answer !== undefined) {
            nativeFill(input, String(result.answer));
            markAsFilled(input);
        }
    };

    // Check if the user is authenticated
    const { token } = await sendToBackground({ type: "GET_TOKEN" });
    if (!token) {
        console.log("[AutoFill Pro] Not authenticated. Open the extension popup to log in.");
        return;
    }

    // Fetch the user's profile
    let profile;
    try {
        profile = await sendToBackground({ type: "GET_PROFILE" });
    } catch (err) {
        console.warn("[AutoFill Pro] Could not load profile:", err.message);
        return;
    }

    // Select the appropriate adapter (priority order matters — specific before generic)
    const adapters = [WorkdayAdapter, GreenhouseAdapter, LeverAdapter, GenericAdapter];
    const adapter = adapters.find((a) => a.detect());

    if (!adapter) {
        console.log("[AutoFill Pro] No adapter matched this page.");
        return;
    }

    console.log(`[AutoFill Pro] Using adapter: ${adapter.name}`);

    try {
        await adapter.fill(profile);
        console.log("[AutoFill Pro] Fill complete. Review green-highlighted fields before submitting.");
    } catch (err) {
        console.error("[AutoFill Pro] Error during fill:", err);
    }

    // Listen for manual trigger from popup (e.g., "Fill Now" button)
    chrome.runtime.onMessage.addListener(async (message) => {
        if (message.type === "TRIGGER_FILL") {
            console.log("[AutoFill Pro] Manual fill triggered from popup.");
            try {
                const freshProfile = await sendToBackground({ type: "GET_PROFILE" });
                await adapter.fill(freshProfile);
            } catch (err) {
                console.error("[AutoFill Pro] Manual fill error:", err);
            }
        }
    });
})();
