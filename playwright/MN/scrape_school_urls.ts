import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://www.mshsl.org/schools/activities?activity=141';
const OUTPUT_FILE = path.resolve(__dirname, 'school_url_map.json');

export interface SchoolUrlMap {
    [schoolSlug: string]: string;
}

/**
 * Extracts school slugs and constructs map of { [school_name]: "https://www.mshsl.org/schools/{school_name}" }
 * across all pages (0 to 4).
 */
export async function scrapeSchoolUrls(): Promise<SchoolUrlMap> {
    console.log('Starting MSHSL school URL scraper...');
    const browser: Browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page: Page = await context.newPage();

    const schoolUrlMap: SchoolUrlMap = {};

    try {
        for (let pageNum = 0; pageNum <= 4; pageNum++) {
            const pageUrl = pageNum === 0 ? BASE_URL : `${BASE_URL}&page=${pageNum}`;
            console.log(`\n[Page ${pageNum}/4] Navigating to: ${pageUrl}`);

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('a.school-teaser__title', { timeout: 15000 });

            // Extract school teaser link details (href and text content)
            const schoolLinks = await page.$$eval('a.school-teaser__title', (anchors) =>
                anchors.map((a) => ({
                    href: a.getAttribute('href') || '',
                    title: (a.textContent || '').trim(),
                }))
            );

            console.log(`[Page ${pageNum}/4] Found ${schoolLinks.length} school links`);

            for (const item of schoolLinks) {
                const href = item.href;
                if (!href) continue;

                // Extract slug from href, e.g. /schools/albany-high-school/soccer-boys/2026 -> albany-high-school
                const match = href.match(/\/schools\/([^\/\?#]+)/);
                let slug = '';

                if (match && match[1] && match[1] !== 'soccer-boys') {
                    slug = match[1].trim();
                } else if (item.title) {
                    // Fallback for edge cases where href lacks the school slug (e.g. /schools/soccer-boys/2026)
                    slug = item.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, '');
                }

                if (slug) {
                    const fullSchoolUrl = `https://www.mshsl.org/schools/${slug}`;
                    schoolUrlMap[slug] = fullSchoolUrl;
                } else {
                    console.warn(`[WARN] Could not extract slug from item: ${JSON.stringify(item)}`);
                }
            }

            // Incremental write after each page
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(schoolUrlMap, null, 2), 'utf-8');
            console.log(`[Page ${pageNum}/4] Saved to ${OUTPUT_FILE} (Total collected: ${Object.keys(schoolUrlMap).length})`);
        }

        console.log(`\nDone! Total unique schools in map: ${Object.keys(schoolUrlMap).length}`);
        return schoolUrlMap;
    } finally {
        await browser.close();
    }
}

// Standalone execution runner
if (process.argv[1] === __filename) {
    scrapeSchoolUrls()
        .then((map) => {
            console.log(`\nSuccessfully generated school_url_map.json with ${Object.keys(map).length} entries.`);
            process.exit(0);
        })
        .catch((err) => {
            console.error('Fatal error during scraping:', err);
            process.exit(1);
        });
}
