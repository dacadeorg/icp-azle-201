import { Principal } from "@dfinity/principal";
import { transferICP } from "./ledger";

export async function createProduct(product) {
  return window.canister.marketplace.addProduct(product);
}

export async function getProducts() {
  try {
    return await window.canister.marketplace.getProducts();
  } catch (err) {
    if (err.name === "AgentHTTPResponseError") {
      const authClient = window.auth.client;
      await authClient.logout();
    }
    return [];
  }
}

export async function buyProduct(product) {
  const marketplaceCanister = window.canister.marketplace;

  const orderReseponce = await marketplaceCanister.createOrder(product.id);
  const sellerPrincipal = Principal.from(orderReseponce.Ok.seller);
  const sellerAddress = await marketplaceCanister.getAddressFromPrincipal(sellerPrincipal);
  const block = await transferICP(sellerAddress, orderReseponce.Ok.price, orderReseponce.Ok.memo);
  await marketplaceCanister.completePurchase(sellerPrincipal, product.id, orderReseponce.Ok.price, block, orderReseponce.Ok.memo);
}
