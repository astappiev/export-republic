import { BaseReader, type ReaderOptions, type Transaction } from './index.ts';
import { parseString } from '@fast-csv/parse';
import { readFile } from 'fs/promises';
import { logger } from '../utils/logger.ts';
import { parseAmountEU } from '../utils/parse.ts';

interface ScalableCapitalCsvRecord {
    date: string;
    time: string;
    status: ScalableCapitalTransactionStatus;
    reference: string;
    description: string;
    assetType: string;
    type: string;
    isin: string;
    shares: string;
    price: string;
    amount: string;
    fee: string;
    tax: string;
    currency: string;
}

enum ScalableCapitalTransactionStatus {
    EXECUTED = 'Executed',
    PENDING = 'Pending',
    CANCELLED = 'Cancelled',
}

interface ScalableCapitalCsvReaderOptions extends ReaderOptions {
    csvFile?: string;
    csvContent?: string;
}

/**
 * ScalableCapitalCsvReader - Parses transaction data from Scalable Capital CSV exports
 *
 * CSV Format:
 * - Delimiter: Semicolon (;)
 * - Decimal separator: Comma (,) - European format
 * - Date format: YYYY-MM-DD
 * - Time format: HH:MM:SS
 * - Status values: Pending, Executed, Cancelled
 *
 * Only transactions with status="Executed" are imported.
 */
export class ScalableCapitalCsvReader extends BaseReader<ScalableCapitalCsvRecord> {
    constructor() {
        super('scalable-capital-csv');
    }

    async fetchTransactionRecords(options: ScalableCapitalCsvReaderOptions): Promise<ScalableCapitalCsvRecord[]> {
        const csvContent = options.csvContent || (await readFile(options.csvFile!, 'utf-8'));

        const records: ScalableCapitalCsvRecord[] = [];
        await new Promise<void>((resolve, reject) => {
            parseString(csvContent, {
                headers: true,
                delimiter: ';',
                ignoreEmpty: true,
                trim: true,
            })
                .on('error', (error) => reject(error))
                .on('data', (row) => records.push(row))
                .on('end', () => resolve());
        });

        const executedRecords = records.filter((record) => record.status === ScalableCapitalTransactionStatus.EXECUTED);
        logger.info(`🛄 Filtered ${records.length - executedRecords.length} non-executed transactions`);
        return executedRecords;
    }

    protected parseTransaction(record: ScalableCapitalCsvRecord): Transaction | null {
        const date = new Date(`${record.date}T${record.time}`);

        const isMigrationDate = record.date === '2025-12-05' || record.date === '2025-12-06' || record.date === '2025-12-07';
        if (record.type === 'Security transfer' && isMigrationDate) {
            return null;
        }

        const type = BaseReader.parseTransactionType(record.type);
        if (!type) {
            logger.error({ record }, `Invalid transaction type: ${record.type}`);
            return null;
        }

        return {
            id: record.reference,
            date,
            status: record.status,
            type,
            assetType: record.assetType,
            isin: record.isin,
            name: record.description,
            shares: parseAmountEU(record.shares) || 0,
            price: parseAmountEU(record.price) || 0,
            amount: parseAmountEU(record.amount) || 0,
            fee: parseAmountEU(record.fee) || 0,
            tax: parseAmountEU(record.tax) || 0,
            currency: record.currency,
            source: this.name,
        };
    }
}
