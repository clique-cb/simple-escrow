import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WalletClient, sepolia, useAccount, useConnect, useContractRead, usePrepareContractWrite, useWalletClient } from 'wagmi';
import { Buffer } from 'buffer';

import * as merkle from "@clique/merkle";
import axios from 'axios';
import { disciplina } from '../contract/disciplina';
import { abi as escrowABI, bytecode as escrowBytecode } from '../contract/escrow';

import { InjectedConnector } from 'wagmi/connectors/injected';
import { getContract, waitForTransaction } from 'wagmi/actions';

import { addrHashCBOR, reconstructProof } from './common';

import TEST from "./test.json";
import { Path, Coords, encodeMap } from '../lib';

const MY_IMG: string = TEST.imagePart;
const MY_PATH: Path = TEST.pathPart;
const MY_ORIGIN: Coords = TEST.origin;

const encodedMap = encodeMap(MY_IMG, MY_PATH, MY_ORIGIN);

console.log(encodedMap);


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

    const startSales = async (client: WalletClient, rootHash: string, parts: any[]) => {
        console.log('Posting the sales contract!')

        const addr = client.account.address;
        const prices = parts.map((_, index) => ({ index, price: BigInt("100000000000000") }));
        prices[prices.length - 1].price = BigInt(0);

        // @ts-ignore
        const deployTxId = await client.deployContract({
            abi: escrowABI,
            bytecode: `0x${escrowBytecode}`,
            account: addr,
            args: [addr, `0x${rootHash}`, prices],
            chain: sepolia,
        });

        console.log(deployTxId);

        const { contractAddress } = await waitForTransaction({
            hash: deployTxId,
        });
        console.log(contractAddress);

        await axios.put(`${process.env.REACT_APP_SERVER_URL}/start-sales`, {
            block: rootHash,
            contractAddress,
        }, { withCredentials: true})

        return updateBlocks();
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

            const client = walletClient as WalletClient;
            client.chain = sepolia;
            console.log(client);

            const dscpContract = getContract({
                address: disciplina.address,
                abi: disciplina.abi,
                walletClient: client,
                chainId: sepolia.id,
            });

            const addr = client.account.address;
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

            // const list = JSON.parse(text);
            const list = encodedMap.map((x) => JSON.stringify(x));

            if (!Array.isArray(list)) {
                throw new Error('Invalid list');
            }

            const tree = merkle.listToMerkleTree(list);
            const sig = tree.signature();
            const header = new merkle.PrivateHeader(sig, Buffer.from(prevHash.slice(2), "hex"));
            const merkleRootHash = `0x${sig.hash.toString('hex')}`;

            console.log(header);
            const { request } = await dscpContract.simulate.submitHeader([
                prevHash,
                merkleRootHash,
                sig.size
            ], { account: addr });

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
                    <li key={block.hash}>
                        <span onClick={() => getProof(block.hash, 0)}>{block.hash.slice(0, 8)}</span>
                        (<a href={`https://sepolia.etherscan.io/tx/${block.txId}`} target='blank'>tx</a>):
                        {block.dataParts.length} parts
                        {block.salesContract ? (
                            <Link to={`/sale/${block.salesContract}`}>sales</Link>
                        ) : (
                            <button type="button" onClick={() => startSales(walletClient as WalletClient, block.hash, block.dataParts)}>
                                Start Sales
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}