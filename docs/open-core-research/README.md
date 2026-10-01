# CityCatalyst open core as digital public infrastructure: research and design notes

Working documents from a survey of CityCatalyst's codebase and of the state of the art in government digital identity, data sovereignty, federation, AI-agent governance, verifiable records, spatial-first architecture and cryptographic control. Prepared for Open Earth Foundation (OEF), October 2026, on the local branch `docs/open-core-dpi`. Codebase state: `develop` at commit `65731e28`, 1 October 2026.

These are research notes, not decisions. Every claim about the code is traced to a file path. Every third-party fact carries a link and a date. Items that could not be checked against a primary source are marked **UNVERIFIED**. Reasoning that goes beyond the sources is marked **Inference**. Facts that would need clearance before being shared outside OEF are marked **CLEARANCE**.

## How to read

| Document | What it answers | Length |
|---|---|---|
| [00-decision-brief.md](00-decision-brief.md) | What the core is and is not, whether to build on CityCatalyst's codebase or start fresh, the extraction path, and the three decisions to take | 3 pages |
| [01-component-inventory.md](01-component-inventory.md) | Every capability in the monorepo classified as core, climate app, GCoM-specific or OEF-instance-specific, with file paths | Reference |
| [02-target-architecture.md](02-target-architecture.md) | The target core as layers with interfaces, the generic abstractions that replace climate vocabulary, and the five primitives | Reference |
| [03-extraction-roadmap.md](03-extraction-roadmap.md) | Phases, dependencies on the GCoM Digital Service build, effort estimates and risks | Reference |
| [04-research-directions/](04-research-directions/) | One note per research area: what it is in plain terms, the standards and reference implementations, what to adopt now versus later, what it means for the core, open questions, sources | 9 notes |
| [05-open-questions.md](05-open-questions.md) | Questions for Pablo (technology), Milan (full stack), Mirco (AI), and for C40 and GCoM | 2 pages |

Vocabulary used throughout: "app integration rules" for the published rules every app follows; "CityCatalyst's codebase" for the code; "steward" for OEF's role as copyright holder of the open core; "native" for an app hosted inside a service. "Open core" means the domain-agnostic infrastructure layer stewarded by OEF under AGPL-3.0, as distinct from the climate apps on top and from any service built with it.

## Positions taken as given

These were agreed before this work and are not re-opened here: the hybrid architecture for the GCoM Digital Service; the open core stays AGPL-3.0 with OEF as copyright steward and joint governance; the SDK and connectors are Apache-2.0; the GCoM Digital Service runs in C40's own AWS account on its own branch of the open core; the MVP is 1 July 2027 and the specification gate is 23 October 2026. Where the research touches one of these positions, it says so explicitly.
