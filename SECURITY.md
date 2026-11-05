# Security and integrity

Wheelhold is non-custodial. It never requests a seed phrase, private key, token approval or transaction. The optional wallet button only requests the public account address.

Game outcomes are derived from Squeekchain's confirmation-delayed `/v1/core` response. An action resolves from an exact `RoundRecorded` event at or behind the certified frontier. A round omitted from the latest confirmed settlement span is accepted as zero only when every active event declared by that same settlement transaction is present in the API window; truncated or otherwise incomplete evidence expires without scoring. The protocol limit is 16 active rounds per settlement, not a blanket 16-round evidence assumption.

The `/v1/status` and `/v1/core` snapshots must name the same installation and the expected Sepolia chain. New locks are disabled when settlement is disabled, blocked, stale, incident-affected or when SqueekCore is paused.

Report security issues privately to the project owner before public disclosure.
