import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

(async () => {
    const urlsPath = './urls.json';
    const csvPath = './schools.csv';

    // Read and parse urls.json
    const urlsData = await fs.readFile(urlsPath, 'utf-8');
    const urls: Record<string, string> = JSON.parse(urlsData);

    // Create CSV header if file doesn't exist
    if (!existsSync(csvPath)) {
        await fs.writeFile(csvPath, 'School Name,Mascot,Name\n', 'utf-8');
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const [schoolName, url] of Object.entries(urls)) {
        try {
            console.log(`Visiting: ${schoolName} - ${url}`);
            
            // Navigate to URL and wait for page to load
            await page.goto(url, { waitUntil: 'load' });
            
            // Small wait to ensure dynamic data is loaded
            await page.waitForTimeout(1000);

            // Extract Mascot using the XPath the user provided
            // Because /text()[2] targets a text node rather than an element,
            // we evaluate the xpath directly in the browser context.
            let mascot = await page.evaluate((xpath) => {
                try {
                    const result = document.evaluate(xpath, document, null, XPathResult.STRING_TYPE, null);
                    return result.stringValue.trim();
                } catch (e) {
                    return '';
                }
            }, '//*[@id="react-team"]/div[6]/div[2]/div/span[2]/text()[2]');
            
            // Fallback just in case the structure is slightly different 
            // and text()[2] is empty. We can grab the whole text and remove "Nickname:" or similar.
            if (!mascot) {
                 mascot = await page.evaluate(() => {
                    const el = document.evaluate('//*[@id="react-team"]/div[6]/div[2]/div/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
                    if (el) {
                        return el.textContent?.replace(/Nickname:?/i, '').trim() || '';
                    }
                    return '';
                 });
            }

            // Extract Name using the XPath provided
            const coachName = await page.evaluate((xpath) => {
                try {
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const node = result.singleNodeValue as HTMLElement;
                    return node ? node.textContent?.trim() : '';
                } catch (e) {
                    return '';
                }
            }, '//*[@id="react-team"]/div[3]/div[2]/table/tbody/tr/td[1]');

            console.log(`  -> Mascot: ${mascot}, Coach: ${coachName}`);

            // Append to CSV asynchronously (no double quotes)
            const csvRow = `${schoolName},${mascot},${coachName || ''}\n`;
            await fs.appendFile(csvPath, csvRow, 'utf-8');

        } catch (error) {
            console.error(`  -> Error processing ${schoolName}:`, (error as Error).message);
        }
    }

    await browser.close();
    console.log('Script execution completed.');
})();
