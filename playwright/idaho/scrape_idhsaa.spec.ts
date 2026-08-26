import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { scrapeIdhsaa } from './scrape_idhsaa.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('IDHSAA Directory & Contacts Scraper Test', () => {
    test('Scrapes athletic directors and soccer coaches for Idaho high schools', async () => {
        test.setTimeout(240000); // 4 minutes

        const { athleticsLeads, soccerLeads, masterLeads } = await scrapeIdhsaa();

        expect(athleticsLeads.length).toBeGreaterThan(80);
        expect(soccerLeads.length).toBeGreaterThan(100);
        expect(masterLeads.length).toBeGreaterThan(200);

        const idCsvPath = path.resolve(__dirname, 'id.csv');
        expect(fs.existsSync(idCsvPath)).toBeTruthy();

        const content = fs.readFileSync(idCsvPath, 'utf-8');
        expect(content.startsWith('School Name,Mascot,Name,Email')).toBeTruthy();
    });
});
