# Build on CityCatalyst's codebase, start fresh, or compose from mature components

Research note, 1 October 2026. **UNVERIFIED** marks items confirmed only through secondary sources; **Inference** marks judgement beyond the sources. All effort figures are estimates, ±50 percent, with assumptions stated.

## 1. The short answer

**Inference.** Evolve the core out of CityCatalyst's codebase, under a strict rule: no capability already solved by a mature, foundation-governed component is kept in-house. Identity, policy decisions, workflow, webhook delivery, catalogue metadata and spatial serving all have Apache or MIT licensed incumbents with foundation governance and large installed bases. What the codebase holds that nothing else does is narrow and real: agentic ingestion of documents into structured, provenance-carrying records; a climate data catalogue with pipelines; multi-tenant programme rollouts at network scale; and a tenancy model built for networks of cities rather than one city. No existing platform gives 70 percent of the target; DIGIT, FIWARE and a GovStack composition each give perhaps 30 to 45 percent, and each is built around a different primary object (a citizen service request, a live sensor entity, a national registry) than the one OEF needs: a verifiable record about a place, held by a member of a network.

## 2. Mature components by capability

### Identity and access

| Component | Governance, licence | Maturity | Would replace | Cost | Risk |
|---|---|---|---|---|---|
| Keycloak | CNCF incubating since April 2023, Apache 2.0 | 26.8.0, 1 Oct 2026; credential issuance in preview, verification experimental; AuthZEN experimental since May 2026 ([Keycloak](https://www.keycloak.org/2026/10/keycloak-2680-released)) | The credentials login, the TOTP code, the OAuth server, client registration, revocation; adds SAML, federation to city identity providers, organisations | Medium: a Java service to operate; NextAuth becomes an OpenID Connect client; password hashes need import or a forced reset | Low lock-in; operational weight |
| Ory Kratos, Hydra, Keto | Ory Corp, Apache 2.0 | v26.3.5, 11 Aug 2026 | Same, headless, so the product keeps its own login screens; Keto adds relationship permissions | Medium: three services | Single vendor; open licence mitigates |
| Zitadel | Core AGPL-3.0 since v3 (March 2025), APIs Apache 2.0 | v4.16, July 2026 | Same, with a built-in multi-organisation model | Medium | AGPL complicates a partner's modified branch |
| authentik | MIT core with enterprise directory; 2026.8, August 2026 | Same | Medium | Open-core split |
| SCIM servers | Libraries in Go and Python (scim2-server 0.2.0, 25 Sept 2026) | Standard provisioning; the codebase has none | Low to medium | None |

**Inference.** Keycloak is the safest choice for a public-sector network: CNCF governance, the broadest federation support, the only credible path to wallet-style credentials. Ory fits if OEF wants to keep its own screens and treat identity as pure API. Either way the in-house OAuth server is a rebuild of something mature.

### Authorisation and policy

| Component | Governance | Maturity | Would replace | Cost |
|---|---|---|---|---|
| Open Policy Agent (Rego) | CNCF graduated February 2021, Apache 2.0; its main commercial sponsor wound down in 2026 (**UNVERIFIED**) | Active releases through 2026 | Client-side module entitlement checks and ad hoc role checks | Medium: a new language for the team |
| Cedar | AWS-originated, Apache 2.0, CNCF sandbox late 2025; 4.9.1, 27 Feb 2026; "Dogwood" extends it to sequences of agent tool calls (August 2026) ([InfoQ](https://www.infoq.com/news/2026/08/aws-dogwood-agent-policy/)) | Same, formally verified and schema-typed; better suited to agent tool-call governance | Medium |
| OpenFGA | CNCF incubating since 28 Oct 2025, Apache 2.0 | Holds the organisation, project, city and inventory membership graph and per-project module grants | Medium: schema plus writing tuples on every membership change |
| SpiceDB | AuthZed, Apache 2.0 | Same as OpenFGA | Medium |
| AuthZEN 1.0 | OpenID Foundation Final, 12 Jan 2026 | Not a product: the wire format between the points that enforce and decide policy | Low |
| ODRL evaluators | W3C community; research-grade code (SolidLab 0.6.0, January 2026) | Data-use policies attached to datasets | Medium to high |

**Inference.** A relationship store (OpenFGA) for "who is a member of what" plus a policy engine (Cedar or OPA) for rule-shaped questions, both behind one AuthZEN-shaped internal call so either can be swapped. Cedar's agent work makes it the stronger candidate for tool-call governance.

### Municipal interoperability stacks

- **FIWARE and NGSI-LD.** An ETSI API for live "context" entities with linked-data identifiers; the main broker is AGPL-3.0; about 1,200 Smart Data Models; the Foundation reports 625+ members; India's IUDX adopted NGSI-LD across twelve cities ([smartdatamodels.org](https://smartdatamodels.org/); [IUDX](https://iudx.org.in/cities/)). It is a different data philosophy (live entity state) from versioned annual records. **Inference:** adopt NGSI-LD and Smart Data Models as an export and interchange profile, not as the core store.
- **OASC Minimal Interoperability Mechanisms.** MIMs Plus 8.0 (30 June 2025) from Open and Agile Smart Cities, representing more than 150 sub-national governments; specifications, not software ([Living-in.EU](https://living-in.eu/sites/default/files/files/mims-plus-v.8_2.pdf)). **Inference:** the best external yardstick for OEF's interoperability claim; each mechanism maps to one core interface.
- **EU Local Digital Twin Toolbox and Simpl.** The toolbox was presented as "production-ready" on 16 and 17 June 2026; Simpl is the Commission's open-source dataspace middleware ([Commission](https://digital-strategy.ec.europa.eu/en/policies/simpl)). Adoption numbers: none found. **Inference:** too EU-specific and young for a core; the core should be able to act as a participant.
- **Eclipse Dataspace Components, X-Road, GovStack, DIGIT, Sunbird RC**: see [03-federation.md](03-federation.md) and [06-govtech-ai-and-dpi.md](06-govtech-ai-and-dpi.md). DIGIT would replace tenancy, user and role service, workflow, notifications, localisation and a registry service, at high cost (Java microservices with Indian municipal service semantics baked in). Sunbird RC is the closest existing thing to "entity registry plus verifiable record" (Java, Keycloak-dependent).
- **OpenFn.** A workflow and integration DPG under LGPL-3.0; the claim that it has a native MCP interface could not be found in its documentation (**UNVERIFIED**, contradicting the CDPI assessment cited in the govtech note). Would replace the cron outbox worker, OCR orchestration and the integration side of the module registry.
- **Workflow engines.** Temporal (MIT, v1.32.0, September 2026) for durable in-app jobs; Apache Airflow 3 (Apache 2.0) stays for data pipelines; n8n's sustainable-use licence and Camunda 8's paid production licence rule them out for a DPI.
- **iSHARE** Trust Framework 3.0 (January 2026) is the cleanest written model for "who is a trusted member of this network and under what delegation", worth copying for its role structure.

### Records, registries, provenance

OpenCRVS 2.0 (25 June 2026) is worth copying for its pattern: a country-configuration package separated from the core, and the record as an event-sourced object with an action history. DHIS2's metadata model (organisation unit hierarchy, data element, period) maps almost one to one onto an inventory by sector and year and is the right reference for the record envelope; code reuse is impractical. CKAN 2.12 (26 August 2026, over 1,000 portals) or at least DCAT-AP output for catalogue metadata. ODK Central and KoboToolbox for survey-style inputs. LinkML 1.11 to define the envelope once and generate validators for TypeScript and Python. For events: keep the Postgres outbox as source of truth, publish through NATS JetStream (CNCF), deliver webhooks with Svix (MIT) or at minimum the Standard Webhooks signature that OpenAI, Anthropic and Google have adopted.

### AI agent governance

MCP moved to the Linux Foundation's Agentic AI Foundation in December 2025; Agent2Agent 1.0 shipped in January 2026 with 150+ supporting organisations. Gateways: IBM ContextForge (Apache 2.0) federates MCP, A2A and REST behind one endpoint with OAuth scopes and tracing, with access control and audit "still maturing". Observability: Langfuse (MIT core) with the OpenTelemetry GenAI conventions, still pre-stable. Guardrails: NeMo Guardrails (Apache 2.0), LLM Guard (MIT). **Inference:** put a gateway in front of the six existing tools, emit the telemetry spans now and accept that attribute names will churn, and treat Cedar's agent work as the candidate policy layer.

### Spatial

PostGIS is already in place. pygeoapi 0.24 (28 July 2026) is the OGC-certified reference implementation for OGC API Features; GeoServer 3.0 shipped 11 June 2026; pg_tileserv serves tiles straight from PostGIS; H3 4.5 (May 2026); the Overture Maps Foundation reached 50 members in 2026. These replace the UN/LOCODE-only entity key with a geometry-backed one at low to medium cost.

### Nearby "municipal DPI" projects

The EU Local Digital Twin work (digital-twin centred); IUDX (twelve cities); Decidim's new public institutions committee led by Barcelona (300+ organisations in 30 countries); Brazil's Rede Gov.br, which only a quarter of municipalities had joined by end 2024 ([World Bank](https://documents1.worldbank.org/curated/en/099121725090527750/pdf/P508363-912c4344-db92-4869-8de7-c27403640d4d.pdf)); UN-Habitat's Quality of Life Initiative in 100+ cities. None is a generic "network of municipalities exchanging verifiable records with AI-agent governance".

## 3. Three strategies compared

Assumptions: one engineer-month is one senior engineer for one month; a team of four to six; the GCoM MVP is nine months away; "robust v1 for a second network" means a non-climate or non-GCoM network can onboard with configuration and a domain app, not core changes.

| Dimension | A. Evolve the codebase (strangler) | B. Fresh thin core, port the apps | C. Adopt DIGIT, FIWARE or a GovStack composition |
|---|---|---|---|
| Time to a robust v1 for a second network | 15 to 20 months (Q1 to Q2 2028) | 18 to 24 months | 24 months or more |
| Engineer-months, estimate ±50% | 60 to 90: 15 to 20 to extract packages and generalise vocabulary; 10 to 15 for the identity server and membership store; 8 to 12 for the record envelope and entity registry; 6 to 10 for events, webhooks and gateway; 10 to 15 for audit, consent and policy; 10 to 18 for tests, documentation and conformance | 90 to 140: the above plus 30 to 50 to port the application, the data service and the agent service onto new interfaces and rebuild tenancy and localisation | 100 to 160: learning and bending a Java platform, rewriting the climate apps as its modules, plus the same identity and policy work |
| Risk to the July 2027 MVP | Low to medium: the partner's branch keeps shipping; strangler steps land behind feature flags | High: two codebases in flight during the MVP window | High: the MVP on a platform the team does not know |
| Reused from the codebase | All of it, progressively re-homed; the climate apps, ingestion, catalogue, pipelines and tenancy patterns untouched at first | Climate apps, ingestion and pipelines after a port; tenancy and UI largely rewritten | Catalogue and pipelines as external services; the rest reimplemented |
| "Rebuilding X" | Little, provided the no-rebuild rule is enforced | Tenancy, localisation, the admin surface, 216 routes' worth of glue | The climate apps on someone else's framework |
| Governance and community | OEF remains steward; needs a technical steering group with the first partner and the second network; fork-drift risk | A clean slate eases a neutral foundation home | Joins an existing community with less roadmap control |
| What the world gets | A network-of-municipalities core with verified records and agent governance, proven on climate first | The same, later, cleaner | A climate module for an existing municipal platform |

**Inference.** A wins on MVP risk and on time to a second network, provided two conditions hold: a published package boundary within six months, and a prohibition on keeping in-house anything in the rebuild list below.

## 4. Recommended composition under strategy A

**Build, thin and generic.** (1) The record envelope: identifier, entity reference, period, schema reference, payload, provenance chain including agent identity, signature slot, version pointer. (2) The entity registry: places and organisations with multiple keys, geometry in PostGIS, parent and member relations; City becomes an entity type. (3) The network and membership model: Network, Programme, Member, Entitlement as the generic form of Organization, Project, City and module; membership facts in OpenFGA, entitlement rules in Cedar, all checks through one AuthZEN-shaped call. (4) The agent registry and audit log, enforced through the MCP gateway. (5) The event contract: CloudEvents-shaped domain events into the existing outbox, published through NATS, delivered with Svix or Standard Webhooks signatures. (6) Consent and policy records: consent as a record type, data-use policy as ODRL on datasets, the GDPR module as first consumer.

**Integrate, by name.** Keycloak; OpenFGA plus Cedar; an Apache-licensed MCP gateway; Langfuse with OpenTelemetry; Temporal for durable jobs; Airflow for pipelines; CKAN or DCAT-AP 3 output; pygeoapi over PostGIS and pg_tileserv; Overture Divisions as reference geometry; NGSI-LD and Smart Data Models as an interchange profile; a dataspace connector later for EU networks.

**Leave to domain apps.** GPC taxonomy, emission factors, action prioritisation, the advisor's prompts and tools, the climate-named MCP tools, the inventory UI, the component library, country-specific onboarding content.

## 5. The honest ledger

**Rebuilding something mature (retire or wrap):** the in-house OAuth server; credentials-only login plus TOTP; HMAC webhooks plus cron worker; client-side module entitlements; the module registry's integration side; hand-built catalogue metadata; OCR job orchestration; charts and dashboards; the MCP server's own authentication and logging.

**Rare and worth protecting:** agentic ingestion of unstructured municipal documents into structured records with provenance in a versioned store (no DPG found does this end to end for sub-national data); the climate data pipelines and warehouse with country-scale, source-attributed activity data; multi-tenant programme rollouts onboarding thousands of municipalities under a national or network programme (DIGIT addresses single-country urban bodies; nobody packages the network-of-networks case); tenancy-aware MCP exposure of a record store.

## 6. Three open research questions

1. **Record envelope semantics across domains.** Can one envelope (entity, period, schema, provenance, signature) serve emissions inventories, health indicators and biodiversity observations without a per-domain fork? Test by expressing a GPC inventory, a DHIS2 export and a GBIF-style occurrence set in one LinkML schema and measuring what breaks.
2. **Agent tool-call governance.** Does Cedar's sequence model, or an OPA equivalent, express the policies a network actually needs, for example "an agent may draft but not submit a record on behalf of a member unless a human in that member's organisation approves within the same session"? Prototype against the six existing tools.
3. **Sovereignty under forks.** With a partner running a branch in its own cloud, what package boundary, conformance suite and portability guarantee keep a fork interoperable with the upstream network without forcing it to track upstream? Compare OpenCRVS's country configuration and X-Road's member certification.

## Sources

- Keycloak 26.8.0 released, 1 Oct 2026. https://www.keycloak.org/2026/10/keycloak-2680-released
- Keycloak experimental AuthZEN support, May 2026. https://www.keycloak.org/2026/05/authzen-as-experimental-feature
- Ory v26.3.5 released, 11 Aug 2026. https://changelog.ory.com/announcements/ory-hydra-ory-kratos-ory-keto-v26-3-5-released
- Zitadel v3 announcement, March 2025. https://zitadel.com/blog/zitadel-v3-announcement
- OPA graduates in the CNCF, Feb 2021. https://www.openpolicyagent.org/blog/open-policy-agent-graduates-in-the-cloud-native-computing-foundation-f00145202a99
- Cedar CHANGELOG. https://github.com/cedar-policy/cedar/blob/main/cedar-policy/CHANGELOG.md
- AWS open-sources Dogwood. InfoQ, Aug 2026. https://www.infoq.com/news/2026/08/aws-dogwood-agent-policy/
- OpenFGA project page. CNCF. https://presentations.cncf.io/projects/openfga/
- AuthZEN 1.0 Final, 12 Jan 2026. https://openid.net/authorization-api-1-0-final-specification-approved/
- ODRL-Evaluator 0.6.0. Zenodo, 21 Jan 2026. https://zenodo.org/records/18328853
- Smart Data Models. https://smartdatamodels.org/
- FIWARE Foundation. https://fiware.org/foundation/
- IUDX cities. https://iudx.org.in/cities/
- MIMs Plus 8.0. Living-in.EU, 30 June 2025. https://living-in.eu/sites/default/files/files/mims-plus-v.8_2.pdf
- EU LDT Toolbox. https://ldtcitiverse-edic.eu/eu-ldt-toolbox-launch-box/
- Simpl. European Commission. https://digital-strategy.ec.europa.eu/en/policies/simpl
- DIGIT. https://digit.org/vision-mission/
- Sunbird RC. https://rc.sunbird.org/
- OpenFn documentation. https://docs.openfn.org/documentation
- Temporal self-hosted. https://automationatlas.io/answers/temporal-self-hosted-pricing-2026/
- Apache Airflow 3. https://airflow.apache.org/blog/airflow-three-point-oh-is-here/
- n8n Sustainable Use License. https://www.ssdnodes.com/learn/n8n-sustainable-use-license-explained
- Camunda licences. https://docs.camunda.io/docs/reference/licenses/
- iSHARE Trust Framework release notes. https://framework.ishare.eu/releases/release-notes
- OpenCRVS release notes. https://documentation.opencrvs.org/releases/release-notes
- About DHIS2. https://dhis2.org/about-2/
- Twenty years of CKAN. https://ckan.org/20-years-of-ckan/
- LinkML. https://linkml.io/
- Svix open-source webhooks. https://www.svix.com/open-source-webhook-service/
- Standard Webhooks. https://www.svix.com/blog/standard-webhooks/
- A2A surpasses 150 organizations. Linux Foundation, 2026. https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year
- Best open-source MCP gateways in 2026. Maxim. https://www.getmaxim.ai/articles/best-open-source-mcp-gateways-in-2026/
- Langfuse self-hosting. https://langfuse.com/faq/all/self-hosting-langfuse
- pygeoapi. https://docs.pygeoapi.io/en/stable/
- GeoServer 3.0.0. OSGeo, 11 June 2026. https://www.osgeo.org/community-news/geoserver-3-0-0-released/
- Overture Maps Foundation reaches 50 members, 2026. https://overturemaps.org/announcements/2026/overture-maps-foundation-reaches-50-members-as-industry-converges-on-open-data-to-ground-ai/
- Rede Gov.br, World Bank Project Information Document, 2025. https://documents1.worldbank.org/curated/en/099121725090527750/pdf/P508363-912c4344-db92-4869-8de7-c27403640d4d.pdf
