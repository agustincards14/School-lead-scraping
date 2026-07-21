import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function scrapeUHSAASoccerCoaches() {
    const csvPath = path.join(__dirname, 'uhsaa_soccer_coaches.csv');
    const idsPath = path.join(__dirname, 'ids.txt');

    // Create file and headers if it doesn't exist
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, 'School Name,Mascot,Email,Name\n');
    }

    // Read and parse ids.txt
    const idsRaw = fs.readFileSync(idsPath, 'utf8');
    const idsString = idsRaw.replace(/,\s*\]/, ']'); // Handle potential trailing commas
    const ids: number[] = JSON.parse(idsString);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`Starting UHSAA directory scrape for ${ids.length} schools...`);
    const baseURL = 'https://uhsaa.org/school-directory/';

    for (const id of ids) {
        const url = `${baseURL}?schoolID=${id}`;

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const extractedData = await page.evaluate(() => {
                const schoolNameEl = document.querySelector('.school-name');
                if (!schoolNameEl || !schoolNameEl.textContent) {
                    return null; // School not found
                }

                // Extract School Name & Mascot
                const fullName = schoolNameEl.textContent.trim().split(' ');
                const mascot = fullName.length > 1 ? fullName.pop() || '' : '';
                const schoolName = fullName.join(' ');

                // Extract Coaches
                const coaches: { name: string, email: string }[] = [];
                const staffRows = document.querySelectorAll('.staff-table tbody tr');

                staffRows.forEach(row => {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 2) {
                        const sportOrTitleText = tds[0].textContent?.trim().toLowerCase() || '';

                        // Check if Boys Soccer or Girls Soccer
                        if (sportOrTitleText.includes('boys soccer') || sportOrTitleText.includes('girls soccer')) {
                            // Name and Email information will be contained in the second td element, within an a element
                            const aTag = tds[1].querySelector('a');
                            if (aTag) {
                                const name = aTag.textContent?.trim() || '';
                                const href = aTag.getAttribute('href') || '';
                                let email = '';

                                if (href.startsWith('mailto:')) {
                                    email = href.replace('mailto:', '').split('?')[0].trim();
                                } else {
                                    // Sometimes email is the text if no mailto is used but it's an email link
                                    if (name.includes('@')) {
                                        email = name;
                                    }
                                }

                                if (name && email) {
                                    coaches.push({ name, email });
                                }
                            }
                        }
                    }
                });

                return { schoolName, mascot, coaches };
            });

            if (!extractedData) {
                console.log(`[ID: ${id}] Skipping (No valid .school-name found)`);
                continue;
            }

            if (extractedData.coaches.length === 0) {
                console.log(`[ID: ${id}] Found school but no valid soccer coaches (${extractedData.schoolName})`);
                continue;
            }

            // Deduplicate coaches for this school using a Set of strings (emails)
            const uniqueEmails = new Set<string>();
            const uniqueCoaches: { name: string, email: string }[] = [];

            for (const coach of extractedData.coaches) {
                if (!uniqueEmails.has(coach.email)) {
                    uniqueEmails.add(coach.email);
                    uniqueCoaches.push(coach);
                }
            }

            console.log(`[ID: ${id}] Extracted ${uniqueCoaches.length} soccer coaches from ${extractedData.schoolName}`);

            // Asynchronously write to CSV
            const rowsToAppend = uniqueCoaches.map(coach => {
                // Escape values for CSV
                const escapedSchool = `"${extractedData.schoolName.replace(/"/g, '""')}"`;
                const escapedMascot = `"${extractedData.mascot.replace(/"/g, '""')}"`;
                const escapedEmail = `"${coach.email.replace(/"/g, '""')}"`;
                const escapedName = `"${coach.name.replace(/"/g, '""')}"`;
                return `${escapedSchool},${escapedMascot},${escapedEmail},${escapedName}`;
            });

            fs.appendFile(csvPath, rowsToAppend.join('\n') + '\n', (err) => {
                if (err) console.error(`Error writing id ${id} to CSV:`, err);
            });

        } catch (error) {
            console.error(`[ID: ${id}] Error navigating or extracting:`, error);
        }
    }

    console.log('Finished scraping directory.');
    await browser.close();
}

// Only run if called directly (not from tests)
if (process.argv[1].endsWith('uhsaa_soccer_scraper.ts')) {
    scrapeUHSAASoccerCoaches().catch(console.error);
}

export { scrapeUHSAASoccerCoaches };
