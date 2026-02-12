import nock from 'nock';
import { describe, it, expect, afterEach } from '@jest/globals';
import { YahooResolver } from './yahoo.ts';

describe('YahooResolver', () => {
    afterEach(() => {
        nock.cleanAll();
    });

    describe('resolveSymbol', () => {
        it.skip('live test', async () => {
            const resolver = new YahooResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(1);
        });

        it('should resolve ISIN to symbol', async () => {
            const mockResponse = {
                quotes: [
                    {
                        symbol: 'MUV2.DE',
                        shortname: 'Munich Re',
                        exchange: 'GER',
                        quoteType: 'EQUITY',
                        isYahooFinance: true,
                    },
                ],
            };

            nock('https://query2.finance.yahoo.com')
                .get('/v1/finance/search')
                .query((query) => query.q === 'DE0008430026')
                .reply(200, mockResponse);

            const resolver = new YahooResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(1);
            expect(results[0].symbol).toBe('MUV2.DE');
            expect(results[0].name).toBe('Munich Re');
            expect(results[0].exchange).toBe('GER');
            expect(results[0].type).toBe('EQUITY');
            expect(results[0].isin).toBe('DE0008430026');
        });

        it('should return empty array when no quotes found', async () => {
            const mockResponse = {
                quotes: [],
            };

            nock('https://query2.finance.yahoo.com')
                .get('/v1/finance/search')
                .query(true)
                .reply(200, mockResponse);

            const resolver = new YahooResolver();
            const results = await resolver.resolveSymbol('INVALID123');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(0);
        });

        it('should return empty array for invalid ISIN', async () => {
            const resolver = new YahooResolver();

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

        it('should return empty array when API request fails', async () => {
            nock('https://query2.finance.yahoo.com')
                .get('/v1/finance/search')
                .query(true)
                .reply(500, { error: 'Internal Server Error' });

            const resolver = new YahooResolver();
            const results = await resolver.resolveSymbol('DE0008430026');

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(0);
        });
    });
});
