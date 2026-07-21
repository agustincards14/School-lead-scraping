import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CoachData {
    schoolName: string;
    mascot: string;
    name: string;
    email: string;
    sourceUrl: string;
}

// We'll define the workflows here
async function workflowOne(page: Page, searchString: string): Promise<CoachData[] | null> {
    console.log(`  -> Running Workflow 1: Direct Directory for '${searchString}'`);
    try {
        const googleSearch = `https://www.google.com/search?q=${encodeURIComponent(searchString + ' athletics')}`;
        await page.goto(googleSearch, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for standard search results
        await page.waitForSelector('a h3', { timeout: 10000 }).catch(() => null);

        const targetUrl = await page.evaluate(() => {
            const links = document.querySelectorAll('a h3');
            for (const h3 of Array.from(links)) {
                const aTag = h3.closest('a');
                const href = aTag?.getAttribute('href') || '';
                if (href && href.toLowerCase().includes('athletic')) {
                    return href;
                }
            }
            if (links.length > 0) return links[0].closest('a')?.getAttribute('href');
            return null;
        });

        if (!targetUrl) {
            console.log(`    [W1] No 'athletic' URL found in search results.`);
            return null;
        }

        console.log(`    [W1] Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait a bit for potential JS redirects or lazy loading
        await page.waitForTimeout(2000);

        const coaches = await page.evaluate(() => {
            const extracted: { name: string, email: string }[] = [];
            const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));

            for (const a of mailtoLinks) {
                const href = a.getAttribute('href') || '';
                const email = href.replace('mailto:', '').split('?')[0].trim();
                if (!email) continue;

                // Only consider if "soccer" or "coach" is nearby (up to 3 levels up)
                let contextText = '';
                let current: HTMLElement | null = a as HTMLElement;
                for (let depth = 0; depth < 3 && current; depth++) {
                    contextText += ' ' + current.textContent;
                    current = current.parentElement as HTMLElement | null;
                }

                contextText = contextText.toLowerCase();
                const pageText = document.body.textContent?.toLowerCase() || '';

                if (contextText.includes('soccer') || contextText.includes('coach') || pageText.includes('soccer')) {
                    let name = a.textContent?.trim() || '';
                    if (name.includes('@')) {
                        name = a.parentElement?.textContent?.replace(email, '')
                            .replace(/email/i, '').trim().split('\n')[0].trim() || 'Coach';
                    }
                    if (name.length > 2 && !name.toLowerCase().includes('click')) {
                        extracted.push({ name, email });
                    }
                }
            }
            return extracted;
        });

        if (coaches.length > 0) {
            const unique: CoachData[] = [];
            const seenEmails = new Set<string>();
            for (const c of coaches) {
                if (!seenEmails.has(c.email.toLowerCase())) {
                    seenEmails.add(c.email.toLowerCase());
                    unique.push({
                        schoolName: searchString.split(' highschool')[0] || searchString, // Quick heuristic
                        mascot: 'Unknown',
                        name: c.name,
                        email: c.email,
                        sourceUrl: targetUrl
                    });
                }
            }
            return unique;
        }
    } catch (e: any) {
        console.log(`    [W1] Error: ${e.message}`);
    }
    return null;
}

async function workflowTwo(page: Page, searchString: string): Promise<CoachData[] | null> {
    console.log(`  -> Running Workflow 2: MaxPreps Fallback for '${searchString}'`);
    try {
        const mpSearch = `https://www.google.com/search?q=${encodeURIComponent(searchString + ' MaxPreps soccer staff')}`;
        await page.goto(mpSearch, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('a h3', { timeout: 10000 }).catch(() => null);

        const targetUrl = await page.evaluate(() => {
            const links = document.querySelectorAll('a h3');
            for (const h3 of Array.from(links)) {
                const aTag = h3.closest('a');
                const href = aTag?.getAttribute('href') || '';
                if (href.toLowerCase().includes('maxpreps.com') && href.toLowerCase().includes('soccer')) {
                    return href;
                }
            }
            return null;
        });

        if (!targetUrl) {
            console.log(`    [W2] No MaxPreps URL found.`);
            return null;
        }

        let staffUrl = targetUrl;
        if (!staffUrl.includes('/staff')) {
            staffUrl = staffUrl.replace(/\/roster.*/, '/staff/').replace(/\/schedule.*/, '/staff/').replace(/\/home.*/, '/staff/');
            if (!staffUrl.includes('/staff')) staffUrl = staffUrl.replace(/\/$/, '') + '/staff/';
        }

        console.log(`    [W2] Navigating to MaxPreps Staff: ${staffUrl}`);
        await page.goto(staffUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Extract coach names logically
        const coachNames = await page.evaluate(() => {
            const names = new Set<string>();
            const dts = Array.from(document.querySelectorAll('dt')); // Maxpreps often uses dl/dt/dd
            for (const dt of dts) {
                const name = dt.textContent?.trim();
                const role = dt.nextElementSibling?.textContent?.trim().toLowerCase() || '';
                if (name && role.includes('coach')) {
                    names.add(name);
                }
            }
            // fallback: look for elements containing 'coach'
            if (names.size === 0) {
                const elements = Array.from(document.querySelectorAll('*'));
                for (const el of elements) {
                    const text = el.textContent?.trim().toLowerCase() || '';
                    if (text === 'head coach' || text === 'coach') {
                        const parentText = el.parentElement?.textContent || '';
                        const potentialName = parentText.replace(/head coach/i, '').replace(/coach/i, '').trim().split('\n')[0].trim();
                        if (potentialName.length > 2 && potentialName.includes(' ')) names.add(potentialName);
                    }
                }
            }
            return Array.from(names);
        });

        if (coachNames.length === 0) {
            console.log(`    [W2] No coach names found on MaxPreps.`);
            return null;
        }

        console.log(`    [W2] Found Coach Names: ${coachNames.join(', ')}`);

        // Follow-up Email Search for each coach in Staff Directories
        const foundCoaches: CoachData[] = [];
        for (const coachName of coachNames) {
            const directorySearch = `https://www.google.com/search?q=${encodeURIComponent(searchString + ' staff directory ' + coachName + ' email')}`;
            await page.goto(directorySearch, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('.g', { timeout: 10000 }).catch(() => null); // Wait for google results blocks

            // Extract emails from snippets or obvious links
            const emailInSnippet = await page.evaluate(() => {
                const text = document.body.textContent || '';
                const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
                if (match && match[1] && !match[1].includes('example.com')) {
                    return match[1];
                }
                return null;
            });

            if (emailInSnippet) {
                console.log(`    [W2] Found email in directory search snippet for ${coachName}: ${emailInSnippet}`);
                foundCoaches.push({
                    schoolName: searchString.split(' highschool')[0] || searchString,
                    mascot: 'Unknown',
                    name: coachName,
                    email: emailInSnippet,
                    sourceUrl: directorySearch
                });
                continue; // Move to next coach
            }

            // Try to visit the top directory link to scrape for email
            const firstLinkUrl = await page.evaluate(() => {
                const links = document.querySelectorAll('a h3');
                if (links.length > 0) {
                    const aTag = links[0].closest('a');
                    const href = aTag?.getAttribute('href') || '';
                    if (href && !href.includes('maxpreps')) return href;
                }
                return null;
            });

            if (firstLinkUrl) {
                console.log(`    [W2] Navigating to directory page: ${firstLinkUrl}`);
                try {
                    await page.goto(firstLinkUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    await page.waitForTimeout(2000); // Allow lazy loads

                    const extractedEmail = await page.evaluate((name) => {
                        const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
                        for (const a of mailtoLinks) {
                            const href = a.getAttribute('href') || '';
                            const email = href.replace('mailto:', '').split('?')[0].trim();

                            // If the parent element contains their name, or if we just grab a generic one
                            const text = document.body.textContent?.toLowerCase() || '';
                            const nameParts = name.toLowerCase().split(' ');

                            if (nameParts.some((part: string) => text.includes(part))) {
                                return email; // High probability it's their email
                            }
                        }
                        return null;
                    }, coachName);

                    if (extractedEmail && !extractedEmail.includes('example.com')) {
                        console.log(`    [W2] Found email on directory page for ${coachName}: ${extractedEmail}`);
                        foundCoaches.push({
                            schoolName: searchString.split(' highschool')[0] || searchString,
                            mascot: 'Unknown',
                            name: coachName,
                            email: extractedEmail,
                            sourceUrl: firstLinkUrl
                        });
                    }
                } catch (e) {
                    console.log(`    [W2] Failed to scrape directory page: ${e}`);
                }
            }
        }

        if (foundCoaches.length > 0) return foundCoaches;

    } catch (e: any) {
        console.log(`    [W2] Error: ${e.message}`);
    }
    return null;
}

async function workflowThree(page: Page, searchString: string): Promise<CoachData[] | null> {
    console.log(`  -> Running Workflow 3: General Search for '${searchString}'`);
    try {
        const generalSearch = `https://www.google.com/search?q=${encodeURIComponent(searchString + ' boys girls soccer coach email')}`;
        await page.goto(generalSearch, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('.g', { timeout: 10000 }).catch(() => null);

        const foundCoaches: CoachData[] = [];

        // Extract emails from snippets directly
        const emails = await page.evaluate(() => {
            const extracted = new Set<string>();
            const text = document.body.textContent || '';
            const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g);
            if (match) {
                match.forEach(e => extracted.add(e.toLowerCase()));
            }
            return Array.from(extracted);
        });

        for (const email of emails) {
            // Filter out obviously bad emails
            if (email.includes('example.com') || email.includes('maxpreps.com')) continue;

            console.log(`    [W3] Found general email in snippet: ${email}`);
            foundCoaches.push({
                schoolName: searchString.split(' highschool')[0] || searchString,
                mascot: 'Unknown',
                name: 'Unknown',
                email: email,
                sourceUrl: generalSearch
            });
        }

        if (foundCoaches.length > 0) return foundCoaches;

    } catch (e: any) {
        console.log(`    [W3] Error: ${e.message}`);
    }
    return null;
}

async function processSchool(browser: Browser, searchString: string): Promise<CoachData[]> {
    const context = await browser.newContext();
    const page = await context.newPage();
    let coaches: CoachData[] | null = null;

    try {
        // Attempt Workflow 1
        coaches = await workflowOne(page, searchString);
        if (coaches && coaches.length > 0) return coaches;

        // Attempt Workflow 2
        coaches = await workflowTwo(page, searchString);
        if (coaches && coaches.length > 0) return coaches;

        // Attempt Workflow 3
        coaches = await workflowThree(page, searchString);
        if (coaches && coaches.length > 0) return coaches;

    } catch (e) {
        console.error(`Error processing '${searchString}':`, e);
    } finally {
        await context.close();
    }

    return []; // Return empty if all workflows fail
}

async function main() {
    const inputCsvPath = path.join(__dirname, 'school_names.csv');
    const outputCsvPath = path.join(__dirname, 'virginia_soccer_coaches.csv');
    const failedCsvPath = path.join(__dirname, 'failed_schools.csv');

    // Create tracking files if they don't exist
    if (!fs.existsSync(outputCsvPath)) {
        fs.writeFileSync(outputCsvPath, 'School Name,Mascot,Name,Email,Source URL\n');
    }
    if (!fs.existsSync(failedCsvPath)) {
        fs.writeFileSync(failedCsvPath, 'Search String\n');
    }

    // Read queries
    const lines = fs.readFileSync(inputCsvPath, 'utf-8').split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Test variables
    const testLimit = lines.length; // RUN ON ALL 200
    const testLines = lines.slice(0, testLimit);

    console.log(`Loaded ${lines.length} schools. Testing on ${testLimit} schools...`);

    const browser = await chromium.launch({ headless: true }); // headless: false for debugging

    for (const searchString of testLines) {
        console.log(`\nProcessing: ${searchString}`);
        const coaches = await processSchool(browser, searchString);

        if (coaches.length > 0) {
            console.log(`  [SUCCESS] Found ${coaches.length} coaches!`);
            const rows = coaches.map(c => `"${c.schoolName}","${c.mascot}","${c.name}","${c.email}","${c.sourceUrl}"`);
            fs.appendFileSync(outputCsvPath, rows.join('\n') + '\n');
        } else {
            console.log(`  [FAILED] Could not find coaches for ${searchString}`);
            fs.appendFileSync(failedCsvPath, `"${searchString}"\n`);
        }
    }

    console.log('\nFinished testing orchestrator.');
    await browser.close();
}

if (process.argv[1].endsWith('scraper.ts')) {
    main().catch(console.error);
}
export { main, workflowOne, workflowTwo, workflowThree };
