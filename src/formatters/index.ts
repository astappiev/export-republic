import { type Transaction } from '../readers/index.ts';
import { MarketDataService } from '../services/market-data.ts';

export interface FormatOptions {
    /** Default currency code for output */
    currency?: string;
    /** Data source identifier */
    dataSource?: string;
    /** Account name or ID */
    account?: string;
    /** Additional options */
    [key: string]: unknown;
}

export abstract class BaseFormatter {
    public readonly name: string;
    public readonly marketDataService?: MarketDataService;

    protected constructor(name: string, marketDataService?: MarketDataService) {
        this.name = name;
        this.marketDataService = marketDataService;
    }

    /**
     * Format transactions to output string
     * @returns Formatted string (typically CSV)
     */
    abstract formatTransactions(transactions: Transaction[], options?: FormatOptions): Promise<string>;
}
