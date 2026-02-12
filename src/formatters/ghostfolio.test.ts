import { GhostfolioFormatter } from './ghostfolio.ts';
import { MarketDataService } from '../services/market-data.ts';
import { TransactionType, type Transaction } from '../readers/index.ts';

describe('GhostfolioFormatter', () => {
    const mockMarketDataService = {
        getSymbolFromISIN: async (isin: string) => {
            if (isin === 'XS2326497802') return 'AAPL';
            if (isin === 'US42809H1077') return 'BAS.DE';
            if (isin === 'MSFT') return 'MSFT';
            if (isin === 'US5949181045') return 'US5949181045';
            return null;
        },
    } as unknown as MarketDataService;

    describe('format', () => {
        it('should return only header for empty data', async () => {
            const formatter = new GhostfolioFormatter(mockMarketDataService);
            const result = await formatter.formatTransactions([]);
            const lines = result.trim().split(/\r?\n/);
            expect(lines.length).toBe(1);
            expect(lines[0]).toBe('Id,Date,Code,DataSource,Currency,Price,Quantity,Action,Fee,Note');
        });

        it('should match documentation example data exactly', async () => {
            const formatter = new GhostfolioFormatter(mockMarketDataService);
            const transactions: Transaction[] = [
                {
                    id: '1',
                    date: new Date('2021-09-01'),
                    isin: 'Account Opening Fee',
                    type: TransactionType.FEE,
                    price: 0,
                    shares: 0,
                    fee: 49,
                    currency: 'USD',
                },
                {
                    id: '2',
                    date: new Date('2021-09-16'),
                    isin: 'MSFT',
                    type: TransactionType.BUY,
                    price: 298.58,
                    shares: 5,
                    fee: 19.0,
                    currency: 'USD',
                    comment: 'My first order 🤓',
                },
                {
                    id: '3',
                    date: new Date('2021-11-17'),
                    isin: 'MSFT',
                    type: TransactionType.DIVIDEND,
                    price: 0.62,
                    shares: 5,
                    fee: 0,
                    currency: 'USD',
                },
                {
                    id: '4',
                    date: new Date('2022-01-01'),
                    isin: 'Penthouse Apartment',
                    type: TransactionType.BUY,
                    price: 500000.0,
                    shares: 1,
                    fee: 0,
                    currency: 'USD',
                },
                {
                    id: '5',
                    date: new Date('2050-06-06'),
                    isin: 'US5949181045',
                    type: TransactionType.BUY,
                    price: 0.0,
                    shares: 0,
                    fee: 0,
                    currency: 'USD',
                },
            ];

            const result = await formatter.formatTransactions(transactions);
            const expectedLines = [
                'Id,Date,Code,DataSource,Currency,Price,Quantity,Action,Fee,Note',
                '1,01-09-2021,Account Opening Fee,MANUAL,USD,0,0,fee,49,',
                '2,16-09-2021,MSFT,YAHOO,USD,298.58,5,buy,19,My first order 🤓',
                '3,17-11-2021,MSFT,YAHOO,USD,0.62,5,dividend,0,',
                '4,01-01-2022,Penthouse Apartment,MANUAL,USD,500000,1,buy,0,',
                '5,06-06-2050,US5949181045,YAHOO,USD,0,0,buy,0,',
            ];

            const actualLines = result.trim().split(/\r?\n/);

            // Check lines one by one for easier debugging
            expect(actualLines[0]).toBe(expectedLines[0]);
            expect(actualLines[1]).toBe(expectedLines[1]);
            expect(actualLines[2]).toBe(expectedLines[2]);
            expect(actualLines[3]).toBe(expectedLines[3]);
            expect(actualLines[4]).toBe(expectedLines[4]);
            expect(actualLines[5]).toBe(expectedLines[5]);
        });
    });
});
