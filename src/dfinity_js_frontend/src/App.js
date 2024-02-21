import React, { useEffect, useCallback, useState } from "react";
import { Container, Nav } from "react-bootstrap";
import Products from "./components/marketplace/Products";
import "./App.css";
import Wallet from "./components/Wallet";
import coverImg from "./assets/img/sandwich.jpg";
import { login, logout as destroy } from "./utils/auth";
import { balance as principalBalance } from "./utils/ledger"
import Cover from "./components/utils/Cover";
import { Notification } from "./components/utils/Notifications";
import { isAuthenticated, getPrincipalText } from "./utils/auth";
import { getAddressFromPrincipal } from "./utils/marketplace";


const App = function AppWrapper() {
  const [authenticated, setAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState('');
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState("0");

  const getBalance = useCallback(async () => {
    if (authenticated) {
      setBalance(await principalBalance());
    }
  });

  useEffect(async () => {
    setAuthenticated(await isAuthenticated());
  }, [setAuthenticated]);

  useEffect(async () => {
    const principal = await getPrincipalText();
    setPrincipal(principal);
  }, [setPrincipal]);

  useEffect(async () => {
    const principal = await getPrincipalText();
    const address = await getAddressFromPrincipal(principal);
    setAddress(address);
  }, [setAddress]);

  useEffect(() => {
    getBalance();
  }, [getBalance]);

  return (
    <>
    <Notification />
      {authenticated ? (
        <Container fluid="md">
          <Nav className="justify-content-end pt-3 pb-5">
            <Nav.Item>
              <Wallet
                address={address}
                principal={principal}
                balance={balance}
                symbol={"ICP"}
                isAuthenticated={authenticated}
                destroy={destroy}
              />
            </Nav.Item>
          </Nav>
          <main>
            <Products />
          </main>
        </Container>
      ) : (
        <Cover name="Street Food" login={login} coverImg={coverImg} />
      )}
    </>
  );
};

export default App;
