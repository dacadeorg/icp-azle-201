import { v4 as uuidv4 } from 'uuid';
import { Server, StableBTreeMap, ic, Principal, None, nat64, text, bool, Duration } from 'azle';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import {
    Ledger, binaryAddressFromAddress, binaryAddressFromPrincipal, hexAddressFromPrincipal
} from "azle/canisters/ledger";
import { hashCode } from "hashcode";

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
    seller: string; // Principal
    paid_at_block: number | null;
    memo: string
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
const productsStorage = StableBTreeMap<string, Product>(33);
const persistedOrders = StableBTreeMap<string, Order>(34);
const pendingOrders = StableBTreeMap<string, Order>(35);

const ORDER_RESERVATION_PERIOD = 120n; // reservation period in seconds

/* 
    initialization of the Ledger canister. The principal text value is hardcoded because 
    we set it in the `dfx.json`
*/
const icpCanister = Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));

export default Server(() => {
    const app = express();
    // only for development purposes. For production-ready apps one must configure CORS appropriately
    app.use(cors());
    app.use(bodyParser.json());

    app.get("/products", (req: Request, res: Response) => {
        res.json(productsStorage.values());
    });

    app.get("/orders", (req: Request, res: Response) => {
        res.json(persistedOrders.values());
    });

    app.get("/pending-orders", (req: Request, res: Response) => {
        res.json(pendingOrders.values());
    });

    app.delete("/pending-orders/:memo", (req: Request, res: Response) => {
        const deletedPendingOrderOpt = pendingOrders.remove(req.params.memo);
        if ("None" in deletedPendingOrderOpt) {
            res.status(400).send(`couldn't delete a pending order with memo=${req.params.memo}. order not found`);
        } else {
            res.json(deletedPendingOrderOpt.Some);
        }
    });

    app.get("/products/:id", (req: Request, res: Response) => {
        const productId = req.params.id;
        const productOpt = productsStorage.get(productId);
        if ("None" in productOpt) {
            res.status(404).send(`the product with id=${productId} not found`);
        } else {
            res.json(productOpt.Some);
        }
    });

    app.post("/products", (req: Request, res: Response) => {
        const payload = req.body as ProductPayload;
        const product = { id: uuidv4(), soldAmount: 0, seller: ic.caller().toText(), ...payload };
        productsStorage.insert(product.id, product);
        return res.json(product);
    });

    app.put("/products/:id", (req: Request, res: Response) => {
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

    app.delete("/products/:id", (req: Request, res: Response) => {
        const productId = req.params.id;
        const deletedProductOpt = productsStorage.remove(productId);
        if ("None" in deletedProductOpt) {
            res.status(400).send(`couldn't delete a product with id=${productId}. product not found`);
        } else {
            res.json(deletedProductOpt.Some);
        }
    });

    /*
        on create order we generate a hashcode of the order and then use this number as corelation id (memo) in the transfer function
        the memo is later used to identify a payment for this particular order.

        The entire flow is divided into the three main parts:
            1. Create an order
            2. Pay for the order (transfer ICP to the seller). 
            3. Complete the order (use memo from step 1 and the transaction block from step 2)
            
        Step 2 is done on the FE app because we cannot create an order and transfer ICP in the scope of the single method. 
        When we call the `createOrder` method, the ic.caller() would the principal of the identity which initiated this call in the frontend app. 
        However, if we call `ledger.transfer()` from `createOrder` function, the principal of the original caller won't be passed to the 
        ledger canister when we make this call. 
        In this case, when we call `ledger.transfer()` from the `createOrder` method,
        the caller identity in the `ledger.transfer()` would be the principal of the canister from which we just made this call - in our case it's the marketplace canister.
        That's we split this flow into three parts.
    */
    app.post("/orders", (req: Request, res: Response) => {
        const productOpt = productsStorage.get(req.body.productId);
        if ("None" in productOpt) {
            res.send(`cannot create the order: product=${req.body.productId} not found`);
        } else {
            const product = productOpt.Some;
            const order: Order = {
                productId: product.id,
                price: product.price,
                status: OrderStatus[OrderStatus.PaymentPending],
                seller: product.seller,
                paid_at_block: null,
                memo: generateCorrelationId(req.body.id).toString()
            };
            pendingOrders.insert(order.memo, order);
            discardByTimeout(order.memo, ORDER_RESERVATION_PERIOD);
            return res.json(order);
        }
    });

    app.put("/orders/:id", async (req: Request, res: Response) => {
        const { seller, price, block, memo } = req.body;
        const paymentVerified = await verifyPaymentInternal(seller, price, block, memo);
        if (!paymentVerified) {
            res.send(`cannot complete the purchase: cannot verify the payment, memo=${memo}`);
            return;
        }
        const pendingOrderOpt = pendingOrders.remove(memo);
        if ("None" in pendingOrderOpt) {
            res.send(`cannot complete the purchase: there is no pending order with id=${req.params.id}`);
            return;
        }
        const order = pendingOrderOpt.Some;
        const updatedOrder = { ...order, status: OrderStatus[OrderStatus.Completed], paid_at_block: block };
        const productOpt = productsStorage.get(req.params.id);
        if ("None" in productOpt) {
            res.status(404).send(`product with id=${req.params.id} not found`);
            return;
        }
        const product = productOpt.Some;
        product.soldAmount += 1;
        productsStorage.insert(product.id, product);
        persistedOrders.insert(ic.caller().toText(), updatedOrder);
        res.json(updatedOrder);
    });

    /*
        another example of a canister-to-canister communication
        here we call the `query_blocks` function on the ledger canister
        to get a single block with the given number `start`.
        The `length` parameter is set to 1 to limit the return amount of blocks.
        In this function we verify all the details about the transaction to make sure that we can mark the order as completed
    */
    app.get("/verify-payment", async (req: Request, res: Response) => {
        const memo = req.query.memo as unknown as nat64;
        const receiver: string = req.query.receiver as string;
        const amount = req.query.amount as unknown as nat64;
        const block = req.query.block as unknown as nat64;
        const receiverPrincipal = Principal.fromHex(receiver);
        const payment = await verifyPaymentInternal(receiverPrincipal, amount, block, memo);
        res.json(payment);
    });

    /*
        a helper function to get address from the principal
        the address is later used in the transfer method
    */
    app.get("/principal-to-address/:principalHex", (req: Request, res: Response) => {
        const principal = Principal.fromHex(req.params.principalHex);
        res.json(hexAddressFromPrincipal(principal, 0));
    });

    // not used right now. can be used for transfers from the canister for instances when a marketplace can hold a balance account for users
    app.put("/payment/:id", async (req: Request, res: Response) => {
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

/*
    a hash function that is used to generate correlation ids for orders.
    also, we use that in the verifyPayment function where we check if the used has actually paid the order
*/
function hash(input: any): bigint {
    return BigInt(Math.abs(hashCode().value(input)));
};

function generateCorrelationId(productId: text): bigint {
    const correlationId = `${productId}_${ic.caller().toText()}_${ic.time()}`;
    return hash(correlationId);
};

/*
    after the order is created, we give the `delay` amount of minutes to pay for the order.
    if it's not paid during this timeframe, the order is automatically removed from the pending orders.
*/
function discardByTimeout(memo: string, delay: Duration) {
    ic.setTimer(delay, () => {
        const order = pendingOrders.remove(memo);
        console.log(`Order discarded: memo=${order?.Some?.memo}, productId=${order?.Some?.productId}`);
    });
};

async function verifyPaymentInternal(receiver: Principal, amount: nat64, block: nat64, memo: nat64): Promise<bool> {
    const blockData = await ic.call(icpCanister.query_blocks, { args: [{ start: block, length: 1n }] });
    const tx = blockData.blocks.find((block) => {
        if ("None" in block.transaction.operation) {
            return false;
        }
        const operation = block.transaction.operation.Some;
        const senderAddress = binaryAddressFromPrincipal(ic.caller(), 0);
        const receiverAddress = binaryAddressFromPrincipal(receiver, 0);
        return block.transaction.memo === memo &&
            hash(senderAddress) === hash(operation.Transfer?.from) &&
            hash(receiverAddress) === hash(operation.Transfer?.to) &&
            amount === operation.Transfer?.amount.e8s;
    });
    return tx ? true : false;
};

function getCurrentDate() {
    const timestamp = new Number(ic.time());
    return new Date(timestamp.valueOf() / 1000_000);
}
