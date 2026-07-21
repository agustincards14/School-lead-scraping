import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvFilePath = path.join(__dirname, 'schools.csv');

(async () => {
  console.log('Starting Missouri high school scraper...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (let i = 1; i < 5; i++) {
    const url = `https://www.mshsaa.org/Activities/ClassAndDistrictAssignments.aspx?alg=34&class=${i}&year=2024`;
    console.log(`Fetching URL list: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.error(`Failed to load URL: ${url}`);
      continue;
    }

    // Locate all links
    const schoolLinks = await page.$$eval('.target > li > a', els => els.map(el => ({
      text: el.textContent?.trim() || '',
      href: el.getAttribute('href') || ''
    })));

    console.log(`Found ${schoolLinks.length} schools in Class ${i}`);

    for (const school of schoolLinks) {
      if (!school.href) continue;
      const schoolName = school.text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

      const schoolUrl = new URL(school.href, url).href;
      console.log(`Processing school: ${schoolName}`);

      let retries = 3;
      let success = false;
      while (retries > 0 && !success) {
        try {
          await page.goto(schoolUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // Mascot
          let mascot = '';
          try {
            const mascotText = await page.$eval('#School_Name > div > div > a.schoolname > span.tiny.bigIndent.d-none.d-md-inline > span', el => el.textContent?.trim() || '');
            if (mascotText.includes('Home of the')) {
              mascot = mascotText.split('Home of the')[1].trim();
            } else {
              mascot = mascotText.trim();
            }
            // Remove wrapping quotes if any
            mascot = mascot.replace(/^"|"$/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
          } catch (e) {
            // Mascot not found, leave as empty
            console.log(`  [Warning] Mascot not found for ${schoolName}`);
          }

          // Coaches page
          const coachesLink = await page.$('#ctl00_SchoolHeader_aCoaches');
          if (coachesLink) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { }),
              coachesLink.click()
            ]);

            // Extract coaches
            let coaches: string[] = [];
            try {
              coaches = await page.$$eval('tr > td.xl', els => {
                return els.map(el => el.textContent?.trim() || '');
              });
            } catch (e) {
              console.log(`  [Warning] Could not extract coach elements for ${schoolName}`);
            }

            // Handle potential empty strings or duplicates
            const uniqueCoaches = [...new Set(coaches)].filter(c => c && c.length > 0);

            if (uniqueCoaches.length === 0) {
              console.log(`  No coaches found for ${schoolName}`);
            }

            for (const coach of uniqueCoaches) {
              // Append to CSV
              const cleanCoach = coach.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
              const row = `"${schoolName.replace(/"/g, '""')}","${mascot.replace(/"/g, '""')}","${cleanCoach.replace(/"/g, '""')}"\n`;
              fs.appendFileSync(csvFilePath, row);
              console.log(`  -> Appended: ${schoolName} | ${mascot} | ${coach}`);
            }
          } else {
            console.log(`  [Warning] Coaches link not found for ${schoolName}`);
          }
          success = true;
        } catch (error) {
          console.log(`  [Retry] Error processing ${schoolName}, retries left: ${retries - 1}`);
          retries--;
        }
      }
    }
  }

  await browser.close();
  console.log('Scraping complete.');
})();
