# PROTOTYPE — 100-proposal hardening pass

Question: can the CSA proposal state model accept, reject, and carry 100 proposal scenarios—including drafts, malformed payloads, hostile strings, duplicate submissions, concurrency, and role mismatches—without losing the record or crossing a permission boundary?

This harness is throwaway. It starts the real `server.js` against a temporary copy of `portal-data.json`, drives the HTTP lifecycle, prints the state after every action, and deletes the temporary store when it exits.

Run it with:

```sh
npm run prototype:proposal-hardening
```
