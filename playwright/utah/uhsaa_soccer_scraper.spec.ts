import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('UHSAA Soccer Scraper', () => {
    test('extracts soccer coaches from 5 different schools', async ({ page }) => {
        const testIds = [1, 3, 4, 5, 6];
        const baseURL = 'https://uhsaa.org/school-directory/';
        const results: any[] = [];

        test.setTimeout(60000); // Give plenty of time for 5 pages to load

        for (const id of testIds) {
            const url = `${baseURL}?schoolID=${id}`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const extractedData = await page.evaluate((currentId) => {
                const schoolNameEl = document.querySelector('.school-name');
                if (!schoolNameEl || !schoolNameEl.textContent) return null;

                const fullName = schoolNameEl.textContent.trim().split(' ');
                const mascot = fullName.length > 1 ? fullName.pop() || '' : '';
                const schoolName = fullName.join(' ');

                const coaches: { name: string, email: string }[] = [];
                const staffRows = document.querySelectorAll('.staff-table tr');

                staffRows.forEach(row => {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 2) {
                        const sportOrTitleText = tds[0].textContent?.trim().toLowerCase() || '';

                        // Check if Boys Soccer or Girls Soccer
                        if (sportOrTitleText.includes('boys soccer') || sportOrTitleText.includes('girls soccer')) {
                            const aTag = tds[1].querySelector('a');
                            if (aTag) {
                                const name = aTag.textContent?.trim() || '';
                                const href = aTag.getAttribute('href') || '';
                                let email = '';

                                if (href.startsWith('mailto:')) {
                                    email = href.replace('mailto:', '').split('?')[0].trim();
                                } else if (name.includes('@')) {
                                    email = name;
                                }

                                // Only keep if valid email is present
                                if (name && email) {
                                    coaches.push({ name, email });
                                }
                            }
                        }
                    }
                });

                return {
                    id: currentId,
                    schoolName,
                    mascot,
                    coaches
                };
            }, id);

            if (extractedData) {
                // Remove duplicates by email
                const uniqueEmails = new Set<string>();
                const uniqueCoaches = [];
                for (const c of extractedData.coaches) {
                    if (!uniqueEmails.has(c.email)) {
                        uniqueEmails.add(c.email);
                        uniqueCoaches.push(c);
                    }
                }
                extractedData.coaches = uniqueCoaches;
                results.push(extractedData);
            }
        }

        console.log('Results from test:', JSON.stringify(results, null, 2));

        // Assert we actually collected some data
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].schoolName).toBeTruthy();
        expect(results[0].mascot).toBeTruthy();
    });
});
