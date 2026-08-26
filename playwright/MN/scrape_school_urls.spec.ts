import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('MSHSL School URL Scraper Test', () => {
    test('Navigates pages 0 to 4, extracts slugs, and saves school_url_map.json', async ({ page }) => {
        test.setTimeout(180000); // 3 minutes timeout

        const BASE_URL = 'https://www.mshsl.org/schools/activities?activity=141';
        const OUTPUT_FILE = path.resolve(__dirname, 'school_url_map.json');
        const schoolUrlMap: Record<string, string> = {};

        for (let pageNum = 0; pageNum <= 4; pageNum++) {
            const pageUrl = pageNum === 0 ? BASE_URL : `${BASE_URL}&page=${pageNum}`;
            console.log(`Navigating to page ${pageNum}: ${pageUrl}`);

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('a.school-teaser__title', { timeout: 15000 });

            const schoolLinks = await page.$$eval('a.school-teaser__title', (anchors) =>
                anchors.map((a) => ({
                    href: a.getAttribute('href') || '',
                    title: (a.textContent || '').trim(),
                }))
            );

            expect(schoolLinks.length).toBeGreaterThan(0);
            console.log(`Page ${pageNum}: Extracted ${schoolLinks.length} school links`);

            for (const item of schoolLinks) {
                const href = item.href;
                if (!href) continue;

                const match = href.match(/\/schools\/([^\/\?#]+)/);
                let slug = '';

                if (match && match[1] && match[1] !== 'soccer-boys') {
                    slug = match[1].trim();
                } else if (item.title) {
                    slug = item.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, '');
                }

                if (slug) {
                    schoolUrlMap[slug] = `https://www.mshsl.org/schools/${slug}`;
                }
            }

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(schoolUrlMap, null, 2), 'utf-8');
        }

        const totalSchools = Object.keys(schoolUrlMap).length;
        console.log(`Total unique schools scraped: ${totalSchools}`);

        expect(totalSchools).toBe(224);
        expect(fs.existsSync(OUTPUT_FILE)).toBeTruthy();

        const savedData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        expect(Object.keys(savedData).length).toBe(totalSchools);
        expect(savedData['albany-high-school']).toBe('https://www.mshsl.org/schools/albany-high-school');
    });
});
