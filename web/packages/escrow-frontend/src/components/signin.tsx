import { useNavigate } from "react-router-dom";

import { useAccount, useConnect, useSignMessage, useDisconnect, sepolia } from "wagmi";
import { signIn } from "./common";

export default function SignIn() {
    const navigate = useNavigate();

    const { connectAsync } = useConnect();
    const { disconnectAsync } = useDisconnect();
    const { isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const handleAuth = async () => {
        //disconnects the web3 provider if it's already active
        if (isConnected) {
            await disconnectAsync();
        }

        await signIn(connectAsync, signMessageAsync);

        // redirect to /user
        navigate("/user");
    };

    return (
        <div>
            <h3>Web3 Authentication</h3>
            <button onClick={() => handleAuth()}>Authenticate via MetaMask</button>
        </div>
    );
}