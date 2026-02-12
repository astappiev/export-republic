import { PortfolioPerformanceFormatter } from './portfolio-performance.ts';
import { MarketDataService } from '../services/market-data.ts';
import { TransactionType, type Transaction } from '../readers/index.ts';

describe('PortfolioPerformanceFormatter', () => {
    const mockMarketDataService = {
        getSymbolFromISIN: async (isin: string) => isin,
    } as unknown as MarketDataService;

    describe('format', () => {
        it('should format transactions correctly', async () => {
            const formatter = new PortfolioPerformanceFormatter(mockMarketDataService);
            const date = new Date('2023-01-01T12:00:00Z');

            const transactions: Transaction[] = [
                {
                    id: '1',
                    date: date,
                    type: TransactionType.BUY,
                    isin: 'US0378331005',
                    name: 'Apple Inc.',
                    shares: 10,
                    price: 150.0,
                    fee: 5.0,
                    tax: 2.0,
                    currency: 'USD',
                    source: 'test'
                },
                {
                    id: '2',
                    date: date,
                    type: TransactionType.DIVIDEND,
                    isin: 'US0378331005',
                    name: 'Apple Inc.',
                    shares: 10,
                    price: 0,
                    amount: 2.5, // Dividend value
                    currency: 'USD',
                    source: 'test'
                }
            ];

            const result = await formatter.formatTransactions(transactions);
            const lines = result.trim().split('\n');

            // Header
            expect(lines[0]).toBe('Date;Type;Security name;ISIN;Note;Shares;Operation currency;Fees;Taxes/Charges;Value');

            // Buy transaction
            // Date;Type;Security name;ISIN;Note;Shares;Operation currency;Fees;Taxes/Charges;Value
            // 2023-01-01;Buy;Apple Inc.;US0378331005;;10;USD;5;2;1500
            const buyLine = lines[1].split(';');
            expect(buyLine[0]).toBe('2023-01-01');
            expect(buyLine[1]).toBe('Buy');
            expect(buyLine[2]).toBe('Apple Inc.');
            expect(buyLine[3]).toBe('US0378331005');
            expect(buyLine[5]).toBe('10');
            expect(buyLine[6]).toBe('USD');
            expect(buyLine[7]).toBe('5');
            expect(buyLine[8]).toBe('2');
            expect(buyLine[9]).toBe('1500');

            // Dividend transaction
            // 2023-01-01;Dividend;Apple Inc.;US0378331005;;10;USD;0;0;2.5
            const divLine = lines[2].split(';');
            expect(divLine[1]).toBe('Dividend');
            expect(divLine[9]).toBe('2.5');
        });
    });
});
