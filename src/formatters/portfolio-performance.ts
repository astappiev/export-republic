import { writeToString, type Row } from '@fast-csv/format';
import { BaseFormatter, type FormatOptions } from './index.ts';
import { TransactionType, type Transaction } from '../readers/index.ts';
import { MarketDataService } from '../services/market-data.ts';
import dateFormat from 'dateformat';

const TYPE_MAP: Record<string, string> = {
    [TransactionType.BUY]: 'Buy',
    [TransactionType.SELL]: 'Sell',
    [TransactionType.DIVIDEND]: 'Dividend',
    [TransactionType.INTEREST]: 'Interest',
    [TransactionType.FEE]: 'Fees',
    [TransactionType.TAX]: 'Taxes',
    [TransactionType.DEPOSIT]: 'Deposit',
    [TransactionType.WITHDRAWAL]: 'Removal',
};

export class PortfolioPerformanceFormatter extends BaseFormatter {
    constructor(marketDataService: MarketDataService) {
        super('portfolio-performance', marketDataService);
    }

    /**
     * Format transactions to Portfolio Performance CSV
     * @param transactions - Parsed transaction data
     * @param options - Formatting options
     * @returns CSV formatted string
     */
    async formatTransactions(transactions: Transaction[], options: FormatOptions = {}): Promise<string> {
        const rows: Row[] = [];
        for (const tx of transactions) {
            const row = await this.formatTransactionRow(tx, options);
            if (row) {
                rows.push(row);
            }
        }

        return await writeToString(rows, {
            headers: ['Date', 'Type', 'Security name', 'ISIN', 'Note', 'Shares', 'Operation currency', 'Fees', 'Taxes/Charges', 'Value'],
            alwaysWriteHeaders: true,
            delimiter: ';',
        });
    }

    private async formatTransactionRow(tx: Transaction, options: FormatOptions): Promise<Row | null> {
        let type = TYPE_MAP[tx.type] || null;
        let value = Math.abs((tx.price || 0) * (tx.shares || 0));

        // Special handling for dividends
        if (tx.type === 'dividend') {
            // For dividends, we might have 'value' directly if price/quantity are 0
            // But standardized Transaction should have quantity/price.
            // However, if price is per-share dividend, value = price * quantity is correct.
            if (tx.amount && value === 0) {
                value = Math.abs(tx.amount);
            }
        }

        return [
            tx.date ? this.formatDate(tx.date) : '',
            type,
            tx.name || '',
            tx.isin || '',
            '', // Note
            tx.shares || 0,
            tx.currency || 'EUR',
            tx.fee || 0,
            tx.tax || 0,
            value,
        ];
    }

    private formatDate(date?: Date | string): string {
        if (!date) return '';
        return dateFormat(date, "UTC:yyyy-mm-dd");
    }
}
