import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sepolia, useAccount, useConnect, useContractRead, usePrepareContractWrite, useWalletClient } from 'wagmi';
import { Buffer } from 'buffer';

import * as merkle from "@clique/merkle";
import axios from 'axios';
import { disciplina } from '../contract/disciplina';
import * as EscrowContract from '../contract/data_escrow.json';

import { InjectedConnector } from 'wagmi/connectors/injected';
import { getContract, waitForTransaction } from 'wagmi/actions';
import { keccak256 } from 'viem';
import * as CBOR from 'cbor-web';


const addrHashCBOR = (addr: string) => {
    const buf = Buffer.from(addr.slice(2), "hex");
    const packed = CBOR.encode(buf);
    return keccak256(packed);
}

const reconstructProof = (proof: any): merkle.MerkleProofNode<any> => {
    if ('left' in proof) {
        return new merkle.MerkleProofBranch(
            reconstructProof(proof.left),
            reconstructProof(proof.right)
        );
    } else if ('sig' in proof) {
        return new merkle.MerkleProofPruned(
            new merkle.MerkleSig(
                proof.sig.size,
                Buffer.from(proof.sig.hash.data)
            )
        );
    } else {
        return new merkle.MerkleProofLeaf(proof.value);
    }
}

export default function PostBlock() {
    const navigate = useNavigate();
    const { connectAsync } = useConnect();
    const { data: walletClient, isError, isLoading } = useWalletClient({
        chainId: sepolia.id,
    });

    const [text, setText] = useState('');
    const [blocks, setBlocks] = useState([]);

    const handleChange = (event: any) => {
        setText(event.target.value);
    }

    const updateBlocks = async () => {
        try {
            const res = await axios.get(`${process.env.REACT_APP_SERVER_URL}/my-blocks`, { withCredentials: true });
            console.log(res);
            setBlocks(res.data.reverse());
        } catch (err) {
            console.log(err);
        }
    }

    const getProof = async (blockHash: string, ix: number) => {
        const { data } = await axios.get(`${process.env.REACT_APP_SERVER_URL}/get-data`, {
            params: {
                block: blockHash,
                ix,
            },
            withCredentials: true
        });

        const { proof } = data;
        const actualProof = reconstructProof(proof);
        console.log(proof);
        console.log(actualProof);
        console.log(merkle.restoreRoot(actualProof).hash.toString('hex'));
    }

    const postBlock = async () => {
        try {
            if (!walletClient) {
                throw new Error('Wallet client not connected');
            }

            walletClient.chain = sepolia;
            console.log(walletClient);

            const dscpContract = getContract({
                address: disciplina.address,
                abi: disciplina.abi,
                walletClient,
                chainId: sepolia.id,
            });

            const addr = walletClient.account.address;
            let prevHash = addrHashCBOR(addr);
            const prevHashCur = await dscpContract.read.prevHashCur([addr]) as string;
            if (prevHashCur !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                const merkleRootCur = await dscpContract.read.merkleRootCur([addr]) as string;
                const sizeCur = Number(await dscpContract.read.sizes([addr]));

                const prevHeader = new merkle.PrivateHeader(
                    new merkle.MerkleSig(sizeCur, Buffer.from(merkleRootCur.slice(2), "hex")),
                    Buffer.from(prevHashCur.slice(2), "hex")
                )

                console.log(prevHashCur, merkleRootCur, sizeCur);
                console.log(prevHeader);
                prevHash = `0x${merkle.hashSerializable(prevHeader).toString('hex')}`;
            }

            console.log(prevHash);

            const list = JSON.parse(text);
            if (!Array.isArray(list)) {
                throw new Error('Invalid list');
            }

            const tree = merkle.listToMerkleTree(list);
            const sig = tree.signature();
            const header = new merkle.PrivateHeader(sig, Buffer.from(prevHash.slice(2), "hex"));
            const merkleRootHash = `0x${sig.hash.toString('hex')}`;

            console.log(header);
            const res = await dscpContract.simulate.submitHeader([
                prevHash,
                merkleRootHash,
                sig.size
            ], { account: addr });
            console.log(res);

            const txId = await dscpContract.write.submitHeader([
                prevHash,
                merkleRootHash,
                sig.size
            ], { account: addr });
            console.log(txId);

            const data = await waitForTransaction({
                hash: txId,
            })
            console.log(data);

            console.log('Posting the sales contract!')

            const deployTxId = await walletClient.deployContract({
                abi: EscrowContract.abi,
                bytecode: `0x${EscrowContract.bytecode.object.slice(2)}`,
                account: addr,
                args: [addr, merkleRootHash, list.map((_, index) => ({ index, price: 1000}))]
            })

            console.log(deployTxId);

            const data2 = await waitForTransaction({
                hash: deployTxId,
            });
            console.log(data);

            const postRes = await axios.post(`${process.env.REACT_APP_SERVER_URL}/post-block`, {
                parts: list,
                txId,
                // salesContract,
            }, { withCredentials: true });
            console.log(postRes);
            updateBlocks();


        } catch (err) {
            console.log(err);
        }
    }

    useEffect(() => {
        if (!walletClient) {
            connectAsync({
                connector: new InjectedConnector(),
            });
        }
    }, [walletClient, connectAsync]);

    useEffect(() => { updateBlocks() }, []);

    return (
        <div>
            <h3>Post Data Block</h3>
            <textarea id="blockData" name="blockData" rows={4} cols={50} value={text} onChange={handleChange} />
            <button type="button" onClick={postBlock}>
                Post Block
            </button>

            <h3>My Blocks</h3>
            <ul>
                {blocks.map((block: any, i) => (
                    <li key={block.id}>
                        <span onClick={() => getProof(block.hash, 0)}>{block.hash.slice(0, 8)}</span>
                        (<a href={`https://sepolia.etherscan.io/tx/${block.txId}`} target='blank'>tx</a>):
                        {JSON.stringify(block.dataParts)}
                    </li>
                ))}
            </ul>
        </div>
    );
}