import * as fs from 'fs';
import * as path from 'path';

// Define the structure of your school data
export interface SchoolData {
    schoolName: string;
    section: string;
    mascot: string;
    website: string;
    athleticDirectorName: string;
    athleticDirectorEmail: string;
    athleticDirectorPhone: string;
    athleticDirectorExt: string;
    boysSoccerCoachName: string;
    boysSoccerCoachEmail: string;
    girlsSoccerCoachName: string;
    girlsSoccerCoachEmail: string;
}

const headers = 'School Name,Section,Mascot,Website,Athletic Director Name,Athletic Director Email,Athletic Director Phone,Athletic Director Ext,Boys Soccer Coach Name,Boys Soccer Coach Email,Girls Soccer Coach Name,Girls Soccer Coach Email\n';

/**
 * Appends a school's data to the CSV file.
 * Creates the file and adds headers if it doesn't exist.
 * @param data - The SchoolData object to write.
 */
export function writeSchoolDataToCsv(data: SchoolData) {
    // Sanitize section name for filename (remove/replace problematic characters)
    const safeSection = data.section.replace(/[^a-zA-Z0-9_-]/g, '_');
    const assetsDir = path.join(process.cwd(), 'assets');
    const outputFilePath = path.join(assetsDir, `${safeSection}.csv`);

    // Check if the file exists
    const fileExists = fs.existsSync(outputFilePath);

    // If the file doesn't exist, write the header row first
    if (!fileExists) {
        fs.writeFileSync(outputFilePath, headers, 'utf-8');
    }

    // Sanitize data to handle commas within fields by wrapping in double quotes
    const sanitize = (value: string) => `"${value.replace(/"/g, '""')}"`;

    // Format the data object into a CSV row string
    const row = [
        sanitize(data.schoolName),
        sanitize(data.section),
        sanitize(data.mascot),
        sanitize(data.website),
        sanitize(data.athleticDirectorName),
        sanitize(data.athleticDirectorEmail),
        sanitize(data.athleticDirectorPhone),
        sanitize(data.athleticDirectorExt),
        sanitize(data.boysSoccerCoachName),
        sanitize(data.boysSoccerCoachEmail),
        sanitize(data.girlsSoccerCoachName),
        sanitize(data.girlsSoccerCoachEmail),
    ].join(',') + '\n';

    // Append the new row to the file
    fs.appendFileSync(outputFilePath, row, 'utf-8');
    console.log(`Wrote data for: ${data.schoolName} (section: ${data.section})`);
}