import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

// Ensure GEMINI_API_KEY exists
if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CSV_FILE = path.join(__dirname, 'schools.csv');

interface CoachPrediction {
    email: string;
}

interface ADPrediction {
    ad_name: string;
    ad_email: string;
}

interface SchoolRow {
    schoolName: string;
    mascot: string;
    name: string;
    email: string;
}

async function predictCoachEmail(schoolName: string, coachName: string): Promise<string> {
    const prompt = `Find the email for the soccer coach ${coachName} at ${schoolName} highschool in michigan. If you cannot find it, then predict the email. Return ONLY a valid JSON object with key "email". If you cannot find or predict an email, return an empty string for the email.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.1,
            }
        });

        let text = response.text || "{}";
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data: CoachPrediction = JSON.parse(text);
        return data.email || '';
    } catch (error) {
        console.error(`Error predicting coach email for ${schoolName}:`, error);
        return '';
    }
}

async function predictADInfo(schoolName: string): Promise<ADPrediction> {
    const prompt = `Find the name and email for the athletic director at ${schoolName} highschool in michigan. If you cannot find it, then predict the email. Return ONLY a valid JSON object with keys "ad_name" and "ad_email". If you cannot find the data, return an empty string.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.1,
            }
        });

        let text = response.text || "{}";
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data: ADPrediction = JSON.parse(text);
        return {
            ad_name: data.ad_name || '',
            ad_email: data.ad_email || ''
        };
    } catch (error) {
        console.error(`Error predicting AD info for ${schoolName}:`, error);
        return { ad_name: '', ad_email: '' };
    }
}

function parseCSV(content: string): SchoolRow[] {
    const lines = content.split('\n');
    const rows: SchoolRow[] = [];

    // Skip header (line 0)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        rows.push({
            schoolName: parts[0] ? parts[0].trim() : '',
            mascot: parts[1] ? parts[1].trim() : '',
            name: parts[2] ? parts[2].trim() : '',
            email: parts[3] ? parts[3].trim() : '',
        });
    }
    return rows;
}

function writeCSV(rows: SchoolRow[], filePath: string) {
    let content = 'School Name,Mascot,Name,Email\n';
    for (const row of rows) {
        // Just writing them back out in standard format
        content += `${row.schoolName},${row.mascot},${row.name},${row.email}\n`;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
}
const INPUT_CSV = path.join(__dirname, 'schools.csv');
const OUTPUT_CSV = path.join(__dirname, 'schools_with_emails.csv');

async function runTest() {
    console.log('--- STARTING 3 SCHOOL TEST MODE ---');
    
    // 1. Read existing CSV
    const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
    const allRows = parseCSV(csvContent);
    
    // Select 5 random rows for test
    const shuffled = [...allRows].sort(() => 0.5 - Math.random());
    const testRows = shuffled.slice(0, 5);
    const updatedRows: SchoolRow[] = [];

    for (const row of testRows) {
        console.log(`\n======================================`);
        console.log(`Processing: ${row.schoolName}`);
        console.log(`Coach: ${row.name}`);
        
        // 1) Predict coach email
        let coachEmail = row.email;
        if (!coachEmail && row.name) {
            console.log(` -> Predicting Coach Email for ${row.name}...`);
            coachEmail = await predictCoachEmail(row.schoolName, row.name);
            console.log(` <- Result: ${coachEmail}`);
        } else {
             if (coachEmail) {
                 console.log(` -> Coach Email already exists.`);
             } else {
                 console.log(` -> No coach name provided to predict email.`);
             }
        }

        updatedRows.push({
            ...row,
            email: coachEmail
        });

        // 2) Predict AD Info
        console.log(` -> Finding AD Info for ${row.schoolName}...`);
        const adInfo = await predictADInfo(row.schoolName);
        console.log(` <- Result: Name: ${adInfo.ad_name}, Email: ${adInfo.ad_email}`);
        
        if (adInfo.ad_name || adInfo.ad_email) {
             updatedRows.push({
                 schoolName: row.schoolName,
                 mascot: row.mascot, // Use same mascot for AD row per latest CSV format
                 name: adInfo.ad_name,
                 email: adInfo.ad_email
             });
        }
    }

    // Sort updatedRows array
    updatedRows.sort((a, b) => a.schoolName.localeCompare(b.schoolName));

    console.log(`\n--- TEST RESULTS: SAVING TO OUTPUT CSV ---`);
    writeCSV(updatedRows, OUTPUT_CSV);
    console.log(`Saved 3-school test to ${OUTPUT_CSV}`);
    console.log(`\n--- END TEST ---`);
}

// Ensure GEMINI_API_KEY exists
if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
}

runTest();
