import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import Moralis from "moralis";

dotenv.config();

import { connectDb } from './db';
import { routes } from './routes';
import { WEBSITE_URL } from './config';

const app: Express = express();
const port = process.env.PORT || 8000;

async function main() {
    await connectDb();

    await Moralis.start({
        apiKey: process.env.MORALIS_API_KEY,
    });

    app.use(express.json({limit: '200mb'}));
    app.use(cookieParser());
    app.use(cors({
        origin: WEBSITE_URL,
        credentials: true,
    }));

    app.use("/", routes);

    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

main();
