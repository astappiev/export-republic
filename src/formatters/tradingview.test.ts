import { TradingViewFormatter } from './tradingview.ts';
import { MarketDataService } from '../services/market-data.ts';
import { TransactionType, type Transaction } from '../readers/index.ts';

describe('TradingviewFormatter', () => {
    const mockMarketDataService = {
        resolveSymbol: async (isin: string) => {
            const exchangeMap: Record<string, { symbol: string; exchange: string; currency: string }> = {
                DE0008430026: { symbol: 'GETTEX:AMZ', exchange: 'GETTEX', currency: 'EUR' },
                US5949181045: { symbol: 'GETTEX:NFC', exchange: 'GETTEX', currency: 'EUR' },
                IE00BZ12WP82: { symbol: 'GETTEX:CJ6', exchange: 'GETTEX', currency: 'EUR' },
                US5951121038: { symbol: 'GETTEX:ORC', exchange: 'GETTEX', currency: 'EUR' },
                US0090661010: { symbol: 'GETTEX:ASME', exchange: 'GETTEX', currency: 'EUR' },
                FR0000120073: { symbol: 'GETTEX:AIR', exchange: 'GETTEX', currency: 'EUR' },
                DE0005140008: { symbol: 'GETTEX:ABEA', exchange: 'GETTEX', currency: 'EUR' },
                DE0007500001: { symbol: 'GETTEX:RRU', exchange: 'GETTEX', currency: 'EUR' },
                TKE123456789: { symbol: 'GETTEX:TKE', exchange: 'TRADEGATE', currency: 'EUR' },
                US5949181046: { symbol: 'GETTEX:MSF', exchange: 'GETTEX', currency: 'EUR' },
                US0378331005: { symbol: 'NASDAQ:AAPL', exchange: 'NASDAQ', currency: 'USD' },
            };
            return exchangeMap[isin] || null;
        },
    } as MarketDataService;

    describe('format', () => {
        it('should return only header for empty data', async () => {
            const formatter = new TradingViewFormatter(mockMarketDataService);
            const result = await formatter.formatTransactions([]);
            const lines = result.trim().split(/\r?\n/);
            expect(lines.length).toBe(1);
            expect(lines[0]).toBe('Symbol,Side,Qty,Fill Price,Commission,Closing Time');
        });

        it('should format buy transaction with exchange prefix', async () => {
            const formatter = new TradingViewFormatter(mockMarketDataService);
            const transactions: Transaction[] = [
                {
                    isin: 'DE0008430026',
                    type: TransactionType.BUY,
                    shares: 10,
                    price: 197.86,
                    fee: 1,
                    tax: 0,
                    currency: 'EUR',
                    date: new Date('2026-01-02T06:00:00Z'),
                },
            ];

            const result = await formatter.formatTransactions(transactions);
            const lines = result.trim().split(/\r?\n/);
            expect(lines.length).toBe(2);
            expect(lines[1]).toBe('GETTEX:AMZ,Buy,10,197.86,1,2026-01-02 06:00:00');
        });

        it('should format sell transaction', async () => {
            const formatter = new TradingViewFormatter(mockMarketDataService);
            const transactions: Transaction[] = [
                {
                    isin: 'DE0008430026',
                    type: TransactionType.SELL,
                    shares: 1,
                    price: 170.74,
                    fee: 0,
                    tax: 0,
                    currency: 'EUR',
                    date: new Date('2026-02-06T20:24:10Z'),
                },
            ];

            const result = await formatter.formatTransactions(transactions);
            const lines = result.trim().split(/\r?\n/);
            expect(lines[1]).toBe('GETTEX:AMZ,Sell,1,170.74,0,2026-02-06 20:24:10');
        });

        it('should format deposit transaction', async () => {
            const formatter = new TradingViewFormatter(mockMarketDataService);
            const transactions: Transaction[] = [
                {
                    type: TransactionType.DEPOSIT,
                    amount: 14545,
                    currency: 'EUR',
                    date: new Date('2024-01-09T00:00:00Z'),
                },
            ];

            const result = await formatter.formatTransactions(transactions);
            const lines = result.trim().split(/\r?\n/);
            expect(lines[1]).toBe('$CASH,Deposit,14545,0,0,2024-01-09 00:00:00');
        });

        it('should format dividend transaction', async () => {
            const formatter = new TradingViewFormatter(mockMarketDataService);
            const transactions: Transaction[] = [
                {
                    isin: 'US5949181046',
                    type: TransactionType.DIVIDEND,
                    amount: 3.49780798,
                    currency: 'EUR',
                    date: new Date('2024-03-14T00:00:00Z'),
                },
            ];

            const result = await formatter.formatTransactions(transactions);
            const lines = result.trim().split(/\r?\n/);
            expect(lines[1]).toBe('GETTEX:MSF,Dividend,3.49780798,0,0,2024-03-14 00:00:00');
        });

        it('should format multiple transactions correctly', async () => {
            const formatter = new TradingViewFormatter(mockMarketDataService);
            const transactions: Transaction[] = [
                {
                    isin: 'US0378331005',
                    type: TransactionType.BUY,
                    shares: 10,
                    price: 217,
                    date: new Date('2024-09-17T00:00:00Z'),
                },
                {
                    isin: 'US0378331005',
                    type: TransactionType.SELL,
                    shares: 10,
                    price: 240.01,
                    date: new Date('2024-09-18T00:00:00Z'),
                },
                {
                    isin: 'US0378331005',
                    type: TransactionType.DIVIDEND,
                    amount: 0.25,
                    date: new Date('2024-11-14T00:00:00Z'),
                },
                {
                    type: TransactionType.WITHDRAWAL,
                    amount: -2000,
                    date: new Date('2024-08-25T01:20:12Z'),
                },
                {
                    type: TransactionType.DEPOSIT,
                    amount: 5000,
                    date: new Date('2024-08-24T00:00:00Z'),
                },
                {
                    type: TransactionType.TAX,
                    amount: -10.25,
                    date: new Date('2023-08-25T10:37:00Z'),
                },
            ];

            const result = await formatter.formatTransactions(transactions);
            const lines = result.trim().split(/\r?\n/);
            expect(lines.length).toBe(7);
            expect(lines[0]).toBe('Symbol,Side,Qty,Fill Price,Commission,Closing Time');
            expect(lines[1]).toBe('NASDAQ:AAPL,Buy,10,217,0,2024-09-17 00:00:00');
            expect(lines[2]).toBe('NASDAQ:AAPL,Sell,10,240.01,0,2024-09-18 00:00:00');
            expect(lines[3]).toBe('NASDAQ:AAPL,Dividend,0.25,0,0,2024-11-14 00:00:00');
            expect(lines[4]).toBe('$CASH,Withdrawal,2000,0,0,2024-08-25 01:20:12');
            expect(lines[5]).toBe('$CASH,Deposit,5000,0,0,2024-08-24 00:00:00');
            expect(lines[6]).toBe('$CASH,Taxes and fees,10.25,0,0,2023-08-25 10:37:00');
        });
    });
});
