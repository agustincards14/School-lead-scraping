import { readFile, writeFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseSync } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
    const targetArg = process.argv[2];
    if (!targetArg) {
        console.error("Usage: node remove_section.js <path-to-csv>");
        process.exit(1);
    }

    const SRC = resolve(process.cwd(), targetArg);
    if (!existsSync(SRC)) {
        console.error("File not found:", SRC);
        process.exit(1);
    }

    const backupPath = `${SRC}.bak.${new Date().toISOString().replace(/:/g, "-")}`;
    await copyFile(SRC, backupPath);
    console.log("Backup created:", backupPath);

    const raw = await readFile(SRC, "utf8");

    // Remove stray trailing commas at end-of-line (preserve commas inside quotes).
    const normalized = raw
        .split(/\r?\n/)
        .map((line) => (line ? line.replace(/,+\s*$/, "") : line))
        .join("\n");

    const lines = normalized.split(/\r?\n/);
    if (lines.length === 0) {
        console.error("Empty file:", SRC);
        process.exit(1);
    }

    // Parse header row to preserve original column order (handles quoted headers).
    const headerRow = parseSync(lines[0], { relax_column_count: true })[0] as string[];
    const hasSection = headerRow.includes("Section");
    if (!hasSection) {
        console.log("No 'Section' column found — nothing to do.");
        process.exit(0);
    }

    const outHeaders = headerRow.filter((h) => h !== "Section");

    // Parse the full CSV into records (columns:true) using sync parser for simplicity.
    const records = parseSync(normalized, {
        columns: true,
        skip_empty_lines: false,
        relax_column_count: true,
        trim: false,
    }) as Record<string, string>[];

    // Build new records without the Section column, preserving header order.
    const transformed = records.map((rec) => {
        const out: Record<string, string> = {};
        for (const h of outHeaders) {
            // preserve original value or empty string if missing
            out[h] = rec[h] ?? "";
        }
        return out;
    });

    const outCsv = stringify(transformed, { header: true, columns: outHeaders });

    await writeFile(SRC, outCsv, "utf8");
    console.log("Wrote file without 'Section' column:", SRC);
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});