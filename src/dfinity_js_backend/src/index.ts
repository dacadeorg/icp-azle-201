import { $query, $update, Record, StableBTreeMap, Variant, Vec, match, ic, Principal, Opt, nat64 } from 'azle';
import {
    Ledger, QueryBlocksResponse, binaryAddressFromAddress, binaryAddressFromPrincipal, hexAddressFromPrincipal
} from 'azle/canisters/ledger';
import { hashCode } from 'hashcode';

/**
 * This type represents a product that can be listed on a marketplace.
 * It contains basic properties that are needed to define a product.
 */
type Product = Record<{
    id: nat64;
    title: string;
    description: string;
    location: string;
    price: nat64;
    seller: string;
    attachmentURL: string;
    soldAmount: nat64;
}>;

type ProducPayload = Record<{
    title: string;
    description: string;
    location: string;
    price: nat64;
    attachmentURL: string;
}>;

type Order = Record<{
    productId: nat64;
    price: nat64;
    status: string;
    seller: string;
    paid_at_block: Opt<nat64>;
    memo: nat64;
}>;

type Response = Variant<{
    error: string;
    product: Product;
    order: Order;
    caller: string;
    products: Vec<Product>;
    orders: Vec<Vec<Order>>;
    id: nat64;
    icpTransferResult: string;
}>;

let idCounter: nat64 = 0n;

/**
 * `productsStorage` - it's a key-value datastructure that is used to store products by sellers.
 * {@link StableBTreeMap} is a self-balancing tree that acts as a durable data storage that keeps data across canister upgrades.
 * For the sake of this contract we've chosen {@link StableBTreeMap} as a storage for the next reasons:
 * - `insert`, `get` and `remove` operations have a constant time complexity - O(1)
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
const productsStorage = new StableBTreeMap<nat64, Product>(10, 16, 1024);
const persistedOrders = new StableBTreeMap<string, Vec<Order>>(12, 71, 4096);

const icpCanister = new Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));

$query;
export function getProducts(): Response {
    return { products: productsStorage.values() };
}

$query;
export function getOrders(): Response {
    return { orders: persistedOrders.values() };
}

$query;
export function getProduct(id: nat64): Response {
    let response: Response;
    return match(productsStorage.get(id), {
        Some: (product) => response = { product: product },
        None: () => response = { error: `PRODUCT_NOT_FOUND` }
    });
}

$update;
export function addProduct(payload: ProducPayload): Response {
    if (typeof payload != 'object' || Object.keys(payload).length === 0) {
        return { error: `invalid payload` };
    }
    idCounter += 1n;
    let product: Product = { id: idCounter, soldAmount: 0n, seller: ic.caller().toText(), ...payload };
    productsStorage.insert(product.id, product);
    return { product };
};
// on create order we generate a hashcode of the order and then use this number as corelation id (memo) in the transfer function

$update
export function createOrder(id: nat64): Response {
    let response: Response;
    const principal = ic.caller().toText();
    return match(productsStorage.get(id), {
        Some: (product) => {
            const order: Order = {
                productId: product.id,
                price: product.price,
                status: "PAYMENT_PENDING",
                seller: product.seller,
                paid_at_block: Opt.None,
                memo: generateCorrelationId(id)
            };
            match(persistedOrders.get(principal), {
                Some: (orders) => {
                    orders.push(order);
                    persistedOrders.insert(principal, orders);
                },
                None: () => {
                    let principalOrders: Order[] = [];
                    principalOrders.push(order);
                    persistedOrders.insert(principal, principalOrders);
                }
            });
            return response = { order: order };
        },
        None: () => {
            return response = { error: "PRODUCT_NOT_FOUND" };
        }
    });
}


function generateCorrelationId(productId: nat64): nat64 {
    const correlationId = `${productId}_${ic.caller().toText()}_${ic.time()}`;
    return hash(correlationId);
}

$update;
export async function completePurchase(seller: Principal, id: nat64, price: nat64, block: nat64, memo: nat64): Promise<Response> {
    let response: Response;
    const paymentVerified = await verifyPayment(seller, price, block, memo);
    if (!paymentVerified) {
        return response = { error: "PAYMENT_NOT_FOUND" };
    }
    return match(persistedOrders.get(ic.caller().toText()), {
        Some: (orders) => {
            const orderPosition = orders.findIndex((order) =>
                order.memo === memo &&
                order.productId === id &&
                order.status === "PAYMENT_PENDING"
            );
            if (orderPosition >= 0) {
                orders[orderPosition].status = "COMPLETED";
                orders[orderPosition].paid_at_block = Opt.Some(block);
                updateSoldAmount(id);
                persistedOrders.insert(ic.caller().toText(), orders);
                return makePayment(orders[orderPosition].seller, orders[orderPosition].price);
            }
            return response = { error: "PENDING_ORDER_NOT_FOUND" };
        },
        None: () => response = { error: "ORDER_NOT_FOUND" }
    });
}

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
        Err: (err) => false
    });
}

function updateSoldAmount(productId: nat64) {
    return match(productsStorage.get(productId), {
        Some: (product) => {
            product.soldAmount += 1n;
            productsStorage.insert(product.id, product);
        },
        None: () => { throw Error(`PRODUCT_NOT_FOUND`) }
    });
}

async function makePayment(to: string, amount: nat64): Promise<Response> {
    let response: Response;
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
        Ok: (_) => response = { icpTransferResult: `PAYMENT_COMPLETED` },
        Err: (err) => response = { error: `PAYMENT_FAILED` }
    });
}

async function getIcpTransferFee() {
    const transferFee = await icpCanister.transfer_fee({}).call();
    return match(transferFee, {
        Ok: (result) => result.transfer_fee.e8s,
        Err: (err) => -1n //
    });
}

$update;
export function updateProduct(payload: Product): Response {
    let response: Response;
    return match(productsStorage.get(payload.id), {
        Some: (product) => {
            productsStorage.insert(product.id, payload);
            return response = { product: payload };
        },
        None: () => response = { error: `PRODUCT_NOT_FOUND` }
    });
};

$update;
export function deleteProduct(id: nat64): Response {
    let response: Response;
    return match(productsStorage.remove(id), {
        Some: (deletedProduct) => response = { id: deletedProduct.id },
        None: () => response = { error: `PRODUCT_NOT_FOUND` }
    });
};

$query;
export function getAddressFromPrincipal(principal: Principal): string {
    return hexAddressFromPrincipal(principal, 0);
}

function hash(input: any): nat64 {
    return BigInt(Math.abs(hashCode().value(input)));
}
