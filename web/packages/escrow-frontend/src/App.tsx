import React from 'react';
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { WagmiConfig } from 'wagmi';

import { publicClient, webSocketPublicClient, wagmiConfig } from './config';

import Signin from './components/signin';
import User from './components/user';

import logo from './logo.svg';
import './App.css';
import PostBlock from './components/postBlock';


const router = createBrowserRouter([
  {
    path: "/signin",
    element: <Signin />,
  },
  {
    path: "/user",
    element: <User />,
  },
  {
    path: "/post-block",
    element: <PostBlock />,
  },
  {
    path: "/",
    element: <Home />,
  },
]);

function App() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <div className="App">
        <RouterProvider router={router} />
      </div>
    </WagmiConfig>
  );
}

function Home() {
  return (
    <header className="App-header">
      Hello
    </header>
  )
}

export default App;
