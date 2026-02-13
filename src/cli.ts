#!/usr/bin/env node
import { Command } from 'commander';
import { extractText, getDocumentProxy } from 'unpdf';
import { readFile, writeFile } from 'fs/promises';

import { CacheService } from './services/cache.ts';
import { MarketDataService } from './services/market-data.ts';
import { logger } from './utils/logger.ts';

import { BaseFormatter } from './formatters/index.ts';
import { GhostfolioFormatter } from './formatters/ghostfolio.ts';
import { TradingViewFormatter } from './formatters/tradingview.ts';
import { InvestbrainFormatter } from './formatters/investbrain.ts';
import { PortfolioPerformanceFormatter } from './formatters/portfolio-performance.ts';

import type { Transaction } from './readers/index.ts';
import { TradeRepublicPdfReader } from './readers/traderepublic-pdf.ts';
import { TradeRepublicWsReader } from './readers/traderepublic-ws.ts';
import { ScalableCapitalPwReader } from './readers/scalablecapital-pw.ts';
import { ScalableCapitalCsvReader } from './readers/scalablecapital-csv.ts';

import { type Symbol } from './resolvers/index.ts';
import { TradingViewResolver } from './resolvers/tradingview.ts';
import { YahooResolver } from './resolvers/yahoo.ts';
import { OpenfigiResolver } from './resolvers/openfigi.ts';

const program = new Command();

program
    .name('export-republic')
    .description('CLI to help download, parse and convert Trade Republic account statements to Ghostfolio CSV format');

program
    .command('convert')
    .description('Convert transaction files to various export formats')
    .argument('<input>', 'Input file path')
    .argument('[output]', 'Output file path (default: based on formatter)')
    .option('-r, --reader <name>', 'Reader: traderepublic-pdf, scalablecapital-csv', 'scalablecapital-csv')
    .option('-f, --formatter <name>', 'Formatter: ghostfolio, tradingview, investbrain, portfolio-performance, json', 'tradingview')
    .action(async (inputPath: string, outputPath: string | undefined, options: { reader: string; formatter: string }) => {
        const cache = new CacheService();
        const marketDataService = createMarketDataService(cache);

        let transactions;
        if (options.reader === 'traderepublic-pdf') {
            logger.info(`Reading PDF from: ${inputPath}`);
            const buffer = await readFile(inputPath);
            const pdf = await getDocumentProxy(new Uint8Array(buffer));
            const { text } = await extractText(pdf, { mergePages: false });
            logger.info(`Extracted ${text.length} pages from PDF`);

            const reader = new TradeRepublicPdfReader();
            transactions = await reader.readTransactions({ pages: text });
        } else {
            const reader = new ScalableCapitalCsvReader();
            transactions = await reader.readTransactions({ csvFile: inputPath });
        }

        await formatAndSaveTransactions(transactions, marketDataService, options.formatter, outputPath);
        cache.close();
    });

interface FetchOptions {
    reader: string;
    formatter?: string;
    output?: string;
    phone?: string;
    token?: string;
    showToken?: boolean;
    scUsername?: string;
    scPassword?: string;
    scHeadless?: boolean;
    debug?: boolean;
}

program
    .command('fetch')
    .description('Fetch transactions from live broker APIs')
    .option('-r, --reader <choice>', 'Reader: traderepublic-ws, scalablecapital-pw', 'traderepublic-ws')
    .option('-f, --formatter <format>', 'Formatter: ghostfolio, tradingview, investbrain, portfolio-performance, json')
    .option('-o, --output <path>', 'Output file path')
    // TradeRepublic specific
    .option('-p, --phone <number>', 'Phone number for authentication')
    .option('-t, --token <token>', 'Use existing session token (skips authentication)')
    .option('--show-token', 'Display session token after authentication')
    // Scalable Capital specific
    .option('--sc-username <username>', 'Scalable Capital username/email')
    .option('--sc-password <password>', 'Scalable Capital password')
    .option('--sc-headless', 'Run browser in headless mode (default: true)')
    // Other
    .option('-d, --debug', 'Save raw transaction data to disk')
    .action(async (options: FetchOptions) => {
        let transactions;

        if (options.reader === 'scalablecapital-pw') {
            const reader = new ScalableCapitalPwReader();
            transactions = await reader.readTransactions({
                username: options.scUsername,
                password: options.scPassword,
                headless: options.scHeadless !== false,
            });
        } else {
            const reader = new TradeRepublicWsReader();
            transactions = await reader.readTransactions({
                phone: options.phone,
                token: options.token,
                showToken: options.showToken,
                cacheRecords: options.debug,
            });
        }

        if (options.formatter) {
            const cache = new CacheService();
            const marketDataService = createMarketDataService(cache);
            await formatAndSaveTransactions(transactions, marketDataService, options.formatter, options.output);
            cache.close();
        }
    });

interface ResolveOptions {
    resolver: string;
    cache: boolean;
}

program
    .command('resolve')
    .description('Resolve ISIN to trading symbol')
    .argument('<isin>', 'ISIN to resolve')
    .option('-r, --resolver <name>', 'Resolver to use: tradingview, yahoo, or all (default: all)', 'all')
    .option('--no-cache', 'Skip cache and force fresh resolution')
    .action(async (isin: string, options: ResolveOptions) => {
        const cache = new CacheService();

        logger.info(`Resolving ISIN: ${isin}`);

        if (options.cache) {
            const resolver = options.resolver === 'all' ? undefined : options.resolver;
            const cached = await cache.getSymbol(isin, { resolver });
            if (cached) {
                logger.info('(from cache)');
                displaySymbol(cached);
                cache.close();
                return;
            }
        }

        if (options.resolver === 'tradingview') {
            const resolver = new TradingViewResolver();
            const results = await resolver.resolveSymbol(isin);

            if (results && results.length > 0) {
                const primary = results.find((r) => r.isPrimary) || results[0];
                cache.setSymbol(isin, { ...primary, resolver: 'tradingview' });
                displaySymbol(results);
            } else {
                logger.warn('✗ Could not resolve ISIN on TradingView');
            }
        } else if (options.resolver === 'yahoo') {
            const resolver = new YahooResolver();
            const results = await resolver.resolveSymbol(isin);

            if (results && results.length > 0) {
                const result = results[0];
                cache.setSymbol(isin, result);
                displaySymbol(result);
            } else {
                logger.warn('✗ Could not resolve ISIN with Yahoo');
            }
        } else {
            const marketDataService = createMarketDataService(cache);
            const result = await marketDataService.resolveSymbol(isin);

            if (result) {
                displaySymbol(result);
            } else {
                logger.warn('✗ Could not resolve ISIN');
            }
        }

        cache.close();
    });

program.parse();

function createMarketDataService(cache: CacheService): MarketDataService {
    return new MarketDataService({
        cache,
        resolvers: [new TradingViewResolver(), new YahooResolver(), new OpenfigiResolver()],
    });
}

function displaySymbol(results: Symbol | Symbol[]): void {
    const items = Array.isArray(results) ? results : [results];
    logger.info(`✓ Found ${items.length} matches:`);
    items.forEach((result, index) => {
        const prefix = items.length > 1 ? `${index + 1}. ` : '  ';
        const primaryTag = result.isPrimary ? ' ⭐ PRIMARY' : '';

        logger.info(`${prefix}Symbol:   ${result.symbol}${primaryTag}`);
        logger.info(`${prefix}Name:     ${result.name || 'N/A'}`);
        logger.info(`${prefix}Exchange: ${result.exchange || 'N/A'}`);
        logger.info(`${prefix}Type:     ${result.type || 'N/A'}`);
        logger.info(`${prefix}Currency: ${result.currency || 'N/A'}`);
        logger.info(`${prefix}Source:   ${result.resolver || 'N/A'}`);
        if (items.length > 1) logger.info('');
    });
}

async function formatAndSaveTransactions(
    transactions: Transaction[],
    marketDataService: MarketDataService,
    format: string,
    outputPath: string | undefined
): Promise<void> {
    const defaultOutput = format === 'json' ? './transactions.json' : `./${format}.csv`;
    const finalOutput = outputPath || defaultOutput;

    if (format === 'json') {
        await writeFile(finalOutput, JSON.stringify(transactions, null, 2));
    } else {
        let formatter: BaseFormatter;
        switch (format) {
            case 'tv':
            case 'tradingview':
                formatter = new TradingViewFormatter(marketDataService);
                break;
            case 'gf':
            case 'ghostfolio':
                formatter = new GhostfolioFormatter(marketDataService);
                break;
            case 'ib':
            case 'investbrain':
                formatter = new InvestbrainFormatter(marketDataService);
                break;
            case 'pp':
            case 'portfolio-performance':
                formatter = new PortfolioPerformanceFormatter(marketDataService);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }

        const csv = await formatter.formatTransactions(transactions);
        await writeFile(finalOutput, csv, 'utf-8');
    }

    logger.info(`✓ Successfully wrote to: ${finalOutput}`);
}
