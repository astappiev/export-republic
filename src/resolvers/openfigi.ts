import ky from 'ky';
import { logger } from '../utils/logger.ts';
import { BaseResolver, type Symbol, type SymbolOptions } from './index.ts';

interface OpenFigiResponse {
    data?: OpenFigiInstrument[];
    warning?: string;
}

interface OpenFigiInstrument {
    figi: string;
    securityType: string;
    marketSector: string;
    ticker: string;
    name: string;
    exchCode: string;
    shareClassFIGI: string;
    compositeFIGI: string;
    securityType2: string;
    securityDescription: string;
}

export class OpenfigiResolver extends BaseResolver {
    private client = ky.create({
        prefixUrl: 'https://api.openfigi.com/v3',
        headers: {
            'Content-Type': 'application/json',
            // 'X-OPENFIGI-APIKEY': 'YOUR_API_KEY' // Optional: Add key for higher rate limits
        },
    });

    constructor() {
        super('openfigi');
    }

    async resolveSymbol(isin: string, options?: SymbolOptions): Promise<Symbol[]> {
        if (!isin) {
            return [];
        }

        try {
            const data = await this.client.post('mapping', {
                json: [
                    {
                        idType: 'ID_ISIN',
                        idValue: isin,
                        currency: options?.currency,
                        exchCode: options?.exchange,
                        stateCode: options?.country,
                    },
                ],
            }).json<OpenFigiResponse[]>();

            if (data[0]?.data) {
                const results: Symbol[] = data[0].data.map((instrument) => ({
                    isin: isin,
                    symbol: instrument.ticker,
                    name: instrument.name,
                    exchange: instrument.exchCode,
                    type: instrument.securityType,
                    resolver: this.name,
                }));

                logger.debug({ isin, count: results.length, symbol: results[0]?.symbol }, 'OpenFIGI resolved symbols');
                return results;
            }

            logger.info({ isin, warning: data[0]?.warning }, 'OpenFIGI resolved symbols');
            return [];
        } catch (error) {
            const err = error as Error;
            logger.error({ isin, error: err.message }, 'OpenFIGI API error');
            return [];
        }
    }
}
