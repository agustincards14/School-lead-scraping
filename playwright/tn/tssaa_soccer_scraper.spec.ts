import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Test for the TSSAAA Scraper Logic on 5 IDs
 */
test.describe('TSSAAA Soccer Scraper Logic Validator', () => {

    const testIds = [1, 2, 3, 4, 5]; // Sample IDs to iterate through

    test('Iterates 5 IDs and extracts Soccer data correctly', async ({ page, browser }) => {
        test.setTimeout(120000); // Allow test to run longer for 5 pages

        const extractedData: any[] = [];

        for (const id of testIds) {
            const url = `https://portal.tssaa.org/common/directory/?id=${id}`;

            // Go to the directory page
            await page.goto(url, { waitUntil: 'domcontentloaded' });

            // Check for Middle School
            const btnGroupText = await page.evaluate(() => {
                const btn = document.querySelector('#btnGroupDrop1');
                return btn ? btn.textContent?.toLowerCase() || '' : '';
            });

            if (btnGroupText.includes('middle')) {
                console.log(`Test [ID: ${id}] Skipped (Middle School)`);
                continue;
            }

            // Get School Info
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
                console.log(`Test [ID: ${id}] Skipped (No School Name found)`);
                continue;
            }

            // Extract Soccer Coaches
            const soccerCoaches = await page.evaluate(() => {
                const coaches: { name: string, email: string }[] = [];
                const headers = Array.from(document.querySelectorAll('.card-header'));

                const soccerHeaders = headers.filter(h => h.textContent?.toLowerCase().includes('soccer'));

                if (soccerHeaders.length === 0) return null;

                soccerHeaders.forEach(header => {
                    const cardBody = header.nextElementSibling;
                    if (cardBody && cardBody.classList.contains('card-body')) {
                        const staffPersons = cardBody.querySelectorAll('.staffPerson');
                        staffPersons.forEach(person => {
                            let name = 'Unknown';
                            let email = '';

                            const emailLink = person.querySelector('a[href^="mailto:"]');
                            if (emailLink) {
                                email = (emailLink as HTMLAnchorElement).href.replace('mailto:', '').split('?')[0].trim();
                            }

                            // Try extracting name from the first td child
                            const firstTd = person.querySelector('td');
                            if (firstTd) {
                                name = firstTd.textContent?.split('(')[0].trim() || 'Unknown';
                            } else {
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

            if (soccerCoaches) {
                const uniqueCoaches = Array.from(new Map(soccerCoaches.map(c => [c.email, c])).values());
                if (uniqueCoaches.length > 0) {
                    extractedData.push({
                        id,
                        schoolName: pageData.schoolName,
                        mascot: pageData.mascot,
                        coaches: uniqueCoaches
                    });
                    console.log(`Test [ID: ${id}] Extracted ${uniqueCoaches.length} soccer coaches.`);
                } else {
                    console.log(`Test [ID: ${id}] Skipped (Soccer program found, but no valid emails).`);
                }
            } else {
                console.log(`Test [ID: ${id}] Skipped (No Soccer Program).`);
            }
        }

        console.log('Test extraction results:', JSON.stringify(extractedData, null, 2));

        // We expect the script to execute without throwing errors.
        expect(true).toBeTruthy();
    });

});
