import { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { sepolia, useAccount, useConnect, useSignMessage, useWalletClient } from "wagmi";
import { getContract, waitForTransaction } from 'wagmi/actions';
import axios from 'axios';

import { abi } from "../contract/escrow";
import { Button, Container, Modal, Row, Spinner, Table } from "react-bootstrap";
import { MerkleProofNode, restoreRoot, proofSubset } from "@clique/merkle";

import { Coords, Path, decodeMap } from "../lib";
import { getValues, reconstructProof, signIn } from "./common";
import { formatEther } from "viem";
import { MathJax } from "better-react-mathjax";

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


function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve(img);
        }
        img.onabort = () => {
            reject("Aborted");
        }
        img.src = src;
    });
}

function drawImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, maxWidth: number = 1000) {
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
        // Maintain the aspect ratio of the image
        const scaleFactor = 1000 / width;
        width = 1000;
        height = height * scaleFactor;
    }

    // Resize the canvas to match the image size
    ctx.canvas.width = width;
    ctx.canvas.height = height;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
}


const drawPath = (ctx: CanvasRenderingContext2D, path: Path, addArrow: boolean = false) => {
    if (!path) return;

    ctx.beginPath()
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "red";

    let prev = path[0]
    ctx.moveTo(prev.x, prev.y);

    for (const pt of path.slice(1)) {
        ctx.lineTo(pt.x, pt.y);
        prev = pt;
    }

    if (addArrow && path.length > 1) {
        const arrowSize = 10;
        const arrowAngle = Math.PI / 6;
        const arrowBase = arrowSize * Math.tan(arrowAngle / 2);

        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];

        const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
        const angle1 = angle + arrowAngle;
        const angle2 = angle - arrowAngle;

        const x1 = last.x - arrowSize * Math.cos(angle1);
        const y1 = last.y - arrowSize * Math.sin(angle1);
        const x2 = last.x - arrowSize * Math.cos(angle2);
        const y2 = last.y - arrowSize * Math.sin(angle2);

        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x1, y1);
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x2, y2);
    }

    ctx.stroke()
}


function fitPathInBBox(path: Path, maxWidth: number = 1000): Path {
    const xs = path.map(({ x }) => x);
    const ys = path.map(({ y }) => y);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;

    const scaleFactor = maxWidth / width;

    return path.map(({ x, y }) => ({
        x: (x - minX) * scaleFactor,
        y: (y - minY) * scaleFactor,
    }))
}


function DisplayPath({ path, maxWidth = 150 }: { path: Path; maxWidth?: number }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d')!;
            drawPath(ctx, fitPathInBBox(path, maxWidth), true);
        }
    }, [canvasRef, path])

    return (
        <canvas ref={canvasRef} style={{ "width": maxWidth, "height": "auto" }} />
    )
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

    const drawCurrent = useCallback(async ({
        ctx, image, paths, origin
    }: {
        ctx: CanvasRenderingContext2D;
        image?: string;
        paths: Path[];
        origin?: Coords;
    }) => {
        const curPath = paths[0];

        if (image) {
            const imageObj = await loadImage(image);

            drawImage(ctx, imageObj);
            drawPath(ctx, curPath, true);
            if (origin && curPath) {
                ctx.font = "25px sans-serif";
                ctx.fillStyle = "blue";
                ctx.fillText(`${origin.x},${origin.y}`, curPath[0].x, curPath[0].y);

                ctx.font = "15px sans-serif";
                ctx.fillStyle = "green";
                ctx.fillText("прикоп 5-7 см", curPath[curPath.length - 1].x + 5, curPath[curPath.length - 1].y + 5);
            }
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
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current;
        const boughtParts = parts.filter(({ proof }) => !!proof);

        if (canvas && boughtParts.length > 0) {
            const boughtValues = boughtParts.map(({ proof }) => getValues(proof!)[0]);
            const encodedMap = boughtValues.map(v => JSON.parse(v));

            const ctx = canvas.getContext('2d')!;
            const { image, paths, origin } = decodeMap(encodedMap);
            drawCurrent({ ctx, image, paths, origin });
        }
    }, [canvasRef, parts])

    return (
        <>
            <Row>
                <h4>combined data result</h4>
            </Row>
            <Row className="justify-content-center">
                <canvas ref={canvasRef} style={{ "width": "auto", "height": "auto" }} />
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
        return (
            <>
                <p>terrain</p>
                <img src={data.data} alt="part" width={150} />
            </>
        );
    } else if (data.partType === 'coords') {
        const { x, y } = data.data;
        const coords = `${x},${y}`;
        return <a href={`https://www.google.com/maps/place/${coords}`} target='blank'>{coords}</a>;
    } else if (data.partType === 'pathChunk') {
        const { path, ix } = data.data;
        return (
            <>
                <p>path chunk {ix}</p>
                <DisplayPath path={path} />
            </>
        )
    } else if (data.partType === 'transform') {
        const { op, ix } = data.data;
        const fop = op.map((row: number[]) => row.map((x: number) => x.toFixed(2)));

        return (
            <>
                <p>transform {ix}</p>
                <MathJax>{`\\begin{pmatrix} ${fop[0][0]} & ${fop[0][1]} \\\\ ${fop[1][0]} & ${fop[1][1]} \\end{pmatrix}`}</MathJax>
            </>
        )
    }

    return <p>{data.partType}: {JSON.stringify(data.data)}</p>;
}

export default function Sale() {
    const [loadingMsg, setLoadingMsg] = useState<string | null>(null);

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
        setLoadingMsg('Loading data');
        const escrowContract = getEscrowContract();
        const addr = walletClient!.account.address;
        const fullParts = await escrowContract.read.saleState([], { account: addr }) as DataPart[];

        try {
            // const { data } = await axios(`${process.env.REACT_APP_SERVER_URL}/user`, { withCredentials: true });
            // console.log(data, blkHash);
            // const purchasedIxs = data.purchases.filter((p: any) => p.block === blkHash).map((p: any) => p.index);
            // for (const p of fullParts) {
            //     const isPurchased = purchasedIxs.includes(p.index);
            //     if (isPurchased) {
            //         const { data e} = await axios(`${process.env.REACT_APP_SERVER_URL}/get-data`, {
            //             params: { block: blkHash, ix: p.index },
            //             withCredentials: true
            //         });
            //         const { proof } = data;
            //         p.proof = reconstructProof(proof);
            //     }
            // }

            const { data } = await axios(`${process.env.REACT_APP_SERVER_URL}/get-data`, {
                params: { block: blkHash },
                withCredentials: true,
            })
            const { proof, index } = data;
            const globalProof = reconstructProof(proof);
            for (const p of fullParts) {
                if (p.index === index || index.indexOf(p.index) !== -1) {
                    console.log(p.index);
                    p.proof = proofSubset(globalProof, p.index);
                    console.log(p.proof);
                }
            }

        } catch (err) {
            console.error(err)
        }

        console.log(fullParts);
        setParts(fullParts);
        setLoadingMsg(null);
    }, [getEscrowContract]);

    const depositPart = useCallback(async (index: number) => {
        setLoadingMsg('Depositing money: please, confirm transaction in MetaMask')
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

        setLoadingMsg('Waiting for transaction to be confirmed');

        const txRes = await waitForTransaction({ hash: txId });
        console.log(txRes);

        setLoadingMsg('Claiming purchase on server');

        await axios.put(`${process.env.REACT_APP_SERVER_URL}/claim-purchase`, {
            block: blockHash,
            ix: index,
            txId,
        }, { withCredentials: true });

        await getParts(blockHash!);
        setLoadingMsg(null);
    }, [parts, getEscrowContract]);

    const releasePart = useCallback(async (index: number) => {
        setLoadingMsg('Releasing money: please, confirm transaction in MetaMask');
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

        setLoadingMsg('Waiting for transaction to be confirmed');

        const txRes = await waitForTransaction({ hash: txId });
        console.log(txRes);

        await getParts(blockHash!);
        setLoadingMsg(null);

    }, [parts, getEscrowContract])

    useEffect(() => {
        if (!walletClient && !isConnecting && !isConnected) {
            try {
                signIn(connectAsync, signMessageAsync);
            } catch (err) {
                console.error(err);
            }
        }
    }, [walletClient, isConnecting, isConnected, connectAsync, signMessageAsync]);

    useEffect(() => {
        if (isConnected && walletClient) {
            setLoadingMsg('Loading contract');
            getBlockHash().then(getParts).then(() => setLoadingMsg(null));
        }
    }, [contractAddr, isConnected, walletClient])

    if (!contractAddr) {
        return <Navigate to="/" />;
    }

    // if (!isConnected && !isConnecting) {
    //     return <Navigate to="/signin" />;
    // }

    return (
        <>
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
                                            return (<Button onClick={() => depositPart(index)}>
                                                {price > 0 ? "deposit money" : "get data"}
                                            </Button>);
                                        } else if (state === PartState.Considered) {
                                            if (price > 0) {
                                                return <Button variant="danger" onClick={() => releasePart(index)}>release money</Button>;
                                            }

                                            return <p>complete</p>;
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
            <Modal show={loadingMsg !== null}>
                <Modal.Header>
                    <Modal.Title>
                        Loading <Spinner animation="border" role="status"><span className="visually-hidden">Loading...</span></Spinner>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>{loadingMsg}</Modal.Body>
            </Modal>
        </>
    )
}