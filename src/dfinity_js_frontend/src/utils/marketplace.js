import { Principal } from "@dfinity/principal";
import { transferICP} from "./ledger";

export async function createProduct(product) {
  return window.canister.marketplace.addProduct(product);
}

export async function getProducts() {
  try {
    return (await window.canister.marketplace.getProducts()).products;
  } catch (err) {
    if (err.name === "AgentHTTPResponseError") {
      const authClient = window.auth.client;
      await authClient.logout();
    }
    return [];
  }
}

export async function buyProduct(productId) {
  const id = parseInt(productId.id, 10);
  const marketplaceCanister = window.canister.marketplace;

  const orderReseponce = await marketplaceCanister.createOrder(id);
  const sellerPrincipal = Principal.fromText(orderReseponce.order.seller);
  const sellerAddress = await marketplaceCanister.getAddressFromPrincipal(sellerPrincipal);

  const block = await transferICP(sellerAddress, orderReseponce.order.price, orderReseponce.order.memo);
  await marketplaceCanister.completePurchase(sellerPrincipal, id, orderReseponce.order.price, block, orderReseponce.order.memo);
}
