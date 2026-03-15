// Greenhouse Adapter
// Greenhouse apps use a static, predictable DOM with clear field IDs.
// URL pattern: https://boards.greenhouse.io/...

const GreenhouseAdapter = {
    name: "greenhouse",

    detect() {
        return (
            window.location.hostname.includes("greenhouse.io") ||
            !!document.getElementById("application_form") ||
            !!document.querySelector("form#application_form")
        );
    },

    async fill(profile) {
        const form = document.getElementById("application_form") || document.querySelector("form");
        if (!form) return;

        // ── Core text fields ──────────────────────────────────────────────────
        const textMappings = {
            first_name: ["job_application_first_name", "first_name"],
            last_name:  ["job_application_last_name", "last_name"],
            email:      ["job_application_email", "email"],
            phone:      ["job_application_phone", "phone"],
        };

        for (const [profileKey, fieldIds] of Object.entries(textMappings)) {
            const value = profile[profileKey];
            if (!value) continue;
            for (const id of fieldIds) {
                const el = form.querySelector(`#${id}, [name="${id}"]`);
                if (el) { nativeFill(el, String(value)); markAsFilled(el); break; }
            }
        }

        // LinkedIn URL — Greenhouse uses a dedicated field
        if (profile.linkedin_url) {
            const linkedinEl = form.querySelector(
                "#job_application_linkedin_profile_url, [name='job_application[linkedin_profile_url]'], input[name*='linkedin']"
            );
            if (linkedinEl) { nativeFill(linkedinEl, profile.linkedin_url); markAsFilled(linkedinEl); }
        }

        // ── EEO fields — Greenhouse renders them as selects with predictable names ──
        const eeoSelectMappings = [
            { name: "job_application[gender]",           value: profile.gender },
            { name: "job_application[race]",             value: profile.race },
            { name: "job_application[veteran_status]",   value: profile.veteran_status },
            { name: "job_application[disability_status]",value: profile.disability_status },
        ];

        for (const { name, value } of eeoSelectMappings) {
            if (!value || value === "Prefer not to say") continue;
            // Try exact name attribute first
            let sel = form.querySelector(`select[name="${name}"]`);
            if (!sel) {
                // Fall back to label-text matching within the EEO section
                const keyword = name.split("[").pop().replace("]", "");
                sel = findSelectByLabelKeyword(form, keyword);
            }
            if (sel) { nativeSelect(sel, value); markAsFilled(sel); }
        }

        // ── Work authorization — usually radio buttons ────────────────────────
        if (profile.work_authorized != null) {
            const answer = profile.work_authorized ? "yes" : "no";
            nativeClickOption(findRadiosByLabelKeyword(form, "authorized"), answer);
        }

        if (profile.requires_sponsorship_now != null) {
            const answer = profile.requires_sponsorship_now ? "yes" : "no";
            nativeClickOption(findRadiosByLabelKeyword(form, "sponsor"), answer);
        }

        // ── Custom questions via AI classification ────────────────────────────
        const customQuestions = form.querySelectorAll(".custom-question");
        for (const block of customQuestions) {
            await fillCustomQuestion(block, profile);
        }
    },
};

// Find a <select> whose associated <label> contains the keyword
function findSelectByLabelKeyword(container, keyword) {
    const kw = keyword.toLowerCase().replace(/_/g, " ");
    for (const label of container.querySelectorAll("label")) {
        if (label.textContent.toLowerCase().includes(kw)) {
            const sel = label.htmlFor
                ? document.getElementById(label.htmlFor)
                : label.querySelector("select");
            if (sel && sel.tagName === "SELECT") return sel;
        }
    }
    return null;
}

// Find radio inputs whose group label contains the keyword
function findRadiosByLabelKeyword(container, keyword) {
    const kw = keyword.toLowerCase();
    // Look for fieldset legend or div label that contains the keyword
    const groups = container.querySelectorAll("fieldset, .field, .form-field");
    for (const group of groups) {
        const legend = group.querySelector("legend, label, .label");
        if (legend && legend.textContent.toLowerCase().includes(kw)) {
            return Array.from(group.querySelectorAll("input[type='radio']"));
        }
    }
    return [];
}
