import { writeToString, type Row } from '@fast-csv/format';
import { BaseFormatter, type FormatOptions } from './index.ts';
import { type Transaction } from '../readers/index.ts';
import { MarketDataService } from '../services/market-data.ts';
import dateFormat from 'dateformat';

/**
 * Converts parsed transaction data to Investbrain CSV format
 *
 * @see https://github.com/investbrainapp/investbrain/blob/main/app/Imports/Sheets/TransactionsSheet.php
 *
 * Example table:
 * date,type,symbol,quantity,price,fees,portfolio_id,currency
 * 2024-05-21,buy,AAPL,10,190.50,0.00,YOUR_PORTFOLIO_UUID_HERE,USD
 * 2024-06-15,sell,MSFT,5,410.20,1.50,YOUR_PORTFOLIO_UUID_HERE,USD
 * 2024-07-01,dividend,KO,0,0.48,0.00,YOUR_PORTFOLIO_UUID_HERE,USD
 */
export class InvestbrainFormatter extends BaseFormatter {
    constructor(marketDataService: MarketDataService) {
        super('investbrain', marketDataService);
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
            headers: ['id', 'date', 'type', 'symbol', 'quantity', 'price', 'fees', 'portfolio_id', 'currency'],
            alwaysWriteHeaders: true,
        });
    }

    /**
     * Format a single transaction row
     * @param tx - Transaction to format
     * @param options - Formatting options
     * @returns Array of values for CSV row
     */
    async formatTransactionRow(tx: Transaction, options: FormatOptions): Promise<Row | null> {
        const { account, currency } = options;

        let units = tx.shares || 1;
        let unitPrice = tx.price || 0;

        let symbol = tx.isin;
        if (tx.isin && this.marketDataService) {
            symbol = await this.marketDataService.getSymbolFromISIN(tx.isin);
            if (!symbol) {
                symbol = tx.isin;
            }
        }

        if (tx.shares && tx.price) {
            units = tx.shares;
            unitPrice = tx.price;
        }

        return [
            tx.id || '',
            this.formatDate(tx.date),
            tx.type,
            symbol,
            units,
            unitPrice || 0,
            (tx.fee || 0) + (tx.tax || 0),
            account || '',
            tx.currency || currency || 'EUR',
        ];
    }

    private formatDate(date?: Date | string): string {
        if (!date) return '';
        return dateFormat(date, "UTC:yyyy-mm-dd");
    }
}
