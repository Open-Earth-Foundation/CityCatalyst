# Government and institutional digital identity

Research note, 1 October 2026. Sources checked against primary pages where reachable; **UNVERIFIED** marks items that were not; **Inference** marks reasoning beyond the sources. EUR-Lex blocked automated retrieval, so quotations of Regulation (EU) 2024/1183 come from a secondary reproduction of the final text and should be re-checked before being quoted outside OEF.

## 1. What this is, in plain terms

For a platform used by city officials, "digital identity" is three separate questions that are often confused.

1. **Who is this person?** Authentication and assurance. Email and password gives weak assurance. A national electronic identity or a government wallet gives strong assurance.
2. **Which organisation are they acting for, and in what capacity?** A climate officer submits an inventory for the City of Bogotá, not as a private individual. The platform needs a trustworthy way to know the city exists, that this person is authorised by it, and in what role. This is organisational identity and mandate.
3. **What may they do?** Authorisation, including software acting on their behalf: partner tools and AI agents.

Most government-facing platforms answer the first question themselves with their own passwords, the second informally with an administrator inviting someone by email, and the third with internal role tables. The policy shift now under way, led by the European Union, is to let the person and the organisation bring verified identity and mandates from outside, from national wallets, enterprise directories and organisational credentials, so that the platform verifies rather than vouches. For OEF this matters because climate records increasingly carry legal and financial weight, and "who, for whom, with what authority" becomes an audit question, and in the EU from December 2026 partly a legal one for public bodies.

**What exists today.** CityCatalyst answers all three questions itself. Login is a credentials provider in NextAuth with no single sign-on, OpenID Connect or SAML ([app/src/lib/auth.ts](../../../app/src/lib/auth.ts)), with authenticator-app multi-factor authentication added in September 2026 ([app/src/lib/2fa.ts](../../../app/src/lib/2fa.ts)). Organisation membership is an invite table per level with no mandate record. Authorisation is a permission service with five scoped roles ([app/src/backend/permissions/](../../../app/src/backend/permissions/)).

## 2. Standards and reference implementations

| Standard or system | What it does | Status and date | Who uses it |
|---|---|---|---|
| eIDAS 2.0, Regulation (EU) 2024/1183 | Creates the European Digital Identity (EUDI) Wallet; each Member State must offer one within 24 months of the implementing acts, so by 24 December 2026 | Implementing acts published 4 December 2024 and 7 May 2025; further acts 8 April and 15 July 2026 ([EC Digital Building Blocks](https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/915931811/The+European+Digital+Identity+Regulation); [Law and Technology, 8 Sept 2026](https://lawandtechnology.eu/en/european-digital-identity-wallet-december-2026-deadline-en/)) | All EU Member States; readiness uneven: the Netherlands "unlikely to meet the deadline", Germany phased ([Biometric Update, 26 Dec 2025](https://www.biometricupdate.com/202512/will-the-eudi-wallet-be-ready-in-2026-experts-say-probably-not)) |
| EUDI Architecture and Reference Framework | The technical rulebook for wallets, issuers and relying parties | v3.0.0, 21 July 2026 ([eudi.dev](https://eudi.dev/latest/)) | Wallet builders, Large Scale Pilots (concluded 2025, second wave from September 2025) |
| European Business Wallet proposal, COM(2025) 838 | A separate wallet for "economic operators and public sector bodies"; would remove legal persons from the citizen wallet article | Proposed 19 November 2025; Council position 9 June 2026; trilogue pending ([EDPS Opinion 5/2026, 20 Jan 2026](https://www.edps.europa.eu/system/files/2026-01/26-01-20_opinion_establishment_of_european_business_wallets_en.pdf); [KPMG, 17 June 2026](https://kpmg.com/xx/en/our-insights/gms-flash-alert/2026/flash-alert-2026-151.html)) | Not yet; Inference: organisational wallets for municipalities are 2028 or later |
| OpenID for Verifiable Credentials | How a wallet receives a credential (OpenID4VCI) and presents it to a verifier (OpenID4VP) | OpenID4VCI 1.0 Final 16 Sept 2025; OpenID4VP 1.0 Final 9 July 2025; High Assurance Interoperability Profile Final December 2025 ([OIDF](https://openid.net/openid4vc-high-assurance-interoperability-profile-haip-1-0-final-specification-approved/)) | EUDI, MOSIP's Inji, Keycloak 26.8 (issuance in preview, verification experimental, 1 Oct 2026) ([Keycloak](https://www.keycloak.org/2026/10/keycloak-2680-released)) |
| W3C Verifiable Credentials 2.0 family | The data model for signed, portable claims; Data Integrity proofs; status lists; controlled identifiers | Recommendations 15 May 2025 ([W3C](https://www.w3.org/groups/wg/vc/publications/)); DID 1.1 still a Candidate Recommendation (March 2026) | MOSIP, many national pilots; the EU prefers SD-JWT and mdoc for the personal identity credential |
| IETF SD-JWT, RFC 9901 | Selective disclosure for signed JSON tokens | Proposed Standard, November 2025 ([datatracker](https://datatracker.ietf.org/doc/rfc9901/)); SD-JWT VC still a draft (August 2026) | EUDI, HAIP |
| ISO/IEC 18013-5 and 18013-7 | The mobile driving licence credential format and its online presentation | 18013-7:2025 (May 2025); second edition of 18013-5 in ballot (**UNVERIFIED**) | US state licences, Apple and Google wallets, EU personal identity in mdoc form |
| GLEIF verifiable LEI (vLEI) | A cryptographic credential chain for organisations and the roles people hold in them, built on the Legal Entity Identifier (LEI, ISO 17442) | ISO 17442-3 (2024); governance framework v4.0, 25 March 2026; eight qualified issuers; 3.02 million active LEIs in Q1 2026 ([GLEIF](https://www.gleif.org/en/organizational-identity/introducing-the-verifiable-lei-vlei)) | Finance-led; municipalities are eligible for LEIs since the 2019 ROC decision, uptake "a handful" ([DPC Data, 25 July 2024](https://www.dpcdata.com/resources/can-an-lei-system-work-in-the-municipal-market/)) |
| OpenID Federation 1.0 | Hierarchical, signed trust chains so many identity providers and apps can trust each other without pairwise setup; trust marks | Final 17 February 2026 ([OIDF](https://openid.net/openid-federation-1-0-final-specification-approved/)) | Italy SPID and CIE, Sweden, Australian Open Banking, an eduGAIN pilot ([Jones, De Marco, Hedberg, 21 Apr 2026](https://self-issued.info/presentations/OpenID_Federation_TDI_2026.pdf)) |
| OpenID Connect for Identity Assurance 1.0 | Carries the assurance level and evidence behind an identity claim | Final 1 July 2026 ([OIDF](https://openid.net/specs/openid-connect-4-identity-assurance-1_0.html)) | Banks, eID brokers |
| SCIM 2.0 | Provisioning and deprovisioning users and groups between systems | RFC 7643 and 7644 (2015); cursor pagination RFC 9865 (Oct 2025); event notifications RFC 9967 (May 2026) ([IETF SCIM](https://datatracker.ietf.org/group/scim/documents/)) | Every enterprise directory |
| WebAuthn Level 3, passkeys | Phishing-resistant login bound to a device | W3C Recommendation 25 August 2026 ([W3C](https://www.w3.org/TR/webauthn-3/)); 68 percent of organisations deploying passkeys for employees ([FIDO, 7 May 2026](https://fidoalliance.org/fido-alliance-reports-accelerating-global-passkey-adoption-on-world-passkey-day-2026/)) | Widespread |
| NIST SP 800-63-4 | US digital identity guidelines: identity, authentication and federation assurance levels; adds the wallet-as-identity-provider model | Final July 2025 ([NIST](https://pages.nist.gov/800-63-4/)) | US federal, widely referenced |
| GOV.UK One Login and Wallet | UK citizen sign-in and wallet | Wallet holds one credential as of 1 Oct 2026, driving licence "in future" ([gov.uk/wallet](https://www.gov.uk/wallet)); council work covered residents, not staff | UK public services |
| MOSIP | Open-source national identity platform with eSignet (OpenID Connect) and Inji (credentials) | 14 national rollouts across 31 country engagements ([mosip.io](https://www.mosip.io/)) | Philippines, Morocco, Ethiopia and others. **CLEARANCE**: replaces the "11 countries, 100 million+" figure on the v2 deck |
| Login.gov | US shared sign-in for the public | Authentication-only and identity-verified tiers; continuing GAO scrutiny ([GAO-26-109261](https://files.gao.gov/reports/GAO-26-109261/index.html)) | US federal agencies; not for staff |

**What city staff actually use.** No survey exists (**UNVERIFIED** as a population figure), but Microsoft Entra ID dominates through Microsoft 365, "particularly government" ([Security Boulevard, Apr 2026](https://securityboulevard.com/2026/04/15-identity-providers-your-b2b-saas-must-support-to-close-enterprise-deals/)). Europe also has organisational eIDs with registered mandates: the Netherlands' eHerkenning, Denmark's MitID Erhverv for "businesses, associations, and public authorities", Germany's Mein Unternehmenskonto. The existing GCoM reporting channel, CDP-ICLEI Track, uses per-user email and password accounts on an Okta tenant with one "Main User" per city ([CDP Cities User Guide v6.0, March 2023](https://cdn.cdp.net/cdp-production/cms/guidance_docs/pdfs/000/004/473/original/Cities_User_Guide.pdf)). **CLEARANCE** before citing a partner's setup.

## 3. Single sign-on across partner tools

How could a programme operator and partner tools share a city official's identity? Four options.

| Option | How it works | Trade-off | Examples |
|---|---|---|---|
| A. The platform is the identity provider | Partners redirect to the core for login and receive a token with person, organisation and role | Fast for partners with nothing; but OEF becomes the identity authority and liability holder for thousands of officials, and centralises what should be shared | GOV.UK One Login, Login.gov, CDP's Okta tenant |
| B. Bring your own identity provider per organisation | The core is a relying party; the city's directory is the source of truth; SCIM provisions staff | Matches how cities run IT; offboarding becomes automatic; long tail of small cities with no directory needs a fallback; no cross-partner SSO by itself | Standard practice; eHerkenning and MitID Erhverv are national forms of it |
| C. Federation via OpenID Federation trust chains | A programme operator runs a trust anchor; partner tools and city identity providers publish signed metadata; any member accepts any other member | The only option that scales across many operators; now a Final spec; needs a trust-anchor operator with governance | Italy, Sweden, eduGAIN pilot |
| D. Credential-based login via wallets | The user presents a signed credential from a national wallet or an organisational role credential | Highest assurance and privacy; legally required acceptance for EU public bodies from late 2026; wallets uneven, organisational credentials not at municipal scale, per-country relying-party registration | EUDI pilots, vLEI authenticator pilots |

**Inference.** The workable path is B now, C as the shared layer, D as an additional login method, and A only as a fallback for organisations that have nothing. The federation layer is what lets CDP-ICLEI Track, an ICLEI tool and a CityCatalyst-based service accept the same city login without bilateral setup. The anchor should be run by a network, not by OEF.

## 4. Adopt now, design for, watch

**Adopt now.**
- A standards-conformant OpenID Connect provider that passes the OpenID Foundation conformance suite. The benchmark note recommends a mature server (Keycloak or Ory) rather than hardening the in-house one; either way, conformance is the prerequisite for every option above.
- Enterprise single sign-on per organisation (OpenID Connect and SAML inbound) with domain-verified tenant mapping.
- SCIM 2.0 inbound provisioning with deprovisioning. Offboarding is the largest real-world access risk.
- Passkeys as the default second factor.
- An organisation identifier registry: LEI where one exists, national registry identifiers, the network's member identifier, each with the source that asserted it. The GLEIF lookup is free.
- An assurance level recorded on every session and on every person-to-organisation link, even if all are "low" at first. This makes wallet logins additive later instead of a redesign.
- Alignment of the MCP server with the 2026-07-28 authorisation revision (protected resource metadata, audience binding, issuer validation, client metadata documents). Today it declares protocol version 2024-11-05 ([app/src/app/api/v1/.well-known/mcp-server/route.ts](../../../app/src/app/api/v1/.well-known/mcp-server/route.ts)).

**Design for.**
- Wallet-based login: leave a credential-presentation verifier slot; build when two partner countries have a working wallet and the network has decided which attributes it needs.
- Credential issuance of "programme membership" or "verified record" credentials: standards are Final, but value depends on verifiers existing.
- An OpenID Federation trust anchor for the network: publish the core's own Entity Configuration now (a day's work), decide the anchor later.

**Watch.**
- vLEI and the European Business Wallet for organisational identity; obtaining LEIs for a few pilot cities is cheap meanwhile.
- The second edition of ISO/IEC 18013-5.

## 5. What it means for the core's design

- **Principals.** One abstract principal type with four subtypes: person, organisation, service (a partner tool, a confidential client) and agent (an AI agent acting under a person or service, with its own client identity and a parent principal). An agent never inherits a person's full rights implicitly; the IETF actor-profile draft and the OpenID Foundation's agent identity work both converge on tokens that carry both the acting agent and the delegating human ([draft-mcguinness-oauth-actor-profile-00, Apr 2026](https://datatracker.ietf.org/doc/html/draft-mcguinness-oauth-actor-profile-00)).
- **Identifiers.** A core-internal identifier per principal plus a table of external identifiers, each with scheme (OpenID subject, SAML name identifier, DID, LEI, national registry, email), issuer, value, assurance, verified date and source. Account linking is a row, not a merge.
- **Mandates.** "Acts for organisation X in role Y" as an explicit record with grantor, scope (a programme or a place), validity and evidence. Tokens issued to partner tools and agents carry the mandate identifier, so revocation is immediate and auditable. This mirrors eHerkenning's per-service mandates.
- **Assurance.** Stored on the session (how strong the login was) and on the link (how the organisation vouched: invite, directory, mandate credential), as a small enumeration mapped to NIST and eIDAS levels. Policies then say "publishing requires a directory-verified link and a multi-factor session".
- **Consent and audit.** A consent record per data release to a relying party, and an append-only audit log keyed by principal, mandate, session and client, exportable as security event tokens so partner tools learn of deprovisioning.
- **Interfaces.** Outbound: an OpenID Connect provider with discovery, assurance claims and mandate claims; a SCIM server. Inbound: OpenID Connect and SAML relying party per organisation, SCIM client, later a credential verifier. The layer speaks only principals, organisations, mandates, scopes and consent, never cities or inventories.

## 6. Sensitive items

- **Mandatory acceptance.** Article 5f(1) of Regulation 2024/1183 requires that where a Member State requires electronic identification to access an online service of a public sector body, EUDI wallets must also be accepted; Article 5f(2) extends this to listed private sectors by late December 2027. **Inference:** a city using the platform for an official online service could be that public sector body, which would push the acceptance obligation onto the platform. A legal reading per deployment is needed; the obligation should not be assumed away.
- **Relying-party registration.** A relying party must register in the Member State where it is established and declare the data it requests. A non-EU non-profit accepting wallets in several Member States faces multiple registrations.
- **Personal data.** Identity data about named officials is personal data; bringing your own identity provider minimises what OEF holds.
- **Centralisation.** A non-profit as identity authority for city governments worldwide is politically awkward. Federation framing, with OEF as one member, is safer.
- **Legal-person wallets are in flux.** Do not design on the assumption that cities will receive EUDI wallets as organisations.

## 7. Three open research questions

1. **Minimal attribute set for a reporting mandate.** Which claims does a programme operator actually need (person, employer, role, authority to submit) to make a submitted record legally attributable, and which of those can be sourced today from a directory, a national wallet or an organisational credential in the ten largest partner countries? The answer decides whether wallet login is worth building before 2028.
2. **Federation governance.** If a network ran an OpenID Federation trust anchor, which entity types, trust marks and liability terms would partner tools and national platforms accept, and can one anchor coexist with national federations such as Italy's? A tabletop with two partner tools would answer most of it.
3. **Agent delegation with audit-grade provenance.** How should an agent that drafts or edits records carry the human mandate through MCP so that the record's provenance satisfies a later auditor? The IETF drafts are pre-adoption; OEF's domain is a credible testbed.

## Sources

- Regulation (EU) 2024/1183, Articles 5a to 5f, reproduction of final text. https://www.european-digital-identity-regulation.com/Article_5a_(Regulation_EU_2024_1183).html
- The European Digital Identity Regulation, implementing acts. European Commission. https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/915931811/The+European+Digital+Identity+Regulation
- EUDI Wallet towards the December 2026 deadline. Law and Technology, 8 Sept 2026. https://lawandtechnology.eu/en/european-digital-identity-wallet-december-2026-deadline-en/
- EUDI Architecture and Reference Framework v3.0.0, 21 July 2026. https://eudi.dev/latest/
- Will the EUDI Wallet be ready in 2026? Biometric Update, 26 Dec 2025. https://www.biometricupdate.com/202512/will-the-eudi-wallet-be-ready-in-2026-experts-say-probably-not
- EDPS Opinion 5/2026 on European Business Wallets, 20 Jan 2026. https://www.edps.europa.eu/system/files/2026-01/26-01-20_opinion_establishment_of_european_business_wallets_en.pdf
- European Business Wallet: Council position. KPMG, 17 June 2026. https://kpmg.com/xx/en/our-insights/gms-flash-alert/2026/flash-alert-2026-151.html
- OpenID4VCI 1.0 Final, 16 Sept 2025. https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
- OpenID4VP 1.0 Final, 9 July 2025. https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
- HAIP 1.0 Final approved. OpenID Foundation, 29 Dec 2025. https://openid.net/openid4vc-high-assurance-interoperability-profile-haip-1-0-final-specification-approved/
- Keycloak 26.8.0 released, 1 Oct 2026. https://www.keycloak.org/2026/10/keycloak-2680-released
- W3C Verifiable Credentials Working Group publications. https://www.w3.org/groups/wg/vc/publications/
- RFC 9901 Selective Disclosure for JWTs. IETF, Nov 2025. https://datatracker.ietf.org/doc/rfc9901/
- ISO/IEC TS 18013-7:2025. https://www.iso.org/standard/91154.html
- Introducing the verifiable LEI. GLEIF. https://www.gleif.org/en/organizational-identity/introducing-the-verifiable-lei-vlei
- vLEI Ecosystem Governance Framework v4.0, 25 March 2026. https://www.gleif.org/media/pages/organizational-identity/become-a-vlei-issuer-qvi/vlei-ecosystem-governance-framework/e345f7d7ae-1776946389/2026-03-25_vlei-egf-v4.0-primary-document_v1.2_final.pdf
- LEI eligibility for general government entities. LEI ROC, 25 Oct 2019. https://www.leiroc.org/publications/gls/roc_20191025-1.pdf
- Can an LEI system work in the municipal market? DPC Data, 25 July 2024. https://www.dpcdata.com/resources/can-an-lei-system-work-in-the-municipal-market/
- OpenID Federation 1.0 Final approved, 17 Feb 2026. https://openid.net/openid-federation-1-0-final-specification-approved/
- The Journey to OpenID Federation 1.0. Jones, De Marco, Hedberg, 21 Apr 2026. https://self-issued.info/presentations/OpenID_Federation_TDI_2026.pdf
- OpenID Connect for Identity Assurance 1.0 Final, 1 July 2026. https://openid.net/specs/openid-connect-4-identity-assurance-1_0.html
- SCIM working group documents. IETF. https://datatracker.ietf.org/group/scim/documents/
- Web Authentication Level 3. W3C, 25 Aug 2026. https://www.w3.org/TR/webauthn-3/
- World Passkey Day 2026 report. FIDO Alliance, 7 May 2026. https://fidoalliance.org/fido-alliance-reports-accelerating-global-passkey-adoption-on-world-passkey-day-2026/
- NIST SP 800-63-4, July 2025. https://pages.nist.gov/800-63-4/
- GOV.UK Wallet. https://www.gov.uk/wallet
- MOSIP. https://www.mosip.io/
- GAO-26-109261, Login.gov. https://files.gao.gov/reports/GAO-26-109261/index.html
- 15 identity providers your B2B SaaS must support. Security Boulevard, Apr 2026. https://securityboulevard.com/2026/04/15-identity-providers-your-b2b-saas-must-support-to-close-enterprise-deals/
- eHerkenning. business.gov.nl. https://business.gov.nl/regulations/applying-for-eherkenning/
- MitID Erhverv. https://www.mitid-erhverv.dk/en/about/
- CDP-ICLEI Track Cities User Guide v6.0, March 2023. https://cdn.cdp.net/cdp-production/cms/guidance_docs/pdfs/000/004/473/original/Cities_User_Guide.pdf
- MCP authorization, 2026-07-28 changelog. https://modelcontextprotocol.io/specification/2026-07-28/changelog
- draft-mcguinness-oauth-actor-profile-00. IETF, Apr 2026. https://datatracker.ietf.org/doc/html/draft-mcguinness-oauth-actor-profile-00
- New whitepaper tackles AI agent identity challenges. OpenID Foundation, Oct 2025. https://openid.net/new-whitepaper-tackles-ai-agent-identity-challenges/
- Certified OpenID Connect implementations. OpenID Foundation. https://openid.net/certification/certified-openid-connect-implementations/
