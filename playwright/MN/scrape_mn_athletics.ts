import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { stringify } from 'csv/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAP_FILE = path.resolve(__dirname, 'school_url_map.json');
const OUTPUT_CSV = path.resolve(__dirname, 'mn_athletics.csv');
const ASSETS_CSV = path.resolve(process.cwd(), 'assets/high school/MN/mn_athletics.csv');

interface ContactLead {
    schoolName: string;
    mascot: string;
    role: string;
    name: string;
    email: string;
    isPersonalEmail: boolean;
    isAD: boolean;
}

interface RawGridContact {
    role: string;
    name: string;
    email: string;
}

const PERSONAL_EMAIL_DOMAINS = [
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
    'me.com',
    'live.com',
    'msn.com',
    'comcast.net',
    'charter.net',
    'mail.com',
];

/**
 * Cloudflare email XOR decoder fallback
 */
function decodeCfEmail(encodedString: string): string {
    try {
        const k = parseInt(encodedString.substring(0, 2), 16);
        let email = '';
        for (let n = 2; n < encodedString.length; n += 2) {
            const charCode = parseInt(encodedString.substring(n, n + 2), 16) ^ k;
            email += String.fromCharCode(charCode);
        }
        return email;
    } catch {
        return '';
    }
}

function isPersonalDomain(email: string): boolean {
    const lower = email.toLowerCase().trim();
    return PERSONAL_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

function isADRole(role: string): boolean {
    const lower = role.toLowerCase();
    // Matches AD, Activities Director, Athletic Director, etc.
    return (
        /\b(activities director|athletic director)\b/i.test(lower) ||
        /\b(ad\b|ad\s|ad:)/i.test(lower)
    );
}

/**
 * Parses school details and extracts contacts from page HTML
 */
function extractLeadsFromHtml(html: string, url: string): { schoolName: string; mascot: string; contacts: RawGridContact[] } {
    // 1. School Name
    let schoolName = '';
    const h1Match = html.match(/<h1[^>]*class="[^"]*heading--page-title[^"]*"[^>]*>[\s\S]*?<div>(.*?)<\/div>/i) ||
                    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
        schoolName = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }
    if (!schoolName) {
        const slug = url.split('/').filter(Boolean).pop() || '';
        schoolName = slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    }

    // Unescape common HTML entities in school name
    schoolName = schoolName
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    // 2. Mascot / Nickname
    let mascot = '';
    const mascotMatch = html.match(/Nickname:\s*([^<\n\r]+)/i) ||
                        html.match(/class="[^"]*school-teaser__subtitle[^"]*"[^>]*>([\s\S]*?)<\/strong>/i);
    if (mascotMatch) {
        mascot = mascotMatch[1]
            .replace(/Nickname:/i, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&#039;/g, "'")
            .replace(/&amp;/g, '&')
            .trim();
    }

    // 3. Administration Grid Items
    const contacts: RawGridContact[] = [];
    
    // Find the administration grid section
    let administrationHtml = '';
    if (html.includes('grid--administration')) {
        const afterGrid = html.split(/class="[^"]*grid--administration[^"]*"/i)[1] || '';
        // Slice until the end of this grid / next section
        const endOfGrid = afterGrid.search(/Conference Affiliations|<h2|id="block-|<footer/i);
        administrationHtml = endOfGrid !== -1 ? afterGrid.substring(0, endOfGrid) : afterGrid;
    } else {
        administrationHtml = html;
    }

    const itemBlocks = administrationHtml.split('class="grid__item"').slice(1);

    for (const block of itemBlocks) {
        // Role (inside <strong>)
        const roleMatch = block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
        const role = roleMatch ? roleMatch[1].replace(/<[^>]+>/g, '').replace(/:$/, '').trim() : '';

        // Email: check for Cloudflare email protection or mailto: or plaintext email
        let email = '';
        const cfHrefMatch = block.match(/href="\/cdn-cgi\/l\/email-protection#([a-f0-9]+)"/i);
        const cfDataMatch = block.match(/data-cfemail="([a-f0-9]+)"/i);
        const mailtoMatch = block.match(/href="mailto:([^"?#]+)"/i);
        const textEmailMatch = block.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

        if (cfHrefMatch) {
            email = decodeCfEmail(cfHrefMatch[1]);
        } else if (cfDataMatch) {
            email = decodeCfEmail(cfDataMatch[1]);
        } else if (mailtoMatch) {
            email = mailtoMatch[1].trim();
        } else if (textEmailMatch) {
            email = textEmailMatch[1].trim();
        }

        // Name: look for <div>Name</div> or direct text after </strong>
        let name = '';
        const divMatch = block.match(/<\/strong>\s*<div[^>]*>([^<]+)<\/div>/i);
        if (divMatch) {
            name = divMatch[1].trim();
        } else {
            const postStrong = block.split(/<\/strong>/i)[1] || '';
            const plainMatch = postStrong.match(/^\s*([^<]+)/);
            if (plainMatch && plainMatch[1].trim()) {
                name = plainMatch[1].trim();
            }
        }

        if (email && email.includes('@')) {
            contacts.push({ role, name, email });
        }
    }

    return { schoolName, mascot, contacts };
}

/**
 * Prioritizes and selects up to 2 contacts based on user criteria:
 * 1. Filter for items that have emails.
 * 2. If > 2 valid contacts, prioritize personal email domains (yahoo, gmail, outlook, icloud, etc.).
 * 3. If still > 2 valid contacts after that, prioritize ones containing "AD" or "Activities Director" / "Athletic Director".
 * 4. Return top 2 contacts per school.
 */
function selectTopLeads(schoolName: string, mascot: string, rawContacts: RawGridContact[]): ContactLead[] {
    const validContacts = rawContacts.filter((c) => c.email && c.email.includes('@'));

    if (validContacts.length === 0) {
        return [];
    }

    if (validContacts.length <= 2) {
        return validContacts.map((c) => ({
            schoolName,
            mascot,
            role: c.role,
            name: c.name,
            email: c.email,
            isPersonalEmail: isPersonalDomain(c.email),
            isAD: isADRole(c.role),
        }));
    }

    // When > 2 contacts, sort with tiered comparator:
    // Tier 1: Personal email domain (true > false)
    // Tier 2: AD / Activities Director title (true > false)
    const sorted = [...validContacts].sort((a, b) => {
        const aPersonal = isPersonalDomain(a.email) ? 1 : 0;
        const bPersonal = isPersonalDomain(b.email) ? 1 : 0;
        if (aPersonal !== bPersonal) {
            return bPersonal - aPersonal;
        }

        const aAD = isADRole(a.role) ? 1 : 0;
        const bAD = isADRole(b.role) ? 1 : 0;
        if (aAD !== bAD) {
            return bAD - aAD;
        }

        return 0;
    });

    return sorted.slice(0, 2).map((c) => ({
        schoolName,
        mascot,
        role: c.role,
        name: c.name,
        email: c.email,
        isPersonalEmail: isPersonalDomain(c.email),
        isAD: isADRole(c.role),
    }));
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

export async function scrapeMnAthletics() {
    console.log('=== Step 1: Loading school_url_map.json ===');
    if (!fs.existsSync(MAP_FILE)) {
        throw new Error(`Map file not found at ${MAP_FILE}`);
    }

    const urlMap: Record<string, string> = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
    const urlEntries = Object.entries(urlMap);
    console.log(`Found ${urlEntries.length} school URLs to scrape.`);

    console.log('\n=== Step 2: Fetching school administration pages ===');
    const HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    let processedCount = 0;
    const allLeadsNested = await mapConcurrent(urlEntries, 10, async ([slug, url]) => {
        try {
            const resp = await fetch(url, { headers: HEADERS });
            if (!resp.ok) {
                console.warn(`[WARN] HTTP ${resp.status} for ${url}`);
                return [];
            }
            const html = await resp.text();
            const { schoolName, mascot, contacts } = extractLeadsFromHtml(html, url);
            const topLeads = selectTopLeads(schoolName, mascot, contacts);

            processedCount++;
            if (processedCount % 25 === 0 || processedCount === urlEntries.length) {
                console.log(`Progress: ${processedCount}/${urlEntries.length} schools processed...`);
            }

            return topLeads;
        } catch (err: any) {
            console.error(`[ERROR] Failed for ${url}:`, err.message);
            return [];
        }
    });

    const allLeads = allLeadsNested.flat();
    console.log(`\n=== Total Leads Extracted: ${allLeads.length} ===`);

    // Format for CSV
    const csvRecords = allLeads.map((lead) => ({
        'School Name': lead.schoolName,
        'Mascot': lead.mascot,
        'Name': lead.name,
        'Email': lead.email,
    }));

    const csvContent = stringify(csvRecords, {
        header: true,
        columns: ['School Name', 'Mascot', 'Name', 'Email'],
    });

    // Write to both playwright/MN/mn_athletics.csv and assets/high school/MN/mn_athletics.csv
    fs.writeFileSync(OUTPUT_CSV, csvContent, 'utf-8');
    const assetsDir = path.dirname(ASSETS_CSV);
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(ASSETS_CSV, csvContent, 'utf-8');

    console.log(`\nFiles successfully written:`);
    console.log(`1) ${OUTPUT_CSV}`);
    console.log(`2) ${ASSETS_CSV}`);

    // Summary statistics
    const personalCount = allLeads.filter((l) => l.isPersonalEmail).length;
    const adCount = allLeads.filter((l) => l.isAD).length;
    const distinctSchools = new Set(allLeads.map((l) => l.schoolName)).size;

    console.log('\n=== Summary Statistics ===');
    console.log(`- Total Schools in Map: ${urlEntries.length}`);
    console.log(`- Schools with Extracted Leads: ${distinctSchools}`);
    console.log(`- Total Leads (max 2/school): ${allLeads.length}`);
    console.log(`- Leads with Personal Email Domains: ${personalCount}`);
    console.log(`- Leads with AD/Activities Director Role: ${adCount}`);

    return allLeads;
}

if (process.argv[1] === __filename) {
    scrapeMnAthletics().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
