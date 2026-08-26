import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { scrapeMnAthletics } from './scrape_mn_athletics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('MSHSL Administration Leads Scraper Test', () => {
    test('Scrapes up to 2 administration leads per school with prioritization', async () => {
        test.setTimeout(240000); // 4 minutes

        const leads = await scrapeMnAthletics();
        expect(leads.length).toBeGreaterThan(100);

        const csvPath = path.resolve(__dirname, 'mn_athletics.csv');
        expect(fs.existsSync(csvPath)).toBeTruthy();

        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        expect(csvContent.startsWith('School Name,Mascot,Name,Email')).toBeTruthy();
    });
});
