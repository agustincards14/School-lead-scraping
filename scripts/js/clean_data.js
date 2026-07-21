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

function stripHonorifics(name) {
  if (!name) return name;
  // handle quoted groups and multiple names separated by comma
  return name
    .split(",")
    .map((part) => {
      let s = part.trim();
      // remove common honorifics at start: Mr, Mrs, Ms, Miss, Dr, Sr, Rev, Fr, Prof, Coach
      s = s.replace(/^((Mr|Mrs|Ms|Miss|Dr|Sr|Rev|Fr|Prof|Coach)\.?\s+)/i, "");
      // also remove repeating like "Mr. " inside quotes
      return s;
    })
    .join(", ");
}

function titleCase(s) {
  if (!s) return s;
  // keep existing capitalization for parts that look like acronyms (all caps and length <= 3)
  return s
    .toLowerCase()
    .split(/(\s+|[-\/])/)
    .map((token) => {
      // separators preserved by split
      if (/^\s+$/.test(token) || token === "-" || token === "/") return token;
      // keep short all-caps tokens (like "A.J.") as-is
      if (/^[A-Z\.]{1,3}$/.test(token)) return token;
      // capitalize first letter
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join("");
}

function isValidEmail(email) {
  if (!email) return false;
  // practical regex for emails
  const re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return re.test(email.trim());
}

function fixEmail(email) {
  if (!email) return email;
  let e = email.trim();
  // remove stray spaces
  e = e.replace(/\s+/g, "");
  // common double-@ mistake
  e = e.replace(/@@+/g, "@");
  // lowercase domain part
  const parts = e.split("@");
  if (parts.length === 2) {
    parts[1] = parts[1].toLowerCase();
    e = parts.join("@");
  }
  return e;
}

function isValidUrl(u) {
  if (!u) return false;
  try {
    const normalized = /^(https?:)?\/\//i.test(u) ? u : "http://" + u;
    const url = new URL(normalized);
    return !!url.hostname;
  } catch (e) {
    return false;
  }
}

function fixUrl(u) {
  if (!u) return u;
  let s = u.trim();
  if (!s) return s;
  // remove accidental spaces
  s = s.replace(/\s+/g, "");
  if (!/^(https?:)\/\//i.test(s)) {
    if (/\./.test(s)) s = "http://" + s;
  }
  try {
    const url = new URL(s);
    return url.toString();
  } catch (e) {
    return s;
  }
}

function main() {
  if (!existsSync(SRC)) {
    console.error("Source file not found:", SRC);
    process.exit(1);
  }

  const input = readFileSync(SRC, "utf8");

  parse(input, { columns: true, skip_empty_lines: true }, (err, records) => {
    if (err) throw err;

    // const report = [];
    const cleaned = records.map((r, idx) => {
      const nameKey = Object.keys(r).find((k) => /athletic\s*director/i.test(k)) || "Athletic Director";
      const schoolKey = Object.keys(r).find((k) => /school\s*name|school/i.test(k)) || "School Name";
      const emailKey = Object.keys(r).find((k) => /email/i.test(k)) || "Email";
      // const webKey = Object.keys(r).find((k) => /(web|url|address)/i.test(k)) || "Web address";

      if (r[nameKey]) r[nameKey] = stripHonorifics(r[nameKey]);
      // if (r[schoolKey]) r[schoolKey] = titleCase(r[schoolKey]);

      const originalEmail = r[emailKey] || "";
      const fixedEmail = fixEmail(originalEmail || "");
      const emailValid = isValidEmail(fixedEmail);
      if (fixedEmail !== originalEmail) r[emailKey] = fixedEmail;

      // const originalWeb = r[webKey] || "";
      // const fixedWeb = fixUrl(originalWeb || "");
      // const webValid = isValidUrl(fixedWeb);
      // if (fixedWeb !== originalWeb) r[webKey] = fixedWeb;

      if (!emailValid) {
        console.error(`Row ${idx + 1} (${r[schoolKey] || ""}): Invalid email: ${originalEmail}`);
        // report.push({
        //   row: idx + 1,
        //   school: r[schoolKey] || "",
        //   originalEmail,
        //   fixedEmail,
        //   emailValid,
        //   originalWeb,
        //   fixedWeb,
        //   webValid,
        // });
      }

      return r;
    });

    // backup original
    if (!existsSync(BACKUP)) copyFileSync(SRC, BACKUP);

    stringify(cleaned, { header: true }, (err2, output) => {
      if (err2) throw err2;
      writeFileSync(OUT, output, "utf8");
      console.log("Wrote cleaned CSV to", OUT, "(backup at " + BACKUP + ")");
      // try {
      //   const rptPath = path.resolve(__dirname, "clean_principals_lhsaa_report.json");
      //   fs.writeFileSync(rptPath, JSON.stringify({ generated: new Date().toISOString(), issues: report }, null, 2), "utf8");
      //   console.log("Wrote cleaning report to", rptPath, "(rows with invalid email or web)");
      // } catch (e) {
      //   console.error("Failed to write report", e);
      // }
    });
  });
}

if (process.argv[1] === __filename) main();
