import { AuthClient } from "@dfinity/auth-client";

// that is the url of the webapp for the internet identity. 
const IDENTITY_PROVIDER = window.location.origin + `/?canisterId=bd3sg-teaaa-aaaaa-qaaba-cai#authorize`;
const MAX_TTL = 7 * 24 * 60 * 60 * 1000 * 1000 * 1000;

export async function getAuthClient() {
    return await AuthClient.create();
}

export async function login() {
    const authClient = window.auth.client;

    const isAuthenticated = await authClient.isAuthenticated();

    if (!isAuthenticated) {
        await authClient?.login({
            identityProvider: IDENTITY_PROVIDER,
            onSuccess: async () => {
                window.auth.isAuthenticated = await authClient.isAuthenticated();
                window.location.reload();
            },
            maxTimeToLive: MAX_TTL,
        });
    }
}

export async function logout() {
    const authClient = window.auth.client;
    authClient.logout();
    window.location.reload();
}