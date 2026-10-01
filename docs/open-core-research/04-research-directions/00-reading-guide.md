# Research directions: reading guide

Nine notes, one per area. Each follows the same shape: what the area is in plain terms; the standards and reference implementations to know, with status and date; what a government-facing open core should adopt now at low cost versus design for and commit to later; what it means for the core's design; three open research questions; sources with links.

The guiding rule, from OEF's June 2026 Companion Memo: design for compatibility now, commit later. Each note therefore sorts its recommendations into three tiers.

| Tier | Meaning |
|---|---|
| **Adopt now** | Mature standard or component, low cost, and it removes a later retrofit |
| **Design for** | Leave the slot in the schema or interface; do not build the thing yet |
| **Watch** | Immature or vendor-dominated; track, do not depend on |

| Note | Area | Why it matters for the core |
|---|---|---|
| [01-government-identity.md](01-government-identity.md) | Government and institutional digital identity | Who is the person, which organisation do they act for, with what authority; single sign-on across partner tools |
| [02-data-sovereignty.md](02-data-sovereignty.md) | Self-sovereign identity and data sovereignty | "The city owns its data; the service holds it on its behalf" made technical |
| [03-federation.md](03-federation.md) | Federation | How national, city, programme and other-domain instances of one core relate |
| [04-ai-agent-governance.md](04-ai-agent-governance.md) | AI governance for agents acting on public data | Agents as principals, audit, regulation, "no training on city data" |
| [05-verifiable-records.md](05-verifiable-records.md) | Trust and verification | Verifiable versus verified records; what the record layer must carry |
| [06-govtech-ai-and-dpi.md](06-govtech-ai-and-dpi.md) | Govtech AI integration and DPI building-block models | What governments are deploying; how the core compares with GovStack, DIGIT, Sunbird, X-Road, MOSIP and the DPG and DPI standards |
| [07-spatial-first.md](07-spatial-first.md) | Spatial-first architecture | Governments as bounded spaces with rules; nested and overlapping jurisdictions as a graph; the spatial web |
| [08-component-benchmark.md](08-component-benchmark.md) | Build on, start fresh, or integrate | Mature components by capability, three strategies compared, the no-rebuild ledger |
| [09-cryptographic-control.md](09-cryptographic-control.md) | Cryptographic control of AI agents | Keys, capabilities, attestation, signed logs and privacy-preserving computation |

Cross-cutting conclusions appear in [02-target-architecture.md](../02-target-architecture.md). Facts that need clearance before leaving OEF are marked **CLEARANCE**; unconfirmed facts **UNVERIFIED**; reasoning beyond the sources **Inference**.
