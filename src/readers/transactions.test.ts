import { TransactionsReader } from './transactions.ts';
import { AssetType, TransactionType } from "../transaction.ts";

describe('TransactionsReader', () => {
    const reader = new TransactionsReader();

    test('parses valid CSV rows into transactions', async () => {
        const inputContent = [
            'id,type,status,isin,symbol,assetType,name,shares,price,amount,fee,tax,date,currency,comment,source',
            'tx-001,buy,executed,IE00B4L5Y983,IWDA,ETF,iShares Core MSCI World,10.5,82.34,-864.57,1,0,2025-06-15T10:30:00.000Z,EUR,Monthly DCA,traderepublic-ws',
        ].join('\n');

        const result = await reader.readTransactions({ inputContent: inputContent });

        expect(result).toHaveLength(1);
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
        expect(buy.fee).toBe(1);
        expect(buy.tax).toBe(0);
        expect(buy.date).toEqual(new Date('2025-06-15T10:30:00.000Z'));
        expect(buy.currency).toBe('EUR');
        expect(buy.comment).toBe('Monthly DCA');
        expect(buy.source).toBe('traderepublic-ws');
    });

    test('handles sparse fields (undefined for missing values)', async () => {
        const inputContent = [
            'id,type,status,isin,symbol,assetType,name,shares,price,amount,fee,tax,date,currency,comment,source',
            'tx-002,dividend,,US0378331005,,,Apple Inc.,5,,3.75,,,2025-07-01T00:00:00.000Z,USD,,traderepublic-ws',
        ].join('\n');

        const result = await reader.readTransactions({ inputContent: inputContent });

        expect(result).toHaveLength(1);
        const div = result[0];
        expect(div.id).toBe('tx-002');
        expect(div.type).toBe(TransactionType.DIVIDEND);
        expect(div.isin).toBe('US0378331005');
        expect(div.shares).toBe(5);
        expect(div.amount).toBe(3.75);
        expect(div.symbol).toBeUndefined();
        expect(div.fee).toBeUndefined();
        expect(div.tax).toBeUndefined();
    });

    test('rejects rows with invalid transaction type', async () => {
        const inputContent = [
            'id,type,status,isin,symbol,assetType,name,shares,price,amount,fee,tax,date,currency,comment,source',
            'tx-bad,invalid_type,,,,,,,,,,,,,,',
            'tx-ok,buy,,IE00B4L5Y983,,,,10,80,-800,,,2025-01-01T00:00:00.000Z,EUR,,',
        ].join('\n');

        const result = await reader.readTransactions({ inputContent: inputContent });
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(TransactionType.BUY);
    });

    test('handles empty file (header only)', async () => {
        const inputContent = 'id,type,status,isin,symbol,assetType,name,shares,price,amount,fee,tax,date,currency,comment,source\n';

        const result = await reader.readTransactions({ inputContent: inputContent });
        expect(result).toHaveLength(0);
    });

    test('parses minimal deposit (no id, isin, or symbol)', async () => {
        const inputContent = [
            'id,type,status,isin,symbol,assetType,name,shares,price,amount,fee,tax,date,currency,comment,source',
            ',deposit,,,,,,,,500,,,2025-08-01T12:00:00.000Z,EUR,,',
        ].join('\n');

        const result = await reader.readTransactions({ inputContent: inputContent });

        expect(result).toHaveLength(1);
        const dep = result[0];
        expect(dep.type).toBe(TransactionType.DEPOSIT);
        expect(dep.amount).toBe(500);
        expect(dep.id).toBeUndefined();
        expect(dep.isin).toBeUndefined();
    });
});
