import { TransactionsFormatter, HEADERS } from './transactions.ts';
import { TransactionsReader } from '../readers/transactions.ts';
import { AssetType, TransactionType, type Transaction } from "../transaction.ts";

const SAMPLE_TRANSACTIONS: Transaction[] = [
    {
        id: 'tx-001',
        type: TransactionType.BUY,
        status: 'executed',
        isin: 'IE00B4L5Y983',
        symbol: 'IWDA',
        assetType: AssetType.ETF,
        name: 'iShares Core MSCI World',
        shares: 10.5,
        price: 82.34,
        amount: -864.57,
        fee: 1.0,
        tax: 0,
        date: new Date('2025-06-15T10:30:00.000Z'),
        currency: 'EUR',
        comment: 'Monthly DCA',
        source: 'traderepublic-ws',
    },
    {
        id: 'tx-002',
        type: TransactionType.DIVIDEND,
        isin: 'US0378331005',
        assetType: AssetType.STOCK,
        name: 'Apple Inc.',
        shares: 5,
        amount: 3.75,
        date: new Date('2025-07-01T00:00:00.000Z'),
        currency: 'USD',
        source: 'traderepublic-ws',
    },
    {
        type: TransactionType.DEPOSIT,
        assetType: AssetType.CASH,
        amount: 500,
        date: new Date('2025-08-01T12:00:00.000Z'),
        currency: 'EUR',
    },
];

describe('TransactionsFormatter', () => {
    const formatter = new TransactionsFormatter();

    test('produces valid CSV with headers', async () => {
        const csv = await formatter.formatTransactions(SAMPLE_TRANSACTIONS);
        const lines = csv.trim().split(/\r?\n/);

        expect(lines[0]).toBe('id,type,status,isin,symbol,assetType,name,shares,price,amount,fee,tax,date,currency,comment,source');
        expect(lines).toHaveLength(4); // header + 3 rows
    });

    test('HEADERS constant matches expected fields', () => {
        expect(HEADERS).toEqual([
            'id', 'type', 'status', 'isin', 'symbol', 'assetType', 'name',
            'shares', 'price', 'amount', 'fee', 'tax', 'date', 'currency',
            'comment', 'source',
        ]);
    });

    test('serializes dates as ISO strings', async () => {
        const csv = await formatter.formatTransactions([SAMPLE_TRANSACTIONS[0]]);
        const lines = csv.trim().split(/\r?\n/);

        expect(lines[1]).toContain('2025-06-15T10:30:00.000Z');
    });

    test('roundtrip: format then read preserves all fields', async () => {
        const csv = await formatter.formatTransactions(SAMPLE_TRANSACTIONS);

        const reader = new TransactionsReader();
        const result = await reader.readTransactions({ inputContent: csv });

        expect(result).toHaveLength(3);

        // Full BUY transaction
        const buy = result[0];
        expect(buy.id).toBe('tx-001');
        expect(buy.type).toBe(TransactionType.BUY);
        expect(buy.status).toBe('executed');
        expect(buy.isin).toBe('IE00B4L5Y983');
        expect(buy.symbol).toBe('IWDA');
        expect(buy.assetType).toBe(AssetType.ETF);
        expect(buy.name).toBe('iShares Core MSCI World');
        expect(buy.shares).toBe(10.5);
        expect(buy.price).toBe(82.34);
        expect(buy.amount).toBe(-864.57);
        expect(buy.fee).toBe(1.0);
        expect(buy.tax).toBe(0);
        expect(buy.date).toEqual(new Date('2025-06-15T10:30:00.000Z'));
        expect(buy.currency).toBe('EUR');
        expect(buy.comment).toBe('Monthly DCA');
        expect(buy.source).toBe('traderepublic-ws');

        // Dividend with sparse fields
        const div = result[1];
        expect(div.id).toBe('tx-002');
        expect(div.type).toBe(TransactionType.DIVIDEND);
        expect(div.isin).toBe('US0378331005');
        expect(div.assetType).toBe(AssetType.STOCK);
        expect(div.shares).toBe(5);
        expect(div.amount).toBe(3.75);
        expect(div.symbol).toBeUndefined();
        expect(div.fee).toBeUndefined();
        expect(div.tax).toBeUndefined();

        // Minimal deposit
        const dep = result[2];
        expect(dep.type).toBe(TransactionType.DEPOSIT);
        expect(dep.assetType).toBe(AssetType.CASH);
        expect(dep.amount).toBe(500);
        expect(dep.id).toBeUndefined();
        expect(dep.isin).toBeUndefined();
    });
});
