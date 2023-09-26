import * as CBOR from 'cbor-web';
import {
    listToMerkleTree, verifyProof,
    MerkleSig, MerkleTree, MerkleNode, MerkleLeaf, MerkleBranch,
    PrivateHeader,
    Hash, hashSerializable, hashRaw, hashFromHex
} from ".";

const sigToString = (sig: MerkleSig): string => {
    return `[${sig.size}, ${Buffer.from(sig.hash).toString("hex").slice(0, 8)}]`;
}

const padString = (last=false): string => {
    const f = last ? "└" : "├";
    return f + "─";
}

const printNode = (node?: MerkleNode<any>, pad: string = "", last = true) => {
    if (node === undefined) {
        console.log(pad + "()");
        return;
    }

    if (node instanceof MerkleLeaf) {
        console.log(`${pad}b ${sigToString(node.sig)} ${node.value.toString()}`);
    } else {
        console.log(`${pad}b ${sigToString(node.sig)}`);
        const prePad = pad.length? (pad.slice(0, -2) + (last ? "  " : "│ ")) : "";
        const padL = prePad + padString(false);
        const padR = prePad + padString(true);
        printNode(node.left, padL, false);
        printNode(node.right, padR, true);
    }
}

const printTree = (tree: MerkleTree<any>) => {
    printNode(tree.root);
}

const bufstr = (buf: Buffer) => buf.toString('hex').match(/../g)!.join(' ')

const MY_CONTRACT_ADDRESS = "0x7d5f8E5Bbc981F30a0996089A7aAA1A09bC01312";

const main = () => {
    const tree = listToMerkleTree([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    printTree(tree);

    console.log(tree.signature());
    console.log(Buffer.from(tree.signature().hash).toString("hex"));

    const pHash = hashFromHex("0x95deefbfdd17d8c322eed5315f46dd45a5b50615392d7e4a1cbc9983afbfc45d");
    const header = new PrivateHeader(
        new MerkleSig(5, hashFromHex("0xbcd96efb2dd6c0319c87b149754a00e7c35608ab50c104a649ca0a2be06fac75")),
        pHash,
    );

    const headerBinTargetStr = "0x8300582095deefbfdd17d8c322eed5315f46dd45a5b50615392d7e4a1cbc9983afbfc45d190413055820bcd96efb2dd6c0319c87b149754a00e7c35608ab50c104a649ca0a2be06fac75";
    const headerBinTarget = Buffer.from(headerBinTargetStr.slice(2), "hex");

    const headerBin = CBOR.encode(header);
    
    console.log(bufstr(headerBinTarget));
    console.log(bufstr(headerBin));
    console.log('-----')
    console.log(hashRaw(headerBinTarget));
    console.log(hashSerializable(header));
}

main();