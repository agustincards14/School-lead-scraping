import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Scraper for TSSAAA Member High Schools Directory
 * Extracts Head Coaches for Soccer programs.
 */
async function scrapeTSSAAASoccerCoaches() {
    const csvPath = path.join(__dirname, 'tn_soccer_coaches.csv');

    // Create file and headers if it doesn't exist
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, 'School Name,Mascot,Email,Name\n');
    }

    const browser = await chromium.launch({ headless: true });
    // Use a single context but open/close pages to manage memory, or reuse a page.
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Starting TSSAAA directory scrape (IDs 1-1200)...');

    for (let id = 1; id <= 1200; id++) {
        const url = `https://portal.tssaa.org/common/directory/?id=${id}`;

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // 5. Check if it's a middle school
            const btnGroupText = await page.evaluate(() => {
                const btn = document.querySelector('#btnGroupDrop1');
                return btn ? btn.textContent?.toLowerCase() || '' : '';
            });

            if (btnGroupText.includes('middle')) {
                console.log(`[ID: ${id}] Skipping (Middle School)`);
                continue;
            }

            // Also skip if the page didn't load a real school (e.g. invalid ID returns to directory home)
            // A good check is if the school name exists.
            const pageData = await page.evaluate(() => {
                const schoolNameEl = document.querySelector('body > div.container.mt-4 > div > div:nth-child(3) > div > h2');
                const schoolName = schoolNameEl ? schoolNameEl.textContent?.trim() : null;

                const mascotStrongEl = document.querySelector('body > div.container.mt-4 > div > div:nth-child(3) > div > p > strong:nth-child(2)');
                let mascot = 'N/A';
                if (mascotStrongEl && mascotStrongEl.nextSibling) {
                    mascot = mascotStrongEl.nextSibling.textContent?.trim().replace(/[\n\r]+.*[·.]/g, '').trim() || 'N/A';
                }

                return { schoolName, mascot };
            });

            if (!pageData.schoolName) {
                // console.log(`[ID: ${id}] Skipping (No valid school profile found)`);
                continue;
            }

            // 7. Check for Soccer headers
            const soccerCoaches = await page.evaluate(() => {
                const coaches: { name: string, email: string }[] = [];
                const headers = Array.from(document.querySelectorAll('.card-header'));

                // Find all headers that contain 'Soccer' (e.g. "Boys' Soccer", "Girls' Soccer")
                const soccerHeaders = headers.filter(h => h.textContent?.toLowerCase().includes('soccer'));

                if (soccerHeaders.length === 0) return null; // No soccer program

                soccerHeaders.forEach(header => {
                    const cardBody = header.nextElementSibling;
                    if (cardBody && cardBody.classList.contains('card-body')) {
                        const staffPersons = cardBody.querySelectorAll('.staffPerson');
                        staffPersons.forEach(person => {
                            let name = 'Unknown';
                            let email = '';

                            // Extract Name (assuming it's in a strong tag or direct text)
                            // Often structured as "Name - Title" or "Title: Name"
                            // Based on typical structures, we will grab the link text if it's a mailto, 
                            // or the main text content, omitting the title.

                            // Let's look for the email first
                            const emailLink = person.querySelector('a[href^="mailto:"]');
                            if (emailLink) {
                                email = (emailLink as HTMLAnchorElement).href.replace('mailto:', '').split('?')[0].trim();
                            }

                            // Extract name: from the first td child
                            const firstTd = person.querySelector('td');
                            if (firstTd) {
                                name = firstTd.textContent?.split('(')[0].trim() || 'Unknown';
                            } else {
                                // Fallback
                                const strongTag = person.querySelector('strong');
                                if (strongTag) {
                                    name = strongTag.textContent?.split('(')[0].trim() || 'Unknown';
                                } else {
                                    const fullText = person.textContent || '';
                                    const cleaned = fullText
                                        .replace(email, '')
                                        .replace(/(Head Coach|Assistant Coach|Coach|Girls|Boys|Varsity|JV|\-)/gi, '')
                                        .replace(/[\n\r]+/g, ' ')
                                        .trim();
                                    if (cleaned) name = cleaned;
                                }
                            }

                            if (email) {
                                coaches.push({ name, email });
                            }
                        });
                    }
                });

                return coaches;
            });

            if (!soccerCoaches) {
                console.log(`[ID: ${id}] Skipping: No Soccer program (${pageData.schoolName})`);
                continue;
            }

            if (soccerCoaches.length === 0) {
                console.log(`[ID: ${id}] Found Soccer but no valid emails (${pageData.schoolName})`);
                continue;
            }

            // Deduplicate coaches for this school
            const uniqueCoaches = Array.from(new Map(soccerCoaches.map(c => [c.email, c])).values());

            console.log(`[ID: ${id}] Extracted ${uniqueCoaches.length} soccer coaches from ${pageData.schoolName}`);

            // 12. Asynchronously write to CSV
            const rowsToAppend = uniqueCoaches.map(coach => {
                // Escape values for CSV
                const escapedSchool = `"${pageData.schoolName!.replace(/"/g, '""')}"`;
                const escapedMascot = `"${pageData.mascot.replace(/"/g, '""')}"`;
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

scrapeTSSAAASoccerCoaches().catch(console.error);
