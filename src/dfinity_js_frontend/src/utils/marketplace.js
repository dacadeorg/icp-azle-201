import { approve } from "./icrc2_ledger";
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
  const { id, price } = { ...product };
  await approve(process.env.BACKEND_CANISTER_ID, price);
  return await httpClient.POST({path: "/orders", data: {productId: id}});
}
