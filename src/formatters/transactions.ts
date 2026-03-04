import { type Transaction } from "../transaction.ts";
import { writeToString, type Row } from '@fast-csv/format';
import { BaseFormatter, type FormatOptions } from "./index.ts";

export const HEADERS: (keyof Transaction)[] = [
    'id', 'type', 'status', 'isin', 'symbol', 'assetType', 'name',
    'shares', 'price', 'amount', 'fee', 'tax', 'date', 'currency',
    'comment', 'source',
];

export class TransactionsFormatter extends BaseFormatter {

    constructor() {
        super('transactions');
    }

    async formatTransactions(transactions: Transaction[], options?: FormatOptions): Promise<string> {
        const rows: Row[] = transactions.map((tx) =>
            HEADERS.map((h) => {
                const v = tx[h];
                return v instanceof Date ? v.toISOString() : (v ?? '');
            }),
        );

        return await writeToString(rows, { headers: HEADERS, alwaysWriteHeaders: true });
    }
}
