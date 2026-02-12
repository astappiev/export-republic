export interface Symbol {
    /** Trading symbol (e.g., "AAPL", "XETR:SAP") */
    symbol: string;
    /** Security name */
    name?: string;
    /** Exchange code */
    exchange?: string;
    /** Exchange country code */
    country?: string;
    /** Security type (e.g., "EQUITY", "ETF") */
    type?: string;
    /** Currency code */
    currency?: string;
    /** Whether this is the primary listing */
    isPrimary?: boolean;

    /** ISIN code */
    isin: string;
    /** Resolver name */
    resolver: string;
    /** Updated at */
    updatedAt?: string;
}

export interface SymbolOptions {
    country?: string;
    currency?: string;
    exchange?: string;
    resolver?: string;
}

export abstract class BaseResolver {
    public readonly name: string;

    protected constructor(name: string) {
        this.name = name;
    }

    abstract resolveSymbol(isin: string, options?: SymbolOptions): Promise<Symbol[]>;
}
