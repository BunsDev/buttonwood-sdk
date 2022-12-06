import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { Bond, BondData, LoanManager, TrancheData } from '../src';
import {
    encodeSqrtRatioX96,
    FeeAmount,
    nearestUsableTick,
    Pool,
    TickMath,
} from '@uniswap/v3-sdk';

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
    return {
        id: address,
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

function getLoanManager(bond: Bond): LoanManager {
    const currency = new Token(
        1,
        '0x462e8bc032cfc032740e418a3f4b18f9a127f192',
        9,
        'USDC',
        'USD',
    );

    const pools: Pool[] = [];
    for (const tranche of bond.tranches.slice(0, -1)) {
        pools.push(
            new Pool(
                currency,
                tranche.token,
                FeeAmount.MEDIUM,
                encodeSqrtRatioX96(101, 100),
                '1000000000000000000',
                TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101, 100)),
                [
                    {
                        index: nearestUsableTick(TickMath.MIN_TICK, 60),
                        liquidityNet: '1000000000000000000',
                        liquidityGross: '1000000000000000000',
                    },
                    {
                        index: nearestUsableTick(TickMath.MAX_TICK, 60),
                        liquidityNet: '-1000000000000000000',
                        liquidityGross: '1000000000000000000',
                    },
                ],
            ),
        );
    }
    return new LoanManager(bond, pools);
}

describe('LoanManager', () => {
    it('Fetches tranche price', () => {
        const bond = new Bond(getBondData({}));
        const loanManager = getLoanManager(bond);
        const price = loanManager.getTranchePrice(0);
        expect(
            price
                .quote(
                    CurrencyAmount.fromRawAmount(bond.tranches[0].token, '100'),
                )
                .quotient.toString(),
        ).toEqual('99');
    });

    it('Fetches lender APY', async () => {
        const bond = new Bond(getBondData({}));
        const loanManager = getLoanManager(bond);
        const deposit = CurrencyAmount.fromRawAmount(
            loanManager.currency,
            '50000000000',
        );
        const lenderAPY = await loanManager.getLenderInterest(deposit, 0);
        expect(lenderAPY.toFixed(3)).toEqual('0.697');
    });
});
