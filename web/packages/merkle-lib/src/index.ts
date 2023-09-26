import keccak256 from "keccak256";
import * as CBOR from "cbor-web";
import * as bs from "binary-searching";
import { Buffer } from "buffer";

export type Hash = Buffer;

export const hashFromHex = (hex: string): Hash => {
    if (hex.startsWith("0x")) {
        hex = hex.slice(2);
    }
    return Buffer.from(hex, "hex");
}

export const hashRaw = (cbor: Buffer): Hash => {
    return keccak256(cbor);
}

export const hashSerializable = (obj: any): Hash => {
    const data = CBOR.encode(obj);
    return keccak256(Buffer.from(data));
}

const word32LE = (n: number): Uint8Array => {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint32(0, n, true);
    return new Uint8Array(buf);
}

export class MerkleSig {
    size: number;
    hash: Hash;

    constructor(size: number, hash: Hash) {
        this.size = size;
        this.hash = hash;
    }

    encodeCBOR(encoder: CBOR.Encoder): boolean {
        return encoder._pushNumber(1043) && encoder.pushAny(this.size) && encoder.pushAny(this.hash);
    }
}

const hashTwoSignatures = (a: MerkleSig, b: MerkleSig): Hash => {
    const data = new Uint8Array(4 + 32 + 4 + 32);
    data.set(word32LE(a.size), 0);
    data.set(a.hash, 4);
    data.set(word32LE(b.size), 36);
    data.set(b.hash, 40);
    return keccak256(Buffer.from(data));
}

const combineTwoSigs = (a: MerkleSig, b: MerkleSig): MerkleSig => {
    return new MerkleSig(a.size + b.size, hashTwoSignatures(a, b));
}


// Trees

export type MerkleNode<T> = MerkleLeaf<T> | MerkleBranch<T>;

export class MerkleLeaf<T> {
    value: T;
    sig: MerkleSig;

    constructor(value: any) {
        this.value = value;
        this.sig = new MerkleSig(1, hashSerializable(value));
    }
}

export class MerkleBranch<T> {
    left: MerkleNode<T>
    right: MerkleNode<T>;
    sig: MerkleSig;

    constructor(left: MerkleNode<T>, right: MerkleNode<T>) {
        this.left = left;
        this.right = right;
        this.sig = combineTwoSigs(left.sig, right.sig);
    }
}

// Proofs

export type MerkleProofNode<T> = MerkleProofLeaf<T> | MerkleProofPruned | MerkleProofBranch<T>;

export class MerkleProofLeaf<T> {
    value: T;

    constructor(value: any) {
        this.value = value;
    }
}

export class MerkleProofPruned {
    sig: MerkleSig;

    constructor(sig: MerkleSig) {
        this.sig = sig;
    }
}

export class MerkleProofBranch<T> {
    left: MerkleProofNode<T>;
    right: MerkleProofNode<T>;

    constructor(left: MerkleProofNode<T>, right: MerkleProofNode<T>) {
        this.left = left;
        this.right = right;
    }
}

export const restoreRoot = (proof: MerkleProofNode<any>): MerkleSig => {
    if (proof instanceof MerkleProofLeaf) {
        return new MerkleSig(1, hashSerializable(proof.value));
    }
    if (proof instanceof MerkleProofPruned) {
        return proof.sig;
    }
    const { left, right } = proof;
    const leftRoot = restoreRoot(left);
    const rightRoot = restoreRoot(right);

    return combineTwoSigs(leftRoot, rightRoot);
}


export const verifyProof = (proof: MerkleProofNode<any>, root: MerkleSig): boolean => {
    const proofRoot = restoreRoot(proof);
    return proofRoot.hash.equals(root.hash) && proofRoot.size === root.size;
}

// Interface

export class MerkleTree<T> {
    root?: MerkleNode<T>;

    constructor(root?: MerkleNode<T>) {
        this.root = root;
    }

    empty(): boolean {
        return this.root === undefined;
    }

    size(): number {
        if (this.empty()) {
            return 0;
        }
        return this.root!.sig.size;
    }

    signature(): MerkleSig {
        if (this.empty()) {
            return new MerkleSig(0, keccak256(""));
        }
        return this.root!.sig;
    }

    makeProof(index: number | number[]): MerkleProofNode<T> {
        if (this.empty()) {
            return new MerkleProofPruned(this.signature());
        }

        if (typeof index === "number") {
            index = [index];
        }

        index = index.sort((a, b) => a - b);
        
        const go = (node: MerkleNode<T>, ixs: number[], offsetIx: number): MerkleProofNode<T> => {
            if (ixs.length === 0 || ixs[0] >= offsetIx + node.sig.size || ixs[ixs.length - 1] < offsetIx) {
                return new MerkleProofPruned(node.sig);
            }
            
            if (node instanceof MerkleLeaf) {
                return new MerkleProofLeaf(node.value);
            }

            const leftSize = node.left.sig.size;
            const pivot = bs.ge(ixs, offsetIx + leftSize);
            const leftIxs = ixs.slice(0, pivot);
            const rightIxs = ixs.slice(pivot);
            const left = go(node.left, leftIxs, offsetIx);
            const right = go(node.right, rightIxs, offsetIx + leftSize);
            return new MerkleProofBranch(left, right);
        }

        return go(this.root!, index, 0);
    }
}

function listToMerkleNode<T>(list: T[]): MerkleNode<T> | undefined {
    if (list.length === 0) {
        return undefined;
    }
    if (list.length === 1) {
        return new MerkleLeaf(list[0]);
    }
    const mid = Math.floor(list.length / 2);
    const left = listToMerkleNode(list.slice(0, mid));
    const right = listToMerkleNode(list.slice(mid));
    return new MerkleBranch(left!, right!);
}

export function listToMerkleTree<T>(list: T[]): MerkleTree<T> {
    return new MerkleTree(listToMerkleNode(list));
}


// Block header

export class PrivateHeader {
    merkleRoot: MerkleSig;
    prevHash: Hash;

    constructor(merkleRoot: MerkleSig, prevHash: Hash) {
        this.merkleRoot = merkleRoot;
        this.prevHash = prevHash;
    }

    encodeCBOR(encoder: CBOR.Encoder): boolean {
        return encoder.pushAny([0, this.prevHash, this.merkleRoot]);
    }
}


// Reexport for CBOR encoding
export function serialize(obj: any): Buffer {
    return CBOR.encode(obj);
}
