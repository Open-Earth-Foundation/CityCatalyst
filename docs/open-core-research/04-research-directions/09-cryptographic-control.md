# Cryptographic control of AI agents acting on public data

Research note, 1 October 2026. **UNVERIFIED** marks items not confirmed against a primary source; **Inference** marks reasoning beyond the sources. Standards already covered elsewhere (Verifiable Credentials, DIDs, SD-JWT, SCITT, Sigstore, C2PA, eIDAS seals, OAuth token exchange, MCP authorisation, PROV-O, GeoXACML, ODRL) are referenced, not re-explained.

## 1. What cryptographic control means, in plain terms

An AI agent is a program that reads data, decides and acts through tools. Today most control over it rests on trusting its operator and its model. Cryptographic control replaces that trust with evidence: every important fact about the agent is bound to a key and a proof that a stranger can check later. The chain has seven links.

1. **Who authorised it (credential).** A city official holds a signed statement that they may delegate record tasks.
2. **What the agent may do (capability).** The official hands the agent a signed, narrowly scoped permission ("read inventory 2024, write draft only, within jurisdiction X"). Capability tokens express this and let the agent hand a narrower permission to a sub-agent.
3. **What it saw (input commitment).** Before acting, the agent records a hash, a fixed-length fingerprint, of every input it used. The fingerprint is signed, so anyone can later check that the inputs were exactly these.
4. **What it did (signed action log).** Each tool call and result is appended to a hash-chained log in which every entry includes the fingerprint of the previous one, so nothing can be edited or removed quietly.
5. **What it produced (signed output with provenance).** The output carries a signature over its content plus pointers to the inputs, the capability and the log entries that produced it.
6. **Where it ran (attestation).** The hardware signs a statement of which code and model were loaded. This proves the environment, not the reasoning.
7. **Whether a third party can check it later.** Everything above resolves to public keys in registries and entries in append-only logs, so an auditor, another city or a court can verify without asking the operator.

**Inference.** For a municipal platform the practical value is less adversarial proof than non-repudiation and replay: a city can show exactly which agent, under whose authority, using which inputs, produced which figure. Today the codebase has none of these links: no signatures over records, no capability tokens, no input commitments, no hash-chained log and no attestation.

## 2. Tools and standards

### Capability tokens

An OAuth scope says "this token can read calendars". A capability says "this holder may read this resource and may pass a narrower version of this right to someone else", and carries its own delegation history, which is what multi-step agent chains need.

- **UCAN (User Controlled Authorization Networks).** Signed JSON tokens naming issuer, audience, resource and command, with attenuation and a separate invocation token; the specification states version 1.0.0 with four sub-specifications, though no release date is published (**UNVERIFIED**); implementations in Go, Rust and TypeScript ([ucan-wg](https://github.com/ucan-wg/spec/blob/main/README.md)). Small, active community.
- **Biscuit.** Bearer tokens whose rights are written in a small logic language; a holder can append a block that restricts it offline and the signature chain stays valid; originated at Clever Cloud in 2021, now an Eclipse Foundation project, token versions 3.0 to 3.3 with a v4 addressing a 2024 vulnerability ([Clever Cloud](https://www.clever-cloud.com/?p=2832)).
- **Macaroons** (Google, 2014): symmetric-key caveats, so third-party verification requires sharing a secret.
- **ZCAP-LD** (W3C community group): the most natural fit with Verifiable Credentials, but dormant at v0.3 and acknowledged in April 2026 to be out of sync with deployments ([CCG list](https://lists.w3.org/Archives/Public/public-credentials/2026Apr/0029.html)).
- **Compared with OAuth.** RFC 8693 token exchange records delegation but relies on the authorisation server to enforce narrowing; capability tokens carry the narrowing proof themselves. **Inference:** UCAN or Biscuit inside the platform, wrapped in OAuth at the API edge, is the pragmatic combination.

### Key event and identifier infrastructure

An identifier is only as trustworthy as the story of its keys. Key rotation and pre-rotation (committing in advance to the hash of the next key) let an organisation recover from compromise without changing its identifier.

- **KERI, ACDC and CESR** (Trust over IP): a signed, hash-chained log of key events with pre-rotation and witness receipts; credentials chained to those logs. The specification is at v1.1 ([ToIP](https://trustoverip.github.io/kswg-keri-specification/)); the approval date conflicts across sources (**UNVERIFIED**). This is the basis of GLEIF's verifiable LEI, standardised as ISO 17442-3. The strongest answer to "who signs for the municipality and what if the key is stolen".
- **did:webvh** (formerly did:tdw): a web-hosted identifier whose history is a hash-chained log with pre-rotation and optional witnesses, hosted at the Decentralized Identity Foundation and originated by the British Columbia government ([didwebvh](https://github.com/decentralized-identity/didwebvh)). The cheapest route to a city identifier with verifiable key history, using only a web server. **did:web** is the plain version, trust equals DNS plus TLS: adopt for pilots, graduate to did:webvh.
- **Threshold signatures and custody.** FROST, RFC 9591 (June 2024), lets a quorum of officials jointly produce one signature so no single laptop holds the city's key ([RFC 9591](https://www.rfc-editor.org/rfc/rfc9591.html)). **Inference:** for a municipality, a cloud key service with a two-of-three approval policy delivers most of the benefit at a fraction of the engineering.
- **Post-quantum signatures and agility.** FIPS 204 and 205 were finalised in August 2024; NIST's draft timeline would deprecate current signatures after 2030 and disallow them after 2035, still an initial public draft on NIST's own page ([NIST IR 8547](https://csrc.nist.gov/pubs/ir/8547/ipd)); ML-DSA for JOSE and COSE is RFC 9964 (May 2026); the W3C has a quantum-resistant cryptosuite working draft of 16 June 2026 ([W3C](https://www.w3.org/TR/2026/WD-vc-di-quantum-resistant-1.0-20260616/)). **Implication:** the record envelope must carry an algorithm identifier and permit multiple proofs on one record from day one. Municipal records that must stay verifiable for thirty years are exactly the "harvest now, forge later" case.

### Attestation and trusted execution

A trusted execution environment is a hardware-isolated region that even the cloud operator cannot read; remote attestation is the chip signing "this measured code is running in me". The IETF architecture is RFC 9334 and the Entity Attestation Token is RFC 9711 (April 2025). GPU confidential computing exists on NVIDIA Hopper and Blackwell with a reported one to four percent throughput overhead ([NVIDIA](https://developer.nvidia.com/blog/enabling-private-high-performance-production-ai-inference-with-nvidia-confidential-computing/)); Azure confidential VMs with H100 are generally available; AWS Nitro Enclaves have no GPU inside the enclave; Confidential Containers became a CNCF incubating project on 22 July 2026. **What attestation proves and does not:** which binary, model hash and configuration were loaded on genuine hardware at a point in time; not that the output was correct, that prompts were benign, or that the operator's policy was sensible. **Verifiable inference** (zero-knowledge proofs that an output came from a model) handles models up to roughly 100 million parameters; a ResNet-50 proof still takes over 24 hours in surveyed systems, and a 2026 attack shows hollow weights can pass some schemes ([survey, arXiv 2502.18535](https://arxiv.org/pdf/2502.18535)). Not practical for large language models in 2026.

### Signed, tamper-evident logs

A hash chain makes deletion visible; a Merkle tree makes inclusion provable in logarithmic size; a transparency log publishes tree heads so outsiders can verify; witnesses co-sign so the operator cannot fork history. Rekor v2 and Tessera (general availability October 2025) are the open tooling; SCITT layers signed statements and receipts on exactly this kind of log; RFC 3161 timestamps are mature; immudb is a Merkle-verified database usable as an internal log. Agent audit-log designs of 2025 and 2026 converge on hash chain plus Merkle batching plus an external anchor, with about 48 microseconds per event overhead reported by one design ([Agent Flight Recorder, arXiv 2609.01931](https://arxiv.org/abs/2609.01931)); the 2026 Singapore Consensus names reconstructible, tamper-evident action records as a research priority ([arXiv 2608.14611](https://arxiv.org/pdf/2608.14611)). **Inference:** the anchor can be a SCITT or Sigstore-style log rather than a blockchain.

### Output provenance: signatures beat watermarks

Google's SynthID marks text, images, audio and video, with the text method open-sourced ([Google](https://ai.google.dev/responsible/docs/safeguards/synthid)). A watermark is probabilistic, model-specific and removable by paraphrase; a signature over the record plus its provenance chain is deterministic, verifiable by anyone with the public key, and binds the record to an accountable issuer. Watermarks answer "was this machine-made?"; signatures answer "who stands behind this and what was it computed from?" Only the second matters for an official record.

### Privacy-preserving computation across jurisdictions

BBS selective disclosure is a W3C candidate recommendation draft (10 September 2026); SD-JWT is the simpler alternative. Zero-knowledge proofs of a computation are feasible for small deterministic formulas (an emission-factor multiplication) and infeasible for model reasoning. Secure multi-party computation and homomorphic encryption (OpenFHE 1.5.1, April 2026; Zama Concrete ML 1.9; MP-SPDZ) are practical for summing or averaging across a handful of cities with fixed protocols, impractical as a general query layer. Differential privacy (OpenDP 0.15, May 2026) is the one privacy technique a non-profit can adopt now for published aggregates; it is a statistical, not cryptographic, guarantee ([OpenDP](https://opendp.org/2026/05/29/announcing-opendp-library-0-15/)).

### Spatial cryptography

Galileo's Open Service Navigation Message Authentication was declared operational on 24 July 2025, the first satellite system with signed navigation messages, and new EU trucks must carry capable tachographs since December 2025 ([European Commission](https://defence-industry-space.ec.europa.eu/galileos-osnma-authentication-service-now-operational-2025-08-25_en)). It authenticates the signal, not the receiver's honesty. Decentralised proof of location is research-stage; location-bound decryption has a twenty-year research history and no production standard; no normative OGC standard for signed geospatial data was found (**UNVERIFIED**). Device identity (TCG DICE profiles v1.1, April 2025; TPM attestation) is mature for sensor origin. **Inference:** the robust way to bind a record or an agent action to a jurisdiction is organisational, not physical: the jurisdiction's identifier signs, a credential asserts its legal scope, and the capability token carries a geographic predicate the verifier checks against the record's geometry. Physical location proofs belong to sensor inputs, not to agent actions.

### Agent credential and trust registries

OpenID Federation 1.0 (Final, 17 February 2026) supplies trust marks for agent operators; the IETF workload identity architecture draft-08 (July 2026) explicitly considers agents; individual drafts on agent identity and authentication exist; the OpenID Foundation published "Identity Management for Agentic AI" in October 2025; Trust over IP's Trust Spanning Protocol is an implementers' draft (November 2025). An "agent passport" is straightforward: a Verifiable Credential issued by the operator naming the model hash, the operator identifier and allowed capabilities.

### Encryption under sovereignty

Per-tenant envelope encryption (a data key per city wrapped by a city-controlled key) is standard; client-side encryption keeps plaintext out of the platform at the cost of search; crypto-shredding is recognised in NIST SP 800-88 revision 2; Messaging Layer Security, RFC 9420 (2023), is a reasonable basis for end-to-end encrypted inter-city exchange channels; key escrow with quorum maps to FROST or multi-approval key services.

## 3. A layered control stack for the core

| Layer | Adopt now | Design for | Watch |
|---|---|---|---|
| Identity and keys | did:web for cities and agents; cloud key service with two-of-three approval; Ed25519 plus an algorithm identifier field | did:webvh migration; KERI and vLEI for cities that already hold LEIs; ML-DSA as a second proof | FROST custody; Trust Spanning Protocol |
| Authority and delegation | OAuth at the edge; a signed per-task capability (UCAN or Biscuit) inside | ZCAP-LD if revived; federation trust marks for agent operators | Workload identity drafts |
| Input commitments and consent | A hash of each input and its policy, listed in the envelope | Selective disclosure of partial inputs | Zero-knowledge proofs of formula evaluation |
| Execution attestation | Record the model hash, container digest and operator identifier (software "attestation") | An attestation-token slot in the envelope for a hardware quote | GPU confidential inference as default; verifiable inference |
| Action log | Hash-chained, Merkle-batched log per agent run; RFC 3161 timestamps | SCITT receipts; publishing checkpoints to a Rekor-style log with witnesses | Roughtime; anchoring designs |
| Output provenance | A Data Integrity proof on the record plus a PROV graph | C2PA for media outputs; counter-signature by the human approver | Watermarks, informational only |
| Third-party verification | Public key documents; published log checkpoints; an open verifier command-line tool | A federation trust chain to a national anchor | A cross-city witness cohort |
| Privacy-preserving aggregation | Differential privacy for published aggregates | A multi-party sum protocol slot for a few cities | Homomorphic analytics |

**Implications for the three designs.** The record envelope gains: issuer identifier; multiple proofs each with a cryptosuite identifier; a list of input hashes with source and policy reference; a capability token hash; an execution block (model hash, container digest, optional attestation token); a log reference (run, entry range, Merkle root); a timestamp token; a jurisdiction reference (credential plus geometry hash); an optional receipt. The agent registry becomes a signed, hash-chained log of entries with identifier, controller, model hash history, allowed capability templates, attestation policy, trust marks and revocation status. The audit log is an append-only per-run chain whose daily Merkle root is published to a transparency log, with witness co-signatures added when available.

## 4. Honest assessment

**What cryptography can guarantee** about an agent: who authorised it, what rights it held, which exact inputs it committed to, which tool calls it made and in what order, which model and code were loaded, when, and that none of this was later altered. **What it cannot:** that the model reasoned correctly, that the output is true, that the prompt was not manipulated before commitment, that the delegating human was competent. Correctness still needs human review, tests and independent recomputation; the cryptographic layer's job is to make those reviews cheap and binding.

**Operational cost for small municipalities.** The real cost is key custody, not algorithms. A city with two IT staff cannot run witnesses, hardware modules or a witness pool. **Inference:** OEF or a regional host should offer custodial key management with the city holding a recovery quorum, identifiers issued under the city's own domain so they are portable, and a one-click verifier; the city's duty reduces to approving delegations and keeping one recovery credential safe.

**Hype to avoid.** Blockchain anchoring where a witnessed transparency log does the same job for less; verifiable inference for language models in 2026; "proof of location" for agent actions; watermarks as evidence; full homomorphic analytics; post-quantum migration as a 2026 blocker (design the slot, do not rewrite).

## 5. Open questions and cheap experiments

**Open questions.**
1. What is the minimal capability grammar (resource, command, geographic predicate, time, delegation depth) that covers municipal workflows, and can it be expressed losslessly in both UCAN and Biscuit so the core is not locked in?
2. How should an input commitment handle mutable upstream datasets, such as a national emission-factor table corrected later: a content hash, a versioned receipt of the dataset, or both, and what does re-verification mean after correction?
3. What verification evidence do actual auditors (national inventory reviewers, courts of audit) accept today, and does a Data Integrity proof plus a log inclusion proof satisfy their rules, or must it be wrapped in a qualified seal?

**Cheap experiments, one quarter each.**
1. **Signed envelope pilot.** Add issuer, proofs, inputs and log reference to one record type, sign under a `did:web` for one pilot city, publish a verifier command-line tool, and ask a developer outside OEF to verify a record without access to OEF's servers.
2. **Agent run log with an external anchor.** Wrap one existing agent workflow in a hash-chained run log, batch daily Merkle roots, post them as signed statements to a Rekor-compatible or self-hosted log; measure overhead and auditor comprehension.
3. **Capability delegation chain.** Implement an official-to-agent-to-sub-agent delegation in both UCAN and Biscuit for the same task, including a jurisdiction predicate; compare expressiveness, token size and verifier complexity.

## Sources

- UCAN specification README. https://github.com/ucan-wg/spec/blob/main/README.md
- Biscuit, Clever Cloud, 12 Apr 2021. https://www.clever-cloud.com/?p=2832
- Macaroons. Google Research, 2014. https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/
- ZCAP revival threads. W3C CCG, Apr 2026. https://lists.w3.org/Archives/Public/public-credentials/2026Apr/0029.html
- KERI specification v1.1. Trust over IP. https://trustoverip.github.io/kswg-keri-specification/
- ISO 17442-3 vLEI. GLEIF. https://www.gleif.org/en/newsroom/press-releases/iso-standardizes-gleif-s-pioneering-digital-organizational-identity-offering-with-publication-of-vlei-technical-standard
- didwebvh. Decentralized Identity Foundation. https://github.com/decentralized-identity/didwebvh
- RFC 9591 FROST, June 2024. https://www.rfc-editor.org/rfc/rfc9591.html
- NIST IR 8547, initial public draft. https://csrc.nist.gov/pubs/ir/8547/ipd
- ML-DSA for JOSE and COSE, RFC 9964. https://datatracker.ietf.org/doc/draft-ietf-cose-dilithium/
- Quantum-Resistant Cryptosuites v1.0, W3C WD, 16 June 2026. https://www.w3.org/TR/2026/WD-vc-di-quantum-resistant-1.0-20260616/
- RFC 9711 Entity Attestation Token, Apr 2025. https://www.rfc-editor.org/info/rfc9711/
- NVIDIA confidential inference. https://developer.nvidia.com/blog/enabling-private-high-performance-production-ai-inference-with-nvidia-confidential-computing/
- Confidential Containers becomes CNCF incubating, 22 July 2026. https://cncf.io/blog/2026/07/22/confidential-containers-becomes-a-cncf-incubating-project/
- Survey of zero-knowledge verifiable machine learning. arXiv 2502.18535. https://arxiv.org/pdf/2502.18535
- Rekor v2 GA. Sigstore, Oct 2025. https://blog.sigstore.dev/rekor-v2-ga/
- Agent Flight Recorder. arXiv 2609.01931, Sept 2026. https://arxiv.org/abs/2609.01931
- 2026 Singapore Consensus on AI Safety Research Priorities. arXiv 2608.14611. https://arxiv.org/pdf/2608.14611
- SynthID. Google AI for Developers. https://ai.google.dev/responsible/docs/safeguards/synthid
- Data Integrity BBS Cryptosuites, CR Draft 10 Sept 2026. https://www.w3.org/TR/vc-di-bbs/
- OpenDP Library 0.15, 29 May 2026. https://opendp.org/2026/05/29/announcing-opendp-library-0-15/
- Galileo OSNMA operational. European Commission, 25 Aug 2025. https://defence-industry-space.ec.europa.eu/galileos-osnma-authentication-service-now-operational-2025-08-25_en
- OpenID Federation 1.0 Final, 17 Feb 2026. https://openid.net/specs/openid-federation-1_0.txt
- draft-ietf-wimse-arch-08, July 2026. https://datatracker.ietf.org/doc/html/draft-ietf-wimse-arch-08
- Identity Management for Agentic AI. OpenID Foundation, Oct 2025. https://openid.net/wp-content/uploads/2025/10/Identity-Management-for-Agentic-AI.pdf
- Trust Spanning Protocol. Trust over IP. https://trustoverip.github.io/tswg-tsp-specification/
- NIST SP 800-88 Rev. 2, 26 Sept 2025. https://csrc.nist.gov/pubs/sp/800/88/r2/final
- MLS RFC 9420 announcement. Cryspen, July 2023. https://cryspen.com/post/mls-rfc-announcement/
