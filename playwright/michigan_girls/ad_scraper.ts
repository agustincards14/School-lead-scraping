import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

(async () => {
    const urlsPath = './urls.json';
    const csvPath = './schools.csv';

    // Read and parse urls.json
    const urlsData = await fs.readFile(urlsPath, 'utf-8');
    const urls: Record<string, string> = JSON.parse(urlsData);

    // Create CSV header if file doesn't exist
    if (!existsSync(csvPath)) {
        await fs.writeFile(csvPath, 'School Name,Mascot,Name,Email\n', 'utf-8');
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const [schoolName, originalUrl] of Object.entries(urls)) {
        try {
            // Remove the specific endpoint
            const url = originalUrl.replace('/girls/varsity/soccer/2025', '');
            
            console.log(`Visiting: ${schoolName} - ${url}`);
            
            // Navigate to URL and wait for page to load
            await page.goto(url, { waitUntil: 'load' });
            
            // Small wait to ensure dynamic data is loaded
            await page.waitForTimeout(1000);

            // Extract Mascot using the XPath the user provided
            let mascot = await page.evaluate(() => {
                try {
                    const result = document.evaluate('//*[@id="school-detail"]/div[2]/div[2]/div[2]/div/span[2]', document, null, XPathResult.STRING_TYPE, null);
                    return result.stringValue.replace(/Nickname:\s*/i, '').trim();
                } catch (e) {
                    return '';
                }
            });

            // If empty, a slight fallback
            if (!mascot) {
                 mascot = await page.evaluate(() => {
                    const el = document.evaluate('//*[@id="school-detail"]/div[2]/div[2]/div[2]/div/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
                    if (el) {
                        return el.textContent?.replace(/Nickname:\s*/i, '').trim() || '';
                    }
                    return '';
                 });
            }

            // Extract staff info
            const getStaffInfo = (title: string) => {
                let name = '';
                let email = '';
                const els = document.querySelectorAll('.school__staff--admin');
                for (const el of els) {
                    const strong = el.querySelector('strong');
                    if (strong && strong.textContent?.trim() === title) {
                        const p = el.querySelector('p');
                        if (p) name = p.textContent?.trim() || '';
                        const a = el.querySelector('a[href^="mailto:"]');
                        if (a) email = a.textContent?.trim() || a.getAttribute('href')?.replace('mailto:', '').trim() || '';
                        break;
                    }
                }
                return { name, email };
            };

            const ad = await page.evaluate(getStaffInfo, 'Athletic Director');
            const adSec = await page.evaluate(getStaffInfo, 'Athletic Director Secretary');

            console.log(`  -> Mascot: ${mascot}, AD: ${ad.name}, AD Sec: ${adSec.name || 'N/A'}`);

            // Append AD
            if (ad.name || ad.email) {
                const adRow = `${schoolName},${mascot},${ad.name},${ad.email}\n`;
                await fs.appendFile(csvPath, adRow, 'utf-8');
            }

            // Append AD Secretary
            if (adSec.name || adSec.email) {
                const secRow = `${schoolName},${mascot},${adSec.name},${adSec.email}\n`;
                await fs.appendFile(csvPath, secRow, 'utf-8');
            }

        } catch (error) {
            console.error(`  -> Error processing ${schoolName}:`, (error as Error).message);
        }
    }

    await browser.close();
    console.log('Script execution completed.');
})();
