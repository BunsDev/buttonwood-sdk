import { CurrencyAmount, Percent, Token } from '@uniswap/sdk-core';
import BondAbi from '../../abis/BondController.json';
import { BigNumber, BigNumberish, Contract } from 'ethers';
import { addressEquals, toBaseUnits, invariant } from '../utils';
import { Tranche } from './tranche';

export const TRANCHE_RATIO_GRANULARITY = 1000;

export interface TrancheData {
    id: string;
    index: string;
    ratio: string;
    totalCollateral: BigNumberish;
    totalCollateralAtMaturity: BigNumberish | null;
    totalSupplyAtMaturity: BigNumberish | null;
    token: TokenData;
}

export interface TokenData {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
    totalSupply: BigNumberish;
}

export interface BondData {
    id: string;
    startDate: BigNumberish;
    maturityDate: BigNumberish;
    maturedDate: BigNumberish | null;
    collateral: TokenData;
    tranches: TrancheData[];
    isMature: boolean;
    totalDebt: BigNumberish;
    totalDebtAtMaturity: BigNumberish | null;
    totalCollateral: BigNumberish;
    totalCollateralAtMaturity: BigNumberish | null;
    depositLimit?: BigNumberish;
}

export class Bond {
    public collateral: Token;
    public tranches: Tranche[] = [];

    constructor(private data: BondData, chainId = 1) {
        invariant(data.tranches.length >= 2, 'Invalid tranches');
        this.collateral = new Token(
            chainId,
            data.collateral.id,
            parseInt(data.collateral.decimals, 10),
            data.collateral.symbol,
            data.collateral.name,
        );

        const sortedTranches = [...this.data.tranches].sort((a, b) =>
            a.index > b.index ? 1 : -1,
        );
        for (const tranche of sortedTranches) {
            this.tranches.push(new Tranche(tranche, this.collateral, chainId));
        }
    }

    get address(): string {
        return this.data.id;
    }

    get totalDebt(): BigNumber {
        return BigNumber.from(this.data.totalDebt);
    }

    get totalDebtAtMaturity(): BigNumber {
        return BigNumber.from(this.data.totalDebtAtMaturity || 0);
    }

    get totalCollateral(): BigNumber {
        return BigNumber.from(this.data.totalCollateral);
    }

    get totalCollateralAtMaturity(): BigNumber {
        return BigNumber.from(this.data.totalCollateralAtMaturity || 0);
    }

    get cdr(): Percent {
        if (this.mature) {
            return new Percent(
                this.totalCollateralAtMaturity.toString(),
                this.totalDebtAtMaturity.toString(),
            );
        } else {
            return new Percent(
                this.totalCollateral.toString(),
                this.totalDebt.toString(),
            );
        }
    }

    get depositLimit(): BigNumber {
        return this.data.depositLimit
            ? BigNumber.from(this.data.depositLimit)
            : BigNumber.from(0);
    }

    get startDate(): BigNumber {
        return BigNumber.from(this.data.startDate);
    }

    get maturityDate(): BigNumber {
        if (this.mature) {
            return BigNumber.from(this.data.maturedDate || 0);
        } else {
            return BigNumber.from(this.data.maturityDate);
        }
    }

    get mature(): boolean {
        return this.data.isMature;
    }

    get contract(): Contract {
        return new Contract(this.address, BondAbi);
    }

    collateralization(trancheIndex: number): Percent {
        const trancheTotalSupply = this.mature
            ? this.tranches[trancheIndex].totalSupplyAtMaturity
            : this.tranches[trancheIndex].totalSupply;

        if (trancheTotalSupply.eq(0)) {
            return new Percent(0, 1);
        }

        let collateral = this.mature
            ? this.totalCollateralAtMaturity
            : this.totalCollateral;

        // pretend to allocate debt in waterfall sequence up to the requested tranche
        for (let i = 0; i < trancheIndex; i++) {
            const tranche = this.tranches[i];
            const trancheSupply = this.mature
                ? tranche.totalSupplyAtMaturity
                : tranche.totalSupply;
            collateral = collateral.lt(trancheSupply)
                ? BigNumber.from(0)
                : collateral.sub(trancheSupply);
        }

        // final result is remaining collateral after distribution over the debt of the tranche
        return new Percent(
            collateral.toString(),
            trancheTotalSupply.toString(),
        );
    }

    trancheRedeemValue(
        trancheAmount: CurrencyAmount<Token>,
    ): CurrencyAmount<Token> {
        const inputTranche: Tranche | undefined = this.tranches.find((t) =>
            addressEquals(t.address, trancheAmount.currency.address),
        );

        invariant(inputTranche, 'Invalid input currency');

        if (this.mature) {
            return inputTranche.redeemValue(trancheAmount);
        }

        let remainingCollateral = this.totalCollateral;
        for (let i = 0; i < this.tranches.length - 1; i++) {
            const t = this.tranches[i];
            const trancheCollateral = remainingCollateral.gt(t.totalSupply)
                ? t.totalSupply
                : remainingCollateral;
            remainingCollateral = remainingCollateral.sub(trancheCollateral);

            if (addressEquals(t.address, inputTranche.address)) {
                return CurrencyAmount.fromRawAmount(
                    this.collateral,
                    trancheCollateral
                        .mul(toBaseUnits(trancheAmount))
                        .div(t.totalSupply)
                        .toString(),
                );
            }
        }

        const zTranche = this.tranches[this.tranches.length - 1];
        return CurrencyAmount.fromRawAmount(
            this.collateral,
            remainingCollateral
                .mul(toBaseUnits(trancheAmount))
                .div(zTranche.totalSupply)
                .toString(),
        );
    }

    /**
     * Given a certain amount of deposited collateral, return the tranche tokens that will be minted
     * @param collateralInput the amount of collateral to input into the bond
     * @return output The amount of tranche tokens in order that will be received for the input
     */
    deposit(collateralInput: CurrencyAmount<Token>): CurrencyAmount<Token>[] {
        invariant(
            collateralInput.currency.equals(this.collateral),
            'Invalid input currency - not bond collateral',
        );

        invariant(
            this.depositLimit.eq(0) ||
                this.totalCollateral
                    .add(collateralInput.quotient.toString())
                    .lte(this.depositLimit),
            'Exceeded deposit limit',
        );

        const input = toBaseUnits(collateralInput);
        const result: CurrencyAmount<Token>[] = [];

        for (const tranche of this.tranches) {
            const trancheToken = tranche.token;
            if (BigNumber.from(this.totalCollateral).eq(0)) {
                result.push(
                    CurrencyAmount.fromRawAmount(
                        trancheToken,
                        input
                            .mul(tranche.ratio)
                            .div(TRANCHE_RATIO_GRANULARITY)
                            .toString(),
                    ),
                );
            } else {
                // Multiply input by the tranche ratio and by the debt:collateral ratio
                const outputAmount = input
                    .mul(tranche.ratio)
                    .mul(this.totalDebt)
                    .div(TRANCHE_RATIO_GRANULARITY)
                    .div(this.totalCollateral);
                result.push(
                    CurrencyAmount.fromRawAmount(
                        trancheToken,
                        outputAmount.toString(),
                    ),
                );
            }
        }
        return result;
    }

    /**
     * Given an amount of a single tranche token, return the amount of collateral returned by redeeming after maturity
     * @param trancheAmount The amount of the tranche token to redeem
     * @return output The amount of collateral returned
     */
    redeemMature(trancheAmount: CurrencyAmount<Token>): CurrencyAmount<Token> {
        invariant(this.mature, 'Bond is not mature');

        let tranche: Tranche | undefined = undefined;
        for (const t of this.tranches) {
            if (addressEquals(t.address, trancheAmount.currency.address)) {
                tranche = t;
            }
        }
        invariant(tranche, 'Invalid input currency');
        invariant(
            trancheAmount.lessThan(tranche.totalCollateral.toString()) ||
                trancheAmount.equalTo(tranche.totalCollateral.toString()),
            'Insufficient collateral',
        );

        return CurrencyAmount.fromRawAmount(
            this.collateral,
            BigNumber.from(tranche.totalCollateral)
                .mul(toBaseUnits(trancheAmount))
                .div(tranche.totalSupply)
                .toString(),
        );
    }

    /**
     * Given amounts of redeemed tranche tokens, return the amount of collateral that will be returned
     * @param trancheInputs the amounts of tranche tokens to redeem in order of tranche seniority
     * @return output The amount of collateral that will be returned
     */
    redeem(trancheInputs: CurrencyAmount<Token>[]): CurrencyAmount<Token> {
        invariant(
            trancheInputs.length === this.tranches.length,
            'Invalid tranche inputs',
        );
        let totalDebtRedeemed = BigNumber.from(0);
        for (let i = 0; i < trancheInputs.length; i++) {
            const trancheInput = trancheInputs[i];
            const tranche = this.tranches[i];
            invariant(
                addressEquals(trancheInput.currency.address, tranche.address),
                'Invalid tranche inputs',
            );

            totalDebtRedeemed = totalDebtRedeemed.add(
                toBaseUnits(trancheInput),
            );
        }

        invariant(
            totalDebtRedeemed.lte(this.totalCollateral.toString()),
            'Insufficient collateral',
        );

        return CurrencyAmount.fromRawAmount(
            this.collateral,
            totalDebtRedeemed
                .mul(this.totalCollateral)
                .div(this.totalDebt)
                .toString(),
        );
    }

    /**
     * Given a certain amount of deposited collateral, return the tranche tokens that will be minted
     * @param desiredTrancheOutput the amount of collateral to input into the bond
     * @return output The amount of tranche tokens in order that will be received for the input
     */
    getRequiredDeposit(
        desiredTrancheOutput: CurrencyAmount<Token>,
    ): CurrencyAmount<Token> {
        for (const tranche of this.tranches) {
            if (
                addressEquals(
                    tranche.address,
                    desiredTrancheOutput.currency.address,
                )
            ) {
                if (BigNumber.from(this.totalCollateral).eq(0)) {
                    return CurrencyAmount.fromRawAmount(
                        this.collateral,
                        toBaseUnits(desiredTrancheOutput)
                            .mul(TRANCHE_RATIO_GRANULARITY)
                            .div(tranche.ratio)
                            .toString(),
                    );
                } else {
                    return CurrencyAmount.fromRawAmount(
                        this.collateral,
                        // note this is the inverse of deposit calculation
                        toBaseUnits(desiredTrancheOutput)
                            .mul(TRANCHE_RATIO_GRANULARITY)
                            .mul(this.totalCollateral)
                            .div(tranche.ratio)
                            .div(this.totalDebt)
                            .toString(),
                    );
                }
            }
        }

        throw new Error('Invalid desired output - not a tranche token');
    }
}
