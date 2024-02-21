import { Principal } from "@dfinity/principal";
import { transferICP } from "./ledger";
import { isAuthenticated } from "./auth.js"

const CANISTER_API_HOST = `http://${process.env.BACKEND_CANISTER_ID}.localhost:4943`;

export async function createProduct(product) {
  const response = await doRequest(`${CANISTER_API_HOST}/products`, "POST", product);
  return await response.json();
}

export async function getAddressFromPrincipal(principalHex) {
  try {
    const response = await doRequest(`${CANISTER_API_HOST}/principal-to-address/${principalHex}`, "GET");
    return await response.json();
  } catch (err) {
    console.log(err);
    return "";
  }
}

export async function getProducts() {
  try {
    return (await doRequest(`${CANISTER_API_HOST}/products`, "GET")).json();
  } catch (err) {
    return [];
  }
}

export async function buyProduct(product) {
  const marketplaceCanister = window.canister.marketplace;
  const orderResponse = await marketplaceCanister.createOrder(product.id);
  const sellerPrincipal = Principal.from(orderResponse.Ok.seller);
  const sellerAddress = await marketplaceCanister.getAddressFromPrincipal(sellerPrincipal);
  const block = await transferICP(sellerAddress, orderResponse.Ok.price, orderResponse.Ok.memo);
  await marketplaceCanister.completePurchase(sellerPrincipal, product.id, orderResponse.Ok.price, block, orderResponse.Ok.memo);
}

async function doRequest(url, method, data) {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    throw new Error("unauthenticated");
  }
  return await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: data ? JSON.stringify(data) : undefined
  });
}
