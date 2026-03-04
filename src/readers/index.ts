import { jsonlDir } from "jsonl-db";
import { validateTransaction, type Transaction } from "../transaction.ts";
import { logger } from "../utils/logger.ts";
import { join } from "path";
import { mkdirSync } from "fs";

export interface ReaderOptions {
    cacheRecords?: boolean;
    inputPath?: string;
    inputContent?: string;
    [key: string]: unknown;
}

interface RecordsCache<T> {
    add(data: T | T[]): Promise<void>;
    findOne(matchFn: (data: T) => boolean): Promise<T | undefined>;
    find(matchFn: (data: T) => boolean): Promise<T[]>;
    update(matchFn: (data: T) => boolean, updateFn: (data: T) => T): Promise<T[]>;
    delete(matchFn: (data: T) => boolean): Promise<T[]>;
    count(): Promise<number>;
}

export abstract class BaseReader<T = any> {
    public readonly name: string;

    protected constructor(name: string) {
        this.name = name;
    }

    abstract fetchTransactionRecords(options: ReaderOptions): Promise<T[]>;

    abstract parseTransaction(record: T): Transaction | null;

    async readTransactions(options: ReaderOptions = {}): Promise<Transaction[]> {
        let records: T[] = [];
        let recordsCache: RecordsCache<T> | undefined;
        if (options.cacheRecords) {
            const recordsDir = join(process.cwd(), 'records');
            mkdirSync(recordsDir, { recursive: true });

            const cacheDB = jsonlDir(recordsDir);
            recordsCache = cacheDB.file(this.name) as unknown as RecordsCache<T>;

            if (recordsCache && await recordsCache.count() > 0) {
                logger.info(`Found ${await recordsCache.count()} cached transaction records`);
                records = await recordsCache.find(() => true);
            }
        }

        if (records.length === 0) {
            logger.info(`🔎 Fetching transaction records from ${this.name}...`);
            records = await this.fetchTransactionRecords(options);
            logger.info(`📋 Found ${records.length} total transaction records`);

            if (options.cacheRecords && recordsCache) {
                await recordsCache.add(records);
                logger.info(`💾 Cached ${records.length} transaction records`);
            }
        }

        const transactions = records.map((record) => this.parseTransaction(record)).filter(validateTransaction);
        logger.info(`✅ Successfully parsed ${transactions.length} transactions`);
        return transactions;
    }
}
