import dateFormat from "dateformat";
import { writeToString, type Row } from '@fast-csv/format';
import { BaseFormatter, type FormatOptions } from './index.ts';
import { TransactionType, type Transaction } from '../readers/index.ts';
import { MarketDataService } from '../services/market-data.ts';
import { logger } from '../utils/logger.ts';

enum TradingViewSide {
    BUY = 'Buy',
    SELL = 'Sell',
    DIVIDEND = 'Dividend',
    DEPOSIT = 'Deposit',
    WITHDRAWAL = 'Withdrawal',
    TAX_AND_FEE = 'Taxes and fees',
}

/**
 * Converts parsed transaction data to TradingView CSV format.
 */
export class TradingViewFormatter extends BaseFormatter {
    private cumulativeTax: number = 0;

    constructor(marketDataService?: MarketDataService) {
        super('tradingview', marketDataService);
    }

    async formatTransactions(transactions: Transaction[], options: FormatOptions = {}): Promise<string> {
        this.cumulativeTax = 0;
        const rows: Row[] = [];

        for (const transaction of transactions) {
            const row = await this.formatTransactionRow(transaction, options);
            if (row) {
                rows.push(row);
            }
        }

        // TradingView doesn't track taxes within orders, therefore we add them like this :/
        if (this.cumulativeTax) {
            const side = this.cumulativeTax > 0 ? TradingViewSide.TAX_AND_FEE : TradingViewSide.DEPOSIT;
            rows.push(['$CASH', side, Math.abs(this.cumulativeTax), 0, 0, this.formatDate(new Date())]);
        }

        return await writeToString(rows, {
            headers: ['Symbol', 'Side', 'Qty', 'Fill Price', 'Commission', 'Closing Time'],
            alwaysWriteHeaders: true,
            delimiter: ',',
        });
    }

    private async formatTransactionRow(tx: Transaction, options: FormatOptions): Promise<Row | null> {
        let symbol: string | null = null;
        let side: string = '';
        let qty: number = 0;
        let fillPrice: number = tx.price || 0;
        let commission: number = tx.fee || 0;

        switch (tx.type) {
            case TransactionType.BUY:
            case TransactionType.SELL:
                symbol = await this.getSymbolWithExchange(tx.isin);
                side = tx.type === TransactionType.SELL ? TradingViewSide.SELL : TradingViewSide.BUY;
                qty = tx.shares || 1;
                if (tx.tax) this.cumulativeTax += tx.tax;
                break;

            case TransactionType.DIVIDEND:
                symbol = await this.getSymbolWithExchange(tx.isin);
                side = TradingViewSide.DIVIDEND;
                qty = tx.amount || 0;
                break;

            case TransactionType.DEPOSIT:
            case TransactionType.INTEREST:
                symbol = '$CASH';
                side = TradingViewSide.DEPOSIT;
                qty = (tx.amount || 0) - Math.abs(tx.fee || 0);
                commission = 0; // TradingView doesn't deduct commission from deposits
                break;

            case TransactionType.WITHDRAWAL:
                symbol = '$CASH';
                side = TradingViewSide.WITHDRAWAL;
                qty = Math.abs(tx.amount || 0) - Math.abs(tx.fee || 0);
                commission = 0; // Probably from withdrawal too
                break;

            case TransactionType.TAX: // Swap taxt refunds to deposits, TradingView doesn't like negative taxes.
            case TransactionType.FEE: // Also referals are paid as positive fees
                symbol = '$CASH';
                side = (tx.amount || 0) > 0 ? TradingViewSide.DEPOSIT : TradingViewSide.TAX_AND_FEE;
                qty = Math.abs(tx.amount || 0);
                commission = 0;
                break;

            default:
                logger.warn({ transaction: tx }, `Unhandeled transaction type: ${tx.type}`);
                return null;
        }

        if (qty < 0 && side !== TradingViewSide.DIVIDEND) {
            logger.warn({ transaction: tx }, `Negative quantity: ${qty}`);
            return null;
        }

        return [
            symbol,
            side,
            qty,
            fillPrice,
            commission,
            this.formatDate(tx.date),
        ];
    }

    /**
     * Get symbol with exchange prefix (e.g., GETTEX:AMZ)
     * Prefers German exchanges: XETR, GETTEX, FWB, SWB.
     */
    async getSymbolWithExchange(isin?: string): Promise<string | null> {
        if (!isin) return null;
        const symbol = await this.marketDataService?.resolveSymbol(isin, { resolver: 'tradingview', currency: "EUR" });
        return symbol?.symbol || null;
    }

    private formatDate(date?: Date): string {
        if (!date) return '';
        return dateFormat(date, "UTC:yyyy-mm-dd HH:MM:ss");
    }
}
