import { connect, HydratedDocument, InferSchemaType, model, Schema } from "mongoose";

export async function connectDb() {
    try {
        await connect(process.env.MONGO_CONN_STRING!);
    } catch (err) {
        console.log(err);
        throw err;
    }
}

const dataPartSchema = new Schema({
    block: {
        type: String,
        required: true,
    },
    index: {
        type: Number,
        required: true,
    },
})

interface IUser {
    address: string;
    purchases: {
        block: string;
        index: number;
    }[];
};

const userSchema = new Schema<IUser>({
    address: {
        type: String,
        required: true,
        unique: true,
    },
    purchases: [dataPartSchema],
});

export type UserType = HydratedDocument<IUser>;
export const User = model<IUser>("User", userSchema);

export const blockSchema = new Schema({
    hash: String,
    txId: String,
    author: String,
    salesContract: {
        type: String,
        required: false,
    },
    dataParts: [Object],
});

export const Block = model("Block", blockSchema);