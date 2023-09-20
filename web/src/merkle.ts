import keccak256 from "keccak256";
import * as cbor from "cbor-x";
import * as bs from "binary-searching";

export const cborEncoder = new cbor.Encoder();

export type Hash = Uint8Array;

export const hashesEqual = (a: Hash, b: Hash): boolean => {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

export const hashFromHex = (hex: string): Hash => {
    if (hex.startsWith("0x")) {
        hex = hex.slice(2);
    }
    return new Uint8Array(Buffer.from(hex, "hex"));
}

export const hashRaw = (cbor: Uint8Array): Hash => {
    return keccak256(cbor);
}

export const hashSerializable = (obj: any): Hash => {
    const data = cborEncoder.encode(obj);
    return keccak256(data);
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
}

// @ts-ignore
cbor.addExtension({
    Class: MerkleSig,
    // @ts-ignore
    encode(sig: MerkleSig, encodeFn) {
        console.log("I CALLED")
        encodeFn(1043);
        encodeFn(sig.size);
        encodeFn(Buffer.from(sig.hash));
    },
    decode(item: any) {
        return new MerkleSig(item[0], new Uint8Array(item[1]));
    }
})

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

export type MerkleNode = MerkleLeaf | MerkleBranch;

export class MerkleLeaf {
    value: any;
    sig: MerkleSig;

    constructor(value: any) {
        this.value = value;
        this.sig = new MerkleSig(1, hashSerializable(value));
    }
}

export class MerkleBranch {
    left: MerkleNode;
    right: MerkleNode;
    sig: MerkleSig;

    constructor(left: MerkleNode, right: MerkleNode) {
        this.left = left;
        this.right = right;
        this.sig = combineTwoSigs(left.sig, right.sig);
    }
}

// Proofs

export type MerkleProofNode = MerkleProofLeaf | MerkleProofPruned | MerkleProofBranch;

export class MerkleProofLeaf {
    value: any;

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

export class MerkleProofBranch {
    left: MerkleProofNode;
    right: MerkleProofNode;

    constructor(left: MerkleProofNode, right: MerkleProofNode) {
        this.left = left;
        this.right = right;
    }
}

export const restoreRoot = (proof: MerkleProofNode): MerkleSig => {
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


export const verifyProof = (proof: MerkleProofNode, root: MerkleSig): boolean => {
    const proofRoot = restoreRoot(proof);
    return hashesEqual(proofRoot.hash, root.hash) && proofRoot.size === root.size;
}

// Interface

export class MerkleTree {
    root?: MerkleNode;

    constructor(root?: MerkleNode) {
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

    makeProof(index: number | number[]): MerkleProofNode {
        if (this.empty()) {
            return new MerkleProofPruned(this.signature());
        }

        if (typeof index === "number") {
            index = [index];
        }

        index = index.sort((a, b) => a - b);
        
        const go = (node: MerkleNode, ixs: number[], offsetIx: number): MerkleProofNode => {
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

const listToMerkleNode = (list: any[]): MerkleNode | undefined => {
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

export const listToMerkleTree = (list: any[]): MerkleTree => {
    return new MerkleTree(listToMerkleNode(list));
}