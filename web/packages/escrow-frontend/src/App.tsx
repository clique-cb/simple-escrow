import React from 'react';
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { WagmiConfig } from 'wagmi';

import { publicClient, webSocketPublicClient, wagmiConfig } from './config';

import Signin from './components/signin';
import User from './components/user';
import PostBlock from './components/postBlock';
import Sale from './components/sale';

import logo from './logo.svg';
import './App.css';

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
  {
    path: "/sale/:contractAddr",
    element: <Sale />
  }
]);

function App() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
        integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM"
        crossOrigin="anonymous"
      />
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
