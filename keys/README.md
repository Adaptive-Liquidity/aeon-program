# Program keypair

`aeon-keypair.json` pubkey must match `declare_id!` / `AEON_PROGRAM_ID`:

```
8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn
```

Used by CI and local `anchor test` deploys (`scripts/ci-prepare-deploy.sh` copies it to `target/deploy/`).

**Security:** this key is the upgrade authority for the live devnet program.  
Treat production mainnet keys separately (multisig / governance); do not rotate this id without a coordinated redeploy.
