import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'csv/sync';

interface SchoolItem {
    name: string;
    mascot: string;
    href: string;
}

interface CoachContact {
    schoolName: string;
    mascot: string;
    coachName: string;
    coachEmail: string;
}

interface CoachApiItem {
    name?: string;
    title?: string;
    coach_level?: string;
    coach_level_weight?: number;
    field_email?: string | null;
    email?: string | null;
    field_work_phone?: string | null;
}

const BASE_URL = 'https://www.mshsl.org';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            const resp = await fetch(url, { headers: HEADERS });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status} for ${url}`);
            }
            return await resp.text();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise((r) => setTimeout(r, delay * (i + 1)));
        }
    }
    throw new Error(`Failed to fetch ${url}`);
}

function parseSchoolsFromPageHtml(html: string): SchoolItem[] {
    const schools: SchoolItem[] = [];
    const teaserBlocks = html.split('class="school-teaser"').slice(1);

    for (const block of teaserBlocks) {
        // Extract title & href
        const titleMatch =
            block.match(/class="school-teaser__title"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/i) ||
            block.match(/href="([^"]*)"[^>]*class="school-teaser__title"[^>]*>([^<]+)<\/a>/i);

        if (!titleMatch) continue;

        const href = titleMatch[1].trim();
        const name = titleMatch[2].trim();

        // Extract subtitle / nickname
        const subMatch = block.match(/class="school-teaser__subtitle"[^>]*>([\s\S]*?)<\/strong>/i);
        let mascot = '';
        if (subMatch) {
            mascot = subMatch[1].replace(/Nickname:/i, '').trim();
        }

        schools.push({ name, mascot, href });
    }

    return schools;
}

async function getCoachesForSchool(school: SchoolItem): Promise<CoachContact[]> {
    const contacts: CoachContact[] = [];

    let targetUrl = school.href.startsWith('http') ? school.href : `${BASE_URL}${school.href}`;

    try {
        const teamHtml = await fetchWithRetry(targetUrl);

        // Find drupalSettings
        const settingsMatch = teamHtml.match(
            /<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/
        );

        if (!settingsMatch) {
            console.warn(`[WARN] No drupalSettings found for ${school.name} (${targetUrl})`);
            return [{
                schoolName: school.name,
                mascot: school.mascot,
                coachName: '',
                coachEmail: '',
            }];
        }

        const settings = JSON.parse(settingsMatch[1]);
        const currentPath: string = settings.path?.currentPath || '';

        if (!currentPath.startsWith('node/')) {
            // Not a team node page (e.g. school landing page)
            return [{
                schoolName: school.name,
                mascot: school.mascot,
                coachName: '',
                coachEmail: '',
            }];
        }

        const nid = currentPath.replace('node/', '');
        const coachesApiUrl = `${BASE_URL}/api/coaches/${nid}`;

        const apiJsonStr = await fetchWithRetry(coachesApiUrl);
        const coaches: CoachApiItem[] = JSON.parse(apiJsonStr);

        if (!Array.isArray(coaches) || coaches.length === 0) {
            return [{
                schoolName: school.name,
                mascot: school.mascot,
                coachName: '',
                coachEmail: '',
            }];
        }

        for (const coach of coaches) {
            const name = coach.name ? coach.name.trim() : '';
            const email = (coach.field_email || coach.email || '').trim();

            if (name || email) {
                contacts.push({
                    schoolName: school.name,
                    mascot: school.mascot,
                    coachName: name,
                    coachEmail: email,
                });
            }
        }

        // If all coaches had empty names and emails
        if (contacts.length === 0) {
            contacts.push({
                schoolName: school.name,
                mascot: school.mascot,
                coachName: '',
                coachEmail: '',
            });
        }
    } catch (err: any) {
        console.error(`[ERROR] Failed processing ${school.name} (${targetUrl}):`, err.message);
        contacts.push({
            schoolName: school.name,
            mascot: school.mascot,
            coachName: '',
            coachEmail: '',
        });
    }

    return contacts;
}

// Concurrency helper
async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    async function worker() {
        while (currentIndex < items.length) {
            const index = currentIndex++;
            results[index] = await fn(items[index], index);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

async function main() {
    console.log('=== Step 1: Scraping 5 activity pages (activity=141) ===');
    const allSchools: SchoolItem[] = [];

    for (let page = 0; page <= 4; page++) {
        const pageUrl = `${BASE_URL}/schools/activities?activity=141&page=${page}`;
        console.log(`Fetching page ${page}: ${pageUrl}`);
        const html = await fetchWithRetry(pageUrl);
        const schools = parseSchoolsFromPageHtml(html);
        console.log(`-> Page ${page}: extracted ${schools.length} schools`);
        allSchools.push(...schools);
    }

    console.log(`\nTotal schools collected: ${allSchools.length}`);

    console.log('\n=== Step 2: Fetching coach contacts for all schools ===');
    const concurrency = 10;
    let completedCount = 0;

    const allContactsNested = await mapConcurrent(allSchools, concurrency, async (school, index) => {
        const contacts = await getCoachesForSchool(school);
        completedCount++;
        if (completedCount % 20 === 0 || completedCount === allSchools.length) {
            console.log(`Progress: ${completedCount}/${allSchools.length} schools processed...`);
        }
        return contacts;
    });

    const allContacts = allContactsNested.flat();
    console.log(`\nTotal coach records generated: ${allContacts.length}`);

    // Format for CSV
    const csvRecords = allContacts.map((c) => ({
        'School Name': c.schoolName,
        'Mascot': c.mascot,
        'Name': c.coachName,
        'Email': c.coachEmail,
    }));

    const csvOutput = stringify(csvRecords, {
        header: true,
        columns: ['School Name', 'Mascot', 'Name', 'Email'],
    });

    // Write to root and assets directory
    const rootOutputFile = path.resolve(process.cwd(), 'mshsl_soccer_coaches.csv');
    const mnAssetsDir = path.resolve(process.cwd(), 'assets/high school/MN');
    fs.mkdirSync(mnAssetsDir, { recursive: true });
    const mnOutputFile = path.resolve(mnAssetsDir, 'soccer_coaches.csv');

    fs.writeFileSync(rootOutputFile, csvOutput, 'utf-8');
    fs.writeFileSync(mnOutputFile, csvOutput, 'utf-8');

    console.log(`\n=== Done! ===`);
    console.log(`CSV saved to:`);
    console.log(`1) ${rootOutputFile}`);
    console.log(`2) ${mnOutputFile}`);

    // Stats summary
    const schoolsWithCoaches = new Set(allContacts.filter((c) => c.coachName || c.coachEmail).map((c) => c.schoolName));
    const coachesWithEmails = allContacts.filter((c) => c.coachEmail).length;
    console.log(`\nSummary Statistics:`);
    console.log(`- Total Schools: ${allSchools.length}`);
    console.log(`- Schools with Coaches: ${schoolsWithCoaches.size}`);
    console.log(`- Total Coach Records: ${allContacts.length}`);
    console.log(`- Total Coaches with Email: ${coachesWithEmails}`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
