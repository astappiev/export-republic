import { writeToString, type Row } from '@fast-csv/format';
import { BaseFormatter, type FormatOptions } from './index.ts';
import { type Transaction } from '../readers/index.ts';
import { MarketDataService } from '../services/market-data.ts';
import dateFormat from 'dateformat';

/**
 * Converts parsed transaction data to Ghostfolio CSV format
 *
 * Expected Ghostfolio CSV format:
 * - date: Date in ISO format (dd-MM-yyyy)
 * - code: Asset symbol/identifier
 * - dataSource: Data source (e.g., MANUAL)
 * - currency: Currency code (e.g., EUR, USD)
 * - price: Price of transaction
 * - quantity: Number of units
 * - action: Transaction type (BUY, SELL, DIVIDEND, FEE, ITEM, etc.)
 * - fee: Transaction fee (optional)
 * - note: Additional notes (optional)
 * - account: Account name/ID (optional)
 *
 * @see https://github.com/ghostfolio/ghostfolio/blob/main/apps/client/src/app/services/import-activities.service.ts
 * @see https://github.com/ghostfolio/ghostfolio/blob/main/test/import/ok/sample.csv?plain=1
 */
export class GhostfolioFormatter extends BaseFormatter {
    constructor(marketDataService: MarketDataService) {
        super('ghostfolio', marketDataService);
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
            headers: ['Id', 'Date', 'Code', 'DataSource', 'Currency', 'Price', 'Quantity', 'Action', 'Fee', 'Note'],
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
        const { currency } = options;

        let dataSource = options.dataSource || 'YAHOO';
        const units = tx.shares ?? 1;
        const unitPrice = tx.price ?? tx.amount ?? 0;
        let note = tx.comment || '';

        let symbol: string | undefined;
        if (tx.isin && this.marketDataService) {
            symbol = await this.marketDataService.getSymbolFromISIN(tx.isin);
            if (!symbol) {
                dataSource = 'MANUAL';
                symbol = tx.isin;
            }
        }

        return [
            tx.id,
            this.formatDate(tx.date),
            symbol,
            dataSource,
            tx.currency || currency || 'EUR',
            unitPrice,
            units,
            (tx.type || '').toLowerCase(),
            (tx.fee || 0) + (tx.tax || 0),
            note,
        ];
    }

    private formatDate(date?: Date | string): string {
        if (!date) return '';
        return dateFormat(date, "UTC:dd-mm-yyyy");
    }
}
