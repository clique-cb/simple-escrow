import { array, NDArray, random } from 'vectorious';

export type StructuredDataPart = {
    type: 'map' | 'encrypted_text';
    data: string;
}


export type Coords = { x: number; y: number; };
export type Path = Coords[];
export type TransformedPath = { path: Path; op: NDArray; ix: number; }
export type TransformedPathChunks = TransformedPath[];

export function transformPath(path: Path, op: NDArray): Path {
    const vecList = path.map(({ x, y }) => array([[x], [y]]));
    const transformed = vecList.map(vec => op.multiply(vec));
    return transformed.map(vec => ({ x: vec.get(0, 0), y: vec.get(1, 0) }));
}

export function randomInvertibleOp(): NDArray {
    while (true) {
        const op = random(2, 2);
        if (op.det() !== 0) {
            return op;
        }
    }
}

export function randomPathSplitTransform(path: Path, splitNum: number): TransformedPathChunks {
    if (splitNum >= path.length) {
        throw new Error('splitNum must be less than path length');
    }

    const chunkLen = Math.floor(path.length / splitNum);
    const chunks = []
    let ix = 0;
    for (let i = 0; i < path.length; i += chunkLen) {
        console.log(i);
        const directOp = randomInvertibleOp();
        const transformedPath = transformPath(path.slice(i, i + chunkLen), directOp);
        const op = directOp.inv();
        chunks.push({ path: transformedPath, op, ix });
        ix += 1;
    }
    return chunks;
}

export function restorePath(chunks: TransformedPathChunks): Path {
    chunks = chunks.sort((a, b) => a.ix - b.ix);
    const path = [];
    for (const { path: transformedPath, op } of chunks) {
        path.push(...transformPath(transformedPath, op));
    }
    return path;
}


export function encodeMap(imgBase64: string, path: Path, origin: Coords): StructuredDataPart[] {
    const toPart = (val: any): StructuredDataPart => ({ type: 'map', data: JSON.stringify(val) }); 

    const mapPart = toPart({partType: 'image', data: imgBase64});
    const coordsPart = toPart({partType: 'coords', data: origin});

    const pathChunks = randomPathSplitTransform(path, 3);
    const paths = pathChunks.map(({path, ix}) => toPart({partType: 'pathChunk', data: {path, ix}}));
    const ops = pathChunks.map(({op, ix}) => toPart({partType: 'transform', data: {op: op.toArray(), ix}}));

    let pathParts = [...paths, ...ops];
    pathParts = pathParts.sort(() => Math.random() - 0.5);
    
    return [mapPart, ...pathParts, coordsPart];
}


export function decodeMap(parts: StructuredDataPart[]): { image?: string; paths: Path[]; origin?: Coords } {
    const fromPart = (part: StructuredDataPart): any => {
        if (part.type !== 'map') {
            throw new Error('Invalid part type');
        }
        return JSON.parse(part.data);
    }
    
    let image = undefined;
    let splitPaths: TransformedPathChunks[] = [];
    let origin = undefined;

    let chunksMap: Map<number, Path> = new Map()
    let opsMap: Map<number, NDArray> = new Map()

    const restorePaths = () => {
        const maxIx = Math.max(...Array.from(chunksMap.keys()), ...Array.from(opsMap.keys()));
        splitPaths = [];
        let curChunk: TransformedPathChunks = [];

        for (let ix = 0; ix < maxIx; ix++) {
            console.log(ix);
            const path = chunksMap.get(ix);
            if (path) {
                const op = opsMap.get(ix) || array([[1, 0], [0, 1]]);
                curChunk.push({ path, op, ix });
            } else if (curChunk.length > 0) {
                splitPaths.push(curChunk);
                curChunk = [];
            }
        }

        if (curChunk.length > 0) {
            splitPaths.push(curChunk);
        }
    }

    for (const part of parts) {
        const data = fromPart(part);
        switch (data.partType) {
            case 'image':
                image = data.data;
                break;
            case 'coords':
                origin = data.data;
                break;
            case 'pathChunk':
                const { path, ix } = data.data;
                chunksMap.set(ix, path);
                restorePaths();
                break;
            case 'transform':
                const { op, ix: opIx } = data.data;
                opsMap.set(opIx, array(op));
                restorePaths();
                break;
        }
    }

    const paths = splitPaths.map(restorePath);
    return { image, paths, origin };
}
