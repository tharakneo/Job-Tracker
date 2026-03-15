// Lever Adapter
// Lever uses predictable form field names.
// URL pattern: https://jobs.lever.co/...

const LeverAdapter = {
    name: "lever",

    detect() {
        return (
            window.location.hostname.includes("lever.co") ||
            !!document.querySelector(".application-form, form[data-qa='application-form']")
        );
    },

    async fill(profile) {
        const form = document.querySelector(".application-form, form") || document.body;

        // ── Core text fields ──────────────────────────────────────────────────
        const textMappings = {
            first_name:    ["input[placeholder*='First']", "#first-name"],
            last_name:     ["input[placeholder*='Last']",  "#last-name"],
            email:         ["input[name='email']",         "input[type='email']"],
            phone:         ["input[name='phone']",         "input[type='tel']"],
            linkedin_url:  ["input[name='urls[LinkedIn]']","input[placeholder*='LinkedIn']"],
            github_url:    ["input[name='urls[GitHub]']",  "input[placeholder*='GitHub']"],
            portfolio_url: ["input[name='urls[Portfolio]']","input[placeholder*='Portfolio']"],
        };

        // Lever often combines first+last into a single "name" field
        const nameField = form.querySelector("input[name='name']");
        if (nameField && (profile.first_name || profile.last_name)) {
            const full = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
            nativeFill(nameField, full);
            markAsFilled(nameField);
        }

        for (const [profileKey, selectors] of Object.entries(textMappings)) {
            const value = profile[profileKey];
            if (!value) continue;
            for (const selector of selectors) {
                const el = form.querySelector(selector);
                if (el && !el.dataset.autofillPro) {
                    nativeFill(el, String(value));
                    markAsFilled(el);
                    break;
                }
            }
        }

        // ── EEO section — Lever appends it below the main form ───────────────
        // EEO dropdowns have labels like "Gender Identity", "Race/Ethnicity", etc.
        const eeoMappings = [
            { keyword: "gender",     value: profile.gender },
            { keyword: "race",       value: profile.race },
            { keyword: "ethnicity",  value: profile.race },
            { keyword: "veteran",    value: profile.veteran_status },
            { keyword: "disability", value: profile.disability_status },
        ];

        for (const { keyword, value } of eeoMappings) {
            if (!value || value === "Prefer not to say") continue;
            const sel = findSelectByLabelKeyword(document.body, keyword);
            if (sel && !sel.dataset.autofillPro) {
                nativeSelect(sel, value);
                markAsFilled(sel);
            }
        }

        // ── Work authorization ────────────────────────────────────────────────
        if (profile.work_authorized != null) {
            const answer = profile.work_authorized ? "yes" : "no";
            nativeClickOption(findRadiosByLabelKeyword(document.body, "authorized"), answer);
        }

        if (profile.requires_sponsorship_now != null) {
            const answer = profile.requires_sponsorship_now ? "yes" : "no";
            nativeClickOption(findRadiosByLabelKeyword(document.body, "sponsor"), answer);
        }

        // ── Custom questions ──────────────────────────────────────────────────
        const customBlocks = form.querySelectorAll(".application-question");
        for (const block of customBlocks) {
            await fillCustomQuestion(block, profile);
        }
    },
};

function findSelectByLabelKeyword(container, keyword) {
    const kw = keyword.toLowerCase();
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

function findRadiosByLabelKeyword(container, keyword) {
    const kw = keyword.toLowerCase();
    const groups = container.querySelectorAll("fieldset, .application-question, .field");
    for (const group of groups) {
        const legend = group.querySelector("legend, label, .label, .question-label");
        if (legend && legend.textContent.toLowerCase().includes(kw)) {
            return Array.from(group.querySelectorAll("input[type='radio']"));
        }
    }
    return [];
}
