import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function removeADPrefix() {
    const csvPath = path.join(__dirname, 'school_leads.csv');
    const jsonPath = path.join(__dirname, 'school_leads.json');

    if (fs.existsSync(csvPath)) {
        console.log(`Cleaning ${csvPath}...`);
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n');

        const cleanedLines = lines.map(line => {
            // This regex matches "AD: some name" inside quotes or as plain text in the 3rd column
            // But since the format is "School","Mascot","Name","Email"
            // We can just simple replace "AD: " globally if it's safe, 
            // or more precisely target the name column.
            return line.replace(/"AD:\s*/g, '"').replace(/,AD:\s*/g, ',');
        });

        fs.writeFileSync(csvPath, cleanedLines.join('\n'));
        console.log('CSV cleaned.');
    }

    if (fs.existsSync(jsonPath)) {
        console.log(`Cleaning ${jsonPath}...`);
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const cleanedData = data.map((item: any) => {
            if (item.Name && item.Name.startsWith('AD:')) {
                return {
                    ...item,
                    Name: item.Name.replace(/^AD:\s*/, '')
                };
            }
            return item;
        });
        fs.writeFileSync(jsonPath, JSON.stringify(cleanedData, null, 2));
        console.log('JSON cleaned.');
    }
}

removeADPrefix();
