import { useCallback, useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { sepolia, useAccount, useConnect, useSignMessage, useWalletClient } from "wagmi";
import { getContract, waitForTransaction } from 'wagmi/actions';
import axios from 'axios';

import { abi } from "../contract/escrow";
import { Button, Container, Table } from "react-bootstrap";
import { InjectedConnector } from "wagmi/connectors/injected";
import { MerkleProofNode, restoreRoot } from "@clique/merkle";
import { decodeEventLog } from "viem";

import { getValues, reconstructProof, signIn } from "./common";

enum PartState { Offered, Considered, Accepted, Rejected };

type DataPart = {
    index: number;
    price: bigint;
    deposit: bigint;
    state: PartState;
    canBuy: boolean;

    proof?: MerkleProofNode<any>;
}


const isValidRoot = (proof: MerkleProofNode<any>, root: string) => {
    const proofRoot = restoreRoot(proof);
    const hexHash = `0x${proofRoot.hash.toString('hex')}`;
    return hexHash === root;
}


export default function Sale() {
    const { contractAddr } = useParams();
    const { isConnected, isConnecting } = useAccount();
    const { connectAsync } = useConnect();
    const { signMessageAsync } = useSignMessage();
    const { data: walletClient, isError, isLoading } = useWalletClient({
        chainId: sepolia.id,
    });

    const [parts, setParts] = useState<DataPart[]>([]);
    const [blockHash, setBlockHash] = useState<string | null>(null);

    const getEscrowContract = useCallback(() => {
        if (!walletClient || !contractAddr) {
            throw new Error('walletClient or contractAddr is undefined');
        };

        walletClient.chain = sepolia;
        return getContract({
            address: contractAddr as any,
            abi,
            walletClient,
            chainId: sepolia.id,
        });
    }, [walletClient, contractAddr])

    const getBlockHash = useCallback(async () => {
        const escrowContract = getEscrowContract();
        const hash = await escrowContract.read.blockHash([], {}) as string;
        console.log(hash);
        setBlockHash(hash);
    }, [getEscrowContract]);

    const getParts = useCallback(async () => {
        const escrowContract = getEscrowContract();
        const addr = walletClient!.account.address;
        const fullParts = await escrowContract.read.saleState([], { account: addr }) as DataPart[];

        try {
            const { data } = await axios(`${process.env.REACT_APP_SERVER_URL}/user`, { withCredentials: true });
            const purchasedIxs = data.purchases.filter((p: any) => p.block === blockHash).map((p: any) => p.index);
            for (const p of fullParts) {
                const isPurchased = purchasedIxs.includes(p.index);
                if (isPurchased) {
                    const { data } = await axios(`${process.env.REACT_APP_SERVER_URL}/get-data`, { 
                        params: { block: blockHash, ix: p.index },
                        withCredentials: true
                    });
                    const { proof } = data;
                    p.proof = reconstructProof(proof);
                }
            }


        } catch (err) {
            console.error(err)
        }

        console.log(fullParts);    
        setParts(fullParts);
    }, [getEscrowContract, blockHash]);

    const depositPart = useCallback(async (index: number) => {
        const escrowContract = getEscrowContract();
        const addr = walletClient!.account.address;
        const part = parts.find((p) => p.index === index);
        if (!part) {
            throw new Error('part is undefined');
        }

        const toDeposit = part.price - (part.deposit || BigInt(0));
        if (toDeposit <= BigInt(0)) {
            throw new Error('toDeposit is less than 0');
        }

        const { request } = await escrowContract.simulate.deposit([index], { value: toDeposit, chain: sepolia, account: addr });
        console.log(request);

        // @ts-ignore
        const txId = await walletClient!.writeContract(request);
        const txRes = await waitForTransaction({ hash: txId });
        console.log(txRes);

        await axios.put(`${process.env.REACT_APP_SERVER_URL}/claim-purchase`, {
            block: blockHash,
            ix: index,
            txId,
        }, { withCredentials: true });

        await getParts();
    }, [parts, getEscrowContract]);

    const releasePart = useCallback(async (index: number) => {
        const escrowContract = getEscrowContract();
        const addr = walletClient!.account.address;
        const part = parts.find((p) => p.index === index);
        if (!part) {
            throw new Error('part is undefined');
        }

        const { request } = await escrowContract.simulate.release([index], { chain: sepolia, account: addr });
        console.log(request);

        // @ts-ignore
        const txId = await walletClient!.writeContract(request);
        const txRes = await waitForTransaction({ hash: txId });
        console.log(txRes);

        await getParts();

    }, [parts, getEscrowContract])

    useEffect(() => {
        if (!walletClient && !isConnecting && !isConnected) {
            signIn(connectAsync, signMessageAsync);
        }
    }, [walletClient, isConnecting, isConnected, connectAsync, signMessageAsync]);

    useEffect(() => {
        if (isConnected && walletClient) {
            getBlockHash();
            getParts();
        }
    }, [contractAddr, isConnected, walletClient])

    if (!contractAddr) {
        return <Navigate to="/" />;
    }

    // if (!isConnected && !isConnecting) {
    //     return <Navigate to="/signin" />;
    // }

    return (
        <Container fluid>
            <h1>welcome to sale</h1>
            <p>merkle hash: {blockHash}</p>
            <a href={`https://sepolia.etherscan.io/address/${contractAddr}`} target='blank'>contract</a>
            <Table>
                <thead>
                    <tr>
                        <th>index</th>
                        <th>price</th>
                        <th>deposit</th>
                        <th>can buy</th>
                        <th></th>
                        <th>validity</th>
                        <th>content</th>
                    </tr>
                </thead>
                <tbody>
                    {parts.map(({ index, price, deposit, state, canBuy, proof }) => (
                        <tr key={index}>
                            <td>{index}</td>
                            <td>{price.toString()}</td>
                            <td>{deposit ? deposit.toString() : 0}</td>
                            <td>{canBuy ? 'yes' : 'no'}</td>
                            <td>{
                                (() => {
                                    if (!canBuy) {
                                        return '';
                                    }

                                    if (state === PartState.Offered) {
                                        return <Button onClick={() => depositPart(index)}>deposit money</Button>;
                                    } else if (state === PartState.Considered) {
                                        return <Button variant="danger" onClick={() => releasePart(index)}>release money</Button>;
                                    } else if (state === PartState.Accepted) {
                                        return <p>complete</p>;
                                    } else {
                                        return <p>rejected</p>;
                                    }
                                })()
                            }
                            </td>
                            <td>{(proof && blockHash) ? (isValidRoot(proof, blockHash) ? 'valid' : 'invalid') : ''}</td>
                            <td>{proof ? getValues(proof)[0] : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </Container>
    )
}