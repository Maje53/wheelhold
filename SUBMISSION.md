# Wheelhold · Genesis Code submission checklist

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

Operational blocker observed on 2026-11-05: the public status endpoint reported `settlementQueue.state = disabled` and `settlementEnabled = false`. Wheelhold now disables new locks in that state. Do not request Genesis review until settlement is enabled and the production active/zero-round checks below pass.

- [x] Start the first production build/deploy job through IMD using the wallet verified on the builder's Genesis profile
- [x] Record the first job: https://explorer.imd.fun/jobs/10243a89-33c6-4399-a3b2-85890e3ddc68
- [x] Link the IMD job from the production footer
- [ ] Publish the renamed, hardened commit through the existing job continuation and replace the initial site URL: https://squeek-colony-the-wheel-writes-o.imd.site
- [ ] Deploy the exact reviewed commit
- [ ] Test one active and one zero-work round on the production URL
- [ ] Test current Chrome, Safari and Firefox plus iOS/Android widths
- [ ] Record a short gameplay video showing selection, lock, settlement and proof
- [ ] Submit for team review; do not claim approval beforehand

## Honest scope

This version is a personal persistent colony driven by the same public Squeekchain rounds. A server-authoritative shared colony and leaderboard are future features and are not claimed by this build.
