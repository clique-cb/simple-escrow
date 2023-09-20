import { addExtension, Encoder } from "cbor-x";
import { listToMerkleTree, verifyProof, MerkleSig, Hash, hashSerializable, hashRaw, cborEncoder, hashFromHex } from "./merkle";
import { ethers } from "ethers";

class PrivateHeader {
    merkleRoot: MerkleSig;
    prevHash: Hash;

    constructor(merkleRoot: MerkleSig, prevHash: Hash) {
        this.merkleRoot = merkleRoot;
        this.prevHash = prevHash;
    }
}

const main = () => {
    const tree = listToMerkleTree([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    console.log(tree.signature());
    console.log(Buffer.from(tree.signature().hash).toString("hex"));

    const proof1 = tree.makeProof([0]);
    const proof2 = tree.makeProof([1]);
    const proof3 = tree.makeProof([2]);
    const proof45 = tree.makeProof([3, 4]);
    const proof67 = tree.makeProof([5, 6]);

    const root = tree.signature();
    console.log(verifyProof(proof1, root));
    console.log(verifyProof(proof2, root));
    console.log(verifyProof(proof3, root));
    console.log(verifyProof(proof45, root));
    console.log(verifyProof(proof67, root));

    const pHash = hashFromHex("0x95deefbfdd17d8c322eed5315f46dd45a5b50615392d7e4a1cbc9983afbfc45d");
    const header = new PrivateHeader(
        new MerkleSig(5, hashFromHex("0xbcd96efb2dd6c0319c87b149754a00e7c35608ab50c104a649ca0a2be06fac75")),
        pHash,
    );

    const headerBinTargetStr = "0x8300582095deefbfdd17d8c322eed5315f46dd45a5b50615392d7e4a1cbc9983afbfc45d190413055820bcd96efb2dd6c0319c87b149754a00e7c35608ab50c104a649ca0a2be06fac75";
    const headerBinTarget = Buffer.from(headerBinTargetStr.slice(2), "hex");

    const headerBin = cborEncoder.encode([0, Buffer.from(header.prevHash), header.merkleRoot]);
    
    console.log(cborEncoder.encode(header.merkleRoot));

    console.log('----')
    console.log(Buffer.from(pHash));
    console.log(cborEncoder.encode(pHash));
    console.log(cborEncoder.encode(Buffer.from(pHash)));
    console.log('----')

    console.log(cborEncoder.encode(0));
    console.log(cborEncoder.encode([0]));
    console.log(cborEncoder.encode([0, 1, 1043]));
    console.log(header.prevHash);
    console.log(cborEncoder.encode(header.prevHash));
    console.log(Buffer.from(headerBinTarget));
    console.log(Buffer.from(headerBin));

    console.log(hashRaw(headerBinTarget));
    console.log(hashRaw(headerBin));
}

main();