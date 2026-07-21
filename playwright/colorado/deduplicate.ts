import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function deduplicate() {
    const csvPath = path.join(__dirname, 'school_leads.csv');
    const jsonPath = path.join(__dirname, 'school_leads.json');

    const seenEmails = new Set<string>();

    if (fs.existsSync(csvPath)) {
        console.log(`Deduplicating ${csvPath}...`);
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() !== '');

        if (lines.length === 0) return;

        const header = lines[0];
        const dataLines = lines.slice(1);
        const uniqueLines: string[] = [];

        seenEmails.clear();

        for (const line of dataLines) {
            // Simple CSV split (handling quotes)
            const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (parts.length < 4) continue;

            const email = parts[3].replace(/"/g, '').trim().toLowerCase();

            if (email && !seenEmails.has(email)) {
                seenEmails.add(email);
                uniqueLines.push(line);
            }
        }

        fs.writeFileSync(csvPath, [header, ...uniqueLines].join('\n'));
        console.log(`CSV Deduplicated: ${dataLines.length} -> ${uniqueLines.length} rows.`);
    }

    if (fs.existsSync(jsonPath)) {
        console.log(`Deduplicating ${jsonPath}...`);
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        seenEmails.clear();

        const uniqueData = data.filter((item: any) => {
            const email = item.Email?.trim().toLowerCase();
            if (email && !seenEmails.has(email)) {
                seenEmails.add(email);
                return true;
            }
            return false;
        });

        fs.writeFileSync(jsonPath, JSON.stringify(uniqueData, null, 2));
        console.log(`JSON Deduplicated: ${data.length} -> ${uniqueData.length} entries.`);
    }
}

deduplicate();
