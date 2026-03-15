// Workday Adapter
// Workday is an Angular/React SPA that loads content dynamically via routing.
// We use a MutationObserver to watch for new form fields appearing in the DOM.
// URL pattern: https://<company>.wd5.myworkdayjobs.com/...

const WorkdayAdapter = {
    name: "workday",
    _observer: null,
    _profile: null,
    _filled: new Set(), // track filled field IDs to avoid duplicate fills

    detect() {
        return (
            window.location.hostname.includes("myworkdayjobs.com") ||
            window.location.hostname.includes("wd1.myworkdayjobs") ||
            !!document.querySelector("[data-automation-id='legalNameSection']")
        );
    },

    /**
     * Kick off observation — Workday lazy-loads each step of the form.
     */
    async fill(profile) {
        this._profile = profile;

        // Immediately try to fill whatever is already on screen
        await this._fillVisible();

        // Watch for new content as user navigates form steps
        this._observer = new MutationObserver(async () => {
            await this._fillVisible();
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
    },

    async _fillVisible() {
        const profile = this._profile;
        if (!profile) return;

        // Helper to fill a Workday text input by data-automation-id
        const fillById = (automationId, value) => {
            if (!value || this._filled.has(automationId)) return;
            // Workday uses data-automation-id on wrapper divs; actual input is inside
            const wrapper = document.querySelector(`[data-automation-id="${automationId}"]`);
            const input = wrapper?.querySelector("input, textarea") || wrapper;
            if (input && (input.tagName === "INPUT" || input.tagName === "TEXTAREA")) {
                nativeFill(input, String(value));
                markAsFilled(input);
                this._filled.add(automationId);
            }
        };

        // Personal info section
        fillById("legalNameSection_firstName", profile.first_name);
        fillById("legalNameSection_lastName", profile.last_name);
        fillById("email", profile.email);
        fillById("phone-number", profile.phone);

        // Address
        fillById("addressSection_addressLine1", profile.address_line1);
        fillById("addressSection_city", profile.city);
        fillById("addressSection_postalCode", profile.zip_code);

        // Work authorization radio buttons
        const authSection = document.querySelector("[data-automation-id='workAuthorizationSection']");
        if (authSection && !this._filled.has("workAuth")) {
            const radios = authSection.querySelectorAll("input[type='radio']");
            if (radios.length) {
                const answer = profile.work_authorized ? "yes" : "no";
                nativeClickOption(radios, answer);
                this._filled.add("workAuth");
            }
        }

        // Sponsorship
        const sponsorSection = document.querySelector("[data-automation-id='sponsorshipSection'], [data-automation-id='visaSponsorshipRequired']");
        if (sponsorSection && !this._filled.has("sponsorship")) {
            const radios = sponsorSection.querySelectorAll("input[type='radio']");
            if (radios.length) {
                const answer = profile.requires_sponsorship_now ? "yes" : "no";
                nativeClickOption(radios, answer);
                this._filled.add("sponsorship");
            }
        }

        // EEO section — handled via AI for maximum accuracy
        const eeoSection = document.querySelector("[data-automation-id='EEO'], .eeo-section");
        if (eeoSection && !this._filled.has("eeo")) {
            await this._fillEEO(eeoSection, profile);
            this._filled.add("eeo");
        }

        // Custom / unknown fields — classify via Grok
        const unknownInputs = document.querySelectorAll(
            "input:not([data-autofill-pro]):not([type='hidden']):not([type='submit']):not([type='file']), textarea:not([data-autofill-pro])"
        );
        for (const input of unknownInputs) {
            const label = getLabelText(input);
            if (!label || this._filled.has(label)) continue;
            await this._fillUnknown(input, label, profile);
            this._filled.add(label);
        }
    },

    async _fillEEO(section, profile) {
        const selects = section.querySelectorAll("select");
        for (const select of selects) {
            const label = getLabelText(select);
            if (!label) continue;

            const options = Array.from(select.options).map((o) => o.text);
            const result = await sendToBackground({
                type: "CLASSIFY_FIELD",
                data: { label, input_type: "select", options },
            });

            if (result?.answer) {
                nativeSelect(select, result.answer);
                markAsFilled(select);
            }
        }
    },

    async _fillUnknown(input, label, profile) {
        const isTextarea = input.tagName === "TEXTAREA";
        const result = await sendToBackground({
            type: "CLASSIFY_FIELD",
            data: {
                label,
                input_type: isTextarea ? "textarea" : "text",
            },
        });

        if (!result?.field_key || result.confidence < 0.5) return;

        if (result.field_key === "open_ended" && isTextarea) {
            const draft = await sendToBackground({
                type: "ANSWER_OPEN_ENDED",
                data: { question: label },
            });
            if (draft?.answer) {
                nativeFill(input, draft.answer);
                markAsFilled(input);
            }
        } else if (result.answer !== null && result.answer !== undefined) {
            nativeFill(input, String(result.answer));
            markAsFilled(input);
        }
    },

    destroy() {
        this._observer?.disconnect();
    },
};
