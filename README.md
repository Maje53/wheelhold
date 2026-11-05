# Wheelhold — A Squeekchain Colony

A persistent colony strategy game whose verified round outcomes are powered by Squeektoshi's real WHEELY9000 activity. Wheelhold was previously developed under the working title Squeek Colony; the distinct product name avoids confusion with another independently published build. This build is a personal colony, not yet a server-authoritative multiplayer world.

## Run

```bash
npm install
npm run dev
```

## Integrity rules

- Action locking requires fresh hardware telemetry accepted by the Oracle, an unpaused core and an available settlement pipeline.
- The open round is derived from the canonical genesis timestamp and duration; a lock is rejected exactly at the round boundary.
- Resolution uses confirmed `RoundRecorded` work from `/v1/core`, not a guessed RPM snapshot.
- `unavailable`, stale and unknown data never become zero activity.
- Training simulation is visually labelled and never resolves or rewards a live round.
- Processed round IDs are stored and cannot score twice.
- Large chain values remain strings; no unsafe floating-point parsing.
- A missing active-event record is treated as zero only when the latest confirmed submission's complete active set is present; incomplete evidence expires without scoring.

## Quality checks

```bash
npm test
npm run build
```

See [SUBMISSION.md](./SUBMISSION.md) for the Genesis verification checklist and [SECURITY.md](./SECURITY.md) for the trust model.

This prototype reads `GET https://api.squeekchain.com/v1/status` and `/v1/core`. It does not claim Genesis approval. Its first IMD production job is recorded in [SUBMISSION.md](./SUBMISSION.md); the renamed, hardened commit still needs to be published through that job's paid continuation before Genesis review.
