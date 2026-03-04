import dateFormat from "dateformat";
import { writeToString, type Row } from '@fast-csv/format';
import { BaseFormatter, type FormatOptions } from './index.ts';
import { TransactionType, type Transaction } from "../transaction.ts";
import { MarketDataService } from '../services/market-data.ts';
import { logger } from '../utils/logger.ts';

export class SimplywallFormatter extends BaseFormatter {
    constructor(marketDataService?: MarketDataService) {
        super('simplywall', marketDataService);
    }

    async formatTransactions(transactions: Transaction[], options: FormatOptions = {}): Promise<string> {
        const rows: Row[] = [];

        for (const transaction of transactions) {
            const row = await this.formatTransactionRow(transaction, options);
            if (row) {
                rows.push(row);
            }
        }

        return await writeToString(rows, {
            headers: ['ISIN', 'Transaction type', 'Date', 'Shares', 'Price', 'Currency'],
            alwaysWriteHeaders: true,
            delimiter: ',',
        });
    }

    private async formatTransactionRow(tx: Transaction, options: FormatOptions): Promise<Row | null> {
        if (tx.type !== TransactionType.BUY && tx.type !== TransactionType.SELL) {
            logger.warn({ transaction: tx }, `Unhandeled transaction type: ${tx.type}`);
            return null;
        }

        return [
            tx.isin,
            tx.type,
            this.formatDate(tx.date),
            tx.shares || 1,
            tx.price,
            tx.currency || 'EUR',
        ];
    }

    private formatDate(date?: Date): string {
        if (!date) return '';
        return dateFormat(date, "UTC:yyyy/mm/dd");
    }
}
