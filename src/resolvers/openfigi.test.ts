import { OpenfigiResolver } from './openfigi.ts';

describe('OpenfigiResolver', () => {
    describe('resolveSymbol', () => {
        it.skip('live test', async () => {
            const resolver = new OpenfigiResolver();
            const results = await resolver.resolveSymbol('DE0008430026', { currency: 'EUR' });

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(10);
        });
    });
});
