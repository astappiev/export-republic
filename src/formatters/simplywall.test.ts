import { SimplywallFormatter } from './simplywall.ts';
import { TransactionType, type Transaction } from "../transaction.ts";

describe('SimplywallFormatter', () => {
    describe('format', () => {
        it('should return only header for empty data', async () => {
            const formatter = new SimplywallFormatter();
            const result = await formatter.formatTransactions([]);
            const lines = result.trim().split(/\r?\n/);
            expect(lines.length).toBe(1);
            expect(lines[0]).toBe('ISIN,Transaction type,Date,Shares,Price,Currency');
        });

        it('should format buy transaction with exchange prefix', async () => {
            const formatter = new SimplywallFormatter();
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
            expect(lines[1]).toBe('DE0008430026,buy,2026/01/02,10,197.86,EUR');
        });

        it('should format sell transaction', async () => {
            const formatter = new SimplywallFormatter();
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
            expect(lines[1]).toBe('DE0008430026,sell,2026/02/06,1,170.74,EUR');
        });

        it('should format deposit transaction', async () => {
            const formatter = new SimplywallFormatter();
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
            expect(lines.length).toBe(1);
        });

        it('should format multiple transactions correctly', async () => {
            const formatter = new SimplywallFormatter();
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
            expect(lines.length).toBe(3);
            expect(lines[0]).toBe('ISIN,Transaction type,Date,Shares,Price,Currency');
            expect(lines[1]).toBe('US0378331005,buy,2024/09/17,10,217,EUR');
            expect(lines[2]).toBe('US0378331005,sell,2024/09/18,10,240.01,EUR');
        });
    });
});
