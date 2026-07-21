import { existsSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "csv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const targetArg = process.argv[2];

if (!targetArg) {
    console.error("Usage: node scripts/normalize_contacts.js <path-to-csv>");
    process.exit(1);
}

const SRC = resolve(process.cwd(), targetArg);

if (!existsSync(SRC)) {
    console.error("Source file not found:", SRC);
    process.exit(1);
}

const BACKUP = (() => {
    const base = `${SRC}.bak`;
    // return base;
    if (!existsSync(base)) return base;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${base}.${stamp}`;
})();

type CsvRecord = Record<string, string>;

type TransformResult = {
    transformedRecords: CsvRecord[];
    outputHeaders: string[];
};

function parseCsv(buffer: string): Promise<CsvRecord[]> {
    return new Promise((resolvePromise, rejectPromise) => {
        parse(buffer, { columns: true, relax_column_count: true, skip_empty_lines: true }, (err: Error | undefined, records: CsvRecord[]) => {
            if (err) rejectPromise(err);
            else resolvePromise(records);
        });
    });
}

function stringifyCsv(records: CsvRecord[], headers: string[]): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
        stringify(records, { header: true, columns: headers }, (err: Error | undefined, output: string) => {
            if (err) rejectPromise(err);
            else resolvePromise(output);
        });
    });
}

const RENAME_MAP = new Map<string, string>([
    ["Athletic Director Name", "Name"],
    ["Athletic Director Email", "Email"],
    ["Athletic Director Phone", "Phone"],
]);

const REMOVE_SET = new Set<string>(["Boys Soccer Coach Name", "Boys Soccer Coach Email", "Girls Soccer Coach Name", "Girls Soccer Coach Email"]);

// Normalize human names: only first letters capitalized (Title Case-ish), preserve initials and short all-uppercase tokens if appropriate.
function normalizeName(raw?: string): string {
    if (!raw) return "";
    let s = String(raw).trim();
    if (!s) return "";

    // Convert to lower-case first so we don't keep ALL CAPS.
    s = s.toLowerCase();

    // Capitalize each word, handling hyphens and slashes inside words.
    const words = s.split(/\s+/);
    const capWords = words.map((w) => {
        // handle hyphenated pieces and slashes
        return w.split(/([-\/])/).map((part) => {
            if (part === "-" || part === "/") return part;
            // preserve initials like "a.j." or "a.j" -> keep as uppercase with dots
            if (/^([a-z]\.){1,3}$/i.test(part)) return part.toUpperCase();
            // preserve tokens that look like acronyms (2-3 letters)
            if (/^[a-z]{1,3}$/.test(part)) return part.charAt(0).toUpperCase() + part.slice(1);
            // otherwise normal capitalization
            return part.charAt(0).toUpperCase() + part.slice(1);
        }).join("");
    });

    return capWords.join(" ");
}

// Normalize a single CsvRecord (Name and Email canonicalization)
function normalizeRecord(rec: CsvRecord): CsvRecord {
    const out: CsvRecord = { ...rec };
    if (out["Name"]) out["Name"] = normalizeName(out["Name"]);
    // Also normalize any Coach Name fields if present (optional)
    if (out["Boys Soccer Coach Name"]) out["Boys Soccer Coach Name"] = normalizeName(out["Boys Soccer Coach Name"]);
    if (out["Girls Soccer Coach Name"]) out["Girls Soccer Coach Name"] = normalizeName(out["Girls Soccer Coach Name"]);

    // Normalize email: lowercase and trim
    if (out["Email"]) out["Email"] = out["Email"].toString().trim().toLowerCase();
    if (out["Boys Soccer Coach Email"]) out["Boys Soccer Coach Email"] = out["Boys Soccer Coach Email"].toString().trim().toLowerCase();
    if (out["Girls Soccer Coach Email"]) out["Girls Soccer Coach Email"] = out["Girls Soccer Coach Email"].toString().trim().toLowerCase();

    return out;
}

// Remove duplicate records. Preferred key fields: Name + Email + School Name (if present). Keeps first occurrence.
function dedupeRecords(records: CsvRecord[]): CsvRecord[] {
    const seen = new Set<string>();
    const out: CsvRecord[] = [];

    records.forEach((r) => {
        const nameKey = (r["Name"] || "").toString().trim().toLowerCase();
        const emailKey = (r["Email"] || "").toString().trim().toLowerCase();
        const schoolKey = (r["School Name"] || r["School"] || "").toString().trim().toLowerCase();

        // Build a stable key. If Email present use it; otherwise fallback to Name+School; else full JSON.
        let key = "";
        if (emailKey) key = `email:${emailKey}`;
        else if (nameKey || schoolKey) key = `name:${nameKey}|school:${schoolKey}`;
        else key = `raw:${JSON.stringify(r)}`;

        if (!seen.has(key)) {
            seen.add(key);
            out.push(r);
        }
    });

    return out;
}

function transform(records: CsvRecord[], headers: string[]): TransformResult {
    const outputHeaders: string[] = [];
    const headerMap = headers.reduce((acc, header) => {
        const renamed = RENAME_MAP.get(header) ?? header;
        if (!outputHeaders.includes(renamed)) outputHeaders.push(renamed);
        acc.set(header, renamed);
        return acc;
    }, new Map<string, string>());

    const transformedRecords = records.map((record) => {
        const next: CsvRecord = {};
        headerMap.forEach((renamed, original) => {
            next[renamed] = record[original] ?? "";
        });

        // Ensure Name and Email are not empty by checking REMOVE_SET columns
        if (!next["Name"] || next["Name"].trim() === "") {
            next["Name"] = record["Boys Soccer Coach Name"] || record["Girls Soccer Coach Name"] || "";
        }
        if (!next["Email"] || next["Email"].trim() === "") {
            next["Email"] = record["Boys Soccer Coach Email"] || record["Girls Soccer Coach Email"] || "";
        }

        // Clear data from REMOVE_SET columns in the output record if they were copied across
        REMOVE_SET.forEach((column) => {
            if (column in next) {
                delete next[column];
            }
            const headerIndex = outputHeaders.indexOf(column);
            if (headerIndex !== -1) {
                outputHeaders.splice(headerIndex, 1);
            }
        });

        return next;
    });

    return { transformedRecords, outputHeaders };
}

async function main(): Promise<void> {
    const input = readFileSync(SRC, "utf8");
    const records = await parseCsv(input);

    if (!records.length) {
        console.log("No records found. Nothing to do.");
        return;
    }

    const headers = Object.keys(records[0]);
    const { transformedRecords, outputHeaders } = transform(records, headers);

    // Apply normalization (names/emails) then dedupe, before writing
    // const normalized = transformedRecords.map(normalizeRecord);
    // const unique = dedupeRecords(normalized);
    const unique = dedupeRecords(records);

    copyFileSync(SRC, BACKUP);
    console.log("Backup created at", BACKUP);

    const output = await stringifyCsv(unique, outputHeaders);
    writeFileSync(SRC, output, "utf8");
    console.log(`Updated CSV headers (${headers.length} -> ${outputHeaders.length}) and wrote ${unique.length} records to`, SRC);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});