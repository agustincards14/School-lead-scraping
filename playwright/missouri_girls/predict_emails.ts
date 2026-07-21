import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const JSON_FILE = path.join(__dirname, 'temp.json');
const CSV_FILE = path.join(__dirname, 'schools.csv');

interface SchoolObject {
  'school name': string;
  coaches: string[];
}

interface PredictedEmail {
  name: string;
  email: string;
}

async function predictEmails(schoolObject: SchoolObject): Promise<PredictedEmail[]> {
    const prompt = `Get or predict the emails for the following soccer coaches at the following school in Missouri: ${JSON.stringify(schoolObject)}.
    Return ONLY a valid JSON array of objects with keys "name" and "email". DO NOT wrap in markdown \`\`\`json. If you cannot find or predict an email, return an empty string for the email.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.1,
            }
        });

        let text = response.text || "[]";
        
        // Clean up markdown just in case the model returns it
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(text);
    } catch (error) {
        console.error(`Error querying Gemini for ${schoolObject['school name']}:`, error);
        return [];
    }
}

function updateCsvContent(csvContent: string, schoolName: string, predictions: PredictedEmail[]): string {
    const lines = csvContent.split('\n');
    const updatedLines = lines.map(line => {
        if (!line.trim()) return line;
        
        const parts = line.split(',');
        // CSV format: School Name,Mascot,Name,Email
        if (parts.length >= 3 && parts[0].trim() === schoolName) {
            const coachName = parts[2].trim();
            const prediction = predictions.find(p => p.name === coachName);
            
            if (prediction) {
                // Return line with email appended (prevent appending multiple times if already has email)
                if (parts.length === 3) {
                    return `${line},${prediction.email}`;
                } else {
                    parts[3] = prediction.email;
                    return parts.join(',');
                }
            }
        }
        return line;
    });
    return updatedLines.join('\n');
}

async function run() {
    console.log('Starting email prediction test batch...');
    
    // Read JSON
    const schoolsData: SchoolObject[] = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
    
    // Read CSV 
    let csvContent = fs.readFileSync(CSV_FILE, 'utf-8');

    // Run on all schools
    const batch = schoolsData;
    
    for (const school of batch) {
        console.log(`\nQuerying Gemini for: ${school['school name']}`);
        const predictions = await predictEmails(school);
        console.log(`Received predictions:`, predictions);
        
        if (predictions.length > 0) {
            csvContent = updateCsvContent(csvContent, school['school name'], predictions);
        }
        
        // Use a 3-second delay to securely avoid API rate limits when iterating ~300 schools
        await new Promise(r => setTimeout(r, 3000));
        
        // Save incrementally so we don't lose data on crash
        fs.writeFileSync(CSV_FILE, csvContent);
    }

    console.log(`\nFull batch complete. Updated CSV saved directly to ${CSV_FILE}`);
}

run();
