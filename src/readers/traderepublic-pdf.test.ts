import { TradeRepublicPdfReader } from './traderepublic-pdf.ts';

describe('TradeRepublicPdfReader', () => {
    const reader = new TradeRepublicPdfReader();

    describe('removeHeadersAndFooters', () => {
        it('should remove Trade Republic header lines', () => {
            const pages = [
                `TRADE REPUBLIC BANK GMBH BRUNNENSTRASSE 19-21 10119 BERLIN\nTrade Republic Bank GmbH\nBrunnenstraße 19-21\n10119 Berlin\nSome content here`,
            ];

            const cleaned = reader.removeHeaders(pages);

            expect(cleaned.length).toBe(1);
            expect(cleaned[0].trim()).toBe('Some content here');
        });

        it('should remove footer lines with date and page numbers', () => {
            const pages = [`Some content\nErstellt am 06.11.2025, 18:01:02 Seite 5 von 10\nMore content`];

            const cleaned = reader.removeHeaders(pages);

            expect(cleaned[0].trim()).toBe('Some content\nMore content');
        });
    });

    describe('processChapters', () => {
        it('should split content by chapters', () => {
            const pages = [
                `KONTOÜBERSICHT
Content 1
UMSATZÜBERSICHT
Content 2`,
            ];

            const cleanedPages = reader.removeHeaders(pages);
            const chapters: Record<string, string[]> = {};

            reader.processChapters(cleanedPages, (chapterName: string, content: string[]) => {
                chapters[chapterName] = content;
            });

            expect(chapters['KONTOÜBERSICHT']).toBeTruthy();
            expect(chapters['KONTOÜBERSICHT'].join('')).toContain('Content 1');
            expect(chapters['UMSATZÜBERSICHT']).toBeTruthy();
            expect(chapters['UMSATZÜBERSICHT'].join('')).toContain('Content 2');
        });

        it('should remove duplicate headers within chapters', () => {
            const pages = [
                `UMSATZÜBERSICHT
DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANG ZAHLUNGSAUSGANG SALDO
Row 1
DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANG ZAHLUNGSAUSGANG SALDO
Row 2`,
            ];

            const cleanedPages = reader.removeHeaders(pages);
            const chapters: Record<string, string[]> = {};

            reader.processChapters(cleanedPages, (chapterName: string, content: string[]) => {
                chapters[chapterName] = content;
            });

            const headerCount = chapters['UMSATZÜBERSICHT'].filter((line) =>
                line.match(/^DATUM TYP BESCHREIBUNG/)
            ).length;
            expect(headerCount).toBe(1);
        });
    });

    describe('processUmsatzuebersicht', () => {
        it('should parse a simple transaction', () => {
            const lines = [
                'DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANG ZAHLUNGSAUSGANG SALDO',
                '1',
                'Jan.',
                '2021',
                'Überweisung Test transaction 100,00 € 100,00 €',
            ];

            const transactions = reader.processTransactions(lines);

            expect(transactions.length).toBe(1);
            expect(transactions[0].date).toEqual(new Date(2021, 0, 1));
            expect(transactions[0].type).toBe('Überweisung');
            expect(transactions[0].description).toBe('Test transaction');
            expect(transactions[0].received).toBe(100);
            expect(transactions[0].spent).toBeNull();
            expect(transactions[0].balance).toBe(100);
        });

        it('should parse multiple transactions', () => {
            const lines = [
                'DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANG ZAHLUNGSAUSGANG SALDO',
                '1',
                'Jan.',
                '2021',
                'Überweisung Deposit 100,00 € 100,00 €',
                '2',
                'Jan.',
                '2021',
                'Handel Purchase of stock 50,00 € 50,00 €',
            ];

            const transactions = reader.processTransactions(lines);

            expect(transactions.length).toBe(2);
            expect(transactions[0].type).toBe('Überweisung');
            expect(transactions[1].type).toBe('Handel');
        });

        it('should detect ZAHLUNGSEINGANG when saldo increases', () => {
            const lines = [
                '1',
                'Jan.',
                '2021',
                'Überweisung Deposit 100,00 € 100,00 €',
                '2',
                'Jan.',
                '2021',
                'Zinszahlung Interest payment 10,00 € 110,00 €',
            ];

            const transactions = reader.processTransactions(lines);

            expect(transactions[0].received).toBe(100);
            expect(transactions[0].spent).toBeNull();
            expect(transactions[1].received).toBe(10);
            expect(transactions[1].spent).toBeNull();
        });

        it('should detect ZAHLUNGSAUSGANG when saldo decreases', () => {
            const lines = [
                '1',
                'Jan.',
                '2021',
                'Überweisung Deposit 100,00 € 100,00 €',
                '2',
                'Jan.',
                '2021',
                'Handel Stock purchase 50,00 € 50,00 €',
            ];

            const transactions = reader.processTransactions(lines);
            expect(transactions[0].received).toBe(100);
            expect(transactions[1].spent).toBe(50);
            expect(transactions[1].received).toBeNull();
        });

        it('should parse transactions with complex descriptions', () => {
            const lines = [
                '21',
                'Apr.',
                '2021',
                'Handel Ausführung Handel Direktkauf Kauf DE0007664039',
                'VOLKSWAGEN AG VZO O.N. 4788270820210421 236,00 € 264,00 €',
            ];

            const transactions = reader.processTransactions(lines);

            expect(transactions.length).toBe(1);
            expect(transactions[0].date).toEqual(new Date(2021, 3, 21));
            expect(transactions[0].type).toBe('Handel');
            expect(transactions[0].description).toBe(
                'Ausführung Handel Direktkauf Kauf DE0007664039 VOLKSWAGEN AG VZO O.N. 4788270820210421'
            );
            expect(transactions[0].received).toBeNull();
            expect(transactions[0].spent).toBe(236);
            expect(transactions[0].balance).toBe(264);
        });

        it('should handle month abbreviations with and without periods', () => {
            const content = `1
Jan
2021
Überweisung Test 100,00 € 100,00 €
2
Feb.
2021
Handel Test 50,00 € 50,00 €`;

            const transactions = reader.processTransactions(content.split('\n'));

            expect(transactions.length).toBe(2);
            expect(transactions[0].date).toEqual(new Date(2021, 0, 1));
            expect(transactions[1].date).toEqual(new Date(2021, 1, 2));
        });
    });

    describe('parse', () => {
        it('should return structured data with all chapters', () => {
            const pages = [
                `TRADE REPUBLIC BANK GMBH BRUNNENSTRASSE 19-21 10119 BERLIN
DATUM 01 Apr. 2021 - 05 Nov. 2025
IBAN DE12345678999999999999
BIC TRBKDEBBXXX
VORNAME NAME
Musterstraße 1
12345 Stadt
Trade Republic Bank GmbH
Brunnenstraße 19-21
10119 Berlin
www.traderepublic.com Sitz der Gesellschaft: Berlin
AG Charlottenburg HRB 244347 B
Umsatzsteuer-ID DE307510626
Geschäftsführer
Andreas Torner
Gernot Mittendorfer
Christian Hecker
Thomas Pischke
Erstellt am 06.11.2025, 00:00:00 Seite 1 von 10
KONTOÜBERSICHT
PRODUKT ANFANGSSALDO ZAHLUNGSEINGANG ZAHLUNGSAUSGANG ENDSALDO
Cashkonto 0,00 € 1,00 € 1,00 € 225,20 €
UMSATZÜBERSICHT
DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANG ZAHLUNGSAUSGANG SALDO
1
Feb.
2021
Erträge Ereignisausführung Ertrag US85254J1025 STAG INDUSTRI.
INC. DL-,01 6932977820240215 100,25 € 1099,75 €
15
Feb.
2021
Erträge Cash Dividend for ISIN US85254J1025 1,71 € 1.101,46 €
01
März
2021
Zinszahlung Your interest payment 0,53 € 1.101,99 €
23
Juni
2021
Handel Ausführung Handel Direktkauf Kauf US64110L1061 NETFLIX
INC. DL-,001 4859201820220823 KW 422,51 € 679,48 €
09 Juli
2021 Erträge Ereignisausführung Ertrag LU2082999132 LIF-600 TR.+LEI
EOD 1864121920220709 0,58 € 678,90 €
07
März
2022
Handel Ausführung Handel Direktkauf Kauf US3695501086 GENL
DYNAMICS CORP. DL 1 5299117720240307 453,70 € 225,20 €
BARMITTELÜBERSICHT
Zum 05 Nov. 2025
TREUHANDKONTEN SALDO
Deutsche Bank 123,45 €
GELDMARKTFONDS ISIN STK. / NOMINALE KURS PRO STÜCK KURSWERT IN EUR
BlackRock ICS Euro Liquidity Fund IE000GWTNRJ7 1.123,45 1,00 € 1.123,45 €
TRANSAKTIONSÜBERSICHT
DATUM ZAHLUNGSART GELDMARKTFONDS STÜCK KURS PRO STÜCK BETRAG
24 Sept. 2025 Kauf BlackRock ICS Euro Liquidity Fund
IE000GWTNRJ7 1.244,56 1,00 € 1.244,56 €
Trade Republic Bank GmbH
Brunnenstraße 19-21
10119 Berlin
www.traderepublic.com Sitz der Gesellschaft: Berlin
AG Charlottenburg HRB 244347 B
Umsatzsteuer-ID DE307510626
Geschäftsführer
Andreas Torner
Gernot Mittendorfer
Christian Hecker
Thomas Pischke
Erstellt am 06.11.2025, 18:01:02 Seite 9 von 10
DATUM ZAHLUNGSART GELDMARKTFONDS STÜCK KURS PRO STÜCK BETRAG
01 Okt. 2025 Verkauf BlackRock ICS Euro Liquidity Fund
IE000GWTNRJ7 10,00 1,00 € 10,00 €
HINWEISE ZUM KONTOAUSZUG
Bitte überprüfe Deinen Kontoauszug, da Einwendungen unverzüglich geltend gemacht/erhoben werden müssen. Bitte beachte, dass der
angegebene Kontostand nicht die Wertstellung der einzelnen Buchungen bzw. Transaktionen berücksichtigt, der genannte Betrag bzw.
Nennbetrag also nicht dem für die Zinsrechnung maßgeblichen Kontostand entsprechen muss. Ein Rechnungsabschluss gilt als
genehmigt, sofern Du innerhalb von 6 Wochen keine Einwendungen erhebst. Zur Fristwahrung genügt die Einreichung einer Einwendung
über unseren Kundenservice (Chat). Alle Chats sind Gegenstand unabhängiger Überprüfungen durch den Bereich Internal Audit. Dieser
Kontoauszug gilt im Zusammenhang mit den zugrundeliegenden Verträgen laut angegebener Kontonummer als Rechnung i.S.d. UStG.
Die Guthaben, die bei Treuhandbanken verwahrt werden, sind jeweils bis zu €100.000 von der Einlagensicherung der Treuhandbank
gesichert. Die Anteile an qualifizierten Geldmarktfonds (QMMF) sind für den unwahrscheinlichen Fall einer Insolvenz von Trade Republic
geschützt. Weitere Informationen zur Sicherung Deiner Gelder findest Du unter https://support.traderepublic.com.`,
            ];

            const result = reader.parse(pages);

            expect(result.transactions).toBeTruthy();
            expect(result.transactions!.length).toBe(6);
        });
    });
});
