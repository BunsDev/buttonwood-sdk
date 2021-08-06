import { BigNumber, Contract } from 'ethers';
import { Token } from '@uniswap/sdk-core';
import TrancheAbi from '../../abis/Tranche.json';
import { TrancheData } from './bond';

export class Tranche {
    constructor(private data: TrancheData) {}

    get address(): string {
        return this.data.id;
    }

    get ratio(): number {
        return this.data.ratio;
    }

    get totalCollateral(): BigNumber {
        return BigNumber.from(this.data.totalCollateral);
    }

    get decimals(): number {
        return this.data.token.decimals;
    }

    get totalSupply(): BigNumber {
        return BigNumber.from(this.data.token.totalSupply);
    }

    get token(): Token {
        return new Token(1, this.address, this.data.token.decimals);
    }

    get contract(): Contract {
        return new Contract(this.address, TrancheAbi);
    }
}
