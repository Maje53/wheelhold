# Security and integrity

Squeek Colony is non-custodial. It never requests a seed phrase, private key, token approval or transaction. The optional wallet button only requests the public account address.

Game outcomes are derived from Squeekchain's confirmation-delayed `/v1/core` response. An action resolves from an exact `RoundRecorded` event. A newly settled round with no such event is treated as zero work only within the protocol's 16-round maximum batch window; older missing evidence expires without scoring.

Report security issues privately to the project owner before public disclosure.
