# Self-sovereign identity and data sovereignty for cities and nations

Research note, 1 October 2026. **UNVERIFIED** marks items not confirmed against a primary source; **Inference** marks reasoning beyond the sources.

## 1. What this is, in plain terms

**Self-sovereign identity** means the city, not the platform, holds the credentials that prove who it is and what it has authorised. The platform verifies those credentials; it does not issue or own them. **Data sovereignty** means the city decides, and can enforce, where its data lives, who may read it, for what purpose and for how long, even though a third party stores and processes it. Together, "the city owns its data; the service holds it on its behalf" describes a custodial relationship, like a bank holding money that remains yours.

Five practical questions a city official will ask, and the technical decision each one maps to:

- **Who holds the keys?** If the operator holds the encryption keys, the operator can read everything. If the city holds them, the operator is a blind custodian. Key custody.
- **Who can read?** Which operator staff, which partner organisations, which AI agents, under what recorded consent. Access policy and audit.
- **Who can delete?** Can the city order deletion and get proof? Retention and cryptographic erase.
- **Where does the data live?** Which jurisdiction, cloud and region, which decides which governments can compel access. Residency.
- **What if the operator disappears?** Can the city get a complete usable export, and can someone else run the software? Continuity and portability, and the reason the open-source core matters.

**What exists today.** One shared PostgreSQL database per instance with no per-tenant keys; an HMAC-signed webhook outbox ([docs/WebhooksArchitecture.md](../../WebhooksArchitecture.md)); a GDPR module with consent records, subject-access export and a retention cron merged 28 September 2026 ([app/src/backend/gdpr/](../../../app/src/backend/gdpr/)); request logging in the API handler but no general audit log ([app/src/util/api.ts](../../../app/src/util/api.ts)); residency as a deployment choice of AWS region, not as configuration of the core. The London sessions in September recorded that data localisation for China and the Philippines will require separate instances, and that OEF is the processor under a data-processing agreement with C40 or GCoM's host organisation as controller.

## 2. Standards, frameworks and reference implementations

### Key custody

- Cloud key management services are custodial by default. Customer-managed keys let the tenant control the key policy but the provider's hardware still performs operations; this protects against other tenants and careless operators, not against a provider under legal compulsion. "Hold your own key" through an external key store makes the operator a blind custodian, and AWS itself warns that for most workloads "the additional operational burden and greater risks to availability and performance will exceed the perceived security benefits" ([AWS KMS external key stores](https://docs.aws.amazon.com/kms/latest/developerguide/keystore-external.html)).
- Open-source transparent data encryption for PostgreSQL reached general availability on 1 July 2025 with Percona's `pg_tde`, with PostgreSQL 18 support in November 2025 ([Percona](https://www.globenewswire.com/news-release/2025/07/01/3108380/0/en/Percona-Launches-First-Ever-Open-Source-Transparent-Data-Encryption-for-PostgreSQL.html)). **Inference:** it gives per-table keys, not per-tenant keys inside a shared table; per-tenant keys need application-level envelope encryption or per-tenant schemas.
- NIST SP 800-88 Revision 2 (26 September 2025) formalises cryptographic erase, destroying the key, as a purge technique ([NIST](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf)).

### Consent and delegation

- ISO/IEC TS 27560:2023 defines a consent record structure in four parts: header, processing, parties, events. It is implementable with the W3C Data Privacy Vocabulary ([DPV guide](https://w3c-cg.github.io/dpv/guides/consent-27560)). The older Kantara Consent Receipt v1.1 fed into it.
- User-Managed Access 2.0 (Kantara, 2018) lets a resource owner set policy once so third parties obtain tokens without the owner being online; Keycloak's authorisation services build on it ([Keycloak](https://www.keycloak.org/docs/latest/authorization_services/index.html)).
- RFC 9396, OAuth Rich Authorization Requests (2023), lets a client ask for fine-grained permission as structured data instead of coarse scopes ([RFC 9396](https://www.rfc-editor.org/rfc/rfc9396)). **Inference:** this is the cheapest way to express "this partner app may read inventory year 2024, scopes 1 and 2 only" on an OAuth server.

### Machine-readable data-sharing policy

- W3C ODRL 2.2 (Recommendation, 15 February 2018) expresses permissions, prohibitions and obligations over an asset ([W3C](https://www.w3.org/TR/odrl-model/)). The community group has a draft profile for dataspaces (August 2024) and an AI vocabulary profile (27 May 2026), and held a workshop on 20 and 21 July 2026 toward ODRL 3.0 ([ODRL CG](https://www.w3.org/community/odrl/)). Formal semantics are only now being worked out ([arXiv, Feb 2026](https://arxiv.org/pdf/2602.19883)).
- The Data Privacy Vocabulary 2.3 (W3C community report, 25 February 2026) supplies purposes, legal bases and data categories for use inside ODRL policies ([DPV 2.3](https://w3c-cg.github.io/dpv/2.3/dpv)).

### Dataspaces

A dataspace is a federation where data stays with its holder and is shared under negotiated, machine-readable contracts rather than copied into a central lake.

| Item | Status |
|---|---|
| Dataspace Protocol (DSP) and Decentralized Claims Protocol (DCP) | Governance moved from the International Data Spaces Association to the Eclipse Dataspace Working Group; release 2025-1 "considered to be stable"; DSP 1.0.0 and DCP 1.0.0 submitted to ISO/IEC on 2 December 2025 and catalogued as ISO/IEC DIS 26450 and 26451 ([Eclipse, 2 Dec 2025](https://newsroom.eclipse.org/news/announcements/eclipse-dataspace-working-group-edwg-advances-two-open-protocols-toward-global); [ISO](https://www.iso.org/standard/93502.html)); ballot outcome **UNVERIFIED** |
| Eclipse Dataspace Components | The reference connector, in production in Catena-X (over 1,000 companies as of 22 September 2026) ([Catena-X](https://catena-x.net/)) |
| Gaia-X | A trust framework checked by Digital Clearing Houses; Compliance Document 4.0.0 dated 1 October 2026; nine clearing-house operators ([Gaia-X](https://docs.gaia-x.eu/policy-rules-committee/compliance-document/)). **Inference:** relevant as a label a cloud provider carries, not something OEF implements |
| Data Spaces Support Centre Blueprint | v3.0 launched at the Data Spaces Symposium, Madrid, 10 and 11 February 2026 ([LNDS](https://www.lnds.lu/data-spaces-symposium-2026-blueprint/)) |
| Smart communities | "Smart cities and communities" is one of the fifteen Common European Data Spaces; the DS4SSCC deployment project runs to 30 September 2026 and the Local Digital Twins follow-on started 1 June 2025 ([European Commission](https://digital-strategy.ec.europa.eu/en/policies/data-spaces); [DS4SSCC](https://www.ds4sscc.eu/cfp-four)) |

### Solid

The Solid Protocol v0.11.0 (12 May 2024) is a community specification, not a W3C standard; it was handed to the W3C Linked Web Storage Working Group, whose "Linked Web Storage Protocol 1.0" was still a Working Draft on 21 September 2026 ([W3C LWS](https://www.w3.org/groups/wg/lws/)). The Open Data Institute stewards Solid since October 2024. Flanders' data utility Athumi runs Solid pods for citizens on Inrupt's server ([Inrupt case study](https://www.inrupt.com/case-study/flanders-strengthens-trusted-data-economy)). **Inference:** Solid is a model for citizen-level pods; for institutional data such as a city's inventory its main lesson is the access-grant pattern, not the pod.

### EU legal layer

- The Data Act applies from 12 September 2025: providers must enable switching with two months' notice and a 30-day transition; switching charges are abolished from 12 January 2027; Article 32 obliges providers to take measures against third-country government access that would conflict with EU law ([European Commission](https://digital-strategy.ec.europa.eu/en/policies/data-act)). Non-binding standard contractual clauses for cloud switching were published 2 April 2025.
- The Data Governance Act created "data intermediation services" and "data altruism" organisations; uptake is thin, about 26 intermediaries notified EU-wide by October 2025 ([Arcep, 13 Oct 2025](https://en.arcep.fr/news/press-releases/view/n/data-intermediation-services-131025.html)).
- The Digital Omnibus proposal of 19 November 2025 would fold the Data Governance Act into the Data Act and narrow the definition of personal data ([Jones Day, Dec 2025](https://www.jonesday.com/en/insights/2025/12/eu-digital-omnibus-how-eu-data-cyber-and-ai-rules-will-shift)); autumn 2026 status **UNVERIFIED**.
- Under GDPR the controller "determines the purposes and means"; the test is factual influence, not labels ([EDPB Guidelines 07/2020](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en)). **Inference:** for personal data in the platform the city is controller and OEF or the service operator is processor under an Article 28 contract; for the inventory itself, mostly non-personal, the Data Act and the contract govern.

### Sovereignty-oriented cloud practice

Estonia's data embassy holds state registers on state-owned servers in Luxembourg under a 2017 agreement ([e-Estonia](https://e-estonia.com/solutions/e-governance/data-embassy/)). AWS's European Sovereign Cloud became generally available on 15 January 2026, operated by EU residents under a German parent ([InfoQ](https://www.infoq.com/news/2026/01/aws-european-sovereign-cloud/)); critics note the US CLOUD Act still reaches US-parented providers, and Microsoft France told the French Senate on 10 June 2025 it could not guarantee French data would never be handed to US authorities ([The Register, 25 July 2025](https://www.theregister.com/2025/07/25/microsoft_admits_it_cannot_guarantee/)). The Commission's Cloud and AI Development Act proposal of 3 June 2026 sets a four-level sovereignty ladder for public-sector workloads ([IAPP, 11 June 2026](https://iapp.org/news/a/europe-s-cloud-and-ai-development-act-grand-ambition-fragile-foundations)); it is a proposal only.

### Institutions and principles

The Open Data Institute defines data institutions as "organisations that steward data on behalf of others" ([ODI](https://theodi.org/insights/explainers/what-are-data-institutions-and-why-are-they-important/)). **Inference:** OEF already behaves as a data institution for cities; naming it so clarifies the fiduciary posture. The MyData Declaration v2.0 was approved 26 January 2026 ([MyData](https://mydata.org/participate/declaration/)). The Digital Public Goods Standard's indicators on clear ownership, platform independence and non-personal data extraction, and the UN Universal DPI Safeguards Framework, are the yardsticks funders will apply ([DPGA](https://www.digitalpublicgoods.net/standard); [UNDP](https://www.undp.org/press-releases/un-releases-universal-dpi-safeguards-framework-promote-safe-and-inclusive-digital-public-infrastructure)).

## 3. The principle made technical

| Mechanism | Protects against | Cost | Who does it |
|---|---|---|---|
| Residency as a deployment parameter (region, bucket, key store per programme) | Foreign compulsion by location | Low; multi-region operations medium | Sovereign clouds; Estonia's data embassy |
| Per-organisation customer-managed key with an inspectable key policy | Cross-tenant leakage; unaudited operator access | Low to medium | Standard practice |
| Per-tenant keys the operator cannot read | Operator insider access; provider compulsion (ciphertext only) | High: availability and key-loss risk; the city must run a key manager | Regulated sectors; AWS discourages for most workloads |
| Complete export in open formats on demand (records, documents, schema) | Lock-in; operator failure | Low; already implied by the Data Act | Data Act; DPG indicator 6 |
| Deletion with proof (cryptographic erase plus signed receipt) | Silent retention | Medium; needs per-tenant keys to be meaningful | NIST SP 800-88r2 |
| City-visible access log, including agent reads | Undetected misuse | Low to medium | Regulated software; Athumi's contract model |
| Written data ownership clause, processor terms, exit terms | Role ambiguity; exit disputes | Low; templates exist | EU standard clauses of 2 April 2025 |
| Continuity if the operator folds: open code plus periodic encrypted export to a city-controlled bucket | Insolvency | Low for code; medium for data | Estonia's pattern; Inference |
| Run your own instance of the core | Single-operator dependence | Medium; operations burden shifts | C40's branch in its own account is the live example |
| Portability between instances (versioned export and import with identifiers preserved) | Fork fragmentation | Medium; schema versioning discipline | Data Act switching; Solid pod migration |
| Verifiable record ownership (city-signed snapshots) | Disputed provenance | Medium; key management for cities | W3C VC 2.0; see [05-verifiable-records.md](05-verifiable-records.md) |

## 4. Adopt now, design for, watch

**Adopt now.**
- A written data ownership clause, GDPR Article 28 terms and Data Act-style exit terms in every programme agreement.
- A complete tenant export as an API endpoint and a button.
- A per-organisation customer-managed key with a key policy the organisation can inspect. Cheap on AWS, and the prerequisite for cryptographic erase.
- An append-only per-tenant access log that includes AI-agent and MCP reads, exposed to organisation administrators.
- Residency as a configuration parameter of the core, so the C40 branch and OEF's cloud differ only by configuration. The London sessions already want infrastructure-as-code from day zero for this reason.
- Consent records for document uploads structured along ISO/IEC TS 27560's four sections, stored as data, not prose.

**Design for.**
- Per-tenant envelope encryption of document blobs and sensitive columns with keys mapped to a residency profile; row-level security on the organisation column as defence in depth. **Inference:** this is the minimum that makes "delete with proof" and "the operator cannot read" truthful statements later without the operational cost of external key stores today.
- Data-sharing agreements as ODRL policies evaluated over a small, deterministic profile: actions (read, aggregate, publish, train), constraints (period, sector, purpose, expiry), parties (city, programme operator, agent). A few hundred lines of evaluation over a constrained profile is tractable; generic ODRL evaluation is not.
- A versioned export bundle that another instance of the core can import: records with stable identifiers, documents, consent and policy records, the access log, signed by the instance.

**Watch.**
- Hold-your-own-key stores: only when a national government or a legal requirement asks.
- Dataspace connectors: wait for ISO/IEC 26450 to be published and for a concrete counterpart, such as a smart-communities dataspace node, before investing.
- Solid and the Linked Web Storage protocol.

## 5. What it means for the core's design

A city sharing its inventory with a programme for recognition becomes five linked objects: an ODRL agreement referencing the record; an OAuth grant to the programme's client scoped by that agreement; a consent record; a webhook event to the programme; and access-log entries on each read. Revocation flips the policy and the token. AI access to documents follows the same path: the MCP server requests access per tool call carrying the acting user's grant, filtered through the policy; documents whose consent record excludes "AI processing" or "model training" are invisible to the agent, and every agent read is logged with the prompt identifier. **Inference:** this is also the clearest story to tell city officials worried about AI.

## 6. Sensitive items

- **US jurisdiction over AWS.** Any statement that city data on AWS is beyond US reach is contestable. Say "encrypted, EU-resident, contractually protected", not "sovereign".
- **Controller and processor allocation** with C40 and GCoM must be written down; a partner that defines purposes may become joint controller.
- **Brazil and Chile.** Brazil's LGPD applies to the public sector and its regulator became an independent agency in 2025; Chile's Law 21.719 enters into force 1 December 2026 with a new agency ([IAPP](https://iapp.org/news/a/data-privacy-and-the-brazilian-public-sector); [FPF](https://fpf.org/blog/chiles-new-data-protection-law-context-overview-and-key-takeaways/)). Programmes there will face residency questions.
- **CLEARANCE.** Claims about partners' deployments must be cleared before appearing in a shareable document.
- **Moving targets.** "Sovereign" labels (Gaia-X, the Cloud and AI Development Act's levels) and the Digital Omnibus may change; avoid compliance claims built on unadopted law.

## 7. Three open research questions

1. **A minimal ODRL profile for public-sector data.** What is the smallest set of actions, constraints and party roles that covers record sharing, recognition programmes, AI processing and research reuse, and can be evaluated deterministically? Nothing sector-specific exists.
2. **Proof of deletion and proof of custody for institutional records.** Can per-tenant cryptographic erase plus signed deletion receipts satisfy a municipal records officer and an auditor, and how does it interact with records-retention law such as Minnesota's Government Data Practices Act, which covers government data "irrespective of the data's physical form" ([Minnesota Statutes 13.01](https://www.revisor.mn.gov/statutes/cite/13.01))?
3. **Portability between instances of one core.** When one partner runs a branch and OEF runs the trunk, what export and import contract keeps a city portable across them as schemas diverge, and can the Dataspace Protocol serve as the inter-instance protocol rather than a bespoke API?

## Sources

- AWS KMS External Key Stores. https://docs.aws.amazon.com/kms/latest/developerguide/keystore-external.html
- Percona launches open-source TDE for PostgreSQL, 1 July 2025. https://www.globenewswire.com/news-release/2025/07/01/3108380/0/en/Percona-Launches-First-Ever-Open-Source-Transparent-Data-Encryption-for-PostgreSQL.html
- NIST SP 800-88 Rev. 2, 26 Sept 2025. https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf
- Consent records per ISO/IEC TS 27560 using DPV. W3C DPVCG. https://w3c-cg.github.io/dpv/guides/consent-27560
- Keycloak Authorization Services. https://www.keycloak.org/docs/latest/authorization_services/index.html
- RFC 9396 Rich Authorization Requests. IETF, 2023. https://www.rfc-editor.org/rfc/rfc9396
- ODRL Information Model 2.2. W3C, 15 Feb 2018. https://www.w3.org/TR/odrl-model/
- ODRL Community Group. W3C, 2026. https://www.w3.org/community/odrl/
- Formal semantics for ODRL. arXiv, Feb 2026. https://arxiv.org/pdf/2602.19883
- DPV 2.3. W3C DPVCG, 25 Feb 2026. https://w3c-cg.github.io/dpv/2.3/dpv
- EDWG advances two open protocols toward ISO/IEC. Eclipse Foundation, 2 Dec 2025. https://newsroom.eclipse.org/news/announcements/eclipse-dataspace-working-group-edwg-advances-two-open-protocols-toward-global
- ISO/IEC DIS 26450. https://www.iso.org/standard/93502.html
- Catena-X. https://catena-x.net/
- Gaia-X Compliance Document releases. https://docs.gaia-x.eu/policy-rules-committee/compliance-document/
- Data Spaces Symposium 2026 and Blueprint v3.0. LNDS. https://www.lnds.lu/data-spaces-symposium-2026-blueprint/
- Common European Data Spaces. European Commission. https://digital-strategy.ec.europa.eu/en/policies/data-spaces
- DS4SSCC call for pilots. https://www.ds4sscc.eu/cfp-four
- W3C Linked Web Storage Working Group. https://www.w3.org/groups/wg/lws/
- Flanders strengthens trusted data economy. Inrupt. https://www.inrupt.com/case-study/flanders-strengthens-trusted-data-economy
- Data Act. European Commission. https://digital-strategy.ec.europa.eu/en/policies/data-act
- Data intermediation services. Arcep, 13 Oct 2025. https://en.arcep.fr/news/press-releases/view/n/data-intermediation-services-131025.html
- EU Digital Omnibus. Jones Day, Dec 2025. https://www.jonesday.com/en/insights/2025/12/eu-digital-omnibus-how-eu-data-cyber-and-ai-rules-will-shift
- EDPB Guidelines 07/2020 on controller and processor. https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en
- Data Embassy. e-Estonia. https://e-estonia.com/solutions/e-governance/data-embassy/
- AWS European Sovereign Cloud. InfoQ, Jan 2026. https://www.infoq.com/news/2026/01/aws-european-sovereign-cloud/
- Microsoft cannot guarantee data sovereignty. The Register, 25 July 2025. https://www.theregister.com/2025/07/25/microsoft_admits_it_cannot_guarantee/
- Cloud and AI Development Act. IAPP, 11 June 2026. https://iapp.org/news/a/europe-s-cloud-and-ai-development-act-grand-ambition-fragile-foundations
- What are data institutions? ODI. https://theodi.org/insights/explainers/what-are-data-institutions-and-why-are-they-important/
- MyData Declaration v2.0, 26 Jan 2026. https://mydata.org/participate/declaration/
- DPG Standard. Digital Public Goods Alliance. https://www.digitalpublicgoods.net/standard
- Universal DPI Safeguards Framework. UNDP. https://www.undp.org/press-releases/un-releases-universal-dpi-safeguards-framework-promote-safe-and-inclusive-digital-public-infrastructure
- Data privacy and the Brazilian public sector. IAPP. https://iapp.org/news/a/data-privacy-and-the-brazilian-public-sector
- Chile's new data protection law. FPF. https://fpf.org/blog/chiles-new-data-protection-law-context-overview-and-key-takeaways/
- Minnesota Statutes 13.01. https://www.revisor.mn.gov/statutes/cite/13.01
