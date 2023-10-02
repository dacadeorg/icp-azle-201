import { $query, $update, Record, StableBTreeMap, Variant, Vec, match, ic, Principal, Opt, nat64, Duration, Result } from 'azle';
import {
    Ledger, QueryBlocksResponse, binaryAddressFromAddress, binaryAddressFromPrincipal, hexAddressFromPrincipal
} from 'azle/canisters/ledger';
import { hashCode } from 'hashcode';
import { v4 as uuidv4 } from 'uuid';

/**
 * This type represents a product that can be listed on a marketplace.
 * It contains basic properties that are needed to define a product.
 */
type Product = Record<{
    id: string;
    title: string;
    description: string;
    location: string;
    price: nat64;
    seller: Principal;
    attachmentURL: string;
    soldAmount: nat64;
}>;

type ProductPayload = Record<{
    title: string;
    description: string;
    location: string;
    price: nat64;
    attachmentURL: string;
}>;

type Order = Record<{
    productId: string;
    price: nat64;
    status: OrderStatus;
    seller: Principal;
    paid_at_block: Opt<nat64>;
    memo: nat64;
}>;

type Message = Variant<{
    NotFound: string;
    InvalidPayload: string;
    PaymentFailed: string;
    PaymentCompleted: string;
}>;

type OrderStatus = Variant<{
    PaymentPending: string;
    Completed: string;
}>;

/**
 * `productsStorage` - it's a key-value datastructure that is used to store products by sellers.
 * {@link StableBTreeMap} is a self-balancing tree that acts as a durable data storage that keeps data across canister upgrades.
 * For the sake of this contract we've chosen {@link StableBTreeMap} as a storage for the next reasons:
 * - `insert`, `get` and `remove` operations have a constant time complexity - O(1)
 * - data stored in the map survives canister upgrades unlike using HashMap where data is stored in the heap and it's lost after the canister is upgraded
 * 
 * Brakedown of the `StableBTreeMap<string, Product>` datastructure:
 * - the key of map is a `productId`
 * - the value in this map is a product itself `Product` that is related to a given key (`productId`)
 * 
 * Constructor values:
 * 1) 0 - memory id where to initialize a map
 * 2) 16 - it's a max size of the key in bytes.
 * 3) 1024 - it's a max size of the value in bytes. 
 * 2 and 3 are not being used directly in the constructor but the Azle compiler utilizes these values during compile time
 */
const productsStorage = new StableBTreeMap<string, Product>(3, 44, 1024);
const persistedOrders = new StableBTreeMap<Principal, Order>(1, 71, 4096);
const pendingOrders = new StableBTreeMap<nat64, Order>(2, 16, 4096);

const ORDER_RESERVATION_PERIOD = 120n; // reservation period in seconds

/* 
    initialization of the Ledger canister. The principal text value is hardcoded because 
    we set it in the `dfx.json`
*/
const icpCanister = new Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));

$query;
export function getProducts(): Vec<Product> {
    return productsStorage.values();
}

$query;
export function getOrders(): Vec<Order> {
    return persistedOrders.values();
}

$query;
export function getPendingOrders(): Vec<Order> {
    return pendingOrders.values();
}

$query;
export function getProduct(id: string): Result<Product, Message> {
    return match(productsStorage.get(id), {
        Some: (product) => Result.Ok<Product, Message>(product),
        None: () => Result.Err<Product, Message>({ NotFound: `product with id=${id} not found` })
    });
}

$update;
export function addProduct(payload: ProductPayload): Result<Product, Message> {
    if (typeof payload !== 'object' || Object.keys(payload).length === 0) {
        return Result.Err<Product, Message>({ NotFound: "invalid payoad" })
    }
    const product: Product = { id: uuidv4(), soldAmount: 0n, seller: ic.caller(), ...payload };
    productsStorage.insert(product.id, product);
    return Result.Ok<Product, Message>(product);
};

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
$update
export function createOrder(id: string): Result<Order, Message> {
    return match(productsStorage.get(id), {
        Some: (product) => {
            const order: Order = {
                productId: product.id,
                price: product.price,
                status: { PaymentPending: "PAYMENT_PENDING" },
                seller: product.seller,
                paid_at_block: Opt.None,
                memo: generateCorrelationId(id)
            };
            pendingOrders.insert(order.memo, order);
            discardByTimeout(order.memo, ORDER_RESERVATION_PERIOD);
            return Result.Ok<Order, Message>(order);
        },
        None: () => {
            return Result.Err<Order, Message>({ NotFound: `cannot create the order: product=${id} not found` });
        }
    });
}

function generateCorrelationId(productId: string): nat64 {
    const correlationId = `${productId}_${ic.caller().toText()}_${ic.time()}`;
    return hash(correlationId);
}

/*
    after the order is created, we give the `delay` amount of minutes to pay for the order.
    if it's not paid during this timeframe, the order is automatically removed from the pending orders.
*/
function discardByTimeout(memo: nat64, delay: Duration) {
    ic.setTimer(delay, () => {
        const order = pendingOrders.remove(memo);
        console.log(`Order discarded ${order}`);
    });
}

$update;
export async function completePurchase(seller: Principal, id: string, price: nat64, block: nat64, memo: nat64): Promise<Result<Order, Message>> {
    const paymentVerified = await verifyPayment(seller, price, block, memo);
    if (!paymentVerified) {
        return Result.Err<Order, Message>({ NotFound: `cannot complete the purchase: cannot verify the payment, memo=${memo}` });
    }
    return match(pendingOrders.remove(memo), {
        Some: (order) => {
            const updatedOrder = { ...order, status: { Completed: "COMPLETED" }, paid_at_block: Opt.Some(block) };
            updateSoldAmount(id);
            persistedOrders.insert(ic.caller(), updatedOrder);
            return Result.Ok<Order, Message>(updatedOrder);
        },
        None: () => Result.Err<Order, Message>({ NotFound: `cannot complete the purchase: there is no pending order with id=${id}` })
    });
}

/*
    another example of a canister-to-canister communication
    here we call the `query_blocks` function on the ledger canister
    to get a single block with the given number `start`.
    The `length` parameter is set to 1 to limit the return amount of blocks.
    In this function we verify all the details about the transaction to make sure that we can mark the order as completed
*/
$query;
export async function verifyPayment(receiver: Principal, amount: nat64, block: nat64, memo: nat64): Promise<boolean> {
    return match(await icpCanister.query_blocks({ start: block, length: 1n }).call(), {
        Ok: (blockData: QueryBlocksResponse) => {
            const tx = blockData.blocks.find((block) => {
                return match(block.transaction.operation, {
                    Some: (operation) => {
                        const senderAddress = binaryAddressFromPrincipal(ic.caller(), 0);
                        const receiverAddress = binaryAddressFromPrincipal(receiver, 0);
                        return block.transaction.memo === memo &&
                            hash(senderAddress) === hash(operation.Transfer?.from) &&
                            hash(receiverAddress) === hash(operation.Transfer?.to) &&
                            amount === operation.Transfer?.amount.e8s;
                    },
                    None: () => false
                });
            });
            return tx ? true : false;
        },
        Err: (_) => false
    });
}

function updateSoldAmount(productId: string) {
    return match(productsStorage.get(productId), {
        Some: (product) => {
            product.soldAmount += 1n;
            productsStorage.insert(product.id, product);
        },
        None: () => { throw Error(`product with id=${productId} not found`) }
    });
}

// not used right now. can be used for transfers from the canister for instances when a marketplace can hold a balance account for users
async function makePayment(to: string, amount: nat64): Promise<Result<Message, Message>> {
    const toPrincipal = Principal.fromText(to);
    const toAddress = hexAddressFromPrincipal(toPrincipal, 0);
    const transferFee = await getIcpTransferFee();
    const transferResult = await icpCanister
        .transfer({
            memo: 0n,
            amount: {
                e8s: amount
            },
            fee: {
                e8s: transferFee
            },
            from_subaccount: Opt.None,
            to: binaryAddressFromAddress(toAddress),
            created_at_time: Opt.None
        })
        .call()
    return match(transferResult, {
        Ok: (_) => Result.Ok<Message, Message>({ PaymentCompleted: "payment completed" }),
        Err: (err) => Result.Err<Message, Message>({ PaymentFailed: `payment failed, err=${err}` })
    });
}

// here we perform a canister-to-canister call where we talk to the ledger canister to get the value of the transfer_fee
async function getIcpTransferFee() {
    const transferFee = await icpCanister.transfer_fee({}).call();
    return match(transferFee, {
        Ok: (result) => result.transfer_fee.e8s,
        Err: (err) => -1n //
    });
}

$update;
export function updateProduct(payload: Product): Result<Product, Message> {
    return match(productsStorage.get(payload.id), {
        Some: (product) => {
            productsStorage.insert(product.id, payload);
            return Result.Ok<Product, Message>(payload);
        },
        None: () => Result.Err<Product, Message>({ NotFound: `cannot update the product: product with id=${payload.id} not found` })
    });
};

$update;
export function deleteProduct(id: string): Result<string, Message> {
    return match(productsStorage.remove(id), {
        Some: (deletedProduct) => Result.Ok<string, Message>(deletedProduct.id),
        None: () => Result.Err<string, Message>({ NotFound: `cannot delete the product: product with id=${id} not found` }),
    });
};

/*
    a helper function to get address from the principal
    the address is later used in the transfer method
*/
$query;
export function getAddressFromPrincipal(principal: Principal): string {
    return hexAddressFromPrincipal(principal, 0);
}

/*
    a hash function that is used to generate correlation ids for orders.
    also, we use that in the verifyPayment function where we check if the used has actually paid the order
*/
function hash(input: any): nat64 {
    return BigInt(Math.abs(hashCode().value(input)));
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    getRandomValues: () => {
        let array = new Uint8Array(32);

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }

        return array;
    }
};