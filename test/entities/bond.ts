import { BigNumber, Contract } from 'ethers';
import { CurrencyAmount, Percent, Token } from '@uniswap/sdk-core';
import { Bond, BondData, Tranche, TrancheData } from '../../src';
import { addressEquals, toBaseUnits } from '../../src/utils';

function getTrancheData(
    address: string,
    ratio: number,
    index: number,
    totalCollateral: string,
    totalSupply: string,
    isMature = false,
): TrancheData {
    return {
        id: address,
        ratio: ratio.toString(),
        index: index.toString(),
        totalCollateral,
        totalCollateralAtMaturity: isMature ? totalCollateral : '0',
        totalSupplyAtMaturity: isMature ? totalSupply : '0',
        token: {
            id: address,
            symbol: 'tranche',
            name: 'tranche Z',
            decimals: '9',
            totalSupply,
        },
    };
}

function getBondData({
    totalDebt = '30000000',
    totalCollateral = '30000000',
    isMature = false,
}): BondData {
    const address = '0x8feb0797217962c517fac6da4f8667cc000129ff';
    const creator = '0x53462c34c2da0ac7cf391e305327f2c566d40d8d';
    return {
        id: address,
        creator,
        startDate: '1630432337',
        maturityDate: '1630532337',
        maturedDate: isMature ? '1630532337' : '0',
        collateral: {
            id: '0x1439b0429a3ad079c55093fbfd59a7c00c888d00',
            symbol: 'AMPL',
            name: 'Ampleforth',
            decimals: '9',
            totalSupply: '123123123123123',
        },
        tranches: [
            getTrancheData(
                '0xd6d8d269933c02db9f46f0f5b630ae91796a6afc',
                200,
                0,
                '1000000',
                '1000000',
            ),
            getTrancheData(
                '0x881d40237659c251811cec9c364ef91dc08d300c',
                300,
                1,
                '1000000',
                '1000000',
            ),
            getTrancheData(
                '0xd24400ae8bfebb18ca49be86258a3c749cf46853',
                500,
                2,
                '1000000',
                '1000000',
            ),
        ],
        isMature,
        totalDebt,
        totalDebtAtMaturity: isMature ? totalDebt : '0',
        totalCollateral,
        totalCollateralAtMaturity: isMature ? totalCollateral : '0',
    };
}

describe('Bond', () => {
    it('Fails with only 1 tranche', () => {
        const bondData = getBondData({});
        bondData.tranches = [bondData.tranches[0]];
        expect(() => new Bond(bondData)).toThrow(
            'Invariant failed: Invalid tranches',
        );
    });

    it('Fetches bond address', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.address).toEqual(bondData.id);
    });

    it('Fetches bond creator address', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.creator).toEqual(bondData.creator);
    });

    it('Fetches bond total debt', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.totalDebt).toEqual(BigNumber.from(bondData.totalDebt));
    });

    it('Fetches bond total collateral', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.totalCollateral).toEqual(
            BigNumber.from(bondData.totalCollateral),
        );
    });

    it('Fetches bond total collateral when mature', () => {
        const bondData = getBondData({ isMature: true });
        const bond = new Bond(bondData);
        expect(bond.totalCollateral).toEqual(BigNumber.from(30000000));
    });

    it('Fetches bond cdr', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.cdr).toEqual(
            new Percent(
                bondData.totalCollateral.toString(),
                bondData.totalDebt.toString(),
            ),
        );
    });

    it('Fetches bond start date', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.startDate).toEqual(BigNumber.from(bondData.startDate));
    });

    it('Fetches bond mature', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.mature).toEqual(bondData.isMature);
    });

    it('Fetches bond collateral', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        expect(bond.collateral).toEqual(
            new Token(
                1,
                bondData.collateral.id,
                parseInt(bondData.collateral.decimals, 10),
                bondData.collateral.symbol,
                bondData.collateral.name,
            ),
        );
    });

    it('Fetches bond tranches', () => {
        const bondData = getBondData({});
        const bond = new Bond(bondData);
        const tranches = bond.tranches;
        for (let i = 0; i < tranches.length; i++) {
            const tranche = tranches[i];
            expect(tranche).toEqual(
                new Tranche(bondData.tranches[i], bond.collateral),
            );
        }
    });

    it('Fetches contract', () => {
        const bond = new Bond(getBondData({}));
        expect(bond.contract.address).toEqual(bond.address);
        expect(bond.contract instanceof Contract).toBeTruthy();
    });

    describe('Get Required Deposit', () => {
        it('Properly calculates required input for A tranche', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const desiredOutput = CurrencyAmount.fromRawAmount(
                bond.tranches[0].token,
                '100000000',
            );
            const requiredInput = bond.getRequiredDeposit(desiredOutput);
            expect(bond.deposit(requiredInput)[0]).toEqual(desiredOutput);
        });

        it('Properly calculates required input for B tranche', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const desiredOutput = CurrencyAmount.fromRawAmount(
                bond.tranches[1].token,
                '300000000',
            );
            const requiredInput = bond.getRequiredDeposit(desiredOutput);
            expect(bond.deposit(requiredInput)[1]).toEqual(desiredOutput);
        });

        it('Properly calculates required input for Z tranche', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const desiredOutput = CurrencyAmount.fromRawAmount(
                bond.tranches[2].token,
                '100000000',
            );
            const requiredInput = bond.getRequiredDeposit(desiredOutput);
            expect(bond.deposit(requiredInput)[2]).toEqual(desiredOutput);
        });

        it('Properly calculates required input for Z tranche with no initial collateral', () => {
            const bondData = getBondData({
                totalDebt: '0',
                totalCollateral: '0',
            });
            const bond = new Bond(bondData);
            const desiredOutput = CurrencyAmount.fromRawAmount(
                bond.tranches[2].token,
                '100000000',
            );
            const requiredInput = bond.getRequiredDeposit(desiredOutput);
            expect(bond.deposit(requiredInput)[2]).toEqual(desiredOutput);
        });

        it('Fails for invalid tranche', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const desiredOutput = CurrencyAmount.fromRawAmount(
                bond.collateral,
                '100000000',
            );
            expect(() => bond.getRequiredDeposit(desiredOutput)).toThrow(
                'Invalid desired output - not a tranche token',
            );
        });
    });

    describe('Deposit', () => {
        it('properly calculates deposit output with even dcr', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const collateral = bond.collateral;
            const input = CurrencyAmount.fromRawAmount(collateral, '100000000');
            const output = bond.deposit(input);

            for (let i = 0; i < output.length; i++) {
                const trancheOutput = output[i];
                const tranche = bond.tranches[i];
                const expectedOutput = toBaseUnits(input)
                    .mul(bond.totalDebt)
                    .mul(tranche.ratio)
                    .div(1000)
                    .div(bond.totalCollateral);
                expect(toBaseUnits(trancheOutput)).toEqual(expectedOutput);
            }
        });

        it('properly calculates deposit output with positive dcr', () => {
            const bondData = getBondData({
                totalDebt: '600000000',
                totalCollateral: '1200000000',
            });
            const bond = new Bond(bondData);
            const collateral = bond.collateral;
            const input = CurrencyAmount.fromRawAmount(collateral, '100000000');
            const output = bond.deposit(input);

            for (let i = 0; i < output.length; i++) {
                const trancheOutput = output[i];
                const tranche = bond.tranches[i];
                const expectedOutput = toBaseUnits(input)
                    .mul(bond.totalDebt)
                    .mul(tranche.ratio)
                    .div(1000)
                    .div(bond.totalCollateral);
                expect(toBaseUnits(trancheOutput)).toEqual(expectedOutput);
            }
        });

        it('properly calculates deposit output with negative dcr', () => {
            const bondData = getBondData({
                totalDebt: '1200000000',
                totalCollateral: '600000000',
            });
            const bond = new Bond(bondData);
            const collateral = bond.collateral;
            const input = CurrencyAmount.fromRawAmount(collateral, '100000000');
            const output = bond.deposit(input);

            for (let i = 0; i < output.length; i++) {
                const trancheOutput = output[i];
                const tranche = bond.tranches[i];
                const expectedOutput = toBaseUnits(input)
                    .mul(bond.totalDebt)
                    .mul(tranche.ratio)
                    .div(1000)
                    .div(bond.totalCollateral);
                expect(toBaseUnits(trancheOutput)).toEqual(expectedOutput);
            }
        });

        it('properly calculates deposit output for first deposit', () => {
            const bondData = getBondData({
                totalDebt: '0',
                totalCollateral: '0',
            });
            const bond = new Bond(bondData);
            const collateral = bond.collateral;
            const input = CurrencyAmount.fromRawAmount(collateral, '100000000');
            const output = bond.deposit(input);

            for (let i = 0; i < output.length; i++) {
                const trancheOutput = output[i];
                const tranche = bond.tranches[i];
                const expectedOutput = toBaseUnits(input)
                    .mul(tranche.ratio)
                    .div(1000);
                expect(toBaseUnits(trancheOutput)).toEqual(expectedOutput);
            }
        });

        it('fails with invalid input', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[0].token,
                '123',
            );
            expect(() => bond.deposit(input)).toThrow(
                'Invariant failed: Invalid input currency - not bond collateral',
            );
        });
    });

    describe('Redeem Mature', () => {
        it('Successfully gets A-tranche redemption output', () => {
            const bondData = getBondData({ isMature: true });
            const bond = new Bond(bondData);
            const inputAmount = '1000000';
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[0].token,
                inputAmount,
            );
            const output = bond.redeemMature(input);
            expect(
                addressEquals(output.currency.address, bond.collateral.address),
            ).toBeTruthy();
            expect(toBaseUnits(output).toString()).toEqual(inputAmount);
            expect(bond.tranches[0].redeemValue(input)).toEqual(output);
        });

        it('Successfully gets B-tranche redemption output', () => {
            const bondData = getBondData({ isMature: true });
            const bond = new Bond(bondData);
            const inputAmount = '1000000';
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[1].token,
                inputAmount,
            );
            const output = bond.redeemMature(input);
            expect(
                addressEquals(output.currency.address, bond.collateral.address),
            ).toBeTruthy();
            expect(toBaseUnits(output).toString()).toEqual(inputAmount);
        });

        it('Successfully gets Z-tranche redemption output', () => {
            const bondData = getBondData({ isMature: true });
            const bond = new Bond(bondData);
            const inputAmount = '1000000';
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[2].token,
                inputAmount,
            );
            const output = bond.redeemMature(input);
            expect(
                addressEquals(output.currency.address, bond.collateral.address),
            ).toBeTruthy();
            expect(toBaseUnits(output).toString()).toEqual(inputAmount);
        });

        it('Successfully gets Z-tranche redemption output with partial redemption', () => {
            const bondData = getBondData({ isMature: true });
            const bond = new Bond(bondData);
            const inputAmount = '500000';
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[2].token,
                inputAmount,
            );
            const output = bond.redeemMature(input);
            expect(
                addressEquals(output.currency.address, bond.collateral.address),
            ).toBeTruthy();
            expect(toBaseUnits(output).toString()).toEqual(inputAmount);
        });

        it('Fails when redeeming more than balance', () => {
            const bondData = getBondData({ isMature: true });
            const bond = new Bond(bondData);
            const inputAmount = '10000000';
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[2].token,
                inputAmount,
            );
            expect(() => bond.redeemMature(input)).toThrow(
                'Invariant failed: Insufficient collateral',
            );
        });

        it('fails when not mature', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const input = CurrencyAmount.fromRawAmount(
                bond.tranches[0].token,
                '100000000',
            );
            expect(() => bond.redeemMature(input)).toThrow(
                'Invariant failed: Bond is not mature',
            );
        });

        it('fails with invalid input', () => {
            const bondData = getBondData({ isMature: true });
            const bond = new Bond(bondData);
            const input = CurrencyAmount.fromRawAmount(
                bond.collateral,
                '100000000',
            );
            expect(() => bond.redeemMature(input)).toThrow(
                'Invariant failed: Invalid input currency',
            );
        });
    });

    describe('Redeem', () => {
        it('successfully gets redemption output', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const input = bond.tranches.map((tranche) => {
                return CurrencyAmount.fromRawAmount(tranche.token, '1000000');
            });

            const output = bond.redeem(input);
            expect(toBaseUnits(output).toString()).toEqual('3000000');
        });

        it('fails with invalid input currency', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const input = bond.tranches.map(() => {
                return CurrencyAmount.fromRawAmount(bond.collateral, '1000000');
            });

            expect(() => bond.redeem(input)).toThrow(
                'Invariant failed: Invalid tranche inputs',
            );
        });

        it('fails with invalid number of inputs', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const input = bond.tranches.map((tranche) => {
                return CurrencyAmount.fromRawAmount(tranche.token, '1000000');
            });
            input.pop();

            expect(() => bond.redeem(input)).toThrow(
                'Invariant failed: Invalid tranche inputs',
            );
        });

        it('fails with too much input', () => {
            const bondData = getBondData({});
            const bond = new Bond(bondData);
            const input = bond.tranches.map((tranche) => {
                return CurrencyAmount.fromRawAmount(tranche.token, '20000000');
            });

            expect(() => bond.redeem(input)).toThrow(
                'Invariant failed: Insufficient collateral',
            );
        });
    });

    describe('Collateralization', () => {
        it('successfully gets collateralization for A tranche', () => {
            const bondData = getBondData({ totalCollateral: '3000000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(0);
            expect(output.toFixed(0).toString()).toEqual('300');
        });

        it('successfully gets collateralization for B tranche', () => {
            const bondData = getBondData({ totalCollateral: '3000000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(1);
            expect(output.toFixed(0).toString()).toEqual('200');
        });

        it('successfully gets collateralization for Z tranche', () => {
            const bondData = getBondData({ totalCollateral: '3000000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(2);
            expect(output.toFixed(0).toString()).toEqual('100');
        });

        it('successfully gets collateralization for A tranche =100%', () => {
            const bondData = getBondData({ totalCollateral: '1000000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(0);
            expect(output.toFixed(0).toString()).toEqual('100');
        });

        it('successfully gets collateralization for A tranche <100%', () => {
            const bondData = getBondData({ totalCollateral: '500000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(0);
            expect(output.toFixed(0)).toEqual('50');
        });

        it('successfully gets collateralization for B tranche =100%', () => {
            const bondData = getBondData({ totalCollateral: '2000000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(1);
            expect(output.toFixed(0).toString()).toEqual('100');
        });

        it('successfully gets collateralization for B tranche <100%', () => {
            const bondData = getBondData({ totalCollateral: '1500000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(1);
            expect(output.toFixed(0)).toEqual('50');
        });

        it('successfully gets collateralization for B tranche 0%', () => {
            const bondData = getBondData({ totalCollateral: '1000000' });
            const bond = new Bond(bondData);

            const output = bond.collateralization(1);
            expect(output.toFixed(0)).toEqual('0');
        });
    });
});
