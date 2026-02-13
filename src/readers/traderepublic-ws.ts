import { logger } from '../utils/logger.ts';
import WebSocket from 'ws';
import promptly from 'promptly';
import { BaseReader, type Transaction, type ReaderOptions, TransactionType } from './index.ts';
import { parseAmount } from '../utils/parse.ts';

const API_BASE = 'https://api.traderepublic.com';
const WS_URL = 'wss://api.traderepublic.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

// Cached regex patterns for better performance
const PHONE_REGEX = /^\+\d+$/;
const PIN_REGEX = /^\d{4}$/;
const CODE_REGEX = /^\d{4}$/;
const LOGO_ISIN_REGEX = /logos\/([0-9A-Z]{12})(?:\/|$)/i;

/**
 * Raw transaction data from TradeRepublic API
 */
interface RawTransaction {
    [key: string]: unknown;
    id: string;
    timestamp?: string;
    title?: string;
    subtitle?: string;
    status?: string;
    amount?: { value: number; currency: string };
    isin?: string;
    event?: string;
    orderType?: string;
    shares?: string;
    sharePrice?: string;
    dividendPerShare?: string;
    repayment?: string;
    annualRate?: string;
    coupon?: string;
    fee?: string;
    tax?: string;
    total?: string;
    saveback?: boolean;
    cardRefund?: string;
    cardPayment?: string;
    transfer?: boolean;
    from?: string;
    sender?: string;
    iban?: string;
    cardVerification?: boolean;
    giftAmount?: number;
    accrued?: number;
    averageBalance?: number;
    couponPayment?: string;
    transaction?: string;
}

interface TradeRepublicWsOptions extends ReaderOptions {
    /** Phone number for authentication */
    phone?: string;
    /** Whether to show the session token in the output */
    showToken?: boolean;
    /** Session token for authentication (if you have your token, you can reuse it) */
    token?: string;
}

interface LoginInitResponse {
    processId: string;
    countdownInSeconds: number;
    '2fa': string;
}

interface RetryMeta {
    _meta_type: string;
    nextAttemptInSeconds: number;
}

interface ApiErrorResponse {
    errors?: Array<{
        errorCode: string;
        meta?: RetryMeta;
    }>;
}

interface PostResponse<T = unknown> {
    body: T;
    status: number;
    headers: Headers;
}

/**
 * TradeRepublicExporter - Downloads transactions from TradeRepublic API
 *
 * Simple, focused class that handles:
 * 1. Authentication with TradeRepublic
 * 2. Fetching all transactions via WebSocket
 * 3. Parsing and formatting transaction data
 */
export class TradeRepublicWsReader extends BaseReader<RawTransaction> {

    constructor() {
        super('trade-republic-ws');
    }

    protected async fetchTransactionRecords(options: TradeRepublicWsOptions): Promise<RawTransaction[]> {
        const token = await this.authenticate(options.phone, options.showToken, options.token);
        const ws = new TradeRepublicWebSocket(token);

        try {
            await ws.connect();

            const records: RawTransaction[] = [];
            for await (const tx of ws.fetchAllTransactions()) {
                records.push(tx);
            }

            return records;
        } finally {
            ws.close();
        }
    }

    private async authenticate(phoneNumber?: string, showToken?: boolean, token?: string): Promise<string> {
        if (token) {
            logger.info('✅ Using provided session token');
            return token;
        }

        logger.info('🔐 Connecting to the TradeRepublic API...');
        if (!phoneNumber) {
            phoneNumber = await this.promptUser('Enter your phone (e.g., +1234567890): ', 'phone');
        }
        const pin = await this.promptUser('Enter your PIN (4 digits, hidden): ', 'pin');

        const { processId, countdownInSeconds } = await this.initializeLogin(phoneNumber, pin);
        const code = await this.get2FACode(processId, countdownInSeconds);
        token = await this.verifyAndGetToken(processId, code);

        logger.info('✅ Successfully authenticated!');
        if (showToken) {
            logger.info(`Session token: ${token}`);
        }

        return token;
    }

    private async promptUser(
        message: string,
        type: 'phone' | 'pin' | 'code' = 'code',
        options: { silent?: boolean; validator?: (value: string) => string } = {}
    ): Promise<string> {
        if (type === 'phone') {
            options.validator = (value: string) => {
                if (!value.startsWith('+')) {
                    throw new Error('Phone number must start with + (international format)');
                }
                if (!PHONE_REGEX.test(value)) {
                    throw new Error('Phone number must contain only + and digits');
                }
                return value;
            };
        } else if (type === 'pin') {
            options.silent = true;
            options.validator = (value: string) => {
                if (!PIN_REGEX.test(value)) {
                    throw new Error('PIN must be exactly 4 digits');
                }
                return value;
            };
        } else if (type === 'code') {
            options.validator = (value: string) => {
                if (value.toUpperCase() === 'SMS') return value;
                if (!CODE_REGEX.test(value)) {
                    throw new Error('Code must be either "SMS" or exactly 4 digits');
                }
                return value;
            };
        }
        return await promptly.prompt(message, options);
    }

    private async initializeLogin(phoneNumber: string, pin: string): Promise<LoginInitResponse> {
        const { body } = await this.post<LoginInitResponse>('/api/v1/auth/web/login', { phoneNumber, pin });
        if (!body.processId) throw new Error('Initialization failed. Invalid phone number or PIN?');
        return body;
    }

    private async get2FACode(processId: string, countdownInSeconds: number): Promise<string> {
        const code = await this.promptUser(`❓ Enter the 2FA code received (${countdownInSeconds}s) or type 'SMS': `, 'code');
        if (code.toUpperCase() !== 'SMS') return code;

        await this.post(`/api/v1/auth/web/login/${processId}/resend`);
        return await this.promptUser('❓ Enter the 2FA code received by SMS: ', 'code');
    }

    private async verifyAndGetToken(processId: string, code: string): Promise<string> {
        const { status, headers } = await this.post(`/api/v1/auth/web/login/${processId}/${code}`);
        if (status !== 200) throw new Error('Device verification failed');

        const cookies = (headers.get('set-cookie') || '').split(',').map((c) => c.trim());
        const sessionCookie = cookies.find((c) => c.startsWith('tr_session='));

        if (!sessionCookie) throw new Error('Session cookie not found');
        return sessionCookie.split(';')[0].split('=')[1];
    }

    private async post<T = unknown>(
        endpoint: string,
        data: Record<string, unknown> = {},
        retryCount: number = 0,
        maxRetries: number = 3
    ): Promise<PostResponse<T>> {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
            body: JSON.stringify(data),
        });

        const body =
            response.headers.get('content-type') === 'application/json'
                ? await response.json()
                : await response.text();

        if (response.status === 429 && retryCount < maxRetries) {
            const retryInfo = this.extractRetryInfo(body as ApiErrorResponse);

            if (retryInfo) {
                logger.warn(
                    `⏳ Rate limited. Waiting ${retryInfo.nextAttemptInSeconds}s before retry (attempt ${retryCount + 1}/${maxRetries})...`
                );
                await this.waitWithCountdown(retryInfo.nextAttemptInSeconds);
                return this.post<T>(endpoint, data, retryCount + 1, maxRetries);
            } else {
                // Fallback: exponential backoff if no retry metadata
                const waitSeconds = Math.min(300, Math.pow(2, retryCount) * 10); // Cap at 5 minutes
                logger.warn(
                    `⏳ Rate limited (no retry info). Waiting ${waitSeconds}s before retry (attempt ${retryCount + 1}/${maxRetries})...`
                );
                await this.waitWithCountdown(waitSeconds);
                return this.post<T>(endpoint, data, retryCount + 1, maxRetries);
            }
        }

        if (!response.ok) {
            const errorMsg = typeof body === 'object' ? JSON.stringify(body) : body;
            throw new Error(`HTTP ${response.status}: ${errorMsg}`);
        }

        return { body: body as T, status: response.status, headers: response.headers };
    }

    /**
     * Extract retry information from API error response
     * @param body - Response body
     * @returns Retry info or null if not found
     */
    private extractRetryInfo(body: ApiErrorResponse): RetryMeta | null {
        if (typeof body !== 'object' || !body.errors) return null;

        const retryError = body.errors.find(
            (err) => err.errorCode === 'TOO_MANY_REQUESTS' && err.meta?._meta_type === 'RetryMeta'
        );

        return retryError ? (retryError.meta as RetryMeta) : null;
    }

    /**
     * Wait with a countdown display showing progress
     * @param seconds - Total seconds to wait
     */
    private async waitWithCountdown(seconds: number): Promise<void> {
        const totalSeconds = Math.ceil(seconds);
        const barWidth = 30;

        for (let remaining = totalSeconds; remaining > 0; remaining--) {
            const progress = (totalSeconds - remaining) / totalSeconds;
            const filledWidth = Math.floor(progress * barWidth);
            const emptyWidth = barWidth - filledWidth;
            const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);

            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

            process.stdout.write(`\r⏳ Waiting: [${bar}] ${timeStr} remaining`);

            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        process.stdout.write('\r✅ Wait complete. Retrying now...\n');
    }

    /**
     * Converts a space-separated title to camelCase property name
     * Example: "Order Type" -> "orderType"
     */
    private normalizePropertyName(title?: string): string {
        if (!title) return '';
        const words = title.split(' ');
        if (words.length === 1) return title.toLowerCase();

        return words[0].toLowerCase() + words.slice(1).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
    }

    /**
     * Extracts transaction data from TradeRepublic's nested JSON structure
     * into a flat object with camelCase property names
     */
    private extractTransactionData(raw: RawTransaction): RawTransaction {
        const data: RawTransaction = { ...raw };

        if (Array.isArray(raw.sections)) {
            delete data.sections;

            for (const section of raw.sections) {
                if (section.type === 'header') {
                    this.extractHeaderData(section, data);
                } else if (section.type === 'table') {
                    this.extractTableData(section, data);
                }
            }
        }

        return data;
    }

    private extractHeaderData(section: any, data: RawTransaction): void {
        if (section.action?.type === 'instrumentDetail') {
            data.isin = section.action.payload;
        } else if (typeof section.data?.icon === 'string') {
            const match = section.data.icon.match(LOGO_ISIN_REGEX);
            data.isin = match ? match[1] : undefined;
        } else if (typeof section.data?.icon?.asset === 'string') {
            const match = section.data.icon.asset.match(LOGO_ISIN_REGEX);
            data.isin = match ? match[1] : undefined;
        }
    }

    private extractTableData(section: any, data: RawTransaction): void {
        if (!Array.isArray(section.data)) return;
        for (const item of section.data) {
            const propertyName = this.normalizePropertyName(item.title);
            if (propertyName && !data[propertyName] && item.detail?.text) {
                data[propertyName] = item.detail.text;
            }

            for (const nestedSection of item.detail?.action?.payload?.sections || []) {
                if (nestedSection.type === 'table') {
                    for (const nestedItem of nestedSection.data || []) {
                        const nestedPropertyName = this.normalizePropertyName(nestedItem.title);
                        if (nestedPropertyName && !data[nestedPropertyName] && nestedItem.detail?.text) {
                            data[nestedPropertyName] = nestedItem.detail.text;
                        }
                    }
                }
            }
        }
    }

    protected parseTransaction(record: RawTransaction): Transaction | null {
        record = this.extractTransactionData(record);

        const { shares, sharePrice } = this.parseTransactionString(record.transaction);
        const transactionType = this.classifyTransactionType(record);

        if (!transactionType) {
            logger.error({ tx: record }, '⚠️  Unrecognized transaction');
            return null;
        }

        const quantity = shares || (record.shares ? parseInt(record.shares) : 0);
        const price = sharePrice || Math.abs(parseAmount(record.sharePrice) || 0);
        const fees = Math.abs(parseAmount(record.fee) || 0);
        const taxes = Math.abs(parseAmount(record.tax) || 0);
        const dateStr = record.timestamp?.replace('+0000', 'Z') || new Date().toISOString();
        const date = new Date(dateStr);

        return {
            id: record.id,
            type: transactionType,
            isin: record.isin,
            name: record.title,
            shares: quantity,
            price,
            currency: record.amount?.currency || this.parseCurrency(record.total) || 'EUR',
            fee: fees,
            tax: taxes,
            date,
            status: record.status,
            amount: record.amount?.value || parseAmount(record.total),
            source: this.name,
        };
    }

    /**
     * Parse string like "0.389478 x  €32.51" and return shares and sharePrice
     */
    private parseTransactionString(transaction: string | undefined): { shares?: number; sharePrice?: number } {
        if (!transaction) return {};
        const parts = transaction.split('x').map((part) => part.trim());
        if (parts.length !== 2) return {};

        const shares = parseAmount(parts[0]);
        const sharePrice = parseAmount(parts[1]);
        return { shares, sharePrice };
    }

    /**
     * Detects currency from amount string
     * Currently supports EUR, can be extended for other currencies
     */
    private parseCurrency(amountText: string | undefined): string | undefined {
        if (!amountText) return undefined;
        if (amountText.includes('€')) return 'EUR';
        if (amountText.includes('$')) return 'USD';
        return undefined;
    }

    private classifyTransactionType(tx: RawTransaction): TransactionType | undefined {
        // stocks: buy, sell, dividend, fee, interest, liability, tax
        if (tx.isin) {
            if (tx.orderType?.includes('Buy') || tx.subtitle?.includes('Buy') || tx.subtitle === 'Saving executed') {
                return TransactionType.BUY;
            } else if (tx.orderType?.includes('Sell') || tx.subtitle?.includes('Sell')) {
                return TransactionType.SELL;
            } else if (tx.event?.toLowerCase().includes('dividend') || (tx.event?.toLowerCase().includes('income') && tx.dividendPerShare)) {
                return TransactionType.DIVIDEND;
            } else if (tx.event?.toLowerCase().includes('repayment')) {
                return TransactionType.LIABILITY;
            } else if (tx.saveback) {
                return TransactionType.BUY;
            } else if (tx.event?.toLowerCase().includes('lump sum')) {
                return TransactionType.TAX;
            }
        } else {
            if (tx.annualRate || (tx.accrued && tx.averageBalance) || tx.couponPayment || tx.event === 'Coupon Payment') {
                return TransactionType.INTEREST;
            } else if (tx.event?.toLowerCase().includes('tax')) {
                return TransactionType.TAX;
            }

            // card: payment, refund, transfer, deposit, withdrawal, cashback, verification, gift, canceled
            if (tx.status === 'CANCELED') {
                return TransactionType.CANCELED;
            } else if (tx.cardRefund === 'Completed') {
                return TransactionType.REFUND;
            } else if (tx.cardPayment === 'Completed' || tx.cardPayment === 'Pending' || tx.directDebit === 'Completed') {
                return TransactionType.PAYMENT;
            } else if (tx.transfer && tx.recipient) {
                return TransactionType.TRANSFER;
            } else if ((tx.from || tx.sender) && tx.iban) {
                return TransactionType.DEPOSIT;
            } else if (tx.cardVerification) {
                return TransactionType.VERIFICATION;
            } else if (tx.giftAmount) {
                return TransactionType.GIFT;
            }
        }

        return undefined;
    }
}

class TradeRepublicWebSocket {
    private readonly token: string;
    private ws: WebSocket | null = null;
    private messageId: number = 0;

    constructor(token: string) {
        this.token = token;
    }

    private log(message: string, data: Record<string, unknown> | null = null): void {
        if (data && 'token' in data) data.token = '[REDACTED]';
        logger.debug({ msg: `[DEBUG WebSocket] ${message}`, data: data ? JSON.stringify(data) : undefined });
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_URL);

            this.ws.on('open', async () => {
                this.log('WebSocket opened');
                try {
                    await this.authenticate();
                    logger.info('✅ WebSocket connected');
                    resolve();
                } catch (err) {
                    const error = err as Error;
                    this.log('Authentication error', { error: error.message, stack: error.stack });
                    reject(err);
                }
            });

            this.ws.on('error', (err: Error) => {
                this.log('WebSocket error', { error: err.message, stack: err.stack });
                reject(err);
            });

            this.ws.on('close', (code: number, reason: Buffer) => {
                this.log('WebSocket closed', { code, reason: reason.toString() });
            });
        });
    }

    private async authenticate(): Promise<void> {
        const config = {
            locale: 'en',
            platformId: 'webtrading',
            platformVersion: 'chrome - 142.0.0',
            clientId: 'app.traderepublic.com',
            clientVersion: '11.45.0',
        };

        const connectMsg = `connect 33 ${JSON.stringify(config)}`;
        this.log('Sending connect message', { message: connectMsg });
        this.ws!.send(connectMsg);

        await this.waitForMessage();
    }

    private async waitForMessage(): Promise<string> {
        return new Promise((resolve) => {
            this.ws!.once('message', (data: Buffer) => {
                const message = data.toString();
                this.log('Received message', { rawMessage: message });
                resolve(message);
            });
        });
    }

    private async subscribe<T>(payload: Record<string, unknown>): Promise<T> {
        this.messageId++;
        const subMsg = `sub ${this.messageId} ${JSON.stringify(payload)}`;
        this.log(`Subscribing (ID: ${this.messageId})`, payload);
        this.ws!.send(subMsg);
        const response = await this.waitForMessage();

        const json = this.parseJson(response);
        if ((json as { errors?: unknown }).errors) {
            throw new Error(`Subscription error: ${JSON.stringify((json as { errors: unknown }).errors)}`);
        }

        const unsubMsg = `unsub ${this.messageId}`;
        this.log(`Unsubscribing (ID: ${this.messageId})`);
        this.ws!.send(unsubMsg);
        await this.waitForMessage();
        return json as T;
    }

    private parseJson(msg: string): unknown {
        const start = msg.indexOf('{');
        const end = msg.lastIndexOf('}');
        const cleaned = start !== -1 && end !== -1 ? msg.slice(start, end + 1) : '{}';

        try {
            return JSON.parse(cleaned);
        } catch (err) {
            const error = err as Error;
            this.log('JSON parse error', { error: error.message, msg, cleaned });
            throw err;
        }
    }

    async *fetchAllTransactions(): AsyncGenerator<RawTransaction> {
        let afterCursor: string | undefined = undefined;
        let totalFetched = 0;

        while (true) {
            const page = await this.fetchTransactionPage(afterCursor);

            if (!page.items || page.items.length === 0) {
                break;
            }

            for (const transaction of page.items) {
                if (transaction.id) {
                    const details = await this.fetchTransactionDetails(transaction.id);
                    Object.assign(transaction, details);
                    totalFetched++;
                    yield transaction;
                }
            }

            afterCursor = page.cursors?.after;
            if (!afterCursor) {
                break;
            }

            logger.info(`🔄 Fetched ${totalFetched} transactions so far...`);
        }

        logger.info(`📊 Total transactions fetched: ${totalFetched}`);
    }

    private async fetchTransactionPage(afterCursor?: string): Promise<{ items: RawTransaction[]; cursors?: { after?: string } }> {
        const payload: Record<string, unknown> = {
            type: 'timelineTransactions',
            token: this.token,
        };

        if (afterCursor) {
            payload.after = afterCursor;
        }

        return this.subscribe<{ items: RawTransaction[]; cursors?: { after?: string } }>(payload);
    }

    private async fetchTransactionDetails(transactionId: string): Promise<Partial<RawTransaction>> {
        const payload = {
            type: 'timelineDetailV2',
            id: transactionId,
            token: this.token,
        };

        return this.subscribe<Partial<RawTransaction>>(payload);
    }

    close(): void {
        this.ws?.close();
    }
}
