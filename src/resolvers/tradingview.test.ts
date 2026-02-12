import nock from 'nock';
import { describe, it, expect, afterEach } from '@jest/globals';
import { TradingViewResolver } from './tradingview.ts';

describe('TradingViewResolver', () => {
    afterEach(() => {
        nock.cleanAll();
    });

    describe('resolveSymbol', () => {
        it.skip('live test', async () => {
            const resolver = new TradingViewResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(1);
        });

        it('should resolve ISIN to exchange-prefixed symbols array', async () => {
            const mockResponse = {
                symbols_remaining: 0,
                symbols: [
                    {
                        symbol: 'MUV2',
                        description: 'Munich Re',
                        exchange: 'GETTEX',
                        type: 'stock',
                        found_by_isin: true,
                        currency_code: 'EUR',
                        is_primary_listing: false,
                        isin: 'DE0008430026',
                        country: 'DE',
                    },
                ],
            };

            nock('https://symbol-search.tradingview.com')
                .get('/symbol_search/v3')
                .query((query) => query.text === 'DE0008430026')
                .reply(200, mockResponse);

            const resolver = new TradingViewResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(1);
            expect(results[0].symbol).toBe('GETTEX:MUV2');
            expect(results[0].name).toBe('Munich Re');
            expect(results[0].exchange).toBe('GETTEX');
            expect(results[0].type).toBe('stock');
            expect(results[0].currency).toBe('EUR');
        });

        it('should filter out symbols not found by ISIN', async () => {
            const mockResponse = {
                symbols: [
                    {
                        symbol: 'WRONG',
                        description: 'Wrong Match',
                        exchange: 'NYSE',
                        type: 'stock',
                        found_by_isin: false,
                        currency_code: 'USD',
                        isin: 'WRONG',
                        country: 'US',
                    },
                    {
                        symbol: 'MUV2',
                        description: 'Munich Re',
                        exchange: 'GETTEX',
                        type: 'stock',
                        found_by_isin: true,
                        currency_code: 'EUR',
                        isin: 'DE0008430026',
                        country: 'DE',
                    },
                ],
            };

            nock('https://symbol-search.tradingview.com')
                .get('/symbol_search/v3')
                .query(true)
                .reply(200, mockResponse);

            const resolver = new TradingViewResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(1);
            expect(results[0].symbol).toBe('GETTEX:MUV2');
            expect(results[0].exchange).toBe('GETTEX');
        });

        it('should return empty array for invalid ISIN', async () => {
            const resolver = new TradingViewResolver();

            const result1 = await resolver.resolveSymbol(null as unknown as string);
            const result2 = await resolver.resolveSymbol('');
            const result3 = await resolver.resolveSymbol(123 as unknown as string);

            expect(Array.isArray(result1)).toBe(true);
            expect(result1.length).toBe(0);
            expect(Array.isArray(result2)).toBe(true);
            expect(result2.length).toBe(0);
            expect(Array.isArray(result3)).toBe(true);
            expect(result3.length).toBe(0);
        });

        it('should return empty array when no ISIN matches found', async () => {
            const mockResponse = {
                symbols: [],
            };

            nock('https://symbol-search.tradingview.com')
                .get('/symbol_search/v3')
                .query(true)
                .reply(200, mockResponse);

            const resolver = new TradingViewResolver();
            const results = await resolver.resolveSymbol('INVALID123');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(0);
        });

        it('should return empty array when API request fails', async () => {
            nock('https://symbol-search.tradingview.com')
                .get('/symbol_search/v3')
                .query(true)
                .reply(500, { error: 'Internal Server Error' });

            const resolver = new TradingViewResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(0);
        });
    });
});
