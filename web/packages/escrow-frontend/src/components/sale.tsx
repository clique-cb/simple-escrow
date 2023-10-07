import { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { sepolia, useAccount, useConnect, useSignMessage, useWalletClient } from "wagmi";
import { getContract, waitForTransaction } from 'wagmi/actions';
import axios from 'axios';

import { abi } from "../contract/escrow";
import { Button, Container, Row, Table } from "react-bootstrap";
import { MerkleProofNode, restoreRoot } from "@clique/merkle";

import { Coords, Path, decodeMap } from "../lib";
import { getValues, reconstructProof, signIn } from "./common";
import { formatEther } from "viem";

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

function CombinedResults({ parts }: { parts: DataPart[] }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const getClientOffset = useCallback((canvas: HTMLCanvasElement, event: MouseEvent): Coords => {
        const { clientX, clientY } = event;
        const rect = canvas.getBoundingClientRect()
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        return {
           x,
           y
        } 
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current;
        const boughtParts = parts.filter(({ proof }) => !!proof);
        
        if (canvas && boughtParts.length > 0) {
            const boughtValues = boughtParts.map(({ proof }) => getValues(proof!)[0]);
            const encodedMap = boughtValues.map(v => JSON.parse(v));

            const ctx = canvas.getContext('2d')!;
            const { image, paths, origin } = decodeMap(encodedMap);
            console.log(image);
            console.log(paths);
            console.log(origin);

            const curPath = paths[0];

            const drawPath = (path: Path) => {
                if (!curPath) return;
                ctx.beginPath()
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.strokeStyle = "red";

                let start = path[0]
                ctx.moveTo(start.x, start.y);

                for (const pt of path.slice(1)) {
                    ctx.lineTo(pt.x, pt.y);
                }

                ctx.stroke()
            }

            const imageObj = new Image();

            const drawImage = () => {
                let width = imageObj.width;
                let height = imageObj.height;

                if (width > 1000) {
                    // Maintain the aspect ratio of the image
                    const scaleFactor = 1000 / width;
                    width = 1000;
                    height = height * scaleFactor;
                }

                // Resize the canvas to match the image size
                canvas.width = width;
                canvas.height = height;

                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(imageObj, 0, 0, width, height);
            }

            const draw = () => {
                drawImage();
                drawPath(curPath);
            }

            imageObj.onload = draw;
            if (image) {
                imageObj.src = image;
            }
    
            // let curLineStart: Coords | null = null;
            // const lineCoords: Coords[] = []

            // canvas.addEventListener('mousedown', (event) => {
            //     console.log(event);
            //     const mousePos = getClientOffset(canvas, event);

            //     if (curLineStart !== null) {
            //         ctx.lineWidth = 3;
            //         ctx.lineCap = "round";
            //         ctx.strokeStyle = "red";

            //         ctx.moveTo(curLineStart.x, curLineStart.y);
            //         ctx.lineTo(mousePos.x, mousePos.y);
            //         ctx.stroke()
            //     } else {
            //         ctx.beginPath()
            //     }

            //     curLineStart = mousePos;
            //     lineCoords.push(curLineStart);
            //     console.log(lineCoords);
            // })
        }
    }, [canvasRef, parts])

    return (
        <>
            <Row>
                <h4>combined data result</h4>
            </Row>
            <Row className="justify-content-center">
                <canvas ref={canvasRef} style={{"width": "auto", "height": "auto"}} />
                {/* <p>{boughtParts.map(({ proof }) => getValues(proof!)[0]).join(' ')}</p> */}
            </Row>
        </>
    )
}

function displayPart(part: string): ReactElement {
    const obj = JSON.parse(part);
    if (obj.type !== 'map') {
        throw new Error('Invalid part');
    }
    
    const data = JSON.parse(obj.data);
    if (data.partType === 'image') {
        return <img src={data.data} alt="part" width={150} />;
    } else if (data.partType === 'coords') {
        const { x, y } = data.data;
        const coords = `${x},${y}`;
        return <a href={`https://www.google.com/maps/place/${coords}`} target='blank'>{coords}</a>;
    }

    return <p>{data.partType}: {JSON.stringify(data.data)}</p>;
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
        return hash;
    }, [getEscrowContract]);

    const getParts = useCallback(async (blkHash: string) => {
        const escrowContract = getEscrowContract();
        const addr = walletClient!.account.address;
        const fullParts = await escrowContract.read.saleState([], { account: addr }) as DataPart[];

        try {
            const { data } = await axios(`${process.env.REACT_APP_SERVER_URL}/user`, { withCredentials: true });
            console.log(data, blkHash);
            const purchasedIxs = data.purchases.filter((p: any) => p.block === blkHash).map((p: any) => p.index);
            for (const p of fullParts) {
                const isPurchased = purchasedIxs.includes(p.index);
                if (isPurchased) {
                    const { data } = await axios(`${process.env.REACT_APP_SERVER_URL}/get-data`, {
                        params: { block: blkHash, ix: p.index },
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
    }, [getEscrowContract]);

    const depositPart = useCallback(async (index: number) => {
        const escrowContract = getEscrowContract();
        const addr = walletClient!.account.address;
        const part = parts.find((p) => p.index === index);
        if (!part) {
            throw new Error('part is undefined');
        }

        const toDeposit = part.price - (part.deposit || BigInt(0));
        if (toDeposit < BigInt(0)) {
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

        await getParts(blockHash!);
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

        await getParts(blockHash!);

    }, [parts, getEscrowContract])

    useEffect(() => {
        if (!walletClient && !isConnecting && !isConnected) {
            signIn(connectAsync, signMessageAsync);
        }
    }, [walletClient, isConnecting, isConnected, connectAsync, signMessageAsync]);

    useEffect(() => {
        if (isConnected && walletClient) {
            getBlockHash().then(getParts);
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
            <p>get test ETH <a href="https://sepoliafaucet.com/">here</a></p>
            <p>merkle hash: {blockHash}</p>
            <a href={`https://sepolia.etherscan.io/address/${contractAddr}`} target='blank'>contract</a>
            <CombinedResults parts={parts} />
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
                            <td>{formatEther(price)} ETH</td>
                            <td>{deposit ? formatEther(deposit) : 0} ETH</td>
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
                            <td>{proof ? displayPart(getValues(proof)[0]) : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </Container>
    )
}