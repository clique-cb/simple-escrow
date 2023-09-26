import { Buffer } from 'buffer';

import { createConfig, configureChains, WagmiConfig } from "wagmi";
import { publicProvider } from "wagmi/providers/public";
import { infuraProvider } from "wagmi/providers/infura";
import { sepolia } from "wagmi/chains";


// @ts-ignore
window.Buffer = window.Buffer || Buffer;

export const { publicClient, webSocketPublicClient } = configureChains(
  [sepolia],
  [infuraProvider({ apiKey: process.env.REACT_APP_INFURA_API_KEY! }), publicProvider()]
);

export const wagmiConfig = createConfig({
  autoConnect: true,
  publicClient,
  webSocketPublicClient,
});

