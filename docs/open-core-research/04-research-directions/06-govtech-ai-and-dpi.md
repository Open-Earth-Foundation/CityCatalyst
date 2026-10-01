# Govtech AI integration and DPI building-block models

Research note, 1 October 2026. **UNVERIFIED** marks items not confirmed against a primary source; **Inference** marks reasoning beyond the sources. Several official sites (OECD, UNDP, gov.br, UNFCCC, ITS Rio) blocked automated fetching.

Terms: digital public infrastructure (DPI) is shared digital systems, such as identity, payments, data exchange and registries, that others build services on. A digital public good (DPG) is open-source software, data or a standard that meets the Digital Public Goods Alliance (DPGA) standard.

## Part A. What governments are deploying, 2025 to 2026

### A1. Deployments and how they are governed

- **Estonia.** Bürokratt is a network of agency chatbots, live in 18 organisations by October 2025, open source, hosted in the State Cloud for about EUR 150 a month plus model costs ([Apolitical, 6 July 2026](https://apolitical.co/en/navigator/case-studies/burokratt-estonia-s-single-network-of-ai-assistants-replacing-dozens-of-separate-agency-chatbots)). The roadmap moves to a "unified and cooperative network of agents" from 2026 ([RIA](https://www.kratid.ee/en/burokratt)). The Information System Authority is piloting an **agent registry with cryptographic machine identities that extend the national electronic identity to machines, capability manifests, authorisation scopes and kill switches**, plus a sandbox to assess at least 30 AI systems by end-2026 ([Ilves and Velsberg, 24 April 2026](https://luukasilves.substack.com/p/building-the-agentic-state-in-estonia)). **Inference:** the most concrete public design anywhere for giving an AI agent a government-issued identity.
- **United Kingdom.** The "Humphrey" tools were announced 20 January 2025; Consult went live in February 2025, Minute was trialled with 400 users in 22 local authorities and open-sourced, Extract was promised to all local authorities by May 2026 ([Roadmap for Modern Digital Government](https://roadmap-for-modern-digital-government.campaign.gov.uk/ai/innovation-and-prototyping)). **On 5 May 2026 the government closed four of the pilots**, saying they were "superseded by more modern, widely available platforms", while Extract and Consult continue ([Global Government Forum](https://www.globalgovernmentforum.com/uk-closes-ai-pilots-amid-strategic-changes-to-prioritise-legacy-tech-overhaul/)). The AI Playbook (10 February 2025) sets ten principles including "meaningful human control at the right stage" ([GOV.UK](https://gov.uk/government/publications/ai-playbook-for-the-uk-government/artificial-intelligence-playbook-for-the-uk-government-html)). The Algorithmic Transparency Recording Standard is mandatory for central departments.
- **Singapore.** GovTech's Pair assistant serves tens of thousands of officers; five agencies gained Gemini on an air-gapped cloud on 28 August 2025 to run agents on sensitive data ([GovInsider](https://govinsider.asia/intl-en/article/singapore-government-first-in-asia-to-deploy-agentic-ai-on-googles-air-gapped-cloud)); a registry of AI agents for 150,000 public officers was reported on 2 June 2026, with controls such as blocking file deletion by agents and capping email recipients. The Infocomm Media Development Authority's Model AI Governance Framework for Agentic AI (22 January 2026, updated 20 May 2026) is voluntary, structured around bounding risks, human accountability, technical controls and end-user responsibility, and recommends tracking "human override rates and response times" ([Baker McKenzie, June 2026](https://www.bakermckenzie.com/en/insight/publications/2026/06/singapore-imda-updates-model-ai-governance-framework-for-agentic-ai)).
- **India.** The IndiaAI Mission funds compute, datasets and models; Bhashini moved to a sovereign AI cloud on 9 February 2026; the "AI as the next DPI" narrative was prominent in July 2026; the Centre for Digital Public Infrastructure, the IndiaAI Mission and NeGD signed a tripartite agreement on 21 August 2026 ([cdpi.dev](https://cdpi.dev/)).
- **United States.** OMB memoranda M-25-21 and M-25-22 (3 April 2025) require Chief AI Officers and minimum practices for "high-impact AI"; the General Services Administration launched USAi on 14 August 2025 as a shared evaluation suite at no cost to agencies, with models from four providers ([GSA](https://www.gsa.gov/about-gsa/newsroom/news-releases/gsa-launches-usai-to-advance-white-house-americas-ai-action-plan-08142025)).
- **European Union.** The Apply AI Strategy (8 October 2025) targets eleven sectors including public administration ([Commission](https://digital-strategy.ec.europa.eu/en/library/commission-communication-apply-ai-strategy)).
- **Canada.** A federal AI register as a minimum viable product on 28 November 2025 and a Guide on the Use of Agentic Artificial Intelligence on 22 May 2026 ([Canada.ca](https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/responsible-use-ai/advancing-ai/progress.html)).
- **Brazil and Chile.** Brazil's AI Plan (2024 to 2028) was finalised in 2025 with up to R$23 billion and an axis on public services ([Softex](https://softex.br/publicada-a-versao-final-do-plano-nacional-de-inteligencia-artificial-pbia/)). Chile's Chamber approved a risk-based bill on 13 October 2025 and the government announced a replacement enabling framework in May 2026, not yet filed ([CeCo, 26 Aug 2026](https://centrocompetencia.com/chile-reescribe-su-ley-de-ia-del-modelo-europeo-a-una-ley-habilitante/)).
- **Multilaterals.** The OECD's "Governing with Artificial Intelligence" (18 September 2025) analysed 200 cases, 57 percent automation and about 60 percent still in pilot ([OECD](https://www.oecd.org/en/about/news/media-advisories/2025/09/oecd-to-launch-governing-with-artificial-intelligence-on-thursday-18-september.html)); the World Bank published "Public Institutions in the Age of AI" on 16 June 2026.
- **Cities.** Amsterdam's register now sits inside the Dutch national algorithm register, with 77 of 1,573 entries ([Algoritmeregister](https://algoritmes.overheid.nl/nl/organisatie/gemeente-amsterdam)); Helsinki lists nine systems; nine Eurocities members published a shared register schema on 19 January 2023; Boston's interim guidelines tell staff not to share sensitive data with generative tools.

### A2. Recurring patterns a small non-profit can copy

1. **Public registers of AI uses** (UK, Netherlands, Canada, Singapore, Estonia). Publish a register entry per AI feature and an agent manifest per MCP tool.
2. **Human control as a designed checkpoint** with override-rate metrics. A review queue with confidence thresholds for agentic ingestion.
3. **Sandboxes before production.** The dev, test and production ladder plus a documented evaluation set per model change.
4. **Model-provider rules and replaceability.** Declare provider, region and fallback per AI feature in configuration; the CDPI framework asks that "model provenance, hosting options, and replaceability conditions are declared in every block spec".
5. **Procurement clauses.** Ship a short AI clause annex that adopting cities can paste into procurement.
6. **Agent permissions.** Per-tool scopes and allow-lists, as Singapore and Estonia enforce.
7. **Consolidation risk.** The UK shut four pilots for commodity platforms. **Inference:** a platform must offer what a general chatbot cannot, namely trusted records, provenance and entitlements.

### A3. AI agents on top of DPI

Published thinking is young. The CDPI's DPI-AI Framework (2026) defines AI blocks as callable, auditable single capabilities, DPI workflows as orchestration with rules and oversight, and public agents as "not autonomous actors but accountable extensions of government capacity", asking that consent be "a callable, auditable function" ([CDPI](https://digitalpublicinfrastructure.ai/paper.php)). The same site assessed sixteen DPGs for MCP and API readiness in March 2026: **OpenFn was the only one with a native MCP interface**; MOSIP, OpenCRVS, DHIS2, X-Road and Sunbird RC were API-ready without it ([CDPI](https://digitalpublicinfrastructure.ai/dpgs.php)). GovStack 2.0.0 adds AI readiness only as machine-readable API contracts ([GovStack, 10 March 2026](https://govstack.global/news/govstack-2-0-0-core-specifications-are-live-heres-the-rollout-and-alignment-plan/)). Nobody has defined, as a DPI standard, how an agent authenticates to a building block; the closest artefacts are the MCP authorisation specification, an expired IETF draft on on-behalf-of authorisation for agents, Estonia's machine-identity pilot and X-Road 8's credential plans. **Inference:** OEF's OAuth server, client registry and MCP server already sit on the de-facto path; the gap is recording delegation chains and publishing agent manifests.

## Part B. DPI building-block models

| Model | What it is | How others build on it | Status 2026 |
|---|---|---|---|
| **GovStack** (ITU, DIAL, Estonia, GIZ, BMZ) | Building-block *specifications*: identity, consent, registration, digital registries, payments, messaging, workflow, information mediator, scheduler, e-signature, GIS | Map your API to a block spec and pass the test harness; "100% of required rules" for compliance and a marketplace listing | 2.0.0 core live 10 March 2026 with requirement classifiers; 20+ countries use the approach ([GovStack](https://govstack.global/news/govstack-2-0-0-core-specifications-are-live-heres-the-rollout-and-alignment-plan/)) |
| **DIGIT** (eGov Foundation, MIT) | Multi-tenant microservice core (users, access, workflow, localisation, files, signed audit, master data) unbundled from the Indian urban product; "central instance" serves many tenants | Configure master data and workflows; write modules on core APIs | Core 2.9 LTS (March 2024, five-year support); products for local governance, health campaigns, public finance, water; "DIGIT 3.0" **UNVERIFIED** ([DPG registry](https://www.digitalpublicgoods.net/r/digit)) |
| **Sunbird** (EkStep-seeded collective) | 20+ composable blocks; Sunbird RC builds registries and verifiable credentials from schema configuration | Schema-driven registries, telemetry pipeline | RC v2.1.0 (August 2026); used across all Indian states through DIKSHA ([rc.sunbird.org](https://rc.sunbird.org/)) |
| **X-Road** (NIIS, MIT) | Secure data exchange layer | Operate a Security Server registered with the central authority | 7.8.0 ended feature work; version 8 production December 2026; see [03-federation.md](03-federation.md) |
| **MOSIP** (IIIT Bangalore, MPL-2.0) | National identity platform with eSignet (OpenID Connect) and the Inji credential suite | Relying parties use eSignet; issuers use Inji Certify; vendors pass the compliance toolkit | 14 national rollouts across 31 country engagements ([mosip.io](https://www.mosip.io/)) |
| **OpenCRVS** (MPL-2.0) and **DHIS2** (BSD) | Domain DPGs with a core and a per-country configuration package (OpenCRVS) or an app platform and hub (DHIS2, 80+ countries) | Country configuration repository; app hub and plugin SDK | OpenCRVS 2.0 June 2026; DHIS2 v42 |
| **DPG Standard** (DPGA) | Nine indicators: SDG relevance, open licensing, clear ownership, platform independence, documentation, non-personal data extraction, privacy and law, open standards, do no harm by design | Self-nominate with evidence per indicator | v1.1.6 (September 2024) ([DPGA](https://www.digitalpublicgoods.net/standard)) |
| **UN Universal DPI Safeguards Framework** (ODET and UNDP) | 18 principles (nine foundational, nine operational) against 13 risks; an accelerator with 50-in-5 announced September 2025 | Lifecycle self-assessment and playbooks | Site refers to a version 2.0 (date **UNVERIFIED**) ([dpi-safeguards.org](https://www.dpi-safeguards.org/framework)) |

### Where the core matches, exceeds or lacks

| Model | Match | Exceed | Lack |
|---|---|---|---|
| GovStack | Catalogue and versioning approximate Digital Registries; OAuth approximates app-level identity | MCP server and agentic ingestion (no AI block yet) | Consent, workflow, information mediator and messaging blocks; machine-verifiable conformance |
| DIGIT | Tenancy with per-module entitlements; signed audit approximates versioning | MCP; generated SDKs | Configurable workflow engine; schema-driven master data service; module marketplace |
| Sunbird | Catalogue as registry | Agent interface | Credential issuance; telemetry block; schema-first registry configuration |
| X-Road | Signed webhooks give message integrity | — | Mutual authentication, time-stamping and non-repudiation across organisations; ecosystem governance |
| MOSIP | OAuth and MFA | Agent-facing API | Citizen identity provider role; credential issuance; conformance programme |
| OpenCRVS and DHIS2 | Entitlements, SDKs, webhooks | MCP and agentic flows | A documented domain configuration package; app marketplace and plugin SDK |
| DPG Standard | AGPL, clear ownership, Kubernetes portability, SDK extraction | Versioning supports the harm indicator | Registration status **UNVERIFIED**; written privacy and harm-mitigation evidence |
| DPI Safeguards | Transparency via versioned records | AI transparency could be built in | Published redress mechanism; privacy-by-design statement; evidence per principle |

**What "others can build on it" should mean, by leverage (Inference):** first, publish OpenAPI plus the generated SDKs as the primary contract, with semantic versioning and a conformance test third parties can run; second, define a domain configuration package (schemas, workflows, entitlements, catalogue sources) like OpenCRVS's country configuration, so a network or a domain onboards without forking; third, expose MCP tools with per-tool scopes and published manifests, which would make the core the first climate DPG with a native, governed agent interface; only then pursue GovStack or DPG listings, which are marketing and procurement assets rather than engineering ones.

## Claims on the v2 deck checked against sources (CLEARANCE)

- "Climate DPI, COP30, Belém, November 2025: a Climate DPG Collection of 20+ open-source tools offered to 30+ countries, led by Brazil's Ministry of Management and Innovation with the DPGA and ITS Rio; 'an operating system for climate action'." Substantially supported by a Plan to Accelerate Solutions published by the three organisations; the DPGA's "DPGs for Climate Action Collection" was formally launched on 17 April 2026 in Incheon, co-stewarded with the Climate Technology Centre and Network and the UNFCCC Technology Executive Committee ([DPGA, 24 April 2026](https://digitalpublicgoods.net/blog/launching-dpgs-for-climate-action-collection)). Suggested addition: "formally launched April 2026".
- "OPIN, February 2026, Brazil and India, 'the world's first global DPI for climate action'." The launch is confirmed in the India-Brazil joint statement of 21 February 2026 during the state visit, after the AI Impact Summit ([Embassy of India, Brasília](https://eoibrasilia.gov.in/pdf/India-Brazil%20Joint%20Statement%20-%20State%20Visit%20of%20President%20of%20Brazil%20to%20India%20-%2021%20February%202026-1%20(1).pdf)); the phrase "world's first" was not found in a primary source. The quote "transform fragmented data into actionable planetary intelligence" is confirmed.
- "UN Climate Change, Bonn, 17 June 2026." The first sentence is confirmed as Simon Stiell's at an event on AI and digital technologies during the June meetings; the second sentence about connecting national and international systems is a paraphrase in secondary coverage ([Mirage News](https://www.miragenews.com/un-climate-chief-digital-infra-key-to-climate-1695019/)).
- "The COP31 presidency's Antalya Pledge on AI." Confirmed: announced 21 September 2026 in New York with the ITU, on "how AI is designed, procured, powered, deployed, measured and managed in support of climate and sustainable development objectives" ([cop31.tr](https://cop31.tr/news-detail/cop31-presidency-launches-35-by-35-and-antalya-ai-pledges)).
- "MOSIP: 11 countries, 100 million+ registered." Out of date; use "14 national rollouts across 31 country engagements".
- "NIIS members: Estonia, Finland, Iceland." Add the associate members: Ukraine, Schleswig-Holstein, Québec, the Faroe Islands and Åland.

## Three open research questions

1. **Delegated agent authority on records.** Which credential pattern best preserves an auditable delegation chain when an agent ingests a document for a city officer: MCP-profiled OAuth with step-up scopes, the IETF actor-token draft, or Estonia-style machine identities with capability manifests? What minimum fields must a record carry to satisfy a transparency register entry and the safeguards framework's accountability principle?
2. **Conformance a non-profit can afford.** Can the existing OpenAPI pass the GovStack Digital Registries and Workflow harness without re-architecture, what does the evidence cost, and do partners' procurement teams value GovStack or DPG status enough to justify it?
3. **Human control thresholds for AI-produced official records.** What confidence routing, sampling and override-rate monitoring are proportionate when AI extraction feeds a city's reported figures, and how should "accountable extension, not autonomous actor" be encoded in entitlements and record versioning rather than policy documents alone?

## Sources

- Building the Agentic State in Estonia. Ilves and Velsberg, 24 Apr 2026. https://luukasilves.substack.com/p/building-the-agentic-state-in-estonia
- Bürokratt. RIA. https://www.kratid.ee/en/burokratt
- Bürokratt case study. Apolitical, 6 July 2026. https://apolitical.co/en/navigator/case-studies/burokratt-estonia-s-single-network-of-ai-assistants-replacing-dozens-of-separate-agency-chatbots
- Innovation and prototyping. Roadmap for Modern Digital Government. https://roadmap-for-modern-digital-government.campaign.gov.uk/ai/innovation-and-prototyping
- UK closes AI pilots. Global Government Forum, 5 May 2026. https://www.globalgovernmentforum.com/uk-closes-ai-pilots-amid-strategic-changes-to-prioritise-legacy-tech-overhaul/
- AI Playbook for the UK Government, 10 Feb 2025. https://gov.uk/government/publications/ai-playbook-for-the-uk-government/artificial-intelligence-playbook-for-the-uk-government-html
- Singapore first in Asia to deploy agentic AI on air-gapped cloud. GovInsider, 28 Aug 2025. https://govinsider.asia/intl-en/article/singapore-government-first-in-asia-to-deploy-agentic-ai-on-googles-air-gapped-cloud
- IMDA updates Model AI Governance Framework for Agentic AI. Baker McKenzie, June 2026. https://www.bakermckenzie.com/en/insight/publications/2026/06/singapore-imda-updates-model-ai-governance-framework-for-agentic-ai
- CDPI. https://cdpi.dev/
- GSA launches USAi, 14 Aug 2025. https://www.gsa.gov/about-gsa/newsroom/news-releases/gsa-launches-usai-to-advance-white-house-americas-ai-action-plan-08142025
- Apply AI Strategy. European Commission, 8 Oct 2025. https://digital-strategy.ec.europa.eu/en/library/commission-communication-apply-ai-strategy
- Progress on AI in government. Canada.ca. https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/responsible-use-ai/advancing-ai/progress.html
- PBIA final version. Softex. https://softex.br/publicada-a-versao-final-do-plano-nacional-de-inteligencia-artificial-pbia/
- Chile reescribe su ley de IA. CeCo, 26 Aug 2026. https://centrocompetencia.com/chile-reescribe-su-ley-de-ia-del-modelo-europeo-a-una-ley-habilitante/
- OECD to launch Governing with AI, Sept 2025. https://www.oecd.org/en/about/news/media-advisories/2025/09/oecd-to-launch-governing-with-artificial-intelligence-on-thursday-18-september.html
- Algoritmeregister, Gemeente Amsterdam. https://algoritmes.overheid.nl/nl/organisatie/gemeente-amsterdam
- DPI-AI Framework. CDPI, 2026. https://digitalpublicinfrastructure.ai/paper.php
- DPGs as AI blocks, MCP and API readiness. CDPI, March 2026. https://digitalpublicinfrastructure.ai/dpgs.php
- GovStack 2.0.0 core specifications, 10 March 2026. https://govstack.global/news/govstack-2-0-0-core-specifications-are-live-heres-the-rollout-and-alignment-plan/
- DIGIT. DPG registry. https://www.digitalpublicgoods.net/r/digit
- Sunbird RC. https://rc.sunbird.org/
- MOSIP. https://www.mosip.io/
- DPG Standard. https://www.digitalpublicgoods.net/standard
- Universal DPI Safeguards Framework. https://www.dpi-safeguards.org/framework
- Launching the DPGs for Climate Action Collection. DPGA, 24 Apr 2026. https://digitalpublicgoods.net/blog/launching-dpgs-for-climate-action-collection
- India-Brazil Joint Statement, 21 Feb 2026. https://eoibrasilia.gov.in/pdf/India-Brazil%20Joint%20Statement%20-%20State%20Visit%20of%20President%20of%20Brazil%20to%20India%20-%2021%20February%202026-1%20(1).pdf
- UN Climate Chief: digital infrastructure key to climate action. Mirage News, June 2026. https://www.miragenews.com/un-climate-chief-digital-infra-key-to-climate-1695019/
- COP31 Presidency launches 35-by-35 and Antalya AI Pledges, 21 Sept 2026. https://cop31.tr/news-detail/cop31-presidency-launches-35-by-35-and-antalya-ai-pledges
- NIIS. https://www.niis.org/
