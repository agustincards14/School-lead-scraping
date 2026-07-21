import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * AD Scraper for Colorado Schools with Soccer Programs
 */

async function scrapeColoradoADs() {
    const csvPath = path.join(__dirname, 'school_leads.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('File not found: school_leads.csv. Please run the soccer scraper first.');
        return;
    }

    // Use a simple CSV parser (split by lines and then by comma)
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(',');

    // Get unique school names from the existing CSV (assuming School Name is the first column)
    const rows = lines.slice(1);
    const soccerSchools = new Set<string>();

    rows.forEach(line => {
        // Basic CSV parsing for quoted values
        const match = line.match(/"([^"]*)"/);
        if (match) {
            soccerSchools.add(match[1]);
        } else {
            soccerSchools.add(line.split(',')[0]);
        }
    });

    console.log(`Found ${soccerSchools.size} unique schools with soccer programs in CSV.`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to CHSAA school directory to get profile URLs...');
    await page.goto('https://chsaareports.com/school_directory/', { waitUntil: 'networkidle' });

    // Get all school profile links and filter by names we found in the CSV
    const allSchoolLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.school-report-link'));
        return links.map(link => {
            const schoolInfo = link.getAttribute('data-school-info');
            const genie = link.getAttribute('data-genie');
            const name = link.textContent?.trim() || 'Unknown';
            return {
                name,
                url: `https://chsaareports.com/school_directory/list?schoolInfo=${schoolInfo}&genie=${genie}`
            };
        });
    });

    const targets = allSchoolLinks.filter(link => soccerSchools.has(link.name));
    console.log(`Matched ${targets.length} schools for AD scraping.`);

    const adLeads: any[] = [];

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        console.log(`[${i + 1}/${targets.length}] Scraping AD for: ${target.name}`);

        const profilePage = await context.newPage();
        try {
            await profilePage.goto(target.url, { waitUntil: 'networkidle', timeout: 60000 });

            const adData = await profilePage.evaluate(() => {
                // School Name and Mascot (for completeness in the new row)
                const nameEl = document.querySelector('.print-section h3');
                const schoolName = nameEl ? nameEl.textContent?.trim() : 'Unknown';

                const allDivs = Array.from(document.querySelectorAll('.row div'));

                // Mascot
                let mascot = 'N/A';
                const mascotLabel = allDivs.find(el => el.textContent?.trim() === 'Mascot:' || el.textContent?.trim() === 'Mascot(s):');
                if (mascotLabel && mascotLabel.nextElementSibling) {
                    mascot = mascotLabel.nextElementSibling.textContent?.trim() || 'N/A';
                }

                // Athletic Director
                let adName = 'Unknown';
                let adEmail = null;
                const adLabel = allDivs.find(el => el.textContent?.trim() === 'Athletic Director:');
                if (adLabel && adLabel.nextElementSibling) {
                    const valueDiv = adLabel.nextElementSibling;
                    adName = valueDiv.textContent?.split('(')[0].trim() || 'Unknown';
                    const emailLink = valueDiv.querySelector('a[href^="mailto:"]');
                    if (emailLink) {
                        adEmail = (emailLink as HTMLAnchorElement).href.replace('mailto:', '').split('?')[0].trim();
                    }
                }

                return { schoolName, mascot, adName, adEmail };
            });

            if (adData.adEmail && adData.adEmail.toLowerCase() !== 'vacant') {
                adLeads.push({
                    'School Name': adData.schoolName,
                    'Mascot': adData.mascot,
                    'Name': adData.adName,
                    'Email': adData.adEmail
                });
            }

        } catch (error) {
            console.error(`Error scraping AD for ${target.name}:`, error);
        } finally {
            await profilePage.close();
        }
    }

    await browser.close();

    // Append new AD leads to the CSV
    if (adLeads.length > 0) {
        const rowsToAppend = adLeads.map(lead => {
            const escapedValues = Object.values(lead).map(val => `"${(val as string).replace(/"/g, '""')}"`);
            return escapedValues.join(',');
        });

        fs.appendFileSync(csvPath, '\n' + rowsToAppend.join('\n'));
        console.log(`Scraping complete. Appended ${adLeads.length} Athletics Directors to ${csvPath}`);

        // Also update JSON for consistency
        const jsonPath = path.join(__dirname, 'school_leads.json');
        if (fs.existsSync(jsonPath)) {
            const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            const updatedJson = [...existingJson, ...adLeads];
            fs.writeFileSync(jsonPath, JSON.stringify(updatedJson, null, 2));
            console.log(`Updated ${jsonPath} with new AD leads.`);
        }
    } else {
        console.log('No valid AD contact cards found.');
    }
}

scrapeColoradoADs().catch(console.error);
