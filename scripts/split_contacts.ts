import { existsSync, readFileSync, copyFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { parse, stringify } from "csv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_SRC = resolve(__dirname, "../assets/high school/CA/Central_Coast_Section.csv");

const srcArg = process.argv[2];
const SRC = srcArg ? resolve(process.cwd(), srcArg) : DEFAULT_SRC;
let backupPath = SRC + ".bak";

// Define types
type CsvRecord = Record<string, string>;

type ContactGroup = {
    email: string;
    related: string[];
    base: string;
};

function parseCsv(text: string): Promise<CsvRecord[]> {
    return new Promise((resolve, reject) => {
        parse(text, { columns: true, skip_empty_lines: true }, (err: Error | undefined, records: CsvRecord[]) => {
            if (err) reject(err);
            else resolve(records);
        });
    });
}

function stringifyCsv(records: CsvRecord[], headers: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        stringify(records, { header: true, columns: headers }, (err: Error | undefined, output: string) => {
            if (err) reject(err);
            else resolve(output);
        });
    });
}

function appendExtensions(records: CsvRecord[], phoneHeader: string | undefined, extHeader: string | undefined): CsvRecord[] {
    if (!extHeader || !phoneHeader) return records;

    records.forEach((record) => {
        const rawExt = record[extHeader];
        delete record[extHeader];

        if (!rawExt) return;

        const extString = rawExt.toString().trim();
        if (!extString) return;

        const withoutX = extString.replace(/^[xX]\s*/, "");
        const extDigits = withoutX.replace(/\D+/g, "");
        const extValue = extDigits || withoutX;
        if (!extValue) return;

        const formatted = `x${extValue}`;
        const phone = (record[phoneHeader] ?? "").toString().trim();
        record[phoneHeader] = phone ? `${phone} ${formatted}` : formatted;
    });

    return records;
}

function buildContactGroups(headers: string[]): ContactGroup[] {
    const emailHeaders = headers.filter((h) => /email/i.test(h));
    return emailHeaders.map((emailHeader) => {
        const base = emailHeader.replace(/\s*email\s*$/i, "").trim();
        const baseLower = base.toLowerCase();
        const related = headers.filter((h) => h.toLowerCase().startsWith(baseLower));
        return { email: emailHeader, related, base };
    });
}

function duplicateContacts(records: CsvRecord[], headers: string[]): CsvRecord[] {
    const groups = buildContactGroups(headers);
    if (!groups.length) return records;

    const output: CsvRecord[] = [];

    records.forEach((record) => {
        const contacts = groups.filter((group) => {
            const value = record[group.email];
            return value && value.toString().trim() !== "";
        });

        if (!contacts.length) {
            output.push({ ...record });
            return;
        }

        contacts.forEach((current) => {
            const cloned = { ...record };

            groups.forEach((group) => {
                if (group.email === current.email) return;
                group.related.forEach((header) => {
                    cloned[header] = "";
                });
            });

            output.push(cloned);
        });
    });

    return output;
}

async function main(): Promise<void> {
    if (!existsSync(SRC)) {
        console.error("Source file not found:", SRC);
        process.exit(1);
    }

    const input = readFileSync(SRC, "utf8");
    const records = await parseCsv(input);
    if (!records.length) {
        console.log("No records found. Nothing to do.");
        return;
    }

    const initialHeaders = Object.keys(records[0]);
    const phoneHeader = initialHeaders.find((h) => /athletic\s*director\s*phone/i.test(h));
    const extHeader = initialHeaders.find((h) => /athletic\s*director\s*ext/i.test(h));

    const normalizedRecords = appendExtensions(records, phoneHeader, extHeader);
    const headers = extHeader ? initialHeaders.filter((header) => header !== extHeader) : initialHeaders;

    const transformed = duplicateContacts(normalizedRecords, headers);

    copyFileSync(SRC, backupPath);
    console.log("Backup created at", backupPath);

    const output = await stringifyCsv(transformed, headers);
    writeFileSync(SRC, output, "utf8");
    console.log(`Wrote ${transformed.length} records (from ${records.length}) back to`, SRC);
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}