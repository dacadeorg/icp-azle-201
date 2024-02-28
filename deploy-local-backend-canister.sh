#!/usr/bin/env bash

dfx identity use default

dfx generate dfinity_js_backend
dfx deploy dfinity_js_backend

sed -i '' /^BACKEND_CANISTER_ID/d .env
dfx canister id dfinity_js_backend | awk '{print "BACKEND_CANISTER_ID="$1}' >> .env
