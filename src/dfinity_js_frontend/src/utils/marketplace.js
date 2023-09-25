import { Principal } from "@dfinity/principal";
import { getMarketplaceCanister, getLedgerCanister } from "./canisterFactory";
import { getAuthClient } from "./icp";
import { AccountIdentifier } from "@dfinity/nns";


export async function createProduct(product) {
  const canister = await getMarketplaceCanister();
  return canister.addProduct(product);
}

export async function getProducts() {
  const canister = await getMarketplaceCanister();
  try {
    return (await canister.getProducts()).products;
  } catch (err) {
    if (err.name === "AgentHTTPResponseError") {
      const authClient = await getAuthClient();
      await authClient.logout();
    }
    return [];
  }
}

export async function buyProduct(productId) {
  try {
    const id = parseInt(productId.id, 10);
    const marketplaceCanister = await getMarketplaceCanister();

    const orderReseponce = await marketplaceCanister.createOrder(id);
    const sellerPrincipal = Principal.fromText(orderReseponce.order.seller);
    const sellerAddress = await marketplaceCanister.getAddressFromPrincipal(sellerPrincipal);

    console.log(orderReseponce.order.memo)
    const block = await transferICP(sellerAddress, orderReseponce.order.price, orderReseponce.order.memo);
    console.log("# Block: ", block)
    const res2 = await marketplaceCanister.completePurchase(sellerPrincipal, id, orderReseponce.order.price, block, orderReseponce.order.memo);
    console.log("# completePurchase: ", res2)
  } catch (err) {
    console.log(err)
  }
  return {};
}

async function transferICP(sellerAddress, amount, memo) {
  const canister = await getLedgerCanister();
  const account = AccountIdentifier.fromHex(sellerAddress);
  const result = await canister.transfer({
    to: account.toUint8Array(),
    amount: { e8s: amount },
    memo,
    fee: { e8s: 10000n },
    from_subaccount: [],
    created_at_time: []
  });
  return result.Ok;
} 
