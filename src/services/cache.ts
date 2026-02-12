import Database from 'better-sqlite3';
import { type Symbol, type SymbolOptions } from '../resolvers/index.ts';

/**
 * Cached price info from the database
 */
export interface CachedPrice {
    isin: string;
    price: number;
    currency: string;
    date: string;
    updatedAt: string;
}

interface SymbolRow {
    isin: string;
    symbol: string;
    name: string | null;
    exchange: string | null;
    country: string | null;
    type: string | null;
    currency: string | null;
    source: string;
    updated_at: number;
}

export interface SplitRow {
    isin: string;
    type: string;
    ratio_from: number;
    ratio_to: number;
    effective_date: string;
    source: string | null;
}

export interface PriceRow {
    isin?: string;
    price: number;
    currency: string;
    date?: string;
    updated_at?: number;
}

export class CacheService {
    public db: Database.Database;

    /**
     * @param path - Path to the SQLite database file
     */
    constructor(path: string = './cache.db') {
        this.db = new Database(path);
        this.initSchema();
    }


    /**
     * Initialize the database schema
     */
    private initSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS symbols (
                isin TEXT NOT NULL,
                symbol TEXT NOT NULL,
                name TEXT,
                exchange TEXT,
                country VARCHAR(2),
                type TEXT,
                currency TEXT,
                source TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(isin, source)
            );

            CREATE INDEX IF NOT EXISTS idx_symbols_source ON symbols(source);

            CREATE TABLE IF NOT EXISTS splits (
                isin TEXT NOT NULL,
                type TEXT NOT NULL,
                ratio_from REAL NOT NULL,
                ratio_to REAL NOT NULL,
                effective_date TEXT NOT NULL,
                source TEXT,
                PRIMARY KEY(isin, effective_date)
            );

            CREATE TABLE IF NOT EXISTS prices (
                isin TEXT NOT NULL,
                price REAL NOT NULL,
                currency TEXT NOT NULL,
                date TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(isin, date)
            );
        `);

        // Migration: add country column if not exists
        try {
            this.db.prepare('SELECT country FROM symbols LIMIT 1').get();
        } catch {
            this.db.exec('ALTER TABLE symbols ADD COLUMN country VARCHAR(2) DEFAULT NULL');
        }
    }

    /**
     * Get symbol info from cache
     * @param isin - ISIN code
     * @param options - Optional filters
     * @returns Symbol info or null
     */
    async getSymbol(isin: string, options: SymbolOptions = {}): Promise<Symbol | null> {
        const conditions = ['isin = ?'];
        const params: (string | number)[] = [isin];

        if (options.currency) {
            conditions.push('currency = ?');
            params.push(options.currency);
        }

        if (options.country) {
            conditions.push('country = ?');
            params.push(options.country);
        }

        if (options.exchange) {
            conditions.push('exchange = ?');
            params.push(options.exchange);
        }

        if (options.resolver) {
            conditions.push('source = ?');
            params.push(options.resolver);
        }

        const ttlLimit = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
        conditions.push('updated_at > ?');
        params.push(ttlLimit);

        const query = `SELECT * FROM symbols WHERE ${conditions.join(' AND ')}`;
        const row = this.db.prepare(query).get(...params) as SymbolRow | undefined;
        if (!row) return null;

        return {
            isin: row.isin,
            symbol: row.symbol,
            name: row.name ?? undefined,
            exchange: row.exchange ?? undefined,
            country: row.country ?? undefined,
            type: row.type ?? undefined,
            currency: row.currency ?? undefined,
            resolver: row.source,
            updatedAt: new Date(row.updated_at).toISOString(),
        };
    }

    /**
     * Set symbol info in cache
     * @param isin - ISIN code
     * @param info - Symbol info
     */
    setSymbol(isin: string, info: Symbol): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO symbols (isin, symbol, name, exchange, country, type, currency, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            isin,
            info.symbol,
            info.name ?? null,
            info.exchange ?? null,
            info.country ?? null,
            info.type ?? null,
            info.currency ?? null,
            info.resolver ?? null,
            Date.now()
        );
    }

    /**
     * Get splits for an ISIN
     * @param isin - ISIN code
     * @returns Array of splits
     */
    getSplits(isin: string): SplitRow[] {
        const result = this.db.prepare('SELECT * FROM splits WHERE isin = ? ORDER BY effective_date DESC').all(isin);
        return result as SplitRow[];
    }

    /**
     * Add a split to cache
     * @param split - Split info
     */
    addSplit(split: SplitRow): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO splits (isin, type, ratio_from, ratio_to, effective_date, source)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            split.isin,
            split.type,
            split.ratio_from,
            split.ratio_to,
            split.effective_date,
            split.source ?? null
        );
    }

    /**
     * Get price from cache
     * @param isin - ISIN code
     * @param date - Date in YYYY-MM-DD format (optional, defaults to latest)
     * @returns Price info or null
     */
    getPrice(isin: string, date?: string): CachedPrice | null {
        const ttlLimit = Date.now() - (24 * 60 * 60 * 1000);
        let row: PriceRow | undefined;
        if (date) {
            row = this.db.prepare('SELECT * FROM prices WHERE isin = ? AND date = ? AND updated_at > ?').get(isin, date, ttlLimit) as PriceRow | undefined;
        } else {
            row = this.db.prepare('SELECT * FROM prices WHERE isin = ? AND updated_at > ? ORDER BY date DESC LIMIT 1').get(isin, ttlLimit) as PriceRow | undefined;
        }

        if (!row) return null;

        return {
            isin: row?.isin || '',
            price: row.price,
            currency: row.currency,
            date: row?.date || '',
            updatedAt: new Date(row?.updated_at || 0).toISOString(),
        };
    }

    /**
     * Set price in cache
     * @param isin - ISIN code
     * @param priceInfo - Price info
     * @param date - Date in YYYY-MM-DD format
     */
    setPrice(isin: string, priceInfo: PriceRow, date: string): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO prices (isin, price, currency, date, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(isin, priceInfo.price, priceInfo.currency, date, Date.now());
    }

    /**
     * Prune old cache entries
     * @param olderThan - Date to prune before
     * @returns Number of rows deleted
     */
    prune(olderThan: Date): number {
        const timestamp = olderThan.getTime();
        const result = this.db.prepare('DELETE FROM symbols WHERE updated_at < ?').run(timestamp) as { changes: number };
        const resultPrices = this.db.prepare('DELETE FROM prices WHERE updated_at < ?').run(timestamp) as { changes: number };
        return result.changes + resultPrices.changes;
    }

    /**
     * Destroy the cache (delete all data)
     */
    destroy(): void {
        this.db.prepare('DELETE FROM symbols').run();
        this.db.prepare('DELETE FROM splits').run();
        this.db.prepare('DELETE FROM prices').run();
    }

    /**
     * Close the database connection
     */
    close(): void {
        this.db.close();
    }
}
