import { jsonlDir } from "jsonl-db";
import { logger } from "../utils/logger.ts";
import { isValidIsin } from "../utils/validate.ts";
import { join } from "path";
import { mkdirSync } from "fs";

export enum TransactionType {
    BUY = 'buy',
    SELL = 'sell',
    DIVIDEND = 'dividend',
    INTEREST = 'interest',
    FEE = 'fee',
    TAX = 'tax',
    LIABILITY = 'liability',
    CANCELED = 'canceled',
    REFUND = 'refund',
    PAYMENT = 'payment',
    TRANSFER = 'transfer',
    DEPOSIT = 'deposit',
    WITHDRAWAL = 'withdrawal',
    VERIFICATION = 'verification',
    GIFT = 'gift',
}

const TRANSACTION_TYPE_ALIASES: Record<string, TransactionType> = {
    distribution: TransactionType.DIVIDEND,
    taxes: TransactionType.TAX,
};

export interface Transaction {
    /** Unique identifier (hash or UUID) */
    id?: string;
    /** Transaction type */
    type: TransactionType;
    /** Transaction status */
    status?: string;
    /** ISIN code (required) */
    isin?: string;
    /** Trading symbol (optional, resolved by MarketDataService) */
    symbol?: string;
    /** Asset type */
    assetType?: string;
    /** Security name */
    name?: string;
    /** Number of shares/units */
    shares?: number;
    /** Price per share/unit */
    price?: number;
    /** Total amount, which can be positive or negative. In other words, this is how the transaction affected the cash balance. */
    amount?: number;
    /** Transaction fees */
    fee?: number;
    /** Taxes withheld */
    tax?: number;
    /** Transaction date */
    date?: Date;
    /** ISO 4217 currency code (e.g., 'EUR', 'USD') */
    currency?: string;
    /** Comment or description */
    comment?: string;
    /** Source metadata */
    source?: string;
}

export interface ReaderOptions {
    cacheRecords?: boolean;
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

    protected abstract fetchTransactionRecords(options: ReaderOptions): Promise<T[]>;

    protected abstract parseTransaction(record: T): Transaction | null;

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

        const transactions = records
            .map((record) => this.parseTransaction(record))
            .filter((tx) => BaseReader.validateTransaction(tx));
        logger.info(`✅ Successfully parsed ${transactions.length} transactions`);
        return transactions;
    }

    protected static parseTransactionType(type?: string): TransactionType | null {
        if (!type) return null;
        const normalized = type.toLowerCase().trim();

        if (Object.values(TransactionType).includes(normalized as TransactionType)) {
            return normalized as TransactionType;
        }

        return TRANSACTION_TYPE_ALIASES[normalized] ?? null;
    }

    private static validateTransaction(tx: Transaction | null | undefined): tx is Transaction {
        if (!tx) return false;

        if (!tx.type) {
            logger.error({ tx }, `Missing type`);
            return false;
        }

        if (tx.type == TransactionType.BUY || tx.type == TransactionType.SELL || tx.type == TransactionType.DIVIDEND) {
            if (!tx.isin || !isValidIsin(tx.isin)) {
                logger.error({ tx }, `Invalid ISIN: ${tx.isin}`);
                return false;
            }
        }

        if (tx.shares && tx.shares < 0) {
            logger.error({ tx }, `Shares must be non-negative: ${tx.shares}`);
            return false;
        }

        if (tx.price && tx.price < 0) {
            logger.error({ tx }, `Price must be non-negative: ${tx.price}`);
            return false;
        }

        if (tx.fee && tx.fee < 0) {
            logger.error({ tx }, `Fee must be non-negative: ${tx.fee}`);
            return false;
        }

        return true;
    }
}
