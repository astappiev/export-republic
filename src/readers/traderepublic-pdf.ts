import { logger } from '../utils/logger.ts';
import { parseAmountEU } from '../utils/parse.ts';
import { BaseReader, TransactionType, type Transaction, type ReaderOptions } from './index.ts';

/**
 * Parsed transaction from PDF
 */
interface ParsedPdfTransaction {
    date: Date;
    type: string | null;
    description: string | null;
    received: number | null;
    spent: number | null;
    balance: number;
}

/**
 * Date parsing result
 */
interface DateParseResult {
    date: Date;
    nextIndex: number;
    restOfLine?: string;
}

/**
 * Options for TradeRepublicPdfReader
 */
interface TradeRepublicPdfOptions extends ReaderOptions {
    /** Single page text or array of page texts */
    pages: string | string[];
}

/**
 * Parsed PDF result
 */
interface ParsedPdfResult {
    transactions?: ParsedPdfTransaction[];
}

export class TradeRepublicPdfReader extends BaseReader<ParsedPdfTransaction> {
    // Patterns
    static DAY_PATTERN = /^\d{1,2}$/;
    static MONTH_PATTERN = /^\p{Lu}\p{Ll}{2,3}\.?$/u;
    static YEAR_PATTERN = /^\d{4}$/;
    static MONEY_PATTERN = /(-?\d+(?:\.\d{3})*(?:,\d{2})?\s*€)/g;
    static BALANCE_EPSILON = 0.01;

    // Chapter names
    static CHAPTER_ACCOUNT_HOLDER = 'KONTOINHABER';
    static CHAPTER_ACCOUNT_OVERVIEW = 'KONTOÜBERSICHT';
    static CHAPTER_TRANSACTIONS_OVERVIEW = 'UMSATZÜBERSICHT';
    static CHAPTER_CASH_OVERVIEW = 'BARMITTELÜBERSICHT';
    static CHAPTER_TRANSACTION_OVERVIEW = 'TRANSAKTIONSÜBERSICHT';
    static CHAPTER_NOTES = 'HINWEISE ZUM KONTOAUSZUG';

    // Headers
    static HEADER_ACCOUNT = 'PRODUKT ANFANGSSALDO ZAHLUNGSEINGANG ZAHLUNGSAUSGANG ENDSALDO';
    static HEADER_TRANSACTIONS = 'DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANG ZAHLUNGSAUSGANG SALDO';
    static HEADER_CASH = 'DATUM ZAHLUNGSART GELDMARKTFONDS STÜCK KURS PRO STÜCK BETRAG';

    // Transaction types
    static TRANSACTION_TYPES_IN = ['Erträge', 'Überweisung', 'Zinszahlung', 'Prämie', 'Steuern', 'Empfehlung'];
    static TRANSACTION_TYPES_OUT = ['Handel', 'Kartentransaktion', 'Geschenk'];

    // Footer/Header lines to remove
    static EXACT_LINES_TO_REMOVE = [
        'TRADE REPUBLIC BANK GMBH BRUNNENSTRASSE 19-21 10119 BERLIN',
        'Trade Republic Bank GmbH',
        'Brunnenstraße 19-21',
        '10119 Berlin',
        'www.traderepublic.com Sitz der Gesellschaft: Berlin',
        'AG Charlottenburg HRB 244347 B',
        'Umsatzsteuer-ID DE307510626',
        'Geschäftsführer',
        'Andreas Torner',
        'Gernot Mittendorfer',
        'Christian Hecker',
        'Thomas Pischke',
    ];

    static PATTERNS_TO_REMOVE = [/^Erstellt am \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2} Seite \d+ von \d+$/];

    private chapters: string[];
    private headers: string[];
    private transactionTypes: { INCOME: string[]; EXPENSE: string[] };

    constructor() {
        super('trade-republic-pdf');
        this.chapters = [
            TradeRepublicPdfReader.CHAPTER_ACCOUNT_OVERVIEW,
            TradeRepublicPdfReader.CHAPTER_TRANSACTIONS_OVERVIEW,
            TradeRepublicPdfReader.CHAPTER_CASH_OVERVIEW,
            TradeRepublicPdfReader.CHAPTER_TRANSACTION_OVERVIEW,
            TradeRepublicPdfReader.CHAPTER_NOTES,
        ];
        this.headers = [
            TradeRepublicPdfReader.HEADER_ACCOUNT,
            TradeRepublicPdfReader.HEADER_TRANSACTIONS,
            TradeRepublicPdfReader.HEADER_CASH,
        ];
        this.transactionTypes = {
            INCOME: TradeRepublicPdfReader.TRANSACTION_TYPES_IN,
            EXPENSE: TradeRepublicPdfReader.TRANSACTION_TYPES_OUT,
        };
    }

    /** Maps German PDF transaction types to TransactionType enum */
    private static readonly GERMAN_TYPE_MAP: Record<string, TransactionType> = {
        'Erträge': TransactionType.DIVIDEND,
        'Überweisung': TransactionType.DEPOSIT,
        'Zinszahlung': TransactionType.INTEREST,
        'Prämie': TransactionType.DEPOSIT,
        'Steuern': TransactionType.TAX,
        'Empfehlung': TransactionType.DEPOSIT,
        'Kartentransaktion': TransactionType.PAYMENT,
        'Geschenk': TransactionType.GIFT,
    };

    private static readonly GERMAN_MONTHS: Record<string, number> = {
        Jan: 0,
        'Jan.': 0,
        Feb: 1,
        'Feb.': 1,
        März: 2,
        'Mär.': 2,
        Apr: 3,
        'Apr.': 3,
        Mai: 4,
        'Mai.': 4,
        Juni: 5,
        'Jun.': 5,
        Juli: 6,
        'Jul.': 6,
        Aug: 7,
        'Aug.': 7,
        Sep: 8,
        'Sept.': 8,
        Okt: 9,
        'Okt.': 9,
        Nov: 10,
        'Nov.': 10,
        Dez: 11,
        'Dez.': 11,
    };

    protected async fetchTransactionRecords(options: TradeRepublicPdfOptions): Promise<ParsedPdfTransaction[]> {
        const parsed = this.parse(options.pages);
        return parsed.transactions || [];
    }

    protected parseTransaction(record: ParsedPdfTransaction): Transaction | null {
        const type = this.classifyGermanType(record.type, record);
        const amount = record.received ? record.received : record.spent ? -record.spent : 0;

        return {
            type,
            date: record.date,
            name: record.description || undefined,
            amount,
            currency: 'EUR',
            source: this.name,
        };
    }

    /**
     * Classify a German PDF type string into a TransactionType.
     * "Handel" is contextual: income → SELL, expense → BUY.
     */
    private classifyGermanType(germanType: string | null, pdfTx: ParsedPdfTransaction): TransactionType {
        if (!germanType) return TransactionType.FEE;

        const mapped = TradeRepublicPdfReader.GERMAN_TYPE_MAP[germanType];
        if (mapped) return mapped;

        if (germanType === 'Handel') {
            return pdfTx.received ? TransactionType.SELL : TransactionType.BUY;
        }

        logger.warn({ type: germanType }, 'Unmapped German PDF transaction type, defaulting to FEE');
        return TransactionType.FEE;
    }

    /**
     * Parse the PDF and return structured data
     * @param pages - Single page text or array of page texts
     * @returns Parsed data
     */
    parse(pages: string | string[]): ParsedPdfResult {
        let pageArray = Array.isArray(pages) ? pages : [pages];
        pageArray = this.removeHeaders(pageArray);

        const result: ParsedPdfResult = {};

        this.processChapters(pageArray, (chapterName: string, lines: string[]) => {
            if (chapterName === TradeRepublicPdfReader.CHAPTER_TRANSACTIONS_OVERVIEW) {
                result.transactions = this.processTransactions(lines);
            }
        });

        return result;
    }

    /**
     * Remove known header and footer lines from pages
     * @param pages - Array of page texts
     */
    removeHeaders(pages: string[]): string[] {
        const exactLines = new Set(TradeRepublicPdfReader.EXACT_LINES_TO_REMOVE);
        const patterns = TradeRepublicPdfReader.PATTERNS_TO_REMOVE;

        return pages.map((page) =>
            page
                .split('\n')
                .filter((line) => {
                    const trimmedLine = line.trim();
                    return !exactLines.has(trimmedLine) && !patterns.some((pattern) => pattern.test(trimmedLine));
                })
                .join('\n')
        );
    }

    /**
     * Process pages and extract content by chapters
     * @param pages - Array of page texts
     * @param callback - Function to call with (chapterName, content)
     */
    processChapters(pages: string[], callback: (chapterName: string, lines: string[]) => void): void {
        const allLines = pages.flatMap((page) => page.split('\n'));

        let currentChapter = TradeRepublicPdfReader.CHAPTER_ACCOUNT_HOLDER;
        let currentContent: string[] = [];
        let headerSeenInChapter = false;

        for (const line of allLines) {
            const trimmedLine = line.trim();

            // Check if this line is a chapter header
            if (this.chapters.includes(trimmedLine)) {
                // Process previous chapter if exists
                if (currentContent.length > 0) {
                    callback(currentChapter, currentContent);
                }

                // Start new chapter
                currentChapter = trimmedLine;
                currentContent = [];
                headerSeenInChapter = false;
            } else if (this.headers.includes(trimmedLine)) {
                // This is a header line
                if (!headerSeenInChapter) {
                    // Keep the first header in the chapter
                    currentContent.push(trimmedLine);
                    headerSeenInChapter = true;
                }
                // Skip subsequent headers
            } else if (trimmedLine.length > 0) {
                // Add line to current chapter content
                currentContent.push(trimmedLine);
            }
        }

        // Process the last chapter
        if (currentContent.length > 0) {
            callback(currentChapter, currentContent);
        }
    }

    /**
     * Processes the UMSATZÜBERSICHT chapter content and extracts transaction rows.
     * @param lines - Array of text lines in the chapter
     * @returns Array of parsed transactions
     */
    processTransactions(lines: string[]): ParsedPdfTransaction[] {
        const ALL_TYPES = [...this.transactionTypes.INCOME, ...this.transactionTypes.EXPENSE];

        // Skip the header line if present
        const startIndex = lines[0] === TradeRepublicPdfReader.HEADER_TRANSACTIONS ? 1 : 0;

        const transactions: ParsedPdfTransaction[] = [];
        let previousBalance: number | null = null;
        let i = startIndex;

        while (i < lines.length) {
            const dateInfo = this.tryParseDate(lines, i);

            if (dateInfo) {
                const { date, nextIndex, restOfLine } = dateInfo;

                // Collect all remaining lines until we hit another date pattern or end
                let j = nextIndex;
                const restLines: string[] = [];

                // If there's restOfLine (from year being on same line as transaction data),
                // add it first
                if (restOfLine) {
                    restLines.push(restOfLine);
                }

                while (j < lines.length && this.tryParseDate(lines, j) === null) {
                    restLines.push(lines[j]);
                    j++;
                }

                // Join the rest and parse the single transaction for this date
                const restText = restLines.join(' ');

                // Parse the transaction for this date
                const transaction = this.parseTransactionSegment(restText, date, ALL_TYPES, previousBalance);
                if (transaction) {
                    // Validate balance calculation
                    this.validateBalance(transaction, previousBalance);

                    transactions.push(transaction);
                    previousBalance = transaction.balance;
                }

                i = j;
                continue;
            }

            i++;
        }

        return transactions;
    }

    /**
     * Tries to parse a date starting at the given index.
     * Handles two cases:
     * 1. Day, month, year on separate lines
     * 2. "Day Month" on one line, year at start of next line
     *
     * @param lines - Array of text lines
     * @param index - Starting index to check
     * @returns Parsed date info or null
     */
    tryParseDate(lines: string[], index: number): DateParseResult | null {
        if (index >= lines.length) return null;

        const currentLine = lines[index] || '';
        const currentParts = currentLine.trim().split(/\s+/);

        // Check if current line starts with a day
        const dayMatch = currentParts[0]?.match(TradeRepublicPdfReader.DAY_PATTERN);
        if (!dayMatch) return null;

        const day = currentParts[0];

        // Case 1: "Day Month" on current line (2 parts)
        if (currentParts.length === 2) {
            const monthMatch = currentParts[1].match(TradeRepublicPdfReader.MONTH_PATTERN);
            if (monthMatch && index + 1 < lines.length) {
                const month = currentParts[1];
                const nextLine = lines[index + 1] || '';
                const nextParts = nextLine.trim().split(/\s+/);
                const yearMatch = nextParts[0]?.match(TradeRepublicPdfReader.YEAR_PATTERN);

                if (yearMatch) {
                    const year = nextParts[0];
                    const restOfLine = nextParts.slice(1).join(' ');

                    return {
                        date: this.toJSDate(year, month, day),
                        nextIndex: index + 1,
                        restOfLine: restOfLine || undefined,
                    };
                }
            }
        }

        // Case 2: Day, month, year on separate lines (1 part per line)
        if (currentParts.length === 1 && index + 2 < lines.length) {
            const month = lines[index + 1]?.trim();
            const year = lines[index + 2]?.trim();

            const monthMatch = month?.match(TradeRepublicPdfReader.MONTH_PATTERN);
            const yearMatch = year?.match(TradeRepublicPdfReader.YEAR_PATTERN);

            if (monthMatch && yearMatch) {
                return {
                    date: this.toJSDate(year, month, day),
                    nextIndex: index + 3,
                };
            }
        }

        return null;
    }

    /**
     * Converts a German date string to a JavaScript Date object
     * @param yearStr - Year string
     * @param monthStr - Month string in German
     * @param dayStr - Day string
     * @returns JavaScript Date object
     */
    toJSDate(yearStr: string, monthStr: string, dayStr: string): Date {
        const day = parseInt(dayStr, 10);
        const year = parseInt(yearStr, 10);

        const month = TradeRepublicPdfReader.GERMAN_MONTHS[monthStr];
        if (month === undefined) {
            throw new Error(`Unknown German month: ${monthStr}`);
        }

        return new Date(year, month, day);
    }

    /**
     * Parses a single transaction segment
     * @returns Parsed transaction
     */
    parseTransactionSegment(
        segment: string,
        date: Date,
        allTypes: string[],
        previousBalance: number | null
    ): ParsedPdfTransaction {
        const moneyMatches = segment.match(TradeRepublicPdfReader.MONEY_PATTERN) || [];

        const transaction: ParsedPdfTransaction = {
            date,
            type: null,
            description: null,
            received: null,
            spent: null,
            balance: 0,
        };
        transaction.type = this.findTransactionType(segment, allTypes);

        if (moneyMatches.length >= 2) {
            // Extract the monetary values (last 2 matches are: amount and saldo)
            transaction.balance = parseAmountEU(moneyMatches[moneyMatches.length - 1]) || 0;
            const amount = parseAmountEU(moneyMatches[moneyMatches.length - 2]) || 0;

            // Determine if this is ZAHLUNGSEINGANG or ZAHLUNGSAUSGANG by comparing saldo
            const isIncome = this.determineTransactionDirection(previousBalance, transaction.balance, transaction.type);

            // Assign to appropriate column
            if (isIncome) {
                transaction.received = amount;
            } else {
                transaction.spent = amount;
            }

            // Remove type and money values from segment to get description
            transaction.description = this.extractDescription(segment, transaction.type, moneyMatches);
        }

        return transaction;
    }

    /**
     * Find transaction type in segment
     */
    findTransactionType(segment: string, allTypes: string[]): string {
        const type = allTypes.find((t) => segment.startsWith(t));
        if (type) {
            return type;
        }

        // If no type found, extract the first word and mark as unknown
        const firstWord = segment.split(/\s+/)[0];
        logger.error({ type: firstWord }, 'Unknown transaction type detected');
        return firstWord;
    }

    /**
     * Determine if transaction is incoming or outgoing
     * @returns true if incoming
     */
    determineTransactionDirection(
        previousBalance: number | null,
        currentBalance: number,
        type: string | null
    ): boolean {
        if (previousBalance !== null) {
            // If current saldo > previous saldo, it's an incoming payment
            // If current saldo < previous saldo, it's an outgoing payment
            return currentBalance > previousBalance;
        }

        // For the first transaction, use the type to determine direction
        return type !== null && this.transactionTypes.INCOME.includes(type);
    }

    /**
     * Extract description by removing type and money values
     */
    extractDescription(segment: string, type: string | null, moneyMatches: string[]): string {
        let description = segment;
        if (type) {
            description = description.replace(type, '').trim();
        }
        moneyMatches.forEach((money) => {
            description = description.replace(money, '');
        });
        return description.trim();
    }

    /**
     * Validate balance calculation is correct
     */
    validateBalance(transaction: ParsedPdfTransaction, previousBalance: number | null): void {
        if (previousBalance === null) return;

        const expectedBalance = previousBalance + (transaction.received || 0) - (transaction.spent || 0);

        if (Math.abs(expectedBalance - transaction.balance) > TradeRepublicPdfReader.BALANCE_EPSILON) {
            logger.error(
                transaction,
                `Balance calculation error: ${previousBalance} ${transaction.received ? '+ ' + transaction.received : '- ' + transaction.spent} = ${expectedBalance}, but saldo is ${transaction.balance}`
            );
        }
    }
}
