export function isValidIsin(isin: unknown): isin is string {
    return typeof isin === 'string' && /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin);
}

export function isValidCurrency(currency: unknown): currency is string {
    return typeof currency === 'string' && /^[A-Z]{3}$/.test(currency);
}
