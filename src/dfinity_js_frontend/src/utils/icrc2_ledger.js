import { createCanisterActor } from "./canisterFactory";
import { getPrincipal, getPrincipalText, isAuthenticated } from "./auth";
import { idlFactory as icrcIDL } from "../../../declarations/icrc1-ledger/icrc1-ledger.did.js";
import { Principal } from "@dfinity/principal";

const ICRC_CANISTER_ID = "mxzaz-hqaaa-aaaar-qaada-cai";

export async function approve(spender, amount) {
    const canister = await getIcrc1Canister();
    const currentPrincipal = await getPrincipal();
    return await canister.icrc2_approve({ spender: { owner: Principal.fromText(spender), subaccount: [] }, from: { owner: currentPrincipal, subaccount: [] }, amount: BigInt(amount), fee: [], memo: [], from_subaccount: [], created_at_time: [], expected_allowance: [], expires_at: [] })
}

export async function tokenBalance() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return "";
    }
    const canister = await getIcrc1Canister();
    const principal = await getPrincipalText();
    const balance = await canister.icrc1_balance_of({ owner: Principal.fromText(principal), subaccount: [] });
    return balance.toString();
}

export async function tokenSymbol() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return "";
    }
    const canister = await getIcrc1Canister();
    const symbol = await canister.icrc1_symbol();
    return symbol;
}

async function getIcrc1Canister() {
    return createCanisterActor(ICRC_CANISTER_ID, icrcIDL);
}
