// Generic Adapter
// Fallback for company career sites not covered by specific adapters.
// Uses label-text heuristics + Grok AI classification to fill fields.

const GenericAdapter = {
    name: "generic",

    detect() {
        // This is always a match — it's the catch-all fallback.
        return true;
    },

    async fill(profile) {
        const inputs = document.querySelectorAll(
            "input:not([type='hidden']):not([type='submit']):not([type='file']):not([type='button']):not([type='checkbox']):not([type='radio']), textarea, select"
        );

        for (const input of inputs) {
            const label = getLabelText(input);
            if (!label) continue;

            // Fast path: local keyword matching before making an AI call
            const fastAnswer = localMatch(label, profile);
            if (fastAnswer !== null) {
                if (input.tagName === "SELECT") {
                    nativeSelect(input, String(fastAnswer));
                } else {
                    nativeFill(input, String(fastAnswer));
                }
                markAsFilled(input);
                continue;
            }

            // Slow path: ask Grok to classify
            const options =
                input.tagName === "SELECT"
                    ? Array.from(input.options).map((o) => o.text)
                    : undefined;

            const result = await sendToBackground({
                type: "CLASSIFY_FIELD",
                data: {
                    label,
                    input_type: input.type || input.tagName.toLowerCase(),
                    options,
                },
            });

            if (!result?.answer || result.confidence < 0.5) continue;

            if (input.tagName === "SELECT") {
                nativeSelect(input, String(result.answer));
            } else if (input.tagName === "TEXTAREA" && result.field_key === "open_ended") {
                const draft = await sendToBackground({
                    type: "ANSWER_OPEN_ENDED",
                    data: { question: label },
                });
                if (draft?.answer) nativeFill(input, draft.answer);
            } else {
                nativeFill(input, String(result.answer));
            }

            markAsFilled(input);
        }

        // Radio / checkbox groups
        const radioGroups = {};
        document.querySelectorAll("input[type='radio']").forEach((radio) => {
            const name = radio.name;
            if (!radioGroups[name]) radioGroups[name] = [];
            radioGroups[name].push(radio);
        });

        for (const [name, radios] of Object.entries(radioGroups)) {
            const label = getLabelText(radios[0]) || name;
            const options = radios.map((r) => getLabelText(r) || r.value);

            const result = await sendToBackground({
                type: "CLASSIFY_FIELD",
                data: { label, input_type: "radio", options },
            });

            if (result?.answer) {
                nativeClickOption(radios, String(result.answer));
                radios.forEach(markAsFilled);
            }
        }
    },
};

// ── Fast local matching (no API call) ────────────────────────────────────────

/**
 * Maps a form label to a profile value using simple keyword matching.
 * Returns null if no match found (triggers AI fallback).
 *
 * @param {string} label
 * @param {Object} profile
 * @returns {string|boolean|null}
 */
function localMatch(label, profile) {
    const l = label.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

    if (/first.?name|given.?name/.test(l)) return profile.first_name;
    if (/last.?name|surname|family.?name/.test(l)) return profile.last_name;
    if (/full.?name/.test(l))
        return [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    if (/email/.test(l)) return profile.email;
    if (/phone|mobile|cell/.test(l)) return profile.phone;
    if (/linkedin/.test(l)) return profile.linkedin_url;
    if (/github/.test(l)) return profile.github_url;
    if (/portfolio|website|personal.?site/.test(l)) return profile.portfolio_url;
    if (/city/.test(l)) return profile.city;
    if (/state|province/.test(l)) return profile.state;
    if (/zip|postal/.test(l)) return profile.zip_code;
    if (/country/.test(l)) return profile.country;
    if (/address.?1|street/.test(l)) return profile.address_line1;
    if (/address.?2|apt|suite/.test(l)) return profile.address_line2;

    if (/sponsorship|visa.?sponsor|require.?sponsor/.test(l))
        return profile.sponsorship_needed ? "Yes" : "No";
    if (/authorized|legally.?eligible|right.?to.?work|work.?auth/.test(l))
        return profile.authorized_to_work ? "Yes" : "No";

    return null;
}
