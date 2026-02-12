export function parseAmountEU(str: unknown): number | undefined {
    if (typeof str === 'number') return str;
    if (!str || typeof str !== 'string') return undefined;

    // remove currency symbols, + and whitespace
    const s = str.replace(/[€+\s]/g, '').trim();

    if (s === '') return undefined;
    if (s === '0' || s === '0,00' || s === '0.00' || s === 'Free') return 0;

    const result = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(result) ? undefined : result;
}

export function parseAmountUS(str: unknown): number | undefined {
    if (typeof str === 'number') return str;
    if (!str || typeof str !== 'string') return undefined;

    // remove currency symbols, + and whitespace
    const s = str.replace(/[$+\s]/g, '').trim();

    if (s === '') return undefined;
    if (s === '0' || s === '0,00' || s === '0.00' || s === 'Free') return 0;

    const result: number = parseFloat(s.replace(/,/g, ''));
    return isNaN(result) ? undefined : result;
}
