# Squeek Colony

A persistent colony strategy game whose verified round outcomes are powered by Squeektoshi's real WHEELY9000 activity. This build is a personal colony, not yet a server-authoritative multiplayer world.

## Run

```bash
npm install
npm run dev
```

## Integrity rules

- Action locking requires fresh hardware telemetry accepted by the Oracle.
- Resolution uses confirmed `RoundRecorded` work from `/v1/core`, not a guessed RPM snapshot.
- `unavailable`, stale and unknown data never become zero activity.
- Training simulation is visually labelled and never resolves or rewards a live round.
- Processed round IDs are stored and cannot score twice.
- Large chain values remain strings; no unsafe floating-point parsing.
- Missing evidence outside the latest settlement window expires without scoring.

## Quality checks

```bash
npm test
npm run build
```

See [SUBMISSION.md](./SUBMISSION.md) for the Genesis verification checklist and [SECURITY.md](./SECURITY.md) for the trust model.

This prototype reads `GET https://api.squeekchain.com/v1/status`. It does not claim Genesis approval. Before Genesis submission, its first production build/deploy job must be purchased through IMD from the wallet verified on the builder's Genesis profile.
