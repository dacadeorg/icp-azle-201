import { transferICP } from "./ledger";
import { createCanisterActor } from "./canisterFactory";
import { idlFactory as marketPlaceIDL } from "../../../declarations/dfinity_js_backend/dfinity_js_backend.did.js";
import IcHttp from "./ichttp";

const marketplaceAgentCanister = await createCanisterActor(process.env.BACKEND_CANISTER_ID, marketPlaceIDL);
const httpClient = new IcHttp(marketplaceAgentCanister);

export async function createProduct(data) {
  return httpClient.POST({path: "/products", data});
}

export async function getAddressFromPrincipal(principalHex) {
  return httpClient.GET({path: `/principal-to-address/${principalHex}`});
}

export async function getProducts() {
  return httpClient.GET({path: "/products"});
}

export async function buyProduct(product) {
  try {
    const orderResponse = await httpClient.POST({path: "/orders", data: {productId: product.id}});
    const sellerAddress = await getAddressFromPrincipal(orderResponse.seller);
    const block = await transferICP(sellerAddress, orderResponse.price, orderResponse.memo);
    const data = {
      seller: orderResponse.seller,
      price: orderResponse.price,
      block: Number(block)
    }
    return await httpClient.PUT({path: `/orders/${orderResponse.memo}`, data})
  } catch(err) {
    console.err(err);
    throw err;
  }
}
