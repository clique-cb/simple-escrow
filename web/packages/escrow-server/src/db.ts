import { connect, InferSchemaType, model, Schema } from "mongoose";

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

const userSchema = new Schema({
    address: {
        type: String,
        required: true,
        unique: true,
    },
    purchases: [dataPartSchema],
});

export type UserType = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);

export const blockSchema = new Schema({
    hash: String,
    txId: String,
    author: String,
    dataParts: [Object],
});

export const Block = model("Block", blockSchema);