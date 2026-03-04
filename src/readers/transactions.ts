import { parseTransactionType, TransactionType, type Transaction } from "../transaction.ts";
import { logger } from "../utils/logger.ts";
import { parseString } from '@fast-csv/parse';
import { BaseReader, type ReaderOptions } from "./index.ts";
import { HEADERS } from "../formatters/transactions.ts";
import { readFile } from "fs/promises";

const FIELD_PARSERS: Partial<Record<keyof Transaction, (v: string) => unknown>> = {
    type: parseTransactionType,
    shares: Number, price: Number, amount: Number, fee: Number, tax: Number,
    date: (v) => new Date(v),
};

export class TransactionsReader extends BaseReader<Record<string, string>> {
    constructor() {
        super('transactions');
    }

    protected async fetchTransactionRecords(options: ReaderOptions): Promise<Record<string, string>[]> {
        const text = options.inputContent || (await readFile(options.inputPath!, 'utf-8'));

        const rows: Record<string, string>[] = [];
        await new Promise<void>((resolve, reject) => {
            parseString(text, { headers: true, ignoreEmpty: true, trim: true })
                .on('error', reject)
                .on('data', (row) => rows.push(row))
                .on('end', () => resolve());
        });

        logger.info(`📋 Read ${rows.length} transactions from: ${options.inputPath}`);
        return rows;
    }

    protected parseTransaction(record: Record<string, string>): Transaction | null {
        const type = record.type as TransactionType;
        if (!type || !Object.values(TransactionType).includes(type)) {
            logger.error({ record }, `Invalid transaction type: ${record.type}`);
            return null;
        }

        const tx: Record<string, unknown> = { type };
        for (const h of HEADERS) {
            if (h === 'type') continue;
            const v = record[h];
            if (!v) continue;

            const parser = FIELD_PARSERS[h];
            tx[h] = parser ? parser(v) : v;
        }

        return tx as unknown as Transaction;
    }
}
