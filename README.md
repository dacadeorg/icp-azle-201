## Things to be explained in the course:
1. What is Ledger? More details here: https://internetcomputer.org/docs/current/developer-docs/integrations/ledger/
2. What is Internet Identity? More details here: https://internetcomputer.org/internet-identity
3. What is Principal, Identity, Address? https://internetcomputer.org/internet-identity | https://yumimarketplace.medium.com/whats-the-difference-between-principal-id-and-account-id-3c908afdc1f9
4. Canister-to-canister communication and how multi-canister development is done? https://medium.com/icp-league/explore-backend-multi-canister-development-on-ic-680064b06320

## Getting started

To get started developing in the browser, click this button:

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/dacadeorg/icp-azle-201)

If you rather want to use GitHub Codespaces, click this button instead:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/dacadeorg/icp-azle-201?quickstart=1)

**NOTE**: After deploying your canisters in GitHub Codespaces, run `./canister_urls.py` and click the links that are shown there.

If you prefer running VS Code locally and not in the browser, click "Codespaces: ..." or "Gitpod" in the bottom left corner and select "Open in VS Code" in the menu that appears. 
If prompted, proceed by installing the recommended plugins for VS Code.

To develop fully locally, first install [Docker](https://www.docker.com/get-started/) and [VS Code](https://code.visualstudio.com/) and start them on your machine.
Next, click the following button to open the dev container locally:

[![Open locally in Dev Containers](https://img.shields.io/static/v1?label=Dev%20Containers&message=Open&color=blue&logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/dacadeorg/icp-azle-201)

## How to deploy canisters implemented in the course

### Ledger canister
`./deploy-local-ledger.sh` - deploys a local Ledger canister. IC works differently when run locally so there is no default network token available and you have to deploy it yourself. Remember that it's not a token like ERC-20 in Ethereum, it's a native token for ICP, just deployed separately.
This canister is described in the `dfx.json`:
```
	"ledger_canister": {
  	"type": "custom",
  	"candid": "https://raw.githubusercontent.com/dfinity/ic/928caf66c35627efe407006230beee60ad38f090/rs/rosetta-api/icp_ledger/ledger.did",
  	"wasm": "https://download.dfinity.systems/ic/928caf66c35627efe407006230beee60ad38f090/canisters/ledger-canister.wasm.gz",
  	"remote": {
    	"id": {
      	"ic": "ryjl3-tyaaa-aaaaa-aaaba-cai"
    	}
  	}
	}
```
`remote.id.ic` - that is the principal of the Ledger canister and it will be available by this principal when you work with the ledger.

Also, in the scope of this script, a minter identity is created which can be used for minting tokens
for the testing purposes.
Additionally, the default identity is pre-populated with 1000_000_000_000 e8s which is equal to 10_000 * 10**8 ICP.
The decimals value for ICP is 10**8.

List identities:
`dfx identity list`

Switch to the minter identity:
`dfx identity use minter`

Transfer ICP:
`dfx ledger transfer <ADDRESS> --memo 0 --icp 100 --fee 0`
where:
 - `--memo` is some correlation id that can be set to identify some particular transactions (we use that in the marketplace canister).
 - `--icp` is the transfer amount
 - `--fee` is the transaction fee. In this case it's 0 because we make this transfer as the minter idenity thus this transaction is of type MINT, not TRANSFER.
 - `<ADDRESS>` is the address of the recipient. To get the address from the principal, you can use the helper function from the marketplace canister - `getAddressFromPrincipal(principal: Principal)`, it can be called via the Candid UI.

### ICRC2 ledger canister

`deploy-local-icrc-ledger.sh` - deploys an ICRC2 canister.

Transfer ICRC token:
`dfx canister call icrc1_ledger_canister icrc1_transfer '(record { to = record { owner = principal "<PRINCIPAL>";};  amount = <AMOUNT>;})'`
where:
- `<PRINCIPAL>` is the principal string of the receiver
- `<AMOUNT>` is the amount of token to be transferred

### Internet identity canister

`deploy-local-identity.sh` - deploys an identity canister and outputs the canister id to `.env` as the `IDENTITY_CANISTER_ID` variable. Once it's deployed, the `js-agent` library will be talking to it to register identities. There is UI that acts as a wallet where you can select existing identities
or create a new one.

### Marketplace canister

Switch to the default identity:
`dfx identity use default`

`deploy-local-backend-canister.sh` - deploys the marketplace canister where the business logic is implemented and outputs the canister id to `.env` as the `BACKEND_CANISTER_ID` variable.
Basically, it implements functions like add, view, update, delete, and buy products + a set of helper functions.

### Marketplace frontend canister
`dfx deploy dfinity_js_frontend` - deployes the frontend app for the `dfinity_js_backend` canister on IC.
