# AI governance for agents acting on public data

Research note, 1 October 2026. **UNVERIFIED** marks items confirmed only through secondary sources; **Inference** marks reasoning beyond the sources. The EUR-Lex page for the Digital Omnibus on AI returned empty to the fetcher; its dates were cross-checked through three independent summaries plus the annotated article text.

## 1. Why an agent needs identity, scoped permissions, a delegation chain and an audit trail

An AI agent is software that reads data and takes actions (calls tools, edits records, drafts documents) on a person's or an organisation's behalf. Four things go wrong when it borrows a human's credentials instead of having its own.

1. **Over-broad access.** A human session token carries every permission that person has. An agent needs a slice: one city, one record type, read or write. The Model Context Protocol (MCP) security guidance calls this "scope inflation" and prescribes minimal initial scopes with step-up elevation ([MCP security best practices, 28 July 2026](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)).
2. **Untraceable changes.** If the agent writes as "user X", the log cannot separate what X did from what the agent did for X. OAuth Token Exchange defines delegation precisely so both stay visible: the token names the actor and the person it represents ([RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html)).
3. **Prompt injection through documents.** The document ingestion flow reads PDFs. Text inside a PDF can contain instructions the model follows. OWASP ranks goal hijack via malicious content in external inputs as the top agentic risk ([OWASP Top 10 for Agentic Applications, 9 Dec 2025](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)).
4. **Leakage to model providers.** Every prompt sent to a hosted model leaves the city's boundary; default retention is 30 days at the main providers unless zero-retention terms apply.

**What exists today.** The MCP server exposes six tools behind the platform's own tokens, with no agent identity, no per-tool scopes beyond `read` and `write`, and no tests ([app/src/lib/mcp/](../../../app/src/lib/mcp/)). The agentic document flow in the Climate Advisor service has typed capability definitions with flags such as `requiresConfirmation` and `writesCommittedProductData`, but three parallel definitions and no shared registry ([app/src/backend/agentic/](../../../app/src/backend/agentic/)). There is no general audit log. The 1 October London session recorded that no chatbot or generative synthesis ships at the MVP, that AI search is deferred to COP32, and that cities may opt out of AI or bring their own model key; the agentic ingestion flow remains in scope as the interpretation engine.

## 2. Agents as principals: what is ready and what is draft

| Item | What it is | Status, date |
|---|---|---|
| OAuth 2.0 Token Exchange, RFC 8693 | Delegation with an `act` claim naming the agent | Ready, January 2020 |
| GNAP, RFC 9635 and 9767 | An IETF delegation protocol that is not an OAuth extension | Ready as RFCs (Oct 2024, Apr 2025); **Inference:** negligible adoption in the agent ecosystem; MCP chose OAuth 2.1 |
| Protected Resource Metadata, RFC 9728 | How a client discovers which authorisation server protects an API | Ready, April 2025 |
| MCP authorisation, revision 2026-07-28 | Stateless protocol; issuer validation; dynamic client registration deprecated in favour of client metadata documents; credentials bound to the issuing server; OpenTelemetry trace context in tool calls ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) | Ready, 28 July 2026 |
| Enterprise-managed authorisation (MCP SEP-990) | An enterprise identity provider issues an identity-assertion grant so an MCP client gets tokens under administrator policy | Stable in the MCP extension registry; the underlying IETF draft is at revision 04, 21 May 2026 ([ext-auth](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/stable/enterprise-managed-authorization.mdx)) |
| Workload identity (IETF WIMSE, SPIFFE) | Identities for non-human workloads | WIMSE drafts only; SPIFFE graduated in the CNCF in 2022 |
| OpenID AuthZEN 1.0 | A standard request and response between the point that enforces a policy and the point that decides it | Final, 12 January 2026 ([OIDF](https://openid.net/authorization-api-1-0-final-specification-approved/)); an MCP profile is a working-group draft (June 2026) |
| Microsoft Entra Agent ID | Agent identities with sponsors, conditional access and lifecycle | Generally available April 2026 |
| Google Agent2Agent 1.0 | Agent-to-agent protocol under the Linux Foundation; security schemes per agent card; **no delegation semantics** | v1.0, 2026 ([spec](https://a2a-protocol.org/latest/specification/)) |
| AWS Bedrock AgentCore Identity | Per-runtime workload identity with a token vault and a managed consent portal | GA 13 October 2025 |
| Anthropic and OpenAI guidance | Read-only by default, approval before side effects, classifiers against injection; experienced users shift from per-action approval to monitoring with interrupts | Guidance, 2025 to 2026 ([Anthropic, 18 Feb 2026](https://www.anthropic.com/research/measuring-agent-autonomy)) |
| NIST AI Agent Standards Initiative | Industry standards, open protocols, research on agent identity | Launched 17 February 2026; no final guidance ([NIST](https://www.nist.gov/caisi/ai-agent-standards-initiative)) |

**The "agent registry" is three different things.** The official MCP registry is a public catalogue of servers, in preview and not for private servers; enterprise registries such as Microsoft's; and a W3C community group launched 24 April 2026 to specify verifiable agent identity registries with decentralised identifiers ([W3C](https://www.w3.org/community/agent-identity/2026/04/24/call-for-participation-in-agent-identity-registry-protocol-community-group/)). None records "which model and which tools" for a tenant-scoped agent; that record has to be the platform's own. Estonia and Singapore are the governments furthest along, with agent registries that issue machine identities, capability manifests and kill switches ([Ilves and Velsberg, 24 Apr 2026](https://luukasilves.substack.com/p/building-the-agentic-state-in-estonia); see [06-govtech-ai-and-dpi.md](06-govtech-ai-and-dpi.md)).

## 3. Audit trails and provenance of AI-produced records

- **W3C PROV-O** (2013) is the stable vocabulary: entity, activity, agent, with "was generated by", "was attributed to", "was derived from" and "acted on behalf of", the delegation link ([PROV-O](https://www.w3.org/TR/prov-o/)). It maps directly onto "this concept note was generated by run 123 by agent CNB-v3 acting on behalf of user Y, derived from document Z".
- **C2PA 2.4** (April 2026) content credentials now support PDF, HTML and structured text and add an AI-disclosure assertion ([C2PA](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html)). **Inference:** it fits an exported document, not a database row; for structured records use PROV-O fields plus a detached signature.
- **OpenTelemetry GenAI semantic conventions** define spans for inference, agent invocation and tool execution, with model and token attributes; everything is still in "development" status after moving to a dedicated repository in June 2026 ([repo](https://github.com/open-telemetry/semantic-conventions-genai)). MCP now standardises trace propagation in tool calls, so tool calls can join the same trace.
- **Labelling obligations.** EU AI Act Article 50 applies from 2 August 2026: providers mark outputs in machine-readable form, and deployers must disclose AI-generated text "informing the public on matters of public interest, unless the publication has undergone a process of human review and is subject to editorial responsibility" ([Commission guidelines](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations); [Code of Practice, final 10 June 2026](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)). **Inference:** a note drafted by AI, then reviewed and signed by a city official, follows the editorial-responsibility path; that path should be designed in, not assumed.
- **Logs as records.** For high-risk systems the Act requires deployers to keep automatically generated logs for at least six months. **Inference:** even where the platform is not high-risk, treating agent logs as official records with a retention schedule is the cheapest defensible posture.
- **Reproducibility.** Record the model identifier and version, the system prompt hash, the retrieval set, the tool-call sequence and parameters. Hosted models change silently, so the record proves what was sent, not that the output can be regenerated.

## 4. Regulation that applies to a reporting system used by public bodies

- **EU AI Act timeline as of 1 October 2026.** The Digital Omnibus on AI, Regulation (EU) 2026/1744, was published 24 July 2026 and moved Annex III high-risk obligations from 2 August 2026 to **2 December 2027**, softened the AI literacy duty, and added AI Office powers ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng); [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)). Article 50 was not deferred except a marking grace period to 2 December 2026 for systems already on the market.
- **Is a municipal climate reporting and planning assistant high-risk?** Annex III point 5(a) covers systems used by public authorities "to evaluate the eligibility of natural persons for essential public assistance benefits and services" ([Annex III](https://artificialintelligenceact.eu/annex/3/)). **Inference:** inventories, risk assessments, action prioritisation and concept notes do not evaluate natural persons' eligibility, so the current features are minimal-risk with limited-risk transparency duties. Two caveats: the Commission's classification guidelines are still a draft (19 May 2026), and a future feature scoring households or neighbourhoods for adaptation assistance could cross into 5(a), triggering deployer duties and a fundamental rights impact assessment for public bodies from December 2027.
- **Council of Europe Framework Convention on AI.** The EU ratified on 15 May 2026 as the first party; not yet in force ([Law and Technology, 27 July 2026](https://lawandtechnology.eu/en/council-of-europe-framework-convention-artificial-intelligence-eu-ratification-en/)).
- **NIST** AI RMF 1.0 and the Generative AI Profile remain the reference; agent-specific guidance is pending. **ISO/IEC 42001** is the certifiable management system; **ISO/IEC 42005:2025** is the impact-assessment guidance and **Inference** the practical template for a per-tenant assessment.
- **UK Algorithmic Transparency Recording Standard** is mandatory for central departments, 59 records by May 2025 ([GOV.UK](https://dataingovernment.blog.gov.uk/2025/05/08/making-the-algorithmic-transparency-recording-standard-atrs-mandatory-across-government/)). **Inference:** an ATRS-shaped public record per AI feature is a cheap, recognised transparency artefact OEF can publish for every instance.
- **United States.** OMB memoranda M-25-21 and M-25-22 (3 April 2025) govern federal use and procurement; US cities remain governed by state and local rules, so the memos matter as templates only.
- **Brazil** PL 2338/2023 is still awaiting the rapporteur's opinion in the Chamber; the vote is expected after the October 2026 elections ([Congresso Nacional](https://www.congressonacional.leg.br/en/materias/materias-bicamerais/-/ver/pl-2338-2023)). **Chile**'s risk-tiered bill passed the Chamber in October 2025; on 18 May 2026 the Science Minister announced a replacement enabling framework, not yet filed as of late August ([CeCo, 26 Aug 2026](https://centrocompetencia.com/chile-reescribe-su-ley-de-ia-del-modelo-europeo-a-una-ley-habilitante/)). **Inference:** design to the stricter version.
- **OECD** "Governing with Artificial Intelligence" (2025) analyses 200 public-sector cases; neither it nor UNESCO's work creates obligations, but both frame what funders expect ([OECD](https://www.oecd.org/en/publications/2025/06/governing-with-artificial-intelligence_398fa287.html)).

## 5. What "no training on city data" needs to look like

**Provider terms, verified text.**
- Anthropic Commercial Terms (17 June 2025): "Anthropic may not train models on Customer Content from Services"; default API retention 30 days; zero data retention by application. Newer covered models require retention for safety review; on AWS Bedrock they are unavailable unless the account sets a review mode under which prompts stay inside AWS for up to 30 days ([The Register, 2 Sept 2026](https://www.theregister.com/ai-and-ml/2026/09/02/anthropic-promises-zero-data-retention-but-customers-must-check-it-worked/5293789); [Bedrock retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html)).
- OpenAI API: not used for training since March 2023 unless opted in; abuse logs up to 30 days; zero data retention per endpoint; data residency including Europe ([OpenAI](https://developers.openai.com/api/docs/guides/your-data)).
- Google Gemini API terms (23 March 2026): paid services are not used to improve products; unpaid services are ([terms](https://ai.google.dev/gemini-api/terms)).
- AWS Bedrock: model providers have no access to prompts or completions; the retention mode is set per account and can be forced organisation-wide with a service control policy ([Bedrock data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)). **Inference:** for deployments in C40's or OEF's AWS accounts this is the simplest path to a provable "no provider access" posture.

**Architectural controls, Inference.** No fine-tuning pipeline that reads tenant data; retention limits on prompts and outputs in the platform's own database; redaction of personal data before any external call; a per-tenant opt-in per AI feature (already a London decision); a tenant-selectable model route (hosted with zero retention, cloud-hosted in region, or self-hosted open-weights); confidential computing where a tenant demands it. What can be proven: which endpoint and region were called, which retention mode the account is in, that redaction ran, that no training job exists in OEF's infrastructure, and, with confidential computing, a hardware attestation of the inference environment. What is contractual only: that the provider's 30-day safety logs are deleted and never used for training. Zero retention must be verified by the customer, not assumed.

**Data processing terms should state** purpose limitation per feature; sub-processors with retention mode per tenant; a no-training clause mirroring the provider's; retention periods for prompts, outputs and agent logs; the redaction standard; the tenant's right to select or self-host the model; incident notification; audit-log access for the city; and which assurances are technically verified versus contractual.

## 6. What it means for the core's AI integration layer

1. **Agent identity record.** One row per agent deployment: a stable identifier, owner tenant, sponsor (the accountable human, as in Microsoft's model), model provider and version pin, system prompt hash, allowed tool list, retention mode, created and revoked timestamps. Each agent is an OAuth client of its own; never a user's client.
2. **Scopes tied to tenancy and record type**, with step-up for writes, and server-side checks regardless of token claims.
3. **Delegation tokens.** RFC 8693 delegation so agent tokens carry the user as subject and the agent as actor; audience binding on every token; no token passthrough, which MCP forbids. Later, accept identity-assertion grants from a tenant's identity provider.
4. **Tool-call audit log**, append-only and hash-chained: trace and span identifiers, agent, actor chain, tenant, tool, argument hash, result hash, model, token counts, approval decision and approver, timestamp, with OpenTelemetry attribute names so traces and audit share a vocabulary.
5. **Provenance fields on records** created or modified by an agent: generated by run, attributed to agent, on behalf of user, derived from (document and chunk identifiers), plus human reviewed by and editorial responsibility assumed at, to support the Article 50 path.
6. **Document ingestion as a reusable flow.** Upload, OCR, chunk, classify sensitivity, store with a consent scope; embed only after consent; treat every extracted string as untrusted input.
7. **Prompt-injection defences.** Separate document content from instructions in the prompt structure; constrain outputs with schemas; classify documents before use; require approval for any write triggered during a document-grounded run.
8. **Kill switches, rate limits and cost accounting** per agent and per tenant.

## 7. Adopt now, design for, watch

**Adopt now.** Separate agent client identities with tenant-scoped scopes and audience binding, the cheapest fix for the largest blast radius and required by the current MCP revision; the audit log and provenance fields; retention mode and no-training posture documented per provider and enforced where the cloud allows; the per-tenant opt-in; the Article 50 path (chatbot disclosure in the advisor, human review and sign-off for generated documents, an ATRS-style public record per feature); approval gates on writes and on document-grounded runs; kill switch and budgets.

**Design for.** Identity-assertion grants from tenant identity providers; an AuthZEN-shaped decision interface so the policy engine can be swapped; C2PA signing of exported documents; export of the agent record to the W3C and IETF registry formats when they settle.

**Watch.** Confidential inference, only for a tenant that demands it; full ISO/IEC 42001 certification, only if a funder or procurement requires it; use 42005 impact assessments now as the lighter step.

## 8. Three open research questions

1. **Delegation depth and revocation across hops.** RFC 8693 gives a two-party actor chain; Agent2Agent has none. When the platform's agent calls a partner's agent, what is the correct token shape, how is revocation propagated, and can a city audit a three-hop chain end to end?
2. **Provenance that survives model drift.** What minimal record lets a third party confirm after two years that a published figure came from the stated inputs, and can that record be signed without exposing sensitive documents?
3. **Measurable prompt-injection resistance for scanned municipal documents.** Public-sector PDFs are long, multilingual and often scanned; no benchmark covers injection via OCR noise and layout tricks. Building one would show whether classifier defences or structural separation actually hold.

## Sources

- MCP Security Best Practices, 28 July 2026. https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices
- MCP changelog 2026-07-28. https://modelcontextprotocol.io/specification/2026-07-28/changelog
- MCP ext-auth, Enterprise-Managed Authorization. https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/stable/enterprise-managed-authorization.mdx
- RFC 8693 OAuth 2.0 Token Exchange. https://www.rfc-editor.org/rfc/rfc8693.html
- RFC 9728 Protected Resource Metadata. https://www.rfc-editor.org/rfc/rfc9728.html
- OWASP Top 10 for Agentic Applications 2026, 9 Dec 2025. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- AuthZEN Authorization API 1.0 Final, 12 Jan 2026. https://openid.net/authorization-api-1-0-final-specification-approved/
- A2A Protocol Specification v1.0. https://a2a-protocol.org/latest/specification/
- Measuring AI agent autonomy in practice. Anthropic, 18 Feb 2026. https://www.anthropic.com/research/measuring-agent-autonomy
- NIST AI Agent Standards Initiative, 17 Feb 2026. https://www.nist.gov/caisi/ai-agent-standards-initiative
- Agent Identity Registry Protocol Community Group. W3C, 24 Apr 2026. https://www.w3.org/community/agent-identity/2026/04/24/call-for-participation-in-agent-identity-registry-protocol-community-group/
- Building the Agentic State in Estonia. Ilves and Velsberg, 24 Apr 2026. https://luukasilves.substack.com/p/building-the-agentic-state-in-estonia
- PROV-O. W3C, 30 Apr 2013. https://www.w3.org/TR/prov-o/
- C2PA Technical Specification 2.4, Apr 2026. https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html
- OpenTelemetry GenAI semantic conventions. https://github.com/open-telemetry/semantic-conventions-genai
- Guidelines on transparency obligations (Art. 50). European Commission. https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations
- Code of Practice on AI-generated content, final 10 June 2026. https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- Regulation (EU) 2026/1744, Digital Omnibus on AI. https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng
- EU AI Act Omnibus agreement. Gibson Dunn. https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/
- EU AI Act Annex III. https://artificialintelligenceact.eu/annex/3/
- Draft guidelines on classification of high-risk AI systems, 19 May 2026. https://digital-strategy.ec.europa.eu/en/library/draft-commission-guidelines-classification-high-risk-ai-systems
- Council of Europe Framework Convention on AI and the EU's ratification, 27 July 2026. https://lawandtechnology.eu/en/council-of-europe-framework-convention-artificial-intelligence-eu-ratification-en/
- Making ATRS mandatory. GOV.UK, 8 May 2025. https://dataingovernment.blog.gov.uk/2025/05/08/making-the-algorithmic-transparency-recording-standard-atrs-mandatory-across-government/
- PL 2338/2023. Congresso Nacional. https://www.congressonacional.leg.br/en/materias/materias-bicamerais/-/ver/pl-2338-2023
- Chile reescribe su ley de IA. CeCo, 26 Aug 2026. https://centrocompetencia.com/chile-reescribe-su-ley-de-ia-del-modelo-europeo-a-una-ley-habilitante/
- Governing with Artificial Intelligence. OECD, June 2025. https://www.oecd.org/en/publications/2025/06/governing-with-artificial-intelligence_398fa287.html
- Anthropic Commercial Terms, 17 June 2025. https://www.anthropic.com/legal/commercial-terms
- Anthropic promises zero data retention, but customers must check. The Register, 2 Sept 2026. https://www.theregister.com/ai-and-ml/2026/09/02/anthropic-promises-zero-data-retention-but-customers-must-check-it-worked/5293789
- OpenAI API data controls. https://developers.openai.com/api/docs/guides/your-data
- Gemini API Additional Terms, 23 Mar 2026. https://ai.google.dev/gemini-api/terms
- Amazon Bedrock data protection and retention. https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html
- ISO/IEC 42001:2023. https://www.iso.org/standard/42001
- ISO/IEC 42005:2025. https://webstore.iec.ch/en/publication/107659
