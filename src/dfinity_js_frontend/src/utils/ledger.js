import { AccountIdentifier } from "@dfinity/nns";
import { createCanisterActor } from "./canisterFactory";
import { getPrincipalText, isAuthenticated } from "./auth";
import { getAddressFromPrincipal } from "./marketplace";
import { idlFactory as ledgerIDL } from "../../../declarations/ledger_canister/ledger_canister.did.js";

const LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

export async function transferICP(sellerAddress, amount, memo) {
    const canister =  await getLedgerCanister();
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

export async function balance() {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return "0";
    }
    const canister =  await getLedgerCanister();
    const principal = await getPrincipalText();
    const address = await getAddressFromPrincipal(principal);
    const balance = await canister.account_balance_dfx({account: address});
    return (balance.e8s / BigInt(10**8)).toString();
}

async function getLedgerCanister() {
    return createCanisterActor(LEDGER_CANISTER_ID, ledgerIDL);
}