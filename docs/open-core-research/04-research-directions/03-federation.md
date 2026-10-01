# Federation: many instances of one core

Research note, 1 October 2026. **UNVERIFIED** marks items not confirmed against a primary source; **Inference** marks reasoning beyond the sources. Some official sites (GBIF, UNECE, ISO, eduGAIN) refused automated fetching; their figures are cited through the alternates listed.

## 1. What federation means here, in plain terms

Federation is an arrangement in which independently run systems agree to trust each other for a specific purpose without merging. Two kinds matter.

**Identity federation.** The system that checked the password (the identity provider) issues a signed statement, and another system (the relying party) accepts it because it trusts the issuer, or a chain of issuers leading to an anchor it has chosen. Nobody shares passwords; they share signed assertions and a rule for whose signatures count.

**Data federation.** Records held by independent systems are made discoverable, exchangeable or queryable across those systems. The hard problems are not transport but agreement: what a record is called, who may assert it, how a receiver verifies it was not altered, and how to cope with each system changing on its own schedule.

A multi-instance infrastructure needs both because its topology is already federated by politics. A service run by C40 in its own cloud, OEF-run national programmes, ministry-run instances and city-run instances are separate deployments with separate databases and administrators. Without an agreed way to recognise a city, an instance, a user and a record across them, every pairing becomes a bespoke integration and "same core, many instances" collapses into incompatible products. Federation keeps deployments separate, for sovereignty, cost and offline operation, while they behave as one network for discovery, login and verified exchange.

**What exists today.** The recommendation deck's "two clouds, nothing shared" design is federation by construction: no user, data or runtime is shared between the OEF and C40 accounts, and the only link is code. The codebase has signed outbound webhooks, generated client SDKs that are not published, a data catalogue service, and no instance identity, registry of instances or record envelope.

## 2. Federated identity

- **OpenID Federation 1.0** became a Final specification on 17 February 2026, approved 85 to 0 ([OIDF](https://openid.net/openid-federation-1-0-final-specification-approved/)). Each entity publishes a signed statement about itself; superiors publish signed statements about subordinates; a verifier walks the chain to a trust anchor it chose and checks trust marks, which are signed conformance statements. Twelve participants from nine countries tested interoperability in February 2026, and implementations exist in Python, Java, Node, PHP, Go and C# ([OIDF](https://openid.net/nine-countries-prove-openid-federation-interoperability/); [implementations](https://openid.net/developers/openid-federation-implementations/)). Italy runs two federations with two anchors, one for SPID and CIE and one for its wallet; Sweden's Digg publishes an open-source core library ([De Marco, Verona, 20 April 2026](https://st.fbk.eu/assets/areas/events/TDI2026/slides/1_2_DeMarco.pdf)).
- **One correction worth recording.** The EU wallet's Architecture and Reference Framework establishes trust through trusted lists, lists of trusted entities and access certificates, not through OpenID Federation; a vendor page claiming otherwise is **UNVERIFIED** and contradicted by the framework text ([ARF v2.8.0](https://eudi.dev/2.8.0/architecture-and-reference-framework-main/)). Italy keeps OpenID Federation as its national trust plane while meeting the wallet's obligations where mandated.
- **SAML federations.** eduGAIN connects 84 national research and education federations and 10,737 entities, operating since April 2011 ([eduGAIN technical](https://technical.edugain.org/)). Lesson: metadata aggregation across federations works at scale, but new government ecosystems are choosing OpenID Connect.
- **Trust registries.** The European Blockchain Services Infrastructure runs a three-level accreditation chain for issuers ([EBSI trust model v4, 3 July 2026](https://hub.ebsi.eu/vc-framework/trust-model/issuer-trust-model-v4)). Trust over IP's Trust Registry Query Protocol v2.0 (15 April 2026) is a read-only protocol with two questions: "is entity X authorised by authority A for action Y on resource Z" and "does authority A recognise authority B" ([ToIP](https://trustoverip.github.io/tswg-trust-registry-protocol/approved/)).
- **Cross-instance single sign-on, Inference.** Four patterns: a hub identity provider run by OEF (simplest; a partner may refuse to depend on OEF for login); bilateral setup between instances (fine for five, unmanageable for fifty); OpenID Federation with an anchor run by OEF, a partner or a ministry, where new instances join by being listed rather than registered pairwise; and bring-your-own national login. Only the third scales and matches what governments deploy.

## 3. Federated data networks

### X-Road, in depth

X-Road is a data exchange layer. Each member organisation runs a Security Server that signs, encrypts, logs and time-stamps every message; a Central Server holds the member registry and security policy; a certification authority and a time-stamping authority make the message log usable as digital evidence; a signed global configuration is verified by clients against a configuration anchor ([architecture ARC-G v1.14, 1 June 2023](https://docs.x-road.global/Architecture/arc-g_x-road_arhitecture.html); [terms](https://docs.x-road.global/terms_x-road_docs.html)). Federation between X-Road instances run by different authorities exists: Estonia and Finland have exchanged register data since 2019 on the basis of bilateral agency agreements plus mutual certificate verification, with reported low uptake and costs falling on direct participants ([OECD OPSI](https://oecd-opsi.org/innovations/x-road-trust-federation-for-cross-border-data-exchange/)).

Licence MIT. Members of the Nordic Institute for Interoperability Solutions as of 1 October 2026: Estonia and Finland (strategic), Iceland (contributing), Ukraine, Schleswig-Holstein, Québec, the Faroe Islands and Åland (associate) ([niis.org](https://www.niis.org/)). **CLEARANCE**: the v2 deck lists only Estonia, Finland and Iceland. X-Road 7.8.0 (January 2026) is the last feature release of version 7. X-Road 8 "Spaceship" shipped beta 1 on 23 October 2025 and beta 2 on 20 May 2026; the repository schedules the first production release for December 2026; it is containerised and Kubernetes-first, and dataspace support is explicitly deferred to a later phase ([NIIS, 13 Oct 2025](https://www.niis.org/blog/2025/10/13/on-the-launch-pad-x-road-8-spaceship-beta-prepares-for-takeoff); [x-road.global/spaceship](https://x-road.global/spaceship)). Honest limitations from a 2025 UK policy memo: every consumer must run a Security Server, which changes API addresses; logs must either hold personal data and tokens or lose non-repudiation; deployment is "significant, high skill work"; and NIIS alone sets direction, "a product based on standards rather than a standard itself" ([Zilla, 30 April 2025](https://oli.zilla.org.uk/2025/04/30/x-road-in-uk-policy-memo/)). **Inference:** for OEF the value is the pattern (per-instance signing gateway, central member registry, signed global configuration, evidentiary log), not the software, until version 8 ships and a government partner mandates it.

### Other models

- **EU Once-Only Technical System.** A public authority in one Member State fetches evidence directly from the issuing authority in another; a data service directory, an evidence broker and a semantic repository are the common services; live since December 2023 and open-sourced on 14 January 2025 ([OOTS hub](https://ec.europa.eu/digital-building-blocks/sites/display/OOTS/About+OOTS)). This is "the hub keeps a directory, the data stays at source" at EU scale. The Interoperable Europe Act (applied from 12 July 2024) labelled the Core Vocabularies and DCAT-AP as its first solutions ([Interoperable Europe, 13 April 2026](https://interoperable-europe.ec.europa.eu/interoperable-europe/news/two-years-interoperable-europe-act)); **Inference:** a European municipality will be asked whether the catalogue is DCAT-AP.
- **European Health Data Space.** Regulation (EU) 2025/327, in force 26 March 2025; cross-border exchange applies from March 2029 through national contact points ([DG SANTE](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en)). National gateways plus a central interoperability platform, data stays national.
- **India.** The Data Empowerment and Protection Architecture uses a regulated, "data-blind" consent manager; its financial instance reports 2.88 billion enabled accounts and 295 million monthly data shares in June 2026 ([Sahamati](https://sahamati.org.in/)); the India Urban Data Exchange covers about fifty cities ([IUDX](https://iudx.org.in/)); a National Framework for Data Sharing was approved on 15 May 2026 ([NeGD](https://negd.gov.in/ndg/)).
- **Dataspace Protocol.** Catalogue, contract negotiation and transfer between connectors; Apache-2.0; 1.0.2 on 10 September 2026; heading to ISO ([Eclipse](https://projects.eclipse.org/projects/technology.dataspace-protocol-base)). **Inference:** the right target when a counterparty demands contract-bound, usage-controlled exchange; overkill for publishing public inventories.
- **GBIF and OBIS, the working harvest federation.** The Global Biodiversity Information Facility indexes 3.8 billion records from nearly 3,500 publishers across 47 voting countries, "each represented by a national or thematic node", and "functions as a central index aggregating rather than directly vetting records" ([Pensoft, 22 Sept 2026](https://blog.pensoft.net/2026/09/22/gbif-marks-25-years-of-fair-biodiversity-data-now-spanning-70-countries-and-3-8-billion-records/)). It keeps a registry of datasets and endpoints, crawls publisher archives, assigns stable identifiers, flags datasets that rewrite more than half their identifiers, and interprets records while keeping the verbatim data ([GBIF technical docs](https://techdocs.gbif.org/en/data-processing/)). Publishers run the Integrated Publishing Toolkit (Apache-2.0, 3.3.6 in September 2026). OBIS, the ocean counterpart, has 37 nodes. **Inference:** this is the closest analogue both to an OEF biodiversity instance and to a programme such as GCoM: publishers keep authority, the hub keeps an index, assigns stable identifiers, interprets, and never becomes the system of record.
- **DHIS2 and FHIR, health.** DHIS2 is the health system of record in 80+ countries; its hub-and-spoke model pushes metadata versions from the centre and pulls data from the edge, and a local instance that creates its own metadata version "can't receive new metadata versions from the central instance" ([DHIS2 docs](https://docs.dhis2.org/en/use/user-guides/dhis-core-version-241/exchanging-data/metadata-synchronization.html)). **Inference:** the cautionary tale for "city as tenant of a national instance". FHIR is federation by API; R6 had its first normative ballot in January 2026.
- **Catalogue harvesting.** DCAT 3 became a W3C Recommendation on 22 August 2024; CKAN's DCAT extension harvests other catalogues ([W3C](https://www.w3.org/news/2024/data-catalog-vocabulary-dcat-version-3-is-a-w3c-recommendation/)). Hubs harvest descriptions, not necessarily data.
- **For completeness.** ActivityPub (W3C, 2018) and Matrix, whose homeservers each keep a signed, hash-linked copy of a room's event graph so that "no single homeserver has control or ownership" ([Matrix spec](https://spec.matrix.org/latest/)). **Inference:** Matrix's signed event graph is the strongest model for publish-subscribe of signed records; ActivityPub's inbox and outbox the simplest.

## 4. Federated query versus replication

| Question | Query live across instances | Replicate or harvest into a hub |
|---|---|---|
| Freshness | Always current | As of last harvest |
| Availability | Bounded by the weakest instance; an offline city breaks the query | The hub serves a cached copy; the last publication stays visible |
| Sovereignty | Data never leaves the source (OOTS, X-Road, dataspaces) | A copy exists at the hub; needs licence and provenance terms |
| Verification | Per response (X-Road signs every message) | Once at harvest, if records carry signatures |
| Cost per instance | A reachable, authenticated endpoint around the clock | A signed archive from a laptop or a batch job |
| Cost at hub | Low storage, high latency and failure handling | Storage, indexing, de-duplication, stable identifiers |
| Entity reconciliation | At query time, every time | Once, auditable, correctable |
| Best for | Personal data, consented one-off evidence, high-value transactions | Public records, aggregates, catalogues, offline or small cities |

**Inference.** The patterns for OEF are "harvest with provenance" (the hub pulls signed records plus a catalogue entry saying who, when, under which schema and licence), "the hub keeps an index, not data" for anything a partner will not let OEF or C40 copy, and "publish-subscribe of signed records" through the existing webhooks for push to programmes. Live query is justified only for the consent-bound, person-level cases that the Indian and EU systems were built for, which CityCatalyst does not have.

## 5. How national, city and programme instances relate

Four options, each with a precedent: the city as a tenant of a national instance (the DHIS2 model, which fails when the city needs local extensions or leaves the programme); a separate city instance that publishes to the national one (the GBIF publisher-to-node model); peer instances with a shared registry (the X-Road model, where no hub holds data and a registry lists instances, their keys and the entities they may speak for); and a programme instance harvesting from many (the GBIF hub model, with trust marks or registry queries answering "is this instance an accredited reporter for city Y").

**Entity identity.** One city must have one global identifier that every instance uses, with crosswalks to the codes partners already use: UN/LOCODE (roughly 103,000 locations, **UNVERIFIED** from UNECE directly), Wikidata identifiers, GeoNames, OpenStreetMap relations, national statistical codes, and the Legal Entity Identifier for the municipality as a legal person. GBIF's practice of reverse-geocoding to administrative units shows the alternative: derive identity from geometry when codes disagree. The spatial note takes this further.

**Trust.** Who vouches that instance X speaks for city Y. Three mechanisms exist: a federation trust mark, an accreditation entry in a registry, or a bilateral agreement plus certificate. **Inference:** the core needs a registry row of the form (instance, entity, role, valid from, valid to, issued by, signature), and the issuer should be the programme or ministry, not OEF.

**Versioning conflicts.** Records need identifier, version, issuer and supersedes, so a hub can detect a city republishing year 2023 version 3 after the national instance already aggregated version 2, and surface it rather than overwrite.

**Same core, different domain.** A health or biodiversity instance can join the same federation if four things are shared: one identity federation; one entity registry with crosswalks (cities, agencies, protected areas, hospitals); per-domain schema registries (Darwin Core, FHIR, GPC inventories); and a schema-agnostic record envelope.

## 6. Adopt now, design for, watch

**Adopt now.**
- Stable global entity identifiers plus a crosswalk table, with Wikidata as the pivot and UN/LOCODE, GeoNames, OpenStreetMap, national code and LEI as columns. Every later mechanism assumes it.
- A signed record envelope using JSON Web Signature (RFC 7515), optionally expressible as a W3C Verifiable Credential when a partner wants wallet compatibility.
- A DCAT 3 catalogue endpoint per instance listing what it publishes.
- The instance's own Entity Configuration published at `/.well-known/openid-federation`; it costs a day and commits to no anchor.
- Webhook signing aligned with the Standard Webhooks headers and payloads wrapped as CloudEvents 1.0.2, which graduated in the Cloud Native Computing Foundation on 25 January 2024 ([Standard Webhooks](https://www.standardwebhooks.com/); [CloudEvents](https://cloudevents.io/)). These are what receivers' libraries already verify.

**Design for.**
- A registry of instances: a small, signed, DCAT-described dataset of instance, operator, domains, entities it may speak for, schemas and endpoints; mirrored, never a runtime dependency, after X-Road's configuration anchor.
- HTTP Message Signatures (RFC 9421, February 2024) once instances call each other directly.

**Watch.**
- X-Road 8 for government partners that run it.
- Dataspace connectors when a counterparty requires them.
- A trust registry with Trust Registry Query Protocol queries and federation trust marks when more than one programme needs to answer "is instance X accredited for city Y" without asking OEF.

## 7. What it means for the core's design

Instance identity: a URL identifier, a signing key pair with published keys, an Entity Configuration. Record envelope: identifier, version, supersedes, entity, issuer, schema and version, issued at, licence, payload hash, signature, with the payload domain-specific. Events as the federation primitive: every create, update and publish emits an event carrying the envelope; subscribers receive signed pushes; harvest is the fallback for subscribers that were offline. Version the schema registry, not just the HTTP API. The SDKs should verify envelopes and resolve crosswalks client-side so agents and partners never accept unsigned records. The global data catalogue becomes the GBIF-style index, not the system of record.

## 8. Three open research questions

1. **Authority across hierarchies.** When a national instance and a city's own instance both publish a record for the same city and year, which trust rule should a programme hub apply, and can federation trust marks or registry queries express "authoritative for entity Y, domain D, period P" without inventing a new registry format?
2. **Offline-first federation.** Neither GBIF nor DHIS2 gives a signed, append-only publication format a disconnected city can produce and a hub can later verify and merge. Is a Matrix-style hash-linked event log per instance a practical primitive for municipal records, and what does it cost?
3. **Cross-domain entity equivalence.** For a biodiversity or health instance to join, protected areas, watersheds and hospitals need the same stable-identifier-plus-crosswalk treatment as cities. Is Wikidata an acceptable pivot for government partners, or does OEF mint its own identifiers with Wikidata as one column?

## Sources

- OpenID Federation 1.0 Final approved. OpenID Foundation, 17 Feb 2026. https://openid.net/openid-federation-1-0-final-specification-approved/
- Nine countries prove OpenID Federation interoperability. OpenID Foundation, 13 Feb 2026. https://openid.net/nine-countries-prove-openid-federation-interoperability/
- OpenID Federation implementations. https://openid.net/developers/openid-federation-implementations/
- OpenID Federation and the IT-Wallet. De Marco, TDI 2026, 20 Apr 2026. https://st.fbk.eu/assets/areas/events/TDI2026/slides/1_2_DeMarco.pdf
- EUDI ARF v2.8.0. https://eudi.dev/2.8.0/architecture-and-reference-framework-main/
- eduGAIN technical status. https://technical.edugain.org/
- EBSI issuer trust model v4, 3 July 2026. https://hub.ebsi.eu/vc-framework/trust-model/issuer-trust-model-v4
- Trust Registry Query Protocol v2.0. Trust over IP, 15 Apr 2026. https://trustoverip.github.io/tswg-trust-registry-protocol/approved/
- X-Road Architecture ARC-G v1.14. NIIS, 1 June 2023. https://docs.x-road.global/Architecture/arc-g_x-road_arhitecture.html
- X-Road terms. NIIS. https://docs.x-road.global/terms_x-road_docs.html
- X-Road trust federation. OECD OPSI. https://oecd-opsi.org/innovations/x-road-trust-federation-for-cross-border-data-exchange/
- NIIS. https://www.niis.org/
- On the launch pad: X-Road 8 beta. NIIS, 13 Oct 2025. https://www.niis.org/blog/2025/10/13/on-the-launch-pad-x-road-8-spaceship-beta-prepares-for-takeoff
- X-Road 8 Spaceship. https://x-road.global/spaceship
- Adopting X-Road in the UK, policy memo. Zilla, 30 Apr 2025. https://oli.zilla.org.uk/2025/04/30/x-road-in-uk-policy-memo/
- About OOTS. European Commission. https://ec.europa.eu/digital-building-blocks/sites/display/OOTS/About+OOTS
- Two years of the Interoperable Europe Act, 13 Apr 2026. https://interoperable-europe.ec.europa.eu/interoperable-europe/news/two-years-interoperable-europe-act
- European Health Data Space. DG SANTE. https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en
- Sahamati. https://sahamati.org.in/
- India Urban Data Exchange. https://iudx.org.in/
- National Data Governance. NeGD. https://negd.gov.in/ndg/
- Eclipse Dataspace Protocol project. https://projects.eclipse.org/projects/technology.dataspace-protocol-base
- GBIF marks 25 years. Pensoft, 22 Sept 2026. https://blog.pensoft.net/2026/09/22/gbif-marks-25-years-of-fair-biodiversity-data-now-spanning-70-countries-and-3-8-billion-records/
- GBIF data processing. https://techdocs.gbif.org/en/data-processing/
- DHIS2 metadata synchronisation. https://docs.dhis2.org/en/use/user-guides/dhis-core-version-241/exchanging-data/metadata-synchronization.html
- DCAT 3 is a W3C Recommendation, 22 Aug 2024. https://www.w3.org/news/2024/data-catalog-vocabulary-dcat-version-3-is-a-w3c-recommendation/
- Matrix Specification. https://spec.matrix.org/latest/
- Standard Webhooks. https://www.standardwebhooks.com/
- CloudEvents. https://cloudevents.io/
- RFC 7515 JSON Web Signature. https://www.rfc-editor.org/info/rfc7515
- RFC 9421 HTTP Message Signatures. https://rfc-editor.org/rfc/rfc9421.html
- Wikidata property P1937 UN/LOCODE. https://www.wikidata.org/wiki/Property:P1937
