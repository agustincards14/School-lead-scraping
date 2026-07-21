import { test, expect } from '@playwright/test';
import { SchoolData, writeSchoolDataToCsv } from '../file_helpers.js';
import { Locator } from '@playwright/test';


test('scrape all schools in a given section', async ({ page }) => {
    const SECTION = process.env.SECTION;
    if (!SECTION) {
        throw new Error('SECTION environment variable is not set');
    }
    await page.goto('https://www.cifsshome.org/widget/school/directory');

    // const sectionOptions = await page.locator('#section option').all();
    const sectionOption = page.locator(`#section option[value="${SECTION}"]`).first();

    // for (let i = 0; i < sectionOptions.length; i++) { //skip the loop, use specified section
    const sectionValue = await sectionOption.getAttribute('value');
    const sectionLabel = await sectionOption.textContent() || '';

    await page.selectOption('#section', sectionValue!);
    console.log(`Selected section: ${sectionLabel}`);
    await page.waitForTimeout(1000);
    await page.waitForSelector('.school-btn', { timeout: 5000 });
    const schoolButtons = await page.locator('.school-btn').all();
    // This loops through all schools in the selected section
    for (let j = 0; j < schoolButtons.length; j++) {

        async function expectText(locator: import('@playwright/test').Locator, expectedText: string): Promise<boolean> {
            try {
                await expect(locator).toContainText(expectedText, { timeout: 5000 });
                return true;
            } catch (error) {
                console.error(`Expected text "${expectedText}" not found in locator.`);
                console.log(`Skipping school...`);
                return false;
            }
        }

        const currentSchoolButtons = await page.locator('.school-btn').all(); // Re-query (still not sure if needed)
        if (j >= currentSchoolButtons.length) break;
        const schoolButton = currentSchoolButtons[j];
        const schoolName = (await schoolButton.textContent() || '').trim();
        await schoolButton.click().then(async () => await page.waitForTimeout(1000));

        //! DEV MODE - DELETE WHEN SCRAPING
        // if (schoolName === 'Whittier Christian') {
        //     console.log('whittier christian index:', j);
        //     return;
        // } else continue;
        //! DEV MODE

        await page.getByRole('tab', { name: /School information/i }).click().then(async () => await page.waitForTimeout(1000));
        let schoolNameRow = page.locator('div.border-top.d-flex').filter({ has: page.locator('span', { hasText: 'Common Name:' }) }).first();

        let loaded = await expectText(schoolNameRow, schoolName);
        if (!loaded) continue;

        const commonName = await schoolNameRow.locator('div:nth-child(2) > span').textContent();
        // console.log('common name:', commonName);

        let website = await extractWebsite(page);
        let mascot = await extractMascot(page);
        // console.log('Website:', website);
        // console.log('Mascot:', mascot);
        // await page.getByRole('tab', { name: /Athletic Faculty/i }).click().then(async () => await page.waitForTimeout(500));
        //by this point the school data is loaded so we don't have to wait for expected text, extract data directly
        const athleticDirector: AthleticDirectorInfo = await extractAthleticDirector(page);
        const boysSoccerCoach: CoachInfo = await extractCoachData(page, 'boys');
        const girlsSoccerCoach: CoachInfo = await extractCoachData(page, 'girls');

        const schoolData: SchoolData = {
            schoolName: commonName || schoolName,
            section: sectionLabel,
            mascot: mascot || '',
            website: website || '',
            athleticDirectorName: athleticDirector.name || '',
            athleticDirectorEmail: athleticDirector.email || '',
            athleticDirectorPhone: athleticDirector.office || '',
            athleticDirectorExt: athleticDirector.ext || '',
            boysSoccerCoachName: boysSoccerCoach.name || '',
            boysSoccerCoachEmail: boysSoccerCoach.email || '',
            girlsSoccerCoachName: girlsSoccerCoach.name || '',
            girlsSoccerCoachEmail: girlsSoccerCoach.email || '',
        };
        console.log('School Data:', schoolData);
        writeSchoolDataToCsv(schoolData);
        // if (schoolName == 'Archie Williams') return;
        // if (j == 2) return;
    }
    console.log(`Finished scraping ${sectionLabel}`);
    // }
    // console.log(results);
});


// --- Modularized extraction helpers ---

async function extractWebsite(page: import('@playwright/test').Page): Promise<string> {
    try {
        const websiteRow = page.locator('div.border-top.d-flex').filter({ has: page.locator('span', { hasText: 'School Website:' }) }).first();
        const websiteLink = websiteRow.locator('a');
        return await websiteLink.getAttribute('href') || '';
    } catch {
        console.error('Error fetching website:');
        return '';
    }
}

async function extractMascot(page: import('@playwright/test').Page): Promise<string> {
    try {
        const mascotRow = page.locator('div.border-top.d-flex').filter({ has: page.locator('span', { hasText: 'School Mascot / Nickname:' }) }).first();
        return await mascotRow.locator('div:nth-child(2) > span').textContent() || '';
    } catch {
        console.error('Error fetching mascot:');
        return '';
    }
}

interface AthleticDirectorInfo {
    name: string;
    email: string;
    office: string;
    ext: string;
}

async function extractAthleticDirector(page: import('@playwright/test').Page): Promise<AthleticDirectorInfo> {
    try {
        const facultyTab = page.locator('#athletic-faculty');
        const adSections = facultyTab.locator('div.border-bottom:has(h3:text("Athletic Director"))');
        const adCount = await adSections.count();

        let best = { name: '', email: '', office: '', ext: '' };

        for (let i = 0; i < adCount; i++) {
            const section = adSections.nth(i);
            const name = (await section.locator('p:has-text("Name:")').textContent() || '').replace('Name: ', '').trim();
            const email = (await section.locator('p:has-text("Email:")').textContent() || '').replace('Email: ', '').trim();
            const office = (await section.locator('p:has-text("Office Number:")').textContent() || '').replace('Office Number: ', '').trim();
            const ext = (await section.locator('p:has-text("Ext.:")').textContent() || '').replace('Ext.: ', '').trim();

            // If this section has a phone number, return it immediately
            if (office) {
                return { name, email, office, ext };
            }

            // Otherwise, remember the first one
            if (i === 0) {
                best = { name, email, office, ext };
            }
        }

        // If none had a phone number, return the first one (or empty if none exist)
        return best;
    } catch (e) {
        console.error('Error fetching Athletic Director info:', e);
        return { name: '', email: '', office: '', ext: '' };
    }
}

interface CoachInfo {
    name: string;
    email: string;
}

async function extractCoachData(page: import('@playwright/test').Page, gender: string): Promise<CoachInfo> {
    gender = gender.charAt(0).toUpperCase() + gender.slice(1);
    const coachesTab = page.locator('#coaches-and-sports');
    const coachH3Locator = coachesTab.locator('h3.h3-smaller.font-weight-bold.mt-4', { hasText: `Soccer, ${gender}` }).first();
    if (await coachH3Locator.count() === 0) return { name: '', email: '' };

    // Get all sibling divs after the target h3, stopping at the next h3
    const siblingDivs = coachH3Locator.locator('xpath=following-sibling::*[self::div or self::h3]');
    const divCount = await siblingDivs.count();

    const relevantDivs: import('@playwright/test').Locator[] = [];
    for (let i = 0; i < divCount; i++) {
        const sib = siblingDivs.nth(i);
        const tag = await sib.evaluate(el => el.tagName);
        if (tag === 'H3') break;
        if (tag === 'DIV') relevantDivs.push(sib);
    }

    // Helper to extract name/email from a div
    async function extractFromDiv(divLocator: import('@playwright/test').Locator) {
        const name = (await divLocator.locator('p:has-text("Name:")').textContent() || '').replace('Name: ', '').trim();
        const email = (await divLocator.locator('p:has-text("Email:")').textContent() || '').replace('Email: ', '').trim();
        return { name, email };
    }

    // Try to find Head Coach first
    for (const div of relevantDivs) {
        const hasHeadCoach = await div.locator('b.font-weight-bold', { hasText: 'Head Coach' }).count();
        if (hasHeadCoach > 0) {
            return await extractFromDiv(div);
        }
    }

    // If no Head Coach, try Assistant Coach
    for (const div of relevantDivs) {
        const hasAssistantCoach = await div.locator('b.font-weight-bold', { hasText: 'Assistant Coach' }).count();
        if (hasAssistantCoach > 0) {
            return await extractFromDiv(div);
        }
    }

    // If neither found, return empty
    return { name: '', email: '' };
}