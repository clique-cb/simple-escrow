import { keccak256 } from 'viem';
import Cookies from 'js-cookie';
import * as CBOR from 'cbor-web';
import * as merkle from "@clique/merkle";
import { sepolia } from 'wagmi';
import { InjectedConnector } from "wagmi/connectors/injected";
import axios from "axios";


export const signIn = async (connectAsync: any, signMessageAsync: any) => {
    // enabling the web3 provider metamask
    const { account } = await connectAsync({
        connector: new InjectedConnector(),
    });

    if (!Cookies.get("jwt")) {
        const userData = { address: account, chain: sepolia.id };
        // making a post request to our 'request-message' endpoint
        const { data } = await axios.post(
            `${process.env.REACT_APP_SERVER_URL}/request-message`,
            userData,
            {
                headers: {
                    "content-type": "application/json",
                },
            }
        );
        const message = data.message;
        // signing the received message via metamask
        const signature = await signMessageAsync({ message });

        await axios.post(
            `${process.env.REACT_APP_SERVER_URL}/verify`,
            {
                message,
                signature,
            },
            { withCredentials: true } // set cookie from Express server
        );
    }
}

export const addrHashCBOR = (addr: string) => {
    const buf = Buffer.from(addr.slice(2), "hex");
    const packed = CBOR.encode(buf);
    return keccak256(packed);
}

export const reconstructProof = (proof: any): merkle.MerkleProofNode<any> => {
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

export const getValues = (proof: merkle.MerkleProofNode<any>): any[] => {
    if (proof instanceof merkle.MerkleProofLeaf) {
        return [proof.value];
    } else if (proof instanceof merkle.MerkleProofPruned) {
        return [];
    } else {
        return [...getValues(proof.left), ...getValues(proof.right)];
    }
}
