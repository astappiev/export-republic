export function parseAmount(str: unknown): number | undefined {
    if (typeof str === 'number') return str;
    if (!str || typeof str !== 'string') return undefined;

    // remove currency symbols, + and whitespace
    const s = str.replace(/[€$\+\s]/g, '').trim();

    const hasComma = s.includes(',');
    const dotCount = (s.match(/\./g) || []).length;

    if (!hasComma && dotCount === 1) {
        // No comma + single dot → dot is a decimal separator (US)
        return parseAmountUS(s);
    }

    if (hasComma && dotCount > 0) {
        // Both dot and comma present → last one is the decimal separator
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        return lastDot > lastComma ? parseAmountUS(s) : parseAmountEU(s);
    }

    // Comma only, or multiple dots without comma → EU
    return parseAmountEU(s);
}

export function parseAmountEU(str: unknown): number | undefined {
    if (typeof str === 'number') return str;
    if (!str || typeof str !== 'string') return undefined;

    // remove currency symbols, + and whitespace
    const s = str.replace(/[€\+\s]/g, '').trim();

    if (s === '') return undefined;
    if (s === '0' || s === '0,00' || s === '0.00' || s === 'Free') return 0;

    const result = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(result) ? undefined : result;
}

export function parseAmountUS(str: unknown): number | undefined {
    if (typeof str === 'number') return str;
    if (!str || typeof str !== 'string') return undefined;

    // remove currency symbols, + and whitespace
    const s = str.replace(/[$\+\s]/g, '').trim();

    if (s === '') return undefined;
    if (s === '0' || s === '0,00' || s === '0.00' || s === 'Free') return 0;

    const result: number = parseFloat(s.replace(/,/g, ''));
    return isNaN(result) ? undefined : result;
}
