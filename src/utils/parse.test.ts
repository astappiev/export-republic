import { parseAmountEU, parseAmountUS } from './parse.ts';

describe('parse utils', () => {
    describe('parseAmountEU', () => {
        test('handles currency symbols and whitespace', () => {
            expect(parseAmountEU('€1.234,56')).toBe(1234.56);
            expect(parseAmountEU('1.234,56 €')).toBe(1234.56);
            expect(parseAmountEU('-€1.234,56')).toBe(-1234.56);
        });

        test('parses EU format integers', () => {
            expect(parseAmountEU('1.234')).toBe(1234);
            expect(parseAmountEU('-1.234')).toBe(-1234);
            expect(parseAmountEU('12.34')).toBe(1234);
        });

        test('parses EU format decimals', () => {
            expect(parseAmountEU('1.234,56')).toBe(1234.56);
            expect(parseAmountEU('-1.234,56')).toBe(-1234.56);
            expect(parseAmountEU('25,965')).toBe(25.965);
        });

        test('parses EU format small decimals', () => {
            expect(parseAmountEU('0,56')).toBe(0.56);
            expect(parseAmountEU('-0,56')).toBe(-0.56);
        });

        test('handles 0', () => {
            expect(parseAmountEU('Free')).toBe(0);
            expect(parseAmountEU('0')).toBe(0);
            expect(parseAmountEU('0,00')).toBe(0);
            expect(parseAmountEU('0.00')).toBe(0);
        });

        test('returns number as is', () => {
            expect(parseAmountEU(123.45)).toBe(123.45);
            expect(parseAmountEU(-123.45)).toBe(-123.45);
        })

        test('handles invalid inputs gracefully', () => {
            expect(parseAmountEU(null)).toBeUndefined();
            expect(parseAmountEU(undefined)).toBeUndefined();
            expect(parseAmountEU('')).toBeUndefined();
            expect(parseAmountEU('   ')).toBeUndefined();
            expect(parseAmountEU('abc')).toBeUndefined();
        });
    });

    describe('parseAmountUS', () => {
        test('handles explicit + and -', () => {
            expect(parseAmountUS('+1234.56')).toBe(1234.56);
            expect(parseAmountUS('+ 1234.56')).toBe(1234.56);
            expect(parseAmountUS(' + 1234.56')).toBe(1234.56);
            expect(parseAmountUS('-1234.56')).toBe(-1234.56);
            expect(parseAmountUS('- 1234.56')).toBe(-1234.56);
        });

        test('parses US format decimals', () => {
            expect(parseAmountUS('1,234.56')).toBe(1234.56);
            expect(parseAmountUS('-1,234.56')).toBe(-1234.56);
            expect(parseAmountUS('1,234,567.89 $')).toBe(1234567.89);
        });

        test('parses US format small decimals', () => {
            expect(parseAmountUS('0.56')).toBe(0.56);
            expect(parseAmountUS('-0.56')).toBe(-0.56);
        });

        test('parses US format integers', () => {
            expect(parseAmountUS('1.234')).toBe(1.234);
            expect(parseAmountUS('-1.234')).toBe(-1.234);
            expect(parseAmountUS('12.34')).toBe(12.34);
        });

        test('parses multiple separators as thousands', () => {
            expect(parseAmountUS('1,234,567')).toBe(1234567);
            expect(parseAmountUS('-1,234,567')).toBe(-1234567);
        });

        test('handles 0', () => {
            expect(parseAmountUS('Free')).toBe(0);
            expect(parseAmountUS('0')).toBe(0);
            expect(parseAmountUS('00.00')).toBe(0);
            expect(parseAmountUS('0.00')).toBe(0);
            expect(parseAmountUS('0.000')).toBe(0);
        });

        test('parses plain strings', () => {
            expect(parseAmountUS('123')).toBe(123);
            expect(parseAmountUS('1234.56')).toBe(1234.56);
            expect(parseAmountUS('-1234.56')).toBe(-1234.56);
        });
    });
});
