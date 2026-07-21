## Purpose

Practical, principle-first guidance for frontend work in this repository: building small webpages, reusable HTML blocks, and email templates for use in Google Sheets Apps Script. Favor plain HTML/CSS/JS and tested, well-documented small tools over heavy frameworks.

## Principles

- Prefer semantic HTML, CSS that scales, and modern JavaScript (ES modules / async/await) when needed. Keep behaviour progressive and opt-in.
- Avoid large frontend frameworks unless there's a clear, long-term ROI; prefer hand-written, testable markup and minimal utility libraries.
- Design for resilience: components should render cleanly with CSS-only fallbacks when JS is disabled.
- For email HTML, prioritize compatibility and simplicity: inline CSS, limited selectors, and table-based layouts only when necessary.

## Project layout expectations

- assets/ — static fixtures and email templates (keep example inputs here).
- src/ — frontend modules (small, focused files). Prefer explicit exports and avoid global mutable state.
- tests-examples/ — visual or rendering tests (static fixtures + small Playwright checks if needed).

## Email templates (Apps Script) guidance

- Keep templates simple and self-contained. Inline critical CSS because many email clients strip external styles.
- Avoid webfonts, complex CSS grid, and modern selectors that have poor email client support.
- Build templates as plain HTML files in `assets/email-templates/` and store a matching JSON fixture with sample data for tests.
- Escape all user-provided values before inserting them into the template to prevent HTML injection.
- Prefer MailApp.sendEmail() or GmailApp.sendEmail() with the htmlBody parameter in Google Apps Script. Respect script quotas and rate limits; add batching with delays for large sends.

## Small tooling & templating

- For templating, prefer tiny, well-known libraries (lit-html-lite, mustache) only when they simplify escaping and reuse; otherwise use simple placeholder replacement functions.
- Provide a tiny local renderer script (Node or Apps Script test runner) to combine templates + fixtures and output sample HTML for review.

## Accessibility & responsive design

- Use semantic tags, proper alt text, and logical tab order. For email HTML, include meaningful text-only alternatives and preheader text.
- Design mobile-first; test in narrow viewports and on common email clients (Gmail web, Gmail mobile, Outlook web/mobile).

## Testing and preview

- Keep visual tests fast and deterministic. Use static fixtures (MHTML/HTML) and a small Playwright or headless Chromium test to render and snapshot the result.
- For email previews, render the final HTML locally and paste into a test Gmail draft or use a receiver test account rather than sending to production addresses.

## Data handling and security

- Never commit secrets, API keys, or real personal data. Use dummy fixtures in `assets/` for tests.
- Sanitize and escape content before embedding in HTML to prevent XSS when templates are used in web contexts.

## Developer workflow (quick)

1. Edit or create a small HTML/CSS/JS file in `src/` or `assets/email-templates/`.
2. Add a small fixture in `assets/` that demonstrates expected input.
3. Run the local renderer or a Playwright snapshot to verify output.
4. Commit a single, focused change with a clear message and open a PR.

Example local preview (informational): use a tiny static server to view pages, or render template+fixture with a Node script.

## Performance & size

- Keep pages lightweight. Minimize images and external requests. Prefer SVG icons or inline small images encoded as data URIs when appropriate.
- For emails, smaller HTML is more deliverable and faster to parse for clients—strip unnecessary whitespace and comments from templates during finalization.

## When to script vs componentize

- If the interaction is a one-off or simple (toggle, show/hide), prefer plain JS or CSS solutions.
- If reuse across multiple pages or templates is necessary, extract a small, well-documented component into `src/` with tests.

## Troubleshooting & best practices

- Keep a local sample inbox (test Gmail account) to validate delivery and rendering.
- When email clients render differently, isolate the minimal failing HTML and test incremental fixes.
- Document quirks near the template file (short note on why a layout uses a table or an inline style).

## Closing guidance

Prefer small, reviewed, and tested changes. When in doubt, implement the minimal solution that works and add tests/fixtures so future contributors (or agents) can iterate safely. Before making large changes, consider if the task can be solved with a small script or a targeted module. Otherwise, you must be 95% sure that it is the correct change to make. If in doubt, ask for feedback on your approach until I approve of the change.