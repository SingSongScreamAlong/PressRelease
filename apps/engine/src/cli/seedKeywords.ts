/**
 * Seed Keywords CLI
 * 
 * Import seed keywords from a CSV file.
 * 
 * Usage: npm run seed -- --file ./seeds.csv
 */

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { checkConnection, closePool } from '../db';
import { bulkCreateKeywords } from '../storage/repo';
import { createLogger } from '../logger';

const logger = createLogger('seed-keywords');

interface SeedRow {
    keyword: string;
    category?: string;
    priority?: number;
}

function parseCSV(content: string): SeedRow[] {
    const lines = content.trim().split('\n');
    const rows: SeedRow[] = [];

    // Skip header if present
    const hasHeader = lines[0].toLowerCase().includes('keyword');
    const startIndex = hasHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));

        if (parts[0]) {
            rows.push({
                keyword: parts[0],
                category: parts[1] || undefined,
                priority: parts[2] ? parseInt(parts[2], 10) : 0,
            });
        }
    }

    return rows;
}

async function main(): Promise<void> {
    const argv = await yargs(hideBin(process.argv))
        .option('file', {
            alias: 'f',
            type: 'string',
            description: 'Path to CSV file with keywords',
            demandOption: true,
        })
        .help()
        .parse();

    const filePath = path.resolve(argv.file);

    if (!fs.existsSync(filePath)) {
        logger.error('File not found', { filePath });
        process.exit(1);
    }

    // Check database connection
    const connected = await checkConnection();
    if (!connected) {
        logger.error('Cannot connect to database');
        process.exit(1);
    }

    try {
        // Read and parse CSV
        const content = fs.readFileSync(filePath, 'utf-8');
        const keywords = parseCSV(content);

        logger.info('Parsed keywords', { count: keywords.length });

        // Import keywords
        const created = await bulkCreateKeywords(keywords);

        logger.info('Keywords imported successfully', {
            total: keywords.length,
            created
        });
    } catch (error) {
        logger.error('Failed to import keywords', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        process.exit(1);
    } finally {
        await closePool();
    }
}

main()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
