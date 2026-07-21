const fs = require("fs");
const inPath = "assets/high school/MS/schools_table.html";
const outPath = "assets/high school/MS/schools_table.csv";

const html = fs.readFileSync(inPath, "utf8");
const regex = /<a\s+[^>]*href=(?:"|')([^"']*)(?:"|')[^>]*>(.*?)<\/a>/gi;
const anchors = [];
let m;
while ((m = regex.exec(html)) !== null) {
  const href = m[1].trim();
  const text = m[2].replace(/\s+/g, " ").trim();
  anchors.push([text, href]);
}

const header = "School Name,Website";
const rows = anchors.map((a) => `"${a[0].replace(/"/g, '""')}",${a[1]}`);
fs.writeFileSync(outPath, [header, ...rows].join("\n"), "utf8");
console.log("Wrote", outPath, "- rows:", anchors.length);
console.log("First 10 rows:");
console.log([header, ...rows].slice(0, 11).join("\n"));
