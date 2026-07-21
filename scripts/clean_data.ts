import { existsSync, readFileSync, copyFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { parse, stringify } from "csv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_SRC = resolve(__dirname, "../assets/high school/LA/LHSAA2.csv");
const srcArg = process.argv[2];
const SRC = srcArg ? resolve(process.cwd(), srcArg) : DEFAULT_SRC;
const BACKUP = SRC + ".bak";
const OUT = SRC; // overwrite

// Define types
type CsvRecord = Record<string, string>;

function parseCsv(input: string): Promise<CsvRecord[]> {
    return new Promise((resolve, reject) => {
        parse(input, { columns: true, skip_empty_lines: true }, (err: Error | undefined, records: CsvRecord[]) => {
            if (err) reject(err);
            else resolve(records);
        });
    });
}

function stringifyCsv(records: CsvRecord[]): Promise<string> {
    return new Promise((resolve, reject) => {
        stringify(records, { header: true }, (err: Error | undefined, output: string) => {
            if (err) reject(err);
            else resolve(output);
        });
    });
}

function stripHonorifics(name: string): string {
    if (!name) return name;
    return name
        .split(",")
        .map((part) => {
            let s = part.trim();
            s = s.replace(/^((Mr|Mrs|Ms|Miss|Dr|Sr|Rev|Fr|Prof|Coach)\.?\s+)/i, "");
            return s;
        })
        .join(", ");
}

function fixEmail(email: string): string {
    if (!email) return email;
    let e = email.trim();
    e = e.replace(/\s+/g, "");
    e = e.replace(/@@+/g, "@");
    const parts = e.split("@");
    if (parts.length === 2) {
        parts[1] = parts[1].toLowerCase();
        e = parts.join("@");
    }
    return e;
}

function isValidEmail(email: string): boolean {
    if (!email) return false;
    const re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return re.test(email.trim());
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

    const cleaned = records.map((record, idx) => {
        const nameKey = Object.keys(record).find((k) => /athletic\s*director/i.test(k)) || "Athletic Director";
        const emailKey = Object.keys(record).find((k) => /email/i.test(k)) || "Email";

        if (record[nameKey]) record[nameKey] = stripHonorifics(record[nameKey]);

        const originalEmail = record[emailKey] || "";
        const fixedEmail = fixEmail(originalEmail);
        if (fixedEmail !== originalEmail) record[emailKey] = fixedEmail;

        if (!isValidEmail(fixedEmail)) {
            console.error(`Row ${idx + 1}: Invalid email: ${originalEmail}`);
        }

        return record;
    });

    if (!existsSync(BACKUP)) copyFileSync(SRC, BACKUP);

    const output = await stringifyCsv(cleaned);
    writeFileSync(OUT, output, "utf8");
    console.log("Wrote cleaned CSV to", OUT, "(backup at " + BACKUP + ")");
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}