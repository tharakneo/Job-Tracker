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

    /**
     * Fill the form using the user's profile data.
     * @param {Object} profile - The user profile from the backend.
     */
    async fill(profile) {
        const form = document.getElementById("application_form") || document.querySelector("form");
        if (!form) return;

        const mappings = {
            "first_name": ["job_application_first_name", "first_name"],
            "last_name": ["job_application_last_name", "last_name"],
            "email": ["job_application_email", "email"],
            "phone": ["job_application_phone", "phone"],
        };

        for (const [profileKey, fieldIds] of Object.entries(mappings)) {
            const value = profile[profileKey];
            if (!value) continue;

            for (const id of fieldIds) {
                const el = form.querySelector(`#${id}, [name="${id}"]`);
                if (el) {
                    nativeFill(el, String(value));
                    markAsFilled(el);
                    break;
                }
            }
        }

        // Resume upload prompt — skip; user handles this manually
        // Cover letter text area
        const coverLetter = form.querySelector("textarea[name*='cover'], textarea[id*='cover']");
        if (coverLetter && profile.resume_text) {
            // Let AI draft one if the field is empty
            const draft = await sendToBackground({
                type: "ANSWER_OPEN_ENDED",
                data: { question: "Write a brief professional cover letter introduction for a job application." },
            });
            if (draft?.answer) {
                nativeFill(coverLetter, draft.answer);
                markAsFilled(coverLetter);
            }
        }

        // Custom questions — use AI to classify and answer
        const customQuestions = form.querySelectorAll(".custom-question");
        for (const block of customQuestions) {
            await fillCustomQuestion(block, profile);
        }
    },
};
