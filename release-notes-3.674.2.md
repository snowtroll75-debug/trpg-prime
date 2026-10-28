# TRG Prime 3.674.2

28 October 2026. A republish of 3.674.1 under a new number. Graham: "update the version number of the two zips, otherwise it will not trigger updates".

- **Why:** the hatching-card fix (`createCompanionFor`'s `beforeCard`, in the 3.674.1 notes) went out after 3.674.1 had already been installed, under the same number, so Foundry did not offer it. 3.674.2 carries it under a number Foundry will update to.
- **Install over 3.674.1.** Inner Tempest 1.0.2 needs it.
- **No rule or behaviour changes** beyond those in the 3.674.1 notes. **No migration prompt.**

## Harness

- **`verify-block10-core`:** 50 checks (Z2: the system is 3.674.2 or later); **`mutate-block10-core`:** 80 mutations, all caught.
- **Re-pinned to 3.674.2:** the version mutations of the Block 6–10 core pairs, the two fix pairs and the release links.
