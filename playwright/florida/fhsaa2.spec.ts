import { test, expect, chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// This test scrapes the FHSAA school-directory widget and writes a CSV to assets/fhsaa_schools.csv
test('extract all schools and export CSV', async () => {
    // Launch a headed browser so user can watch; add slowMo
    const headful = await chromium.launch({ headless: true, slowMo: 80 });
    const context = await headful.newContext();
    const page = await context.newPage();

    // Try live URL first, fall back to local MHTML snapshot
    const liveUrl = 'https://www.fhsaahome.org/widget/school-directory';
    try {
        try {
            await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            throw new Error(`Failed to load FHSAA school directory page: ${e}`);
        }

        // Wait for the select to be present
        const selector = page.locator('select[name="school_id"]');
        await expect(selector).toHaveCount(1);

        // Build array of option texts and values (ignore empty/--Select--)
        const options = await selector.locator('option').elementHandles();
        console.log(`Found ${options.length} schools in the selector.`);
        const submitBtn = page.locator('body > div:nth-child(2) > fieldset > form > div > div:nth-child(5) > input');
        await expect(submitBtn).toHaveCount(1);
        // Collect all values first to avoid stale element handles after navigation
        const values: string[] = [];
        for (let option of options) {
            const value = await option.getAttribute('value');
            if (value && value !== '') {
                values.push(value);
            }
        }

        // Prepare output CSV file (overwrite if exists)
        const fileDir = path.join('assets', 'high school', 'FL');
        const filePath = path.join(fileDir, 'fhsaa.csv');
        const headers = 'School Name,Athletic Director,Mascot,Website,Phone,Athletic Director Email';
        fs.mkdirSync(fileDir, { recursive: true });
        // Overwrite any existing file and write headers
        // fs.writeFileSync(filePath, headers + '\n', 'utf-8');

        const escapeCsv = (v: any) => {
            if (v === null || v === undefined) return '""';
            const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ');
            return `"${s}"`;
        };

        for (let i = 335; i < values.length; i++) {
            // for (let value of values) {
            const value = values[i];
            console.log('Processing:', value);
            await selector.selectOption({ value });
            await submitBtn.click(); // click search button
            // await page.waitForTimeout(1000);
            await page.waitForLoadState();
            // await page.waitForLoadState('domcontentloaded');
            // await page.waitForFunction(() => {
            //     const el = document.querySelector('#school_detail');
            //     return el && el.children.length > 0;
            // });
            let schoolname = await page.locator('#school_detail > div:nth-child(4) > div.col-md-8 > div > table > tbody > tr:nth-child(1) > td').innerText();
            let athleticDirector = await page.locator('#school_detail > div:nth-child(4) > div.col-md-8 > div > table > tbody > tr:nth-child(3) > td').innerText();
            let mascot = await page.locator('#school_detail > div:nth-child(4) > div.col-md-8 > div > table > tbody > tr:nth-child(22) > td').innerText();
            let website = await page.locator('#school_detail > div:nth-child(4) > div.col-md-8 > div > table > tbody > tr:nth-child(23) > td').innerText();
            let phone = await page.locator('#school_detail > div:nth-child(4) > div.col-md-8 > div > table > tbody > tr:nth-child(14) > td').innerText();
            console.log("director:", athleticDirector);
            await page.locator('#school_detail > div:nth-child(1) > div:nth-child(1) > button').click(); // click faculty button
            // await page.waitForTimeout(1000); //wait for faculty tab to load
            // await page.waitForLoadState();
            // await expect(adEmail).toHaveCount(1);
            // let schoolDetailHtml = await page.locator('#school_detail').innerHTML();
            // let adEmail = page.locator('#school_detail > a:nth-child(22)');
            // console.log("School Detail HTML:", schoolDetailHtml);
            // console.log("email:", email);
            // This locator finds a <div> that has a direct or indirect <h6> child
            // with the exact text "Athletic Director".
            const adContainer = page.locator('#school_detail').locator('div:has(> h6:text("Athletic Director"))').first();
            await adContainer.waitFor({ state: 'visible' });
            const adEmailLink = adContainer.locator('xpath=following-sibling::a[1]');
            // You can now perform actions on this container
            try {
                await expect(adEmailLink).toBeVisible();
            } catch (e) {
                console.error(`AD data not found for school: ${schoolname}`);
                continue;
            }
            let email = await adEmailLink.innerText();
            const row = [schoolname, athleticDirector, mascot, website, phone, email].map(escapeCsv).join(',');
            console.log("row:", row);
            fs.appendFileSync(filePath, row + '\n', 'utf-8');
        }
    } catch (e) {
        console.error("Error during processing:", e);
    } finally {
        headful.close();
        context.close();
        page.close();
    }

});


