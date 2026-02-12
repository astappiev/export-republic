import fs from 'fs';
import { type Symbol } from '../resolvers/index.ts';
import { CacheService, type SplitRow, type PriceRow } from './cache.ts';

const TEST_DB = './test-cache.db';

describe('CacheService', () => {
    let cache: CacheService;

    beforeAll(() => {
        if (fs.existsSync(TEST_DB)) {
            fs.unlinkSync(TEST_DB);
        }
        cache = new CacheService(TEST_DB);
    });

    afterAll(() => {
        cache.close();
        if (fs.existsSync(TEST_DB)) {
            fs.unlinkSync(TEST_DB);
        }
    });

    test('should initialize schema and database file', () => {
        expect(fs.existsSync(TEST_DB)).toBe(true);
    });

    test('should set and get symbol info', async () => {
        const isin = 'US0378331005';
        const info: Symbol = {
            isin,
            symbol: 'AAPL',
            name: 'Apple Inc.',
            exchange: 'NASDAQ',
            type: 'EQUITY',
            currency: 'USD',
            resolver: 'yahoo',
        };

        cache.setSymbol(isin, info);
        const cached = await cache.getSymbol(isin);

        expect(cached).not.toBeNull();
        expect(cached!.isin).toBe(isin);
        expect(cached!.symbol).toBe(info.symbol);
        expect(cached!.name).toBe(info.name);
        expect(cached!.exchange).toBe(info.exchange);
        expect(cached!.currency).toBe(info.currency);
        expect(cached!.resolver).toBe(info.resolver);
        expect(cached!.updatedAt).toBeTruthy();
    });

    test('should return null for non-existent symbol', async () => {
        const cached = await cache.getSymbol('NON-EXISTENT');
        expect(cached).toBeNull();
    });

    test('should filter symbol by multiple criteria', async () => {
        const isin = 'FILTER-TEST';
        const info1: Symbol = {
            isin,
            symbol: 'S1',
            exchange: 'X1',
            currency: 'EUR',
            resolver: 'R1',
        };
        const info2: Symbol = {
            isin,
            symbol: 'S2',
            exchange: 'X2',
            currency: 'USD',
            resolver: 'R2',
        };

        cache.setSymbol(isin, info1);
        cache.setSymbol(isin, info2);

        // Filter by resolver
        const res1 = await cache.getSymbol(isin, { resolver: 'R1' });
        expect(res1?.symbol).toBe('S1');

        const res2 = await cache.getSymbol(isin, { resolver: 'R2' });
        expect(res2?.symbol).toBe('S2');

        // Filter by currency
        const res3 = await cache.getSymbol(isin, { currency: 'EUR' });
        expect(res3?.symbol).toBe('S1');

        // Filter by exchange
        const res4 = await cache.getSymbol(isin, { exchange: 'X1' });
        expect(res4?.symbol).toBe('S1');

        // Non-matching criteria
        const res5 = await cache.getSymbol(isin, { currency: 'XYZ' });
        expect(res5).toBeNull();
    });

    test('should handle TTL', async () => {
        const isin = 'TTL-TEST';
        const info = { symbol: 'TTL', name: 'TTL Test', source: 'test' };

        // Manually insert an old record
        const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 days ago
        cache.db
            .prepare(
                `INSERT INTO symbols (isin, symbol, name, source, updated_at)
             VALUES (?, ?, ?, ?, ?)`
            )
            .run(isin, info.symbol, info.name ?? null, info.source, oldTimestamp);

        const cached = await cache.getSymbol(isin);
        expect(cached).toBeNull();
    });

    test('should add and get splits', () => {
        const isin = 'DE0007100000';
        const split: SplitRow = {
            isin,
            type: 'SPLIT',
            ratio_from: 1,
            ratio_to: 10,
            effective_date: '2023-01-01',
            source: 'manual',
        };

        cache.addSplit(split);
        const splits = cache.getSplits(isin);

        expect(splits.length).toBe(1);
        expect(splits[0].isin).toBe(isin);
        expect(splits[0].ratio_from).toBe(1);
        expect(splits[0].ratio_to).toBe(10);
        expect(splits[0].effective_date).toBe('2023-01-01');
    });

    test('should set and get prices', () => {
        const isin = 'US0378331005';
        const date = '2024-02-01';
        const priceInfo: PriceRow = { price: 185.25, currency: 'USD' };

        cache.setPrice(isin, priceInfo, date);
        const cached = cache.getPrice(isin, date);

        expect(cached).not.toBeNull();
        expect(cached!.isin).toBe(isin);
        expect(cached!.price).toBe(priceInfo.price);
        expect(cached!.currency).toBe(priceInfo.currency);
        expect(cached!.date).toBe(date);
    });

    test('should handle price TTL', () => {
        const isin = 'PRICE-TTL-TEST';
        const date = '2024-01-01';
        const priceInfo: PriceRow = { price: 100, currency: 'EUR' };

        // Manually insert an old record (more than 24 hours ago)
        const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000;
        cache.db
            .prepare(
                `INSERT INTO prices (isin, price, currency, date, updated_at)
             VALUES (?, ?, ?, ?, ?)`
            )
            .run(isin, priceInfo.price, priceInfo.currency, date, oldTimestamp);

        const cached = cache.getPrice(isin, date);
        expect(cached).toBeNull();
    });

    test('should prune old entries', () => {
        const olderThan = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
        const count = cache.prune(olderThan);
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should destroy cache', () => {
        cache.destroy();
        const symbols = cache.db.prepare('SELECT count(*) as count FROM symbols').get() as { count: number };
        expect(symbols.count).toBe(0);
    });
});
