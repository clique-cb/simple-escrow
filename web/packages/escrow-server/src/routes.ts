import { NextFunction, Request, Response, Router } from "express";
import Moralis from "moralis";
import * as jwt from "jsonwebtoken";

import * as merkle from "@clique/merkle";

import { User, Block } from "./db";
import { RequestWithUser } from "./types";
import { WEBSITE_URL } from "./config";

const authConfig = {
    domain: process.env.APP_DOMAIN || "clique.finance",
    statement: 'Please sign this message to confirm your identity.',
    uri: WEBSITE_URL,
    timeout: 60,
};

export const routes = Router();

routes.post('/request-message', async (req, res) => {
    const { address, chain, network } = req.body;

    try {
        const message = await Moralis.Auth.requestMessage({
            address,
            chain,
            ...authConfig,
        });

        res.status(200).json(message);
    } catch (error) {
        res.status(400).json({ error });
        console.error(error);
    }
});

routes.post('/verify', async (req, res) => {
    try {
        const { message, signature } = req.body;

        const { address, profileId } = (
            await Moralis.Auth.verify({
                message,
                signature,
                networkType: 'evm',
            })
        ).raw;

        const user = { address, profileId, signature };

        // create JWT token
        const token = jwt.sign(user, process.env.AUTH_SECRET!);

        // set JWT cookie
        res.cookie('jwt', token, {
            httpOnly: true,
        });

        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ error });
        console.error(error);
    }
});

/**
 * Authentication middleware
 * @param req 
 * @param res 
 * @param next 
 */
async function isAuthorized(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies.jwt;
    if (!token) return res.sendStatus(403); // if the user did not send a jwt token, they are unauthorized

    try {
        const data: any = jwt.verify(token, process.env.AUTH_SECRET!);
        const user = await User.findOneAndUpdate({ address: data.address }, { address: data.address }, { new: true, upsert: true });
        (req as RequestWithUser).user = user;
        next();
    } catch {
        return res.sendStatus(403);
    }
}


routes.get('/logout', isAuthorized, async (req, res) => {
    try {
        res.clearCookie('jwt');
        return res.sendStatus(200);
    } catch {
        return res.sendStatus(403);
    }
});


routes.get('/user', isAuthorized, async (req, res) => {
    try {
        const user = (req as RequestWithUser).user;
        return res.status(200).json(user);
    } catch {
        return res.sendStatus(403);
    }
});

routes.get('/my-blocks', isAuthorized, async (req, res) => {
    try {
        const user = (req as RequestWithUser).user;
        const blocks = await Block.find({ author: user.address });
        return res.status(200).json(blocks);
    } catch {
        return res.sendStatus(403);
    }
});

routes.get('/get-data', isAuthorized, async (req, res) => {
    try {
        const { block, ix } = req.query;
        if (!block || !ix) return res.sendStatus(400);

        if (typeof block !== 'string') return res.sendStatus(400);

        const user = (req as RequestWithUser).user;
        
        const blockObj = await Block.findOne({ hash: block });
        if (!blockObj) return res.sendStatus(404);

        const index = Number(ix);
        const hasPurchased = user.purchases.find(p => p.block === block && p.index === index);
        if (!hasPurchased && blockObj.author !== user.address) return res.sendStatus(403);

        const part = blockObj.dataParts[index];
        if (!part) return res.sendStatus(404);

        const tree = merkle.listToMerkleTree(blockObj.dataParts);
        const proof = tree.makeProof(index);

        return res.status(200).json({ proof });

    } catch {
        return res.sendStatus(500);
    }
});

routes.post('/post-block', isAuthorized, async (req, res) => {
    try {
        const user = (req as RequestWithUser).user;
        const { parts, txId } = req.body;

        const merkleTree = merkle.listToMerkleTree(parts);
        const blockHash = merkleTree.signature().hash;

        const block = new Block({
            hash: blockHash.toString('hex'),
            txId,
            author: user.address,
            dataParts: parts,
        });

        block.save();

        return res.sendStatus(200);
    } catch {
        return res.sendStatus(500);
    }
});