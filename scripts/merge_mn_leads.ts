import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv/sync';

const MN_DIR = path.resolve(process.cwd(), 'assets/high school/MN');
const ATHLETICS_CSV = path.resolve(MN_DIR, 'mn_athletics.csv');
const SOCCER_CSV = path.resolve(MN_DIR, 'soccer_coaches.csv');
const OUTPUT_CSV = path.resolve(MN_DIR, 'mn.csv');

interface LeadRow {
    'School Name': string;
    Mascot: string;
    Name: string;
    Email: string;
}

function readCsv(filePath: string): LeadRow[] {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as LeadRow[];
}

function main() {
    console.log('Loading CSV files...');
    const athleticsLeads = readCsv(ATHLETICS_CSV);
    const soccerLeads = readCsv(SOCCER_CSV);

    console.log(`- Loaded ${athleticsLeads.length} leads from mn_athletics.csv`);
    console.log(`- Loaded ${soccerLeads.length} leads from soccer_coaches.csv`);

    // Combine all leads
    const rawCombined = [...athleticsLeads, ...soccerLeads];

    // Deduplicate by (School Name lower, Email lower) to prevent duplicate entries for the same person at the same school
    const seen = new Set<string>();
    const deduplicatedLeads: LeadRow[] = [];

    for (const lead of rawCombined) {
        const school = lead['School Name'].trim();
        const email = lead.Email.trim().toLowerCase();
        const key = `${school.toLowerCase()}||${email}`;

        if (!seen.has(key)) {
            seen.add(key);
            deduplicatedLeads.push({
                'School Name': school,
                Mascot: lead.Mascot.trim(),
                Name: lead.Name.trim(),
                Email: lead.Email.trim(),
            });
        }
    }

    // Sort by School Name alphabetically, then by Name
    deduplicatedLeads.sort((a, b) => {
        const schoolCompare = a['School Name'].localeCompare(b['School Name']);
        if (schoolCompare !== 0) return schoolCompare;
        return a.Name.localeCompare(b.Name);
    });

    console.log(`\n- Total Combined Records: ${rawCombined.length}`);
    console.log(`- Total Unique Leads (deduplicated by School & Email): ${deduplicatedLeads.length}`);
    console.log(`- Duplicates Removed: ${rawCombined.length - deduplicatedLeads.length}`);

    // Output to CSV
    const csvContent = stringify(deduplicatedLeads, {
        header: true,
        columns: ['School Name', 'Mascot', 'Name', 'Email'],
    });

    fs.writeFileSync(OUTPUT_CSV, csvContent, 'utf-8');
    console.log(`\nSuccessfully created: ${OUTPUT_CSV}`);

    // Distinct schools count
    const distinctSchools = new Set(deduplicatedLeads.map((r) => r['School Name']));
    console.log(`- Total Distinct Schools in mn.csv: ${distinctSchools.size}`);
}

main();
