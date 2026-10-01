# Trust and verification: verifiable records

Research note, 1 October 2026. **UNVERIFIED** marks items not confirmed against a primary source; **Inference** marks reasoning beyond the sources. The GCoM and CDP documents were read in full; W3C, IETF and EU pages were fetched directly.

## 1. Verifiable versus verified, in plain terms

A **verifiable record** is one where anyone, including people who do not trust the platform, can check three things with mathematics rather than a phone call: who issued it (a digital signature made with a key that belongs to a named organisation), that not one byte has changed since issue (a content hash), and when it existed (a timestamp or an entry in a public append-only log). It says nothing about whether the numbers inside are right.

A **verified record** is one whose content somebody checked: completeness against a reporting framework, internal consistency, or, at the strongest level, an accredited auditor's opinion that the inventory is a fair account, which is what "verification" means in ISO 14064-3.

Both matter. Today a city's inventory is re-keyed or re-uploaded into several systems, and each recipient has to trust the intermediary. A verifiable record lets the same file travel between systems and still be checkable at the destination, and lets a badge point at exactly the version it was awarded for. A verified record is what the badge actually means. Keeping the two separate is the single most important design decision: the platform makes records verifiable by default, and records, as its own signed statement, exactly what kind of checking a programme did.

**What exists today.** Publishing is a boolean on the inventory with a timestamp ([app/src/models/Inventory.ts](../../../app/src/models/Inventory.ts)); version history is a row-level diff log keyed by inventory ([app/src/backend/VersionHistoryService.ts](../../../app/src/backend/VersionHistoryService.ts)); exports are PDF and CSV; webhooks are HMAC-signed. There is no content hash, no signature over a record, no status list and no verifier endpoint. The GCoM Digital Service design already calls for "every submitted version kept" and "provenance on every value".

## 2. Standards and reference implementations

### Signatures over structured data

- JSON Web Signature, RFC 7515 (2015); JSON Canonicalization Scheme, RFC 8785 (2020), so that hashes over "the same" JSON are repeatable; COSE, RFC 9052 (2022), the binary equivalent used by SCITT and the EU wallet.
- The W3C published the Verifiable Credentials 2.0 family as Recommendations on 15 May 2025: the data model, Data Integrity proofs, the EdDSA and ECDSA cryptosuites, securing credentials with JOSE and COSE, Controlled Identifiers and the Bitstring Status List ([W3C](https://www.w3.org/news/2025/the-verifiable-credentials-2-0-family-of-specifications-is-now-a-w3c-recommendation/)). The EdDSA cryptosuite has a JSON-canonicalisation variant, which avoids RDF canonicalisation.
- Decentralised identifiers: DID 1.0 is a Recommendation (2022); Controlled Identifiers 1.0 lets a plain HTTPS address publish keys, which is what `did:web` uses.

### Organisational seals under eIDAS

An electronic seal is the organisation-level counterpart of a signature. Under Article 35 a qualified seal "shall enjoy the presumption of integrity of the data and of correctness of the origin of that data" ([Article 35, retained-law mirror](https://www.legislation.gov.uk/eur/2014/910/article/35)). Nothing excludes public legal persons; the City of Vejle holds a Legal Entity Identifier, for example. **Inference:** an EU municipality can obtain a qualified seal certificate from any provider on the trusted lists; the obstacle is procurement and key custody, not law. Outside the EU no equivalent presumption exists. Long-term validation formats (the AdES family up to the archival level; JAdES for JSON, ETSI TS 119 182-1 v1.2.1, July 2024) keep a signature checkable after certificates expire.

### Timestamps and transparency logs

- RFC 3161 time-stamp protocol (2001), mature; qualified EU providers exist.
- Certificate Transparency 2.0, RFC 9162 (2021), is the reference design for Merkle-tree append-only logs. Sigstore's Rekor v2 reached general availability on 10 October 2025 on a tile-based log (Tessera) that can be self-hosted on cloud storage or a filesystem ([Sigstore](https://blog.sigstore.dev/rekor-v2-ga/)).
- **SCITT, RFC 9943** (June 2026, Proposed Standard): signed statements, a transparency service with a registration policy, receipts that carry a Merkle inclusion proof, and transparent statements that verify offline ([RFC 9943](https://datatracker.ietf.org/doc/rfc9943/)). The REST API is in the RFC Editor queue. **This is the closest existing blueprint for a "verification receipt".**

### Content addressing, hash chains, blockchain anchoring

Content identifiers in the IPFS style are self-describing hashes usable without running IPFS. OpenTimestamps batches hashes into Bitcoin and proves existence before a time, not who made the data. The European Blockchain Services Infrastructure runs 20 production nodes and a trusted-issuers registry, with a "full service offering" promised for later in 2026 ([ebsi.eu](https://ebsi.eu/)). The honest state of blockchain in public records: the OECD concluded that public services "with actual users are very rare" ([OECD OPSI, 2020](https://oecd-opsi.org/blog/uncertain-promise-blockchain/)); the carbon-market Climate Action Data Trust launched Data Model 2.0 on 23 October 2025 and "uses blockchain technology to create a decentralised record" ([CAD Trust](https://climateactiondata.org/cad-trust-launches-data-model-version-2-0/)). **Inference:** for city records, a signed hash chain plus a tile-based transparency log gives the same tamper evidence with no token, no consensus and no governance novelty; a public chain is at most an optional anchor.

### Status, revocation, selective disclosure

Bitstring Status List 1.0 (one bit per credential in a published list, so a verifier fetches the list, not the issuer). SD-JWT, RFC 9901 (November 2025), hides individual claims while keeping the issuer signature valid. BBS signatures, which allow unlinkable selective disclosure, are a Candidate Recommendation draft of 10 September 2026 with features "at risk" ([W3C](https://www.w3.org/TR/vc-di-bbs/)); not production-ready.

### Credentials for badges and recognition

- **Open Badges 3.0** (1EdTech): a badge is a Verifiable Credential aligned with the 2.0 data model, signed as a JWT or with a Data Integrity proof; the recipient may be identified by a DID, a URL or an email. Document version 1.4.5, 29 June 2026 ([1EdTech](https://www.imsglobal.org/spec/ob/v3p0)); conformance certification exists; Credly accepts any 3.0 badge regardless of issuer ([Credly, 16 Oct 2024](https://learn.credly.com/blog/credly-supports-open-badge-3.0)). The first Final Release date is **UNVERIFIED** to the day.
- Government entities are eligible for a Legal Entity Identifier, and the verifiable LEI was standardised as ISO 17442-3 in October 2024 ([GLEIF](https://gleif.org/en/newsroom/press-releases/iso-standardizes-gleif-s-pioneering-digital-organizational-identity-offering-with-publication-of-vlei-technical-standard)).

### Provenance and schemas

W3C PROV-O for "derived from these datasets by this tool run". JSON Schema 2020-12 is the current version and the project now runs independently of the IETF. The W3C's VC JSON Schema (Candidate Recommendation draft, February 2025) lets a schema itself be a signed credential. LinkML compiles one YAML schema to JSON Schema, SHACL, OWL, Pydantic and SQL ([linkml.io](https://linkml.io/)), which is the right tool to define the record envelope once and generate validators for TypeScript and Python.

### Digital tagging in sustainability reporting

The EFRAG XBRL taxonomy for European sustainability reporting exists (30 August 2024) but mandatory tagging is suspended pending the revised standards, with a new consultation open until 11 November 2026 ([XBRL International, 4 May 2026](https://www.xbrl.org/news/efrags-2026-work-programme-puts-xbrl-taxonomy-front-and-centre/)). Lesson: tagging makes content machine-readable; it is not a signature mechanism. The GHG Protocol's consolidation with ISO (consultation Q2 2027, final Q4 2028) says nothing about structured reporting ([GHG Protocol, 29 July 2026](https://ghgprotocol.org/blog/ghg-protocol-announces-key-standard-development-updates-faq-resource)). The WBCSD PACT specification 3.0.3 (18 November 2025) exchanges product footprints over an authenticated API with a self-declared assurance object and no end-to-end signature ([PACT](https://wbcsd.github.io/tr/data-exchange-protocol/latest/)). **Inference:** in industry practice "verifiable" today means "authenticated API plus self-declared assurance", not cryptographic proof. The UNFCCC's transparency framework submission module opened on 17 March 2026 and holds submissions "under validation" pending secretariat checks.

### What GCoM and CDP-ICLEI Track actually require

The Common Reporting Framework is version 7.0 of 14 September 2023; no 2025 or 2026 revision is listed ([GCoM](https://www.globalcovenantofmayors.org/our-initiatives/data4cities/common-global-reporting-framework/)). Badges are awarded for inventory, target and plan (mitigation), risk assessment, goal and plan (adaptation), and assessment, target and plan (energy access). The 2025 guidance says "CDP will validate the city's report against the requirements of the CRF"; feedback comes from CDP and ICLEI; badges are announced each March; reporting must be public to be eligible ([GCoM 2025 Reporting Guidance](https://assets.ctfassets.net/v7uy4j80khf8/3U40eO6y3Kd7tc7B1somWq/6f740949b17425a225b3f6c22ff65ca5/GCoM_Reporting_Guidance_2025_ENG.pdf)). The CDP-ICLEI Track questionnaire asks whether the main inventory "has been audited/verified" with options for external, internal, both or no, plus an evidence attachment, and marks the column optional for GCoM at both reporting levels ([2025 questionnaire, pp. 79 to 80](https://assets.ctfassets.net/v7uy4j80khf8/g2pV5HJDE4LFwsSOjYvU2/8bb279ccccea3528671cd2e2bb41550a/2025_CDP-ICLEI_Track_Questionnaire_and_Guidance.pdf)). **Inference:** GCoM compliance today is a completeness and consistency check by CDP and ICLEI staff; third-party verification is self-declared and optional; nothing is cryptographically bound to a specific inventory version. **CLEARANCE** before characterising a partner's process in writing.

## 3. What it means for the record layer

1. **Immutable versions with content hashes** over the canonical body, exposed as self-describing identifiers; a `previousVersion` pointer forms a per-record hash chain. Database row identifiers stay internal; hashes are the public handle.
2. **Canonicalisation** with the JSON scheme; avoid RDF canonicalisation unless linked-data semantics are required.
3. **Issuer identity.** The platform signs with a `did:web` under its domain and an Ed25519 key. A city starts with a platform-hosted identifier and an optional LEI; it may later bring a city-domain identifier or an eIDAS seal. Every signature records "signed by platform on behalf of city" unless the city holds its own key, and says so in the proof.
4. **Signature and timestamp on publish**, as a Data Integrity or JOSE envelope over the version hash plus metadata (schema, issuer, publish state, previous hash), with an RFC 3161 timestamp or, better, an entry in a tile-based log and its receipt.
5. **Status.** One Bitstring Status List per issuer for records (revoked, superseded) and one for badges.
6. **Verification receipts** modelled on SCITT: when a programme checks a record it issues its own signed statement over the record hash, stating the framework version, level, checks run, result and checker identity. Receipts are stored beside, never inside, the record. This keeps "the city said" separate from "the programme checked", and it is the generic rule the core needs: the core produces issuer proofs and stores verifier receipts; it never asserts that content is correct.
7. **Badges as credentials** in the Open Badges 3.0 shape, issued from the programme's identifier to the city's, with record hashes and receipt identifiers as evidence, a status entry and a human-readable scope-of-check field.
8. **Verifier API.** A bundle endpoint returning body, proofs, receipts, the status list address and a snapshot of the issuer's key document, and a verify endpoint; use an off-the-shelf credential verifier library so third parties can reproduce the check without the API.
9. **Portability.** The bundle verifies offline on another instance; schemas are referenced by versioned addresses and hashes.
10. **Key rotation and long-term validity.** Retired keys stay in the key document with validity windows; the log receipt proves the signature predates rotation; an archival re-timestamp routine mirrors the AdES archival level. The cryptography note adds an algorithm identifier and room for multiple proofs per record.

## 4. Adopt now, design for, watch

**Adopt now.** Content hashes and version chains; canonicalisation; a JSON Schema 2020-12 registry with versioned addresses; a platform `did:web` and Ed25519 key that reuses the webhook-signing key material; signed export envelopes as a detached JSON sidecar for PDF and CSV; status lists; badge JSON in the Open Badges 3.0 shape; PROV-style provenance fields; RFC 3161 timestamps. **Inference on cost:** four to six engineer-weeks for hashing, signing, status and the verify endpoint, plus two to three for badge issuance and conformance testing.

**Design for.** City-held keys and wallet presentation; a self-hosted transparency log once a second instance or an external verifier wants independent inclusion proofs (Rekor v2 makes this cheap when the time comes); eIDAS qualified seals where the legal presumption matters, such as EU Covenant submissions.

**Watch.** EBSI's trusted-issuer registration (EU-only, onboarding through the EDIC); BBS selective disclosure; SD-JWT unless a real need to hide claims appears.

## 5. Sensitive items

- **Wording.** GCoM and CDP "validate" completeness; "verification" in climate accounting means ISO 14064-3 assurance. A badge credential must state its scope of check or it reads as an audit opinion, with liability for the issuer.
- A signed badge is a public statement by a programme about a city; disputes and revocations become visible events and need a documented process.
- Who may sign for a city is a question of municipal law and changes with administrations; the platform must not imply authority it has not been delegated.
- GCoM reporting runs through CDP-ICLEI Track and MyCovenant today; a new service needs explicit designation to issue badges in GCoM's name.
- EU-centric tooling (seals, EBSI, wallets) does not transfer to most GCoM cities; blockchain anchoring is politically contested in some jurisdictions and should remain optional.
- Signed records must not contain personal data; status lists and logs are public and permanent.

## 6. Three open research questions

1. Can the Common Reporting Framework's requirements be expressed as executable rules (JSON Schema plus SHACL or a rule language) such that a signed, reproducible "compliance receipt" is accepted by CDP-ICLEI Track, national systems and funders without re-checking, and what residual human judgement remains?
2. What custody model fits thousands of small municipalities: platform-signed on behalf of the city with an explicit delegation credential, a city-domain identifier, an LEI or vLEI, or eIDAS seals, and how is authority revoked after an election?
3. How are 2026 signatures kept verifiable in 2040 across key rotation, algorithm deprecation and post-quantum migration, and is a neutral multi-party transparency log (OEF, GCoM, ICLEI) more sustainable than periodic timestamp anchoring?

## Sources

- The Verifiable Credentials 2.0 family is now a W3C Recommendation, 15 May 2025. https://www.w3.org/news/2025/the-verifiable-credentials-2-0-family-of-specifications-is-now-a-w3c-recommendation/
- Data Integrity BBS Cryptosuites, Candidate Recommendation Draft, 10 Sept 2026. https://www.w3.org/TR/vc-di-bbs/
- RFC 7515, 8785, 9052, 3161, 9162, 9901, 9943. https://www.rfc-editor.org/
- SCITT Architecture, RFC 9943, June 2026. https://datatracker.ietf.org/doc/rfc9943/
- Rekor v2 GA. Sigstore, 10 Oct 2025. https://blog.sigstore.dev/rekor-v2-ga/
- eIDAS Article 35, retained-law mirror. https://www.legislation.gov.uk/eur/2014/910/article/35
- eSignature FAQ. European Commission. https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/880312429/eSignature+FAQ
- ETSI TS 119 182-1 v1.2.1 JAdES, July 2024. https://etsi.org/deliver/etsi_TS/119100_119199/11918201/01.02.01_60/ts_11918201v010201p.pdf
- EBSI. https://ebsi.eu/
- The Uncertain Promise of Blockchain for Government. OECD OPSI, 25 Nov 2020. https://oecd-opsi.org/blog/uncertain-promise-blockchain/
- CAD Trust launches Data Model 2.0, 23 Oct 2025. https://climateactiondata.org/cad-trust-launches-data-model-version-2-0/
- Open Badges Specification v3.0. 1EdTech, 29 June 2026. https://www.imsglobal.org/spec/ob/v3p0
- Credly supports Open Badge 3.0, 16 Oct 2024. https://learn.credly.com/blog/credly-supports-open-badge-3.0
- ISO 17442-3 vLEI. GLEIF, 14 Oct 2024. https://gleif.org/en/newsroom/press-releases/iso-standardizes-gleif-s-pioneering-digital-organizational-identity-offering-with-publication-of-vlei-technical-standard
- PROV-O. W3C. https://www.w3.org/TR/prov-o/
- VC JSON Schema. W3C. https://www.w3.org/TR/vc-json-schema/
- LinkML. https://linkml.io/
- EFRAG's 2026 work programme. XBRL International, 4 May 2026. https://www.xbrl.org/news/efrags-2026-work-programme-puts-xbrl-taxonomy-front-and-centre/
- GHG Protocol standard development FAQ, 29 July 2026. https://ghgprotocol.org/blog/ghg-protocol-announces-key-standard-development-updates-faq-resource
- PACT Technical Specifications 3.0.3, 18 Nov 2025. https://wbcsd.github.io/tr/data-exchange-protocol/latest/
- ETF Submission Module Guide v2. UNFCCC, 4 May 2026. https://unfccc.int/sites/default/files/resource/SubmissionModuleGuide_V2.pdf
- Common Reporting Framework. GCoM. https://www.globalcovenantofmayors.org/our-initiatives/data4cities/common-global-reporting-framework/
- 2025 Guidance for reporting to GCoM through CDP-ICLEI Track. https://assets.ctfassets.net/v7uy4j80khf8/3U40eO6y3Kd7tc7B1somWq/6f740949b17425a225b3f6c22ff65ca5/GCoM_Reporting_Guidance_2025_ENG.pdf
- 2025 CDP-ICLEI Track Questionnaire and Guidance. https://assets.ctfassets.net/v7uy4j80khf8/g2pV5HJDE4LFwsSOjYvU2/8bb279ccccea3528671cd2e2bb41550a/2025_CDP-ICLEI_Track_Questionnaire_and_Guidance.pdf
