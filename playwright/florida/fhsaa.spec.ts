import { test, expect, chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// This test scrapes the FHSAA school-directory widget and writes a CSV to assets/fhsaa_schools.csv
test.describe('FHSAA school directory scrape', () => {
    test('extract all schools and export CSV', async () => {
        // Launch a headed browser so user can watch; add slowMo
        const headful = await chromium.launch({ headless: false, slowMo: 80 });
        const context = await headful.newContext();
        const page = await context.newPage();

        // Try live URL first, fall back to local MHTML snapshot
        const liveUrl = 'https://www.fhsaahome.org/widget/school-directory';

        const fallback = `file://${path.resolve(__dirname, '..', 'assets', 'fhsa.mhtml')}`;
        try {
            await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            // Try local MHTML fallback when live site is unavailable
            console.warn(`Live URL failed, falling back to local snapshot: ${e}`);
            await page.goto(fallback, { waitUntil: 'domcontentloaded' }).catch((err) => {
                throw new Error(`Failed to load both live URL and local fallback: ${err}`);
            });
        }

        // Wait for the select to be present
        const select = page.locator('select[name="school_id"]');
        await expect(select).toHaveCount(1);

        // Build array of option texts and values (ignore empty/--Select--)
        const options = await select.locator('option').elementHandles();

        const schools: { name: string; value: string }[] = [];
        for (const opt of options) {
            const value = (await opt.getAttribute('value')) || '';
            const text = (await opt.textContent())?.trim() || '';
            if (!value || /^(-+|Select)$/i.test(text)) continue;
            schools.push({ name: text, value });
        }

        // Open a write stream and write header
        const outPath = path.resolve(__dirname, '..', 'assets', 'fhsaa_schools.csv');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        const stream = fs.createWriteStream(outPath, { flags: 'w' });
        stream.write('School Name,Mascot,School Phone,School Website,Athletic Director Name,Athletic Director Email\n');

        for (let i = 0; i < schools.length; i++) {
            const s = schools[i];
            // Select by value, then click Search (if present) and wait for #school_detail to update
            console.log(`Selecting (${i + 1}/${schools.length}): ${s.name} -> ${s.value}`);

            const detailSelector = '#school_detail';
            let prevHTML = '';
            if (await page.locator(detailSelector).count()) {
                prevHTML = await page.locator(detailSelector).evaluate((el: Element) => el.innerHTML).catch(() => '');
            }

            await select.selectOption({ value: s.value });

            // Click the Search button if it exists
            const searchBtn = page.locator('button:has-text("Search"), input[type="submit"][value="Search"], input[type="button"][value="Search"]').first();
            if (await searchBtn.count()) {
                try {
                    await Promise.all([
                        searchBtn.click(),
                        page.waitForFunction(
                            (args: any) => {
                                const selector = args[0];
                                const prev = args[1];
                                const el = document.querySelector(selector);
                                return !!el && (el as Element).innerHTML !== prev;
                            },
                            [detailSelector, prevHTML],
                            { timeout: 10000 }
                        )
                    ]);
                } catch (e) {
                    // fallback: wait for the detail to appear
                    await page.waitForSelector(detailSelector, { state: 'visible', timeout: 7000 }).catch(() => { });
                }
            } else {
                // No search button - wait for #school_detail to change or become visible
                try {
                    await page.waitForFunction(
                        (args: any) => {
                            const selector = args[0];
                            const prev = args[1];
                            const el = document.querySelector(selector);
                            return !!el && (el as Element).innerHTML !== prev;
                        },
                        [detailSelector, prevHTML],
                        { timeout: 10000 }
                    );
                } catch (e) {
                    await page.waitForSelector(detailSelector, { state: 'visible', timeout: 7000 }).catch(() => { });
                }
            }

            // Now extract values from the "School Information" table per instructions (label in first cell, value in second)
            const containerSelector = '#school_info, #school-info, .school-information, #school_detail, .school-info';
            const findContainer = async () => {
                const loc = page.locator(containerSelector).first();
                if (await loc.count()) return loc;
                return page.locator('body');
            };

            const container = await findContainer();

            const getTableValue = async (label: string) => {
                const rows = container.locator('table tr');
                const count = await rows.count();
                for (let r = 0; r < count; r++) {
                    const firstCell = rows.nth(r).locator('th, td').first();
                    const firstText = (await firstCell.textContent())?.trim() || '';
                    if (firstText.replace(/[:\s]+$/, '').toLowerCase().includes(label.replace(/[:\s]+$/, '').toLowerCase())) {
                        const cells = rows.nth(r).locator('th, td');
                        if (await cells.count() >= 2) {
                            return (await cells.nth(1).textContent())?.trim().replace(/\s+/g, ' ') || '';
                        }
                        return (await rows.nth(r).textContent())?.replace(new RegExp(label, 'i'), '').trim() || '';
                    }
                }
                // fallback: search for label text and return nearby text
                const labelEl = container.locator(`text=/${label.replace(/[:\/]/g, '')}/i`).first();
                if (await labelEl.count()) {
                    const parent = labelEl.locator('..');
                    const txt = (await parent.textContent()) || '';
                    return txt.replace(new RegExp(label, 'i'), '').trim();
                }
                return '';
            };

            const schoolName = (await getTableValue('School Full Name')) || s.name;
            const mascot = (await getTableValue('School Mascot/Nickname')) || (await getTableValue('School Mascot')) || '';
            const website = (await getTableValue('School Website')) || (await getTableValue('Website')) || '';
            const phone = (await getTableValue('Phone')) || (await getTableValue('Telephone')) || '';
            const adName = (await getTableValue('Athletic Director')) || '';

            // Click Athletic Faculty button and wait for dynamic data per instructions
            const athleticBtn = page.locator('button:has-text("Athletic Faculty"), a:has-text("Athletic Faculty")').first();
            if (await athleticBtn.count()) {
                await athleticBtn.click().catch(() => { });
                // wait for the #school_detail area to refresh
                await page.waitForSelector('#school_detail', { state: 'visible', timeout: 5000 }).catch(() => { });
            }

            // Find the <div> inside #school_detail with class 'athletic-faculty-header' whose text is 'Athletic Director', then get the nearest <a> child inside that div
            let adEmail = '';
            const headerLocator = page.locator('#school_detail .athletic-faculty-header:has-text("Athletic Director")').first();
            if (await headerLocator.count()) {
                const link = headerLocator.locator('a').first();
                if (await link.count()) adEmail = (await link.textContent())?.trim() || '';
            }
            // fallback: look for a mailto or email pattern inside #school_detail
            if (!adEmail) {
                const mailEl = page.locator('#school_detail a[href^="mailto:"]').first();
                if (await mailEl.count()) adEmail = (await mailEl.textContent())?.trim() || '';
                else {
                    const detailText = (await page.locator('#school_detail').textContent()) || '';
                    const m = detailText.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
                    if (m) adEmail = m[0];
                }
            }

            // Sanitize and stream row to file as we go
            const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
            stream.write([esc(schoolName), esc(mascot), esc(phone), esc(website), esc(adName), esc(adEmail)].join(',') + '\n');

            // small delay to avoid overwhelming
            await page.waitForTimeout(200);
        }
        // Close stream and clean up
        await stream.close();
        const content = fs.readFileSync(outPath, 'utf8');
        expect(content.split('\n').length).toBeGreaterThan(1);

        await context.close();
        await headful.close();
    });
});


