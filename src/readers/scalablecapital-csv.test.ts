import { ScalableCapitalCsvReader } from './scalablecapital-csv.ts';
import { TransactionType } from './index.ts';

describe('ScalableCapitalCsvReader', () => {
    const reader = new ScalableCapitalCsvReader();

    describe('readTransactions', () => {
        it('should parse valid CSV with executed transactions', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR
2026-02-05;18:32:16;Executed;"SCALZNg3EirzHXA";"Comcast A";Security;Buy;US20030N1019;10;25,965;-259,65;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions.length).toBe(2);
            expect(transactions[0].name).toBe('Continental');
            expect(transactions[0].isin).toBe('DE0005439004');
            expect(transactions[0].shares).toBe(7);
            expect(transactions[0].price).toBe(70.98);
            expect(transactions[0].type).toBe(TransactionType.BUY);
            expect(transactions[0].currency).toBe('EUR');

            expect(transactions[1].name).toBe('Comcast A');
            expect(transactions[1].shares).toBe(10);
            expect(transactions[1].price).toBe(25.965);
            expect(transactions[1].amount).toBe(-259.65);
        });

        it('should filter out pending transactions', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-03;08:13:38;Pending;"SCALceP8htS4nAG";"Apple";Security;Sell;US0378331005;0;0,00;0,00;0,00;0,00;EUR
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions.length).toBe(1);
            expect(transactions[0].name).toBe('Continental');
        });

        it('should filter out cancelled transactions', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-04;19:36:49;Cancelled;"SCALaqdjFQUHgk7";"Roku A";Security;Sell;US77543R1023;0;0,00;0,00;0,00;0,00;EUR
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions.length).toBe(1);
            expect(transactions[0].name).toBe('Continental');
        });

        it('should parse European number format correctly', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;1,50;2,25;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions[0].shares).toBe(7);
            expect(transactions[0].price).toBe(70.98);
            expect(transactions[0].fee).toBe(1.5);
            expect(transactions[0].tax).toBe(2.25);
        });

        it('should combine date and time into Date object', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions[0]!.date).toBeInstanceOf(Date);
            expect(transactions[0]!.date!.getFullYear()).toBe(2026);
            expect(transactions[0]!.date!.getMonth()).toBe(1); // February (0-indexed)
            expect(transactions[0]!.date!.getDate()).toBe(5);
            expect(transactions[0]!.date!.getHours()).toBe(18);
            expect(transactions[0]!.date!.getMinutes()).toBe(44);
            expect(transactions[0]!.date!.getSeconds()).toBe(14);
        });

        it('should map transaction types correctly', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL1";"Test Buy";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR
2026-02-05;18:44:14;Executed;"SCAL2";"Test Sell";Security;Sell;DE0005439004;7;70,98;496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions[0].type).toBe(TransactionType.BUY);
            expect(transactions[1].type).toBe(TransactionType.SELL);
        });

        it('should remove quotes from description', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions[0].name).toBe('Continental');
            expect(transactions[0].name).not.toContain('"');
        });

        it('should handle zero values correctly', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions[0].fee).toBe(0);
            expect(transactions[0].tax).toBe(0);
        });

        it('should set source metadata correctly', async () => {
            const csvContent = `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency
2026-02-05;18:44:14;Executed;"SCAL9h5JMARgS6E";"Continental";Security;Buy;DE0005439004;7;70,98;-496,86;0,00;0,00;EUR`;

            const transactions = await reader.readTransactions({ csvContent });

            expect(transactions[0].source).toBe('scalable-capital-csv');
        });
    });
});
