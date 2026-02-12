import ky from 'ky';
import { logger } from '../utils/logger.ts';
import { BaseResolver, type Symbol, type SymbolOptions } from './index.ts';

interface TradingViewResponse {
    symbols_remaining: number;
    symbols?: TradingViewSymbol[];
}

interface TradingViewSymbol {
    symbol: string;
    description: string;
    type: string;
    exchange: string;
    found_by_isin: boolean;
    isin: string;
    currency_code: string;
    country: string;
    is_primary_listing: boolean;
}

export class TradingViewResolver extends BaseResolver {
    private client = ky.create({
        prefixUrl: 'https://symbol-search.tradingview.com',
        headers: {
            accept: '*/*', 'accept-language': 'en-US,en;q=0.9',
            origin: 'https://www.tradingview.com',
            referer: 'https://www.tradingview.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        }
    });

    constructor() {
        super('tradingview');
    }

    async resolveSymbol(isin: string, options?: SymbolOptions): Promise<Symbol[]> {
        if (!isin) {
            return [];
        }

        try {
            const response = await this.client.get('symbol_search/v3', {
                searchParams: {
                    text: isin,
                    country: options?.country,
                    hl: 1,
                    lang: 'en',
                    domain: 'production',
                },
            }).json<TradingViewResponse>();

            const isinMatches = response.symbols?.filter((s) => s.found_by_isin) || [];
            if (isinMatches.length === 0) {
                return [];
            }

            // Return top 10 matches
            const results: Symbol[] = isinMatches.slice(0, 10).map((match) => ({
                symbol: `${match.exchange}:${match.symbol}`,
                name: match.description,
                exchange: match.exchange,
                type: match.type,
                currency: match.currency_code,
                isPrimary: match.is_primary_listing,
                country: match.country,
                isin: match.isin,
                resolver: this.name,
            }));

            logger.debug({ isin, count: results.length, primary: results[0]?.symbol }, 'TradingView resolved symbols');
            return results;
        } catch (error) {
            const err = error as Error;
            logger.error({ isin, error: err.message }, 'TradingView API error');
            return [];
        }
    }
}
