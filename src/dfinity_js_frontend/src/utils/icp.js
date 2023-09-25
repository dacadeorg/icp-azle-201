// import { HttpAgent, Actor } from "@dfinity/agent";
import { AuthClient } from "@dfinity/auth-client";

const IDENTITY_PROVIDER = `http://localhost:4943/?canisterId=bd3sg-teaaa-aaaaa-qaaba-cai#authorize`;
const MAX_TTL = 7 * 24 * 60 * 60 * 1000 * 1000 * 1000;

export async function getAuthClient() {
    const authClient = await AuthClient.create({
        idleOptions: {
            disableIdle: true,
            disableDefaultIdleCallback: true,
        },
    });
    const isAuthenticated = await authClient.isAuthenticated();

    if (!isAuthenticated) {
        await authClient?.login({
            identityProvider: IDENTITY_PROVIDER,
            onSuccess: async () => {
                console.log("is authenticated: ", await authClient.isAuthenticated())
                console.log("authenticated principal: ", authClient.getIdentity().getPrincipal().toText())
            },
            maxTimeToLive: MAX_TTL,
        });
    }
    return authClient;
}
