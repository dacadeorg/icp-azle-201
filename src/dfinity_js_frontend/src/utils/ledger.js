import { createCanisterActor } from "./canisterFactory";
import { getPrincipalText, isAuthenticated, logout } from "./auth";
import { getAddressFromPrincipal } from "./marketplace";
import { idlFactory as ledgerIDL } from "../../../declarations/ledger_canister/ledger_canister.did.js";

const LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

export async function icpBalance() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return "0";
    }
    const canister = await getLedgerCanister();
    const principal = await getPrincipalText();
    try {
        const account = await getAddressFromPrincipal(principal);
        const balance = await canister.account_balance_dfx(account);
        return (balance.e8s / BigInt(10 ** 8)).toString();
    } catch(err) {
        if (err.name === 'AgentHTTPResponseError') {
            logout();
        }
    }
}

async function getLedgerCanister() {
    return createCanisterActor(LEDGER_CANISTER_ID, ledgerIDL);
}