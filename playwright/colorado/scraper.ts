import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CHSAA School Directory Scraper
 * Scrapes school information and soccer coach contacts.
 */

async function scrapeCHSAA() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to CHSAA school directory...');
    await page.goto('https://chsaareports.com/school_directory/', { waitUntil: 'networkidle' });

    // Get all school profile links by constructing them from data attributes
    const schoolLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.school-report-link'));
        return links.map(link => {
            const schoolInfo = link.getAttribute('data-school-info');
            const genie = link.getAttribute('data-genie');
            return `https://chsaareports.com/school_directory/list?schoolInfo=${schoolInfo}&genie=${genie}`;
        });
    });

    console.log(`Found ${schoolLinks.length} schools. Starting full scrape...`);

    const allLeads = [];

    for (let i = 0; i < schoolLinks.length; i++) {
        const link = schoolLinks[i];
        console.log(`[${i + 1}/${schoolLinks.length}] Scraping: ${link}`);

        const profilePage = await context.newPage();
        try {
            await profilePage.goto(link, { waitUntil: 'networkidle', timeout: 60000 });

            // Extract School Name and Mascot
            const schoolData = await profilePage.evaluate(() => {
                const nameEl = document.querySelector('.print-section h3');
                const schoolName = nameEl ? nameEl.textContent?.trim() : 'Unknown';

                // Mascot: Find the specific text-right label for Mascot
                const allDivs = Array.from(document.querySelectorAll('.row div'));
                let mascot = 'N/A';
                const mascotLabel = allDivs.find(el => el.textContent?.trim() === 'Mascot:' || el.textContent?.trim() === 'Mascot(s):');
                if (mascotLabel && mascotLabel.nextElementSibling) {
                    mascot = mascotLabel.nextElementSibling.textContent?.trim() || 'N/A';
                }

                return { schoolName, mascot };
            });

            // Extract Coaches
            const coaches = await profilePage.evaluate(() => {
                const coachTables = Array.from(document.querySelectorAll('table.table-coach'));
                const contacts = [];

                for (const table of coachTables) {
                    const rows = Array.from(table.querySelectorAll('tr'));
                    let isSoccer = false;
                    let coachName = 'Unknown';
                    let coachEmail = null;

                    for (const row of rows) {
                        const tds = Array.from(row.querySelectorAll('td'));
                        if (tds.length < 2) continue;

                        const labelTd = tds[0];
                        const valueTd = tds[1];

                        const labelText = labelTd.textContent?.trim() || '';
                        const valueText = valueTd.textContent?.trim() || '';

                        if (labelText.includes('Activity')) {
                            if (valueText.toLowerCase().includes('soccer')) {
                                isSoccer = true;
                            }
                        } else if (labelText.includes('Coach')) {
                            // Extract name and strip out the email in parentheses if it exists
                            coachName = valueText.split('(')[0].trim() || 'Unknown';
                            const emailLink = valueTd.querySelector('a[href^="mailto:"]');
                            if (emailLink) {
                                coachEmail = (emailLink as HTMLAnchorElement).href.replace('mailto:', '').split('?')[0].trim();
                            }
                        }
                    }

                    if (isSoccer && coachEmail && coachEmail.toLowerCase() !== 'vacant') {
                        contacts.push({ name: coachName, email: coachEmail });
                    }
                }
                return contacts;
            });

            // Combine and add to leads
            for (const coach of coaches) {
                allLeads.push({
                    'School Name': schoolData.schoolName,
                    'Mascot': schoolData.mascot,
                    'Name': coach.name,
                    'Email': coach.email
                });
            }

        } catch (error) {
            console.error(`Error scraping ${link}:`, error);
        } finally {
            await profilePage.close();
        }
    }

    await browser.close();

    // Save to JSON
    const jsonPath = path.join(__dirname, 'school_leads.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allLeads, null, 2));
    console.log(`Scraping complete. Saved ${allLeads.length} leads to ${jsonPath}`);

    // Save to CSV
    if (allLeads.length > 0) {
        const csvPath = path.join(__dirname, 'school_leads.csv');
        const headers = Object.keys(allLeads[0]).join(',');
        const rows = allLeads.map(lead => {
            const escapedLead = Object.values(lead).map(val => `"${val.replace(/"/g, '""')}"`);
            return escapedLead.join(',');
        });
        fs.writeFileSync(csvPath, [headers, ...rows].join('\n'));
        console.log(`Also saved to ${csvPath}`);
    }
}

scrapeCHSAA().catch(console.error);
