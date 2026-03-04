import { type Transaction } from "../transaction.ts";
import type { SymbolOptions } from '../resolvers/index.ts';
import { MarketDataService } from '../services/market-data.ts';

export interface FormatOptions extends SymbolOptions {
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
