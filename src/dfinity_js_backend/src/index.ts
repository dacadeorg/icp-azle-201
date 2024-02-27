import { v4 as uuidv4 } from 'uuid';
import { Server, StableBTreeMap, ic, Principal, None } from 'azle';
import express from 'express';
import cors from 'cors';
import { Ledger, hexAddressFromPrincipal, binaryAddressFromAddress } from "azle/canisters/ledger";
import { ICRC } from 'azle/canisters/icrc';

/**
 * This type represents a product that can be listed on a marketplace.
 * It contains basic properties that are needed to define a product.
 */
class Product {
    id: string;
    title: string;
    description: string;
    location: string;
    price: number;
    seller: string;
    attachmentURL: string;
    soldAmount: number
}

class ProductPayload {
    title: string;
    description: string;
    location: string;
    price: number;
    attachmentURL: string
}

enum OrderStatus {
    PaymentPending,
    Completed
}

class Order {
    productId: string;
    price: number;
    status: string;
    seller: string;
}

/**
 * `messagesStorage` - it's a key-value datastructure that is used to store messages.
 * {@link StableBTreeMap} is a self-balancing tree that acts as a durable data storage that keeps data across canister upgrades.
 * For the sake of this contract we've chosen {@link StableBTreeMap} as a storage for the next reasons:
 * - `insert`, `get` and `remove` operations have a constant time complexity - O(1)
 * - data stored in the map survives canister upgrades unlike using HashMap where data is stored in the heap and it's lost after the canister is upgraded
 * 
 * Brakedown of the `StableBTreeMap(string, Message)` datastructure:
 * - the key of map is a `messageId`
 * - the value in this map is a message itself `Message` that is related to a given key (`messageId`)
 * 
 * Constructor values:
 * 1) 0 - memory id where to initialize a map.
 */
const productsStorage = StableBTreeMap<string, Product>(0);
const orders = StableBTreeMap<string, Order>(1);

/* 
    initialization of the Ledger canister. The principal text value is hardcoded because 
    we set it in the `dfx.json`
*/
const icpCanister = Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));
const icrc = ICRC(Principal.fromText("mxzaz-hqaaa-aaaar-qaada-cai"));

export default Server(() => {
    const app = express();
    // only for development purposes. For production-ready apps one must configure CORS appropriately
    app.use(cors());
    app.use(express.json());

    app.get("/products", (req, res) => {
        res.json(productsStorage.values());
    });

    app.get("/orders", (req, res) => {
        res.json(orders.values());
    });

    app.get("/products/:id", (req, res) => {
        const productId = req.params.id;
        const productOpt = productsStorage.get(productId);
        if ("None" in productOpt) {
            res.status(404).send(`the product with id=${productId} not found`);
        } else {
            res.json(productOpt.Some);
        }
    });

    app.post("/products", (req, res) => {
        const payload = req.body as ProductPayload;
        const product = { id: uuidv4(), soldAmount: 0, seller: ic.caller().toText(), ...payload };
        productsStorage.insert(product.id, product);
        return res.json(product);
    });

    app.put("/products/:id", (req, res) => {
        const productId = req.params.id;
        const payload = req.body as ProductPayload;
        const productOpt = productsStorage.get(productId);
        if ("None" in productOpt) {
            res.status(400).send(`couldn't update a product with id=${productId}. product not found`);
        } else {
            const product = productOpt.Some;
            const updatedProduct = { ...product, ...payload, updatedAt: getCurrentDate() };
            productsStorage.insert(product.id, updatedProduct);
            res.json(updatedProduct);
        }
    });

    app.delete("/products/:id", (req, res) => {
        const productId = req.params.id;
        const deletedProductOpt = productsStorage.remove(productId);
        if ("None" in deletedProductOpt) {
            res.status(400).send(`couldn't delete a product with id=${productId}. product not found`);
        } else {
            res.json(deletedProductOpt.Some);
        }
    });

    /*
        Before the order is received, the icrc2_approve is called - that's where we create
        an allowance entry for the canister to make a transfer of an ICRC token on behalf of the sender to the seller of the product.
        Here, we make an allowance transfer by calling icrc2_transfer_from.
    */
    app.post("/orders", async (req, res) => {
        const productOpt = productsStorage.get(req.body.productId);
        if ("None" in productOpt) {
            res.send(`cannot create the order: product=${req.body.productId} not found`);
        } else {
            const product = productOpt.Some;
            const allowanceResponse = await allowanceTransfer(product.seller, BigInt(product.price));
            if (allowanceResponse.Err) {
                res.send(allowanceResponse.Err);
                return;
            }
            const order: Order = {
                productId: product.id,
                price: product.price,
                status: OrderStatus[OrderStatus.Completed],
                seller: product.seller
            };
            orders.insert(uuidv4(), order);
            product.soldAmount += 1;
            productsStorage.insert(product.id, product);
            res.json(order);
        }
    });

    /*
        a helper function to get address from the principal
        the address is later used in the transfer method
    */
    app.get("/principal-to-address/:principalHex", (req, res) => {
        const principal = Principal.fromText(req.params.principalHex);
        res.json({ account: hexAddressFromPrincipal(principal, 0) });
    });

    // not used right now. can be used for transfers from the canister for instances when a marketplace can hold a balance account for users
    app.put("/payment/:id", async (req, res) => {
        const toPrincipal = Principal.fromText(req.body.to);
        const toAddress = hexAddressFromPrincipal(toPrincipal, 0);
        const transferFeeResponse = await ic.call(icpCanister.transfer_fee, { args: [{}] });
        const transferResult = ic.call(icpCanister.transfer, {
            args: [{
                memo: 0n,
                amount: {
                    e8s: req.body.amount
                },
                fee: {
                    e8s: transferFeeResponse.transfer_fee.e8s
                },
                from_subaccount: None,
                to: binaryAddressFromAddress(toAddress),
                created_at_time: None
            }]
        });
        if ("Err" in transferResult) {
            res.send(`payment failed, err=${transferResult.Err}`);
            return;
        }
        res.send("payment completed");
    });

    return app.listen();
});

function getCurrentDate() {
    const timestamp = new Number(ic.time());
    return new Date(timestamp.valueOf() / 1000_000);
}

async function allowanceTransfer(to: string, amount: bigint) {
    try {
        return await ic.call(icrc.icrc2_transfer_from, {
            args: [{
                spender_subaccount: None,
                created_at_time: None,
                memo: None,
                amount: amount,
                fee: None,
                from: { owner: ic.caller(), subaccount: None },
                to: { owner: Principal.fromText(to), subaccount: None }
            }]
        });
    } catch (err) {
        console.log("error on approval transfer: ", err);
        throw err;
    }
}