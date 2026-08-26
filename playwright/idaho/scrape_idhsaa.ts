import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { stringify } from 'csv/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://idhsaa.org';
const DIRECTORY_URL = `${BASE_URL}/directory`;

const ID_ASSETS_DIR = path.resolve(process.cwd(), 'assets/high school/ID');
const ID_PLAYWRIGHT_DIR = __dirname;

interface SchoolLink {
    name: string;
    url: string;
}

interface LeadContact {
    schoolName: string;
    mascot: string;
    name: string;
    email: string;
    role?: string;
}

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Decodes base64 string from window.atob('...')
 */
function decodeBase64(b64: string): string {
    try {
        return Buffer.from(b64, 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

/**
 * Extracts emails from HTML containing window.atob('...') scripts or mailto links
 */
function extractDecodedEmails(htmlSegment: string): string[] {
    const emails: string[] = [];

    // Find window.atob('...') patterns
    const atobMatches = htmlSegment.matchAll(/window\.atob\(['"]([A-Za-z0-9+/=]+)['"]\)/g);
    for (const m of atobMatches) {
        const decodedHtml = decodeBase64(m[1]);
        const mailtoMatch = decodedHtml.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (mailtoMatch) {
            emails.push(mailtoMatch[1].trim());
        } else {
            const rawEmail = decodedHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (rawEmail) {
                emails.push(rawEmail[0].trim());
            }
        }
    }

    // Direct mailto: links fallback
    const directMailtos = htmlSegment.matchAll(/href=['"]mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
    for (const m of directMailtos) {
        const email = m[1].trim();
        if (!emails.includes(email)) {
            emails.push(email);
        }
    }

    return emails;
}

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

/**
 * Parses all school links from https://idhsaa.org/directory
 */
async function getDirectorySchools(): Promise<SchoolLink[]> {
    console.log(`Fetching directory: ${DIRECTORY_URL}`);
    const html = await fetchWithRetry(DIRECTORY_URL);

    const schools: SchoolLink[] = [];
    const rowMatches = html.matchAll(/<tr class=['"]table_row_link['"][^>]*data-href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/tr>/gi);

    for (const m of rowMatches) {
        const relativeHref = m[1].trim();
        const rowContent = m[2];

        // Ensure this is an actual school link, not a script example
        if (!relativeHref.includes('school?id=')) {
            continue;
        }

        // School Name from first <td>
        const nameMatch = rowContent.match(/<a class=['"]default_link['"][^>]*>([^<]+)<\/a>/i) ||
                          rowContent.match(/<td>\s*([^<]+)\s*<\/td>/i);
        const name = nameMatch ? nameMatch[1].trim() : '';

        if (relativeHref && name) {
            const fullUrl = relativeHref.startsWith('http') ? relativeHref : `${BASE_URL}/${relativeHref.replace(/^\//, '')}`;
            schools.push({ name, url: fullUrl });
        }
    }

    console.log(`Found ${schools.length} high schools in the IDHSAA directory.`);
    return schools;
}

/**
 * Scrapes a single school page for Mascot, Athletic Directors, and Soccer Coaches
 */
async function scrapeSchoolDetail(school: SchoolLink): Promise<{ athletics: LeadContact[]; soccer: LeadContact[] }> {
    const athletics: LeadContact[] = [];
    const soccer: LeadContact[] = [];

    try {
        const html = await fetchWithRetry(school.url);

        // 1. School Name
        let schoolName = school.name;
        const h1Match = html.match(/<h1>([^<]+)<\/h1>/i);
        if (h1Match) {
            schoolName = h1Match[1].trim();
        }

        // 2. Mascot
        let mascot = '';
        const mascotMatch = html.match(/Mascot:\s*([^<\r\n]+)/i);
        if (mascotMatch) {
            mascot = mascotMatch[1].trim();
        }

        // 1. First check if Soccer Coaches exist at this school
        const coachBlocks = html.split(/class=['"]school_coach/i).slice(1);
        for (const blockContent of coachBlocks) {
            const sportMatch = blockContent.match(/<b>\s*(Soccer[^<]*)<\/b>/i);
            if (sportMatch) {
                const sport = sportMatch[1].trim(); // e.g. "Soccer (Boys)", "Soccer (Girls)"
                const nameMatch = blockContent.match(/<div class=['"]col-sm-8['"][^>]*>\s*<p>([^<]+)<\/p>/i);
                let coachName = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                if (coachName.toLowerCase().includes('soccer') || coachName.includes('Email') || coachName.includes('@')) {
                    coachName = '';
                }

                const emails = extractDecodedEmails(blockContent);
                for (const email of emails) {
                    soccer.push({
                        schoolName,
                        mascot,
                        name: coachName || 'Soccer Coach',
                        email,
                        role: sport,
                    });
                }
            }
        }

        // If no soccer coaches exist, assume the school has no soccer program and skip it
        if (soccer.length === 0) {
            return { athletics: [], soccer: [] };
        }

        // 2. If soccer coaches exist, extract Athletic / Activities Directors for this school
        const colBlocks = html.split(/class=['"]column/i).slice(1);
        for (const colText of colBlocks) {
            const titleMatch = colText.match(/<b>\s*(Activities Director|Alternate AD|Athletic Director)\s*<br\s*\/?>\s*<\/b>/i);
            if (titleMatch) {
                const role = titleMatch[1].trim();
                const nameMatch = colText.match(/<\/b>\s*(?:<hr[^>]*>)?\s*<p>([^<]+)<\/p>/i);
                let name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                if (name.includes('Click-to-Call') || name.includes('(Fax)') || name.includes('@') || name.includes('Email') || name.startsWith('208-') || name.startsWith('1-')) {
                    name = '';
                }

                const emails = extractDecodedEmails(colText);
                for (const email of emails) {
                    athletics.push({
                        schoolName,
                        mascot,
                        name: name || 'Athletic Director',
                        email,
                        role,
                    });
                }
            }
        }
    } catch (err: any) {
        console.error(`[ERROR] Failed to scrape ${school.name} (${school.url}):`, err.message);
    }

    return { athletics, soccer };
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

export async function scrapeIdhsaa() {
    console.log('=== Step 1: Discovering all schools from IDHSAA directory ===');
    const schools = await getDirectorySchools();

    console.log(`\n=== Step 2: Scraping details for ${schools.length} schools ===`);
    let completedCount = 0;
    const concurrency = 10;

    const schoolResults = await mapConcurrent(schools, concurrency, async (school) => {
        const res = await scrapeSchoolDetail(school);
        completedCount++;
        if (completedCount % 25 === 0 || completedCount === schools.length) {
            console.log(`Progress: ${completedCount}/${schools.length} schools processed...`);
        }
        return res;
    });

    // Flatten lists
    const allAthleticsRaw = schoolResults.flatMap((r) => r.athletics);
    const allSoccerRaw = schoolResults.flatMap((r) => r.soccer);

    // Deduplicate within athletics: (School Name, Email)
    const athleticsSeen = new Set<string>();
    const athleticsLeads: LeadContact[] = [];
    for (const item of allAthleticsRaw) {
        const key = `${item.schoolName.toLowerCase()}||${item.email.toLowerCase()}`;
        if (!athleticsSeen.has(key)) {
            athleticsSeen.add(key);
            athleticsLeads.push(item);
        }
    }

    // Deduplicate within soccer: (School Name, Email)
    const soccerSeen = new Set<string>();
    const soccerLeads: LeadContact[] = [];
    for (const item of allSoccerRaw) {
        const key = `${item.schoolName.toLowerCase()}||${item.email.toLowerCase()}`;
        if (!soccerSeen.has(key)) {
            soccerSeen.add(key);
            soccerLeads.push(item);
        }
    }

    // Combined master list: deduplicate by (School Name, Email)
    const combinedSeen = new Set<string>();
    const masterLeads: LeadContact[] = [];
    for (const item of [...athleticsLeads, ...soccerLeads]) {
        const key = `${item.schoolName.toLowerCase()}||${item.email.toLowerCase()}`;
        if (!combinedSeen.has(key)) {
            combinedSeen.add(key);
            masterLeads.push(item);
        }
    }

    // Sort all datasets alphabetically by School Name, then Name
    const leadSort = (a: LeadContact, b: LeadContact) => {
        const s = a.schoolName.localeCompare(b.schoolName);
        if (s !== 0) return s;
        return a.name.localeCompare(b.name);
    };
    athleticsLeads.sort(leadSort);
    soccerLeads.sort(leadSort);
    masterLeads.sort(leadSort);

    // Helper to format as CSV
    const toCsv = (leads: LeadContact[]) =>
        stringify(
            leads.map((l) => ({
                'School Name': l.schoolName,
                'Mascot': l.mascot,
                'Name': l.name,
                'Email': l.email,
            })),
            {
                header: true,
                columns: ['School Name', 'Mascot', 'Name', 'Email'],
            }
        );

    const athleticsCsv = toCsv(athleticsLeads);
    const soccerCsv = toCsv(soccerLeads);
    const masterCsv = toCsv(masterLeads);

    // Ensure output directories exist
    fs.mkdirSync(ID_ASSETS_DIR, { recursive: true });
    fs.mkdirSync(ID_PLAYWRIGHT_DIR, { recursive: true });

    // Write Assets files
    fs.writeFileSync(path.resolve(ID_ASSETS_DIR, 'id_athletics.csv'), athleticsCsv, 'utf-8');
    fs.writeFileSync(path.resolve(ID_ASSETS_DIR, 'soccer_coaches.csv'), soccerCsv, 'utf-8');
    fs.writeFileSync(path.resolve(ID_ASSETS_DIR, 'id.csv'), masterCsv, 'utf-8');

    // Write Playwright files
    fs.writeFileSync(path.resolve(ID_PLAYWRIGHT_DIR, 'id_athletics.csv'), athleticsCsv, 'utf-8');
    fs.writeFileSync(path.resolve(ID_PLAYWRIGHT_DIR, 'soccer_coaches.csv'), soccerCsv, 'utf-8');
    fs.writeFileSync(path.resolve(ID_PLAYWRIGHT_DIR, 'id.csv'), masterCsv, 'utf-8');

    console.log('\n=== Export Complete! ===');
    console.log(`Saved files to:`);
    console.log(`- ${path.resolve(ID_ASSETS_DIR, 'id_athletics.csv')} (${athleticsLeads.length} leads)`);
    console.log(`- ${path.resolve(ID_ASSETS_DIR, 'soccer_coaches.csv')} (${soccerLeads.length} leads)`);
    console.log(`- ${path.resolve(ID_ASSETS_DIR, 'id.csv')} (${masterLeads.length} leads)`);

    const distinctSoccerSchools = new Set(soccerLeads.map((s) => s.schoolName)).size;

    console.log('\n=== Summary Statistics ===');
    console.log(`- Total Directory Schools Scanned: ${schools.length}`);
    console.log(`- Schools with Soccer Programs Found: ${distinctSoccerSchools}`);
    console.log(`- Schools Skipped (No Soccer Program): ${schools.length - distinctSoccerSchools}`);
    console.log(`- Total Athletic Directors with Email (from Soccer Schools): ${athleticsLeads.length}`);
    console.log(`- Total Soccer Coaches with Email: ${soccerLeads.length}`);
    console.log(`- Total Combined Leads in id.csv (Unique School+Email): ${masterLeads.length}`);

    return { athleticsLeads, soccerLeads, masterLeads };
}

if (process.argv[1] === __filename) {
    scrapeIdhsaa().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
