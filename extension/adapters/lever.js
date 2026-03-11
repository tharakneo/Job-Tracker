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

        const textMappings = {
            "first_name": ["input[name='name']", "input[placeholder*='First']", "#first-name"],
            "last_name": ["input[placeholder*='Last']", "#last-name"],
            "email": ["input[name='email']", "input[type='email']"],
            "phone": ["input[name='phone']", "input[type='tel']"],
            "linkedin_url": ["input[name='urls[LinkedIn]']", "input[placeholder*='LinkedIn']"],
            "github_url": ["input[name='urls[GitHub]']", "input[placeholder*='GitHub']"],
            "portfolio_url": ["input[name='urls[Portfolio]']", "input[placeholder*='Portfolio']"],
        };

        for (const [profileKey, selectors] of Object.entries(textMappings)) {
            const value = profile[profileKey];
            if (!value) continue;

            for (const selector of selectors) {
                const el = form.querySelector(selector);
                if (el) {
                    nativeFill(el, String(value));
                    markAsFilled(el);
                    break;
                }
            }
        }

        // Additional info / cover letter textarea
        const textarea = form.querySelector("textarea[name='comments'], textarea[placeholder*='cover']");
        if (textarea && profile.resume_text) {
            const draft = await sendToBackground({
                type: "ANSWER_OPEN_ENDED",
                data: { question: "Write a brief professional cover letter introduction for a job application." },
            });
            if (draft?.answer) {
                nativeFill(textarea, draft.answer);
                markAsFilled(textarea);
            }
        }

        // Custom questions
        const customBlocks = form.querySelectorAll(".application-question");
        for (const block of customBlocks) {
            await fillCustomQuestion(block, profile);
        }
    },
};
