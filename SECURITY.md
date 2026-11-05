# Security and integrity

Wheelhold is non-custodial. It never requests a seed phrase, private key, token approval or transaction. The optional wallet button only requests the public account address.

Game outcomes are derived from Squeekchain's confirmation-delayed `/v1/core` response. An action resolves from an exact `RoundRecorded` event. A round omitted from the latest confirmed settlement span is certified as zero work; a missing event without that affirmative span evidence expires without scoring. The protocol limit is 16 active rounds per settlement, not a blanket 16-round evidence assumption.

Report security issues privately to the project owner before public disclosure.
