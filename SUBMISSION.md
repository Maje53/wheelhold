# Genesis Code submission checklist

## Product

- [x] Playable strategy loop; not a dashboard or thin API wrapper
- [x] Four decisions with distinct deterministic outcomes
- [x] Persistent local progress and duplicate-round protection
- [x] Hardware, simulated, replay, stale and unavailable data are distinguished
- [x] Confirmed round work links to its Sepolia transaction when available
- [x] Training mode is clearly labelled and cannot score live progress
- [x] Responsive layout, keyboard focus and reduced-motion support
- [x] Automated protocol and game-logic tests

## Before verification

- [ ] Start the first production build/deploy job through IMD using the wallet verified on the builder's Genesis profile
- [ ] Add the resulting IMD job URL to this file and the production footer
- [ ] Deploy the exact reviewed commit
- [ ] Test one active and one zero-work round on the production URL
- [ ] Test current Chrome, Safari and Firefox plus iOS/Android widths
- [ ] Record a short gameplay video showing selection, lock, settlement and proof
- [ ] Submit for team review; do not claim approval beforehand

## Honest scope

This version is a personal persistent colony driven by the same public Squeekchain rounds. A server-authoritative shared colony and leaderboard are future features and are not claimed by this build.
