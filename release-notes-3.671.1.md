# TRG Prime 3.671.1

25 October 2026. A packaging release: 3.671.0 with its manifest and download links.

- **Install over 3.671.0** (or install from the manifest link). Nothing in play changes; Inner Tempest 0.8.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **Why:** the 3.671.0 release's `system.json` had no manifest and no download link. Foundry could not install or update the system from the manifest link, and an install made from that release cannot see the next one. 3.671.1 carries both:
  - manifest: `https://raw.githubusercontent.com/snowtroll75-debug/trpg-prime/main/system.json`;
  - download: this version's release asset.
- **Install once from the manifest link** (or over the top from this release) and later versions are offered as updates again.

## Checks

- **New harness pair `verify/mutate-release-links`** (6 checks, 5 mutations):
  - the manifest is the raw `system.json` on main;
  - the download names this version's release, so the two never disagree;
  - the build tool leaves both alone.
- **Version pins** moved to 3.671.1 in `mutate-block6-core`, `mutate-block7-core`, `mutate-fixes-3669-2` and `mutate-fixes-3670-1`.
