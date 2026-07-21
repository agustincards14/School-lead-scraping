import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const inPath = resolve("assets/high school/MS/schools_table.html");
const outPath = resolve("assets/high school/MS/schools_table.csv");

function extractAnchors(html: string): [string, string][] {
    const regex = /<a\s+[^>]*href=(?:"|')([^"']*)(?:"|')[^>]*>(.*?)<\/a>/gi;
    const anchors: [string, string][] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1].trim();
        const text = match[2].replace(/\s+/g, " ").trim();
        anchors.push([text, href]);
    }
    return anchors;
}

function generateCsv(anchors: [string, string][]): string {
    const header = "School Name,Website";
    const rows = anchors.map(([text, href]) => `"${text.replace(/"/g, '""')}",${href}`);
    return [header, ...rows].join("\n");
}

function main(): void {
    const html = readFileSync(inPath, "utf8");
    const anchors = extractAnchors(html);
    const csvContent = generateCsv(anchors);
    writeFileSync(outPath, csvContent, "utf8");
    console.log("Wrote", outPath, "- rows:", anchors.length);
    console.log("First 10 rows:");
    console.log(csvContent.split("\n").slice(0, 11).join("\n"));
}

main();