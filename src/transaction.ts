import { logger } from "./utils/logger.ts";
import { isValidIsin } from "./utils/validate.ts";

export enum TransactionType {
    BUY = 'buy',
    SELL = 'sell',
    DIVIDEND = 'dividend',
    INTEREST = 'interest',
    FEE = 'fee',
    TAX = 'tax',
    LIABILITY = 'liability',
    CANCELED = 'canceled',
    REFUND = 'refund',
    PAYMENT = 'payment',
    TRANSFER = 'transfer',
    DEPOSIT = 'deposit',
    WITHDRAWAL = 'withdrawal',
    VERIFICATION = 'verification',
    GIFT = 'gift',
}

export interface Transaction {
    /** Unique identifier (hash or UUID) */
    id?: string;
    /** Transaction type */
    type: TransactionType;
    /** Transaction status */
    status?: string;
    /** ISIN code (required) */
    isin?: string;
    /** Trading symbol (optional, resolved by MarketDataService) */
    symbol?: string;
    /** Asset type */
    assetType?: string;
    /** Security name */
    name?: string;
    /** Number of shares/units */
    shares?: number;
    /** Price per share/unit */
    price?: number;
    /** Total amount, which can be positive or negative. In other words, this is how the transaction affected the cash balance. */
    amount?: number;
    /** Transaction fees */
    fee?: number;
    /** Taxes withheld */
    tax?: number;
    /** Transaction date */
    date?: Date;
    /** ISO 4217 currency code (e.g., 'EUR', 'USD') */
    currency?: string;
    /** Comment or description */
    comment?: string;
    /** Source metadata */
    source?: string;
}

const TRANSACTION_TYPE_ALIASES: Record<string, TransactionType> = {
    distribution: TransactionType.DIVIDEND,
    taxes: TransactionType.TAX,
};

export function parseTransactionType(type?: string): TransactionType | null {
    if (!type) return null;
    const normalized = type.toLowerCase().trim();

    if (Object.values(TransactionType).includes(normalized as TransactionType)) {
        return normalized as TransactionType;
    }

    return TRANSACTION_TYPE_ALIASES[normalized] ?? null;
}

export function validateTransaction(tx: Transaction | null | undefined): tx is Transaction {
    if (!tx) return false;

    if (!tx.type) {
        logger.error({ tx }, `Missing type`);
        return false;
    }

    if (tx.type == TransactionType.BUY || tx.type == TransactionType.SELL || tx.type == TransactionType.DIVIDEND) {
        if (!tx.isin || !isValidIsin(tx.isin)) {
            logger.error({ tx }, `Invalid ISIN: ${tx.isin}`);
            return false;
        }
    }

    if (tx.shares && tx.shares < 0) {
        logger.error({ tx }, `Shares must be non-negative: ${tx.shares}`);
        return false;
    }

    if (tx.price && tx.price < 0) {
        logger.error({ tx }, `Price must be non-negative: ${tx.price}`);
        return false;
    }

    if (tx.fee && tx.fee < 0) {
        logger.error({ tx }, `Fee must be non-negative: ${tx.fee}`);
        return false;
    }

    return true;
}
