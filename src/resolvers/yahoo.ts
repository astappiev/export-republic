import ky from 'ky';
import { logger } from '../utils/logger.ts';
import { BaseResolver, type Symbol, type SymbolOptions } from './index.ts';

const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search';

interface YahooSearchResponse {
    quotes?: YahooQuote[];
}

interface YahooQuote {
    exchange: string;
    shortname: string;
    quoteType: string;
    symbol: string;
    index: string;
    score: number;
    typeDisp: string;
    longname: string;
    exchDisp: string;
    sector: string;
    sectorDisp: string;
    industry: string;
    industryDisp: string;
    isYahooFinance: boolean;
}

export class YahooResolver extends BaseResolver {
    private client = ky.create({
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        }
    });

    constructor() {
        super('yahoo');
    }

    async resolveSymbol(isin: string, options?: SymbolOptions): Promise<Symbol[]> {
        if (!isin) {
            return [];
        }

        try {
            const data = await this.client.get(YAHOO_SEARCH_URL, {
                searchParams: {
                    q: isin,
                },
            }).json<YahooSearchResponse>();

            if (!data.quotes || data.quotes.length === 0) {
                return [];
            }

            const results: Symbol[] = data.quotes.map((quote) => ({
                symbol: quote.symbol,
                name: quote.longname || quote.shortname || undefined,
                exchange: quote.exchange || undefined,
                type: quote.quoteType || undefined,
                isin: isin,
                resolver: this.name,
            }));

            logger.debug({ isin, count: results.length, symbol: results[0]?.symbol }, 'Yahoo resolved symbols');
            return results;
        } catch (error) {
            const err = error as Error;
            logger.error({ isin, error: err.message }, 'Yahoo API error');
            return [];
        }
    }
}
