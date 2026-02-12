import { logger } from '../utils/logger.ts';
import { chromium, type Browser, type Page } from 'playwright';
import { BaseReader, type Transaction, type ReaderOptions, TransactionType } from './index.ts';
import { parseAmountEU } from '../utils/parse.ts';

const LOGIN_URL = 'https://de.scalable.capital/en/secure-login';
const BROKER_URL = 'https://de.scalable.capital/broker/';

/**
 * Portfolio position extracted from Scalable Capital
 */
interface PortfolioPosition {
    assetName: string;
    isin: string;
    currentValue: string;
    shares: string | undefined;
}

/**
 * Options for ScalableCapitalPwReader
 */
interface ScalableCapitalPwOptions extends ReaderOptions {
    /** Scalable Capital username/email */
    username?: string;
    /** Scalable Capital password */
    password?: string;
    /** Run browser in headless mode */
    headless?: boolean;
}

/**
 * ScalableCapitalPwReader - Extracts portfolio data from Scalable Capital using Playwright
 *
 * Uses browser automation to:
 * 1. Authenticate with Scalable Capital
 * 2. Navigate to broker dashboard
 * 3. Extract portfolio positions (assets, shares, current values)
 * 4. Return as Transaction objects
 */
export class ScalableCapitalPwReader extends BaseReader<PortfolioPosition> {
    private readonly username: string | null;
    private readonly password: string | null;
    private readonly headless: boolean;
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor(options: ScalableCapitalPwOptions = {}) {
        super('scalable-capital-pw');
        this.username = options.username || null;
        this.password = options.password || null;
        this.headless = options.headless !== false; // default true
    }

    protected async fetchTransactionRecords(options: ScalableCapitalPwOptions): Promise<PortfolioPosition[]> {
        try {
            await this.launchBrowser();
            await this.authenticate();
            await this.navigateToBroker();
            return await this.extractPortfolioData();
        } finally {
            await this.closeBrowser();
        }
    }

    private async launchBrowser(): Promise<void> {
        logger.info('🚀 Launching browser...');
        this.browser = await chromium.launch({
            headless: this.headless,
            args: ['--no-sandbox'],
        });
        this.page = await this.browser.newPage();
        logger.debug('Browser launched successfully');
    }

    private async closeBrowser(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            logger.debug('Browser closed');
        }
    }

    private async authenticate(): Promise<void> {
        logger.info('🔐 Authenticating with Scalable Capital...');

        await this.page!.goto(LOGIN_URL, { waitUntil: 'networkidle' });

        if (this.username && this.password) {
            // Automated login with credentials
            await this.page!.fill('#username', this.username);
            await this.page!.fill('#password', this.password);
            await this.page!.click('button[type="submit"]');
        } else {
            // Interactive login - wait for user to complete
            logger.info('⏳ Please log in manually in the browser...');
            logger.info('   Waiting for navigation to /cockpit or /broker...');
        }

        // Wait for successful login (redirect to cockpit or broker)
        await this.page!.waitForURL(/\/(cockpit|broker|auth\/custodian-switch)/, {
            timeout: 120000, // 2 minutes for manual login
        });

        // Handle "Welcome to the new Scalable" page if present
        if (this.page!.url().includes('auth/custodian-switch/successful-migration')) {
            try {
                await this.page!.click('[data-testid="custodian_switch_successful_migration_cta"]', { timeout: 2000 });
            } catch {
                // Button not found, continue
            }
        }

        logger.info('✅ Successfully authenticated!');
    }

    private async navigateToBroker(): Promise<void> {
        logger.info('📊 Navigating to broker dashboard...');

        await this.page!.goto(BROKER_URL, { waitUntil: 'networkidle' });

        // Handle cookie consent via shadow DOM
        await this.dismissCookies();

        // Close modal dialogs
        await this.closeModals();

        logger.debug('Broker dashboard loaded');
    }

    private async dismissCookies(): Promise<void> {
        try {
            // Wait a bit for cookie banner to appear
            await this.page!.waitForTimeout(2000);

            const shadowHost = await this.page!.$('#usercentrics-root');
            if (shadowHost) {
                const denied = await this.page!.evaluate(() => {
                    const shadowRoot = document.querySelector('#usercentrics-root')?.shadowRoot;
                    const button = shadowRoot?.querySelector('button[data-testid="uc-deny-all-button"]') as HTMLButtonElement | null;
                    if (button) {
                        button.click();
                        return true;
                    }
                    return false;
                });
                if (denied) {
                    logger.debug('Dismissed cookie consent');
                }
            }
        } catch (error) {
            logger.debug('Cookie consent not found or already dismissed');
        }
    }

    private async closeModals(): Promise<void> {
        // Trading venues closed modal
        try {
            const closeButton = await this.page!.$('button:has-text("Close")');
            if (closeButton) {
                await closeButton.click();
                logger.debug('Closed trading venues modal');
            }
        } catch {
            // Modal not present
        }

        // PRIME+ Broker modal
        try {
            const primeButton = await this.page!.$('button[data-testid="close-modal-button"]');
            if (primeButton) {
                await primeButton.click();
                logger.debug('Closed PRIME+ modal');
            }
        } catch {
            // Modal not present
        }

        // Wait a bit after closing modals
        await this.page!.waitForTimeout(1000);
    }

    private async extractPortfolioData(): Promise<PortfolioPosition[]> {
        logger.info('📋 Extracting portfolio data...');

        // Find portfolio section
        const portfolioSection = await this.page!.$("//h2[text()='Portfolio']/..");
        if (!portfolioSection) {
            throw new Error('Portfolio section not found. Make sure you have assets in your portfolio.');
        }

        // Check if portfolio is empty
        const sectionText = await portfolioSection.textContent();
        if (sectionText?.includes('Popular savings plans')) {
            logger.warn('⚠️  Portfolio is empty');
            return [];
        }

        // Get portfolio container
        const portfolioContainer = await this.page!.$('div[aria-label="Portfolio"]//div');
        if (!portfolioContainer) {
            throw new Error('Portfolio container not found');
        }

        // Get all asset list items
        const assetElements = await portfolioContainer.$$('li');
        logger.info(`📦 Found ${assetElements.length} assets in portfolio`);

        const positions: PortfolioPosition[] = [];

        for (let i = 0; i < assetElements.length; i++) {
            const element = assetElements[i];

            try {
                // Extract asset name
                const nameElement = await element.$('div[data-testid="text"]');
                const assetName = await nameElement?.textContent();

                // Extract current value
                const valueElement = await element.$('div[aria-label="Total value"] span');
                const currentValue = await valueElement?.textContent();

                // Extract ISIN from link
                const linkElement = await element.$('a');
                const href = await linkElement?.getAttribute('href');
                const isinMatch = href?.match(/isin=([A-Z0-9]{12})/);
                const isin = isinMatch ? isinMatch[1] : null;

                if (!isin || !assetName || !currentValue) {
                    logger.warn(`⚠️  Skipping asset ${i + 1}: missing data`);
                    continue;
                }

                // Extract portfolio ID from URL
                const portfolioIdMatch = this.page!.url().match(/portfolioId=([^&]+)/);
                const portfolioId = portfolioIdMatch ? portfolioIdMatch[1] : null;

                // Navigate to asset detail page to get shares
                const detailUrl = `https://de.scalable.capital/broker/security?isin=${isin}&portfolioId=${portfolioId || ''}`;
                logger.debug(`Fetching shares for ${assetName} (${isin})...`);

                await this.page!.goto(detailUrl, { waitUntil: 'networkidle' });

                // Wait for shares element
                await this.page!.waitForSelector('//div[contains(text(), "Shares")]//..//span', { timeout: 10000 });

                const sharesElement = await this.page!.$('//div[contains(text(), "Shares")]//..//span');
                const sharesText = await sharesElement?.textContent();

                positions.push({
                    assetName: assetName.trim(),
                    isin: isin,
                    currentValue: currentValue.trim(),
                    shares: sharesText?.trim(),
                });

                logger.info(`✓ ${assetName}: ${sharesText} shares`);
            } catch (error) {
                const err = error as Error;
                logger.error(`Failed to extract data for asset ${i + 1}: ${err.message}`);
            }
        }

        // Navigate back to broker page
        await this.page!.goto(BROKER_URL, { waitUntil: 'networkidle' });

        logger.info(`✅ Successfully extracted ${positions.length} positions`);
        return positions;
    }

    protected parseTransaction(record: PortfolioPosition): Transaction | null {
        const shares = this.parseShares(record.shares);
        const currentValue = parseAmountEU(record.currentValue) || 0;
        const price = shares > 0 ? currentValue / shares : 0;
        const currency = this.parseCurrency(record.currentValue);

        return {
            type: TransactionType.BUY, // Portfolio positions are treated as cumulative buys
            isin: record.isin,
            name: record.assetName,
            shares: shares,
            price: price,
            currency: currency,
            fee: 0,
            tax: 0,
            date: new Date(),
            source: this.name,
        };
    }

    private parseShares(sharesText: string | undefined): number {
        if (!sharesText) return 0;
        // Remove currency symbols and commas, then parse
        const cleaned = sharesText.replace(/[€$,]/g, '').trim();
        return parseFloat(cleaned) || 0;
    }

    private parseCurrency(amountText: string | undefined): string {
        if (!amountText) return 'EUR';
        if (amountText.includes('€')) return 'EUR';
        if (amountText.includes('$')) return 'USD';
        return 'EUR'; // Default to EUR for Scalable Capital
    }
}
