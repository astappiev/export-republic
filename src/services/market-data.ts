import { logger } from '../utils/logger.ts';
import { BaseResolver, type Symbol, type SymbolOptions } from '../resolvers/index.ts';
import { CacheService } from './cache.ts';

/**
 * Options for MarketDataService constructor
 */
export interface MarketDataServiceOptions {
    /** Cache instance (optional) */
    cache?: CacheService | null;
    /** Array of resolver instances */
    resolvers?: BaseResolver[];
}

export class MarketDataService {
    public cache: CacheService | null;
    public resolvers: BaseResolver[];

    constructor(options: MarketDataServiceOptions = {}) {
        this.cache = options.cache || null;
        this.resolvers = options.resolvers || [];
    }

    addResolver(resolver: BaseResolver): void {
        this.resolvers.push(resolver);
    }

    async resolveSymbol(isin: string, options: SymbolOptions = {}): Promise<Symbol | null> {
        if (!isin) return null;
        isin = String(isin).trim();

        if (this.cache) {
            const cached = await this.cache.getSymbol(isin, options);
            if (cached) return cached;
        }

        for (const resolver of this.resolvers) {
            if (options.resolver && options.resolver !== resolver.name) {
                continue;
            }

            try {
                const results = await resolver.resolveSymbol(isin, options);
                if (results && results.length > 0) {
                    for (const result of results) {
                        if (options.currency && options.currency != result.currency) {
                            continue;
                        }

                        if (options.country && options.country != result.country) {
                            continue;
                        }

                        if (options.exchange && options.exchange != result.exchange) {
                            continue;
                        }

                        if (this.cache) {
                            this.cache.setSymbol(isin, result);
                        }
                        return result;
                    }
                }
            } catch (error) {
                const err = error as Error;
                logger.warn({ isin, options, error: err.message }, 'Resolver failed');
            }
        }

        return null;
    }

    async resolveSymbolBatch(isins: string[], options: SymbolOptions = {}): Promise<Map<string, Symbol>> {
        const results = new Map<string, Symbol>();
        const uncached: string[] = [];

        // Check cache for all ISINs
        if (this.cache) {
            for (const isin of isins) {
                const cached = await this.cache.getSymbol(isin, options);
                if (cached) {
                    results.set(isin, cached);
                } else {
                    uncached.push(isin);
                }
            }
        } else {
            uncached.push(...isins);
        }

        // Resolve uncached ISINs
        for (const isin of uncached) {
            const result = await this.resolveSymbol(isin, options);
            if (result) {
                results.set(isin, result);
            }
        }

        return results;
    }

    /**
     * Get symbol string from ISIN, e.g. "US0378331005" => "AAPL"
     */
    async getSymbolFromISIN(isin: string, options: SymbolOptions = {}): Promise<string | undefined> {
        const result = await this.resolveSymbol(isin, options);
        return result?.symbol;
    }
}
