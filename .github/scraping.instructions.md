# Copilot Instructions for statpad_school_leads

## Project Overview
- Playwright-based browser automation project, including scraping the CIFSS school directory widget (see `assets/source1.mhtml` for static source reference).
- Test files are in `tests/` and `tests-examples/` (all subfolders, `*.spec.ts`/`*.test.ts`).
- Main config: `playwright.config.ts` (`testDir: './'` for all subfolders).

## Key Workflows
- **Run all tests:**
  ```bash
  npx playwright test
  ```
- **Run a specific test file:**
  ```bash
  npx playwright test tests/school_scraper/scrape-schools.spec.ts
  ```
- **View HTML test report:**
  ```bash
  npx playwright show-report
  ```
- The test report is generated in `playwright-report/` by default.

## Project Structure
- `playwright.config.ts`: Central config. `testDir: './'` enables test discovery in all subfolders.
- `src/school_scraper.ts`: Main scraping logic for the CIFSS widget (see below for selectors).
- `tests/school_scraper/scrape-schools.spec.ts`: Test that iterates 2 schools per section for fast validation.
- `assets/source1.mhtml`: Saved static source of the iFrame widget for selector reference and troubleshooting.
- `tests/`, `tests-examples/`: Main locations for test files. All files matching `*.spec.ts` or `*.test.ts` are picked up.
- `playwright-report/`: Contains the latest HTML test report.
- `test-results/`: Stores test artifacts and traces.

## Patterns & Conventions
- Tests use Playwright's `@playwright/test` API, including fixtures, `test.describe`, and `test.beforeEach`.
- Helper functions are defined within test files for reuse.
- All workflows use Playwright CLI; no custom build/start scripts.
- All browsers (Chromium, Firefox, WebKit) are configured in the Playwright config for cross-browser testing.

## Integration & Dependencies
- Uses `@playwright/test` as the main dev dependency.
- No custom web server integration or CI/CD by default.


## CIFSS Widget Scraping: Selectors & Structure
- **Reference:** See `assets/source1.mhtml` for the static HTML structure.
- **Section Selector:**
  - `<select id="section">` contains `<option>` elements for each section.
- **School Buttons:**
  - Each school is a `<button class="school-btn ...">` with a unique `id` and `data-id`.
  - Example: `<button class="school-btn ..." id="school-button-1" data-id="1">School Name</button>`
- **School Details:**
  - After clicking a school button, click the "School information" tab (use `page.getByRole('tab', { name: /School information/i })`).
  - The website URL is typically the first `<a href^="http">` on the info tab. If not found, return an empty string.
- **Testing vs. Full Scrape:**
  - Source code in `src/school_scraper.ts` iterates all schools in all sections.
  - The test in `tests/school_scraper/scrape-schools.spec.ts` only iterates 2 schools per section for speed.
- **Error Handling:**
  - Always check for null/empty values when extracting the website.
  - Use `await page.waitForTimeout()` or better, `await page.waitForSelector()` for more robust waits.
- **Optimization:**
  - Re-query `.school-btn` after navigation, as the DOM may refresh.
  - Use `data-id` or `id` attributes for more precise targeting if needed.
  - Refer to `source1.mhtml` for troubleshooting selector issues if the live widget changes.

---

For any unclear or missing sections, or if the widget structure changes, inspect `assets/source1.mhtml` and update this guide for future AI agents and developers.

Before making large changes, consider if the task can be solved with a small script or a targeted module. Otherwise, you must be 95% sure that it is the correct change to make. If in doubt, ask for feedback on your approach until I approve of the change.