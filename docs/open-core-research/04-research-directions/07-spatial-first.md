# Spatial-first architecture: governments as bounded spaces with rules

Research note, 1 October 2026. **UNVERIFIED** marks items not confirmed against a primary source; **Inference** marks reasoning beyond the sources.

## 1. What this is, in plain terms

**Spatial-first** means the platform's root entity is not an organisation record keyed by a code but a *place*: a bounded area in two dimensions, or a volume in three, with a validity period, an authority and a set of rules. Records, datasets, users, agents and policies attach to places. "Which government does this belong to?" becomes a geometry question: which spaces contain this point, this parcel, this sensor, at this date?

**A spatial web** extends the web's addressing model, documents at addresses, to physical and virtual spaces, so that a space can be addressed, described and governed by machine-readable rules, and software agents can ask "what is here, and what am I allowed to do here?" IEEE 2874-2025 uses the term formally; the broader usage is older marketing language and is hype-prone (section 6).

**Why a graph, not a tree.** A tree assumes each place has exactly one parent. Real jurisdictions violate this constantly: a river basin authority crosses several municipalities; a utility's service area ignores district lines; a protected area straddles two provinces; a metropolitan transport body covers twenty cities; a building parcel is owned by one party, regulated by a city and overflown by a national airspace rule. The same place has many "parents" of different kinds (contains, governs, services, protects), each edge with its own validity period and authority. That is a directed graph with typed, dated edges.

**Policy bound to geometry** means a rule is attached to a space rather than to an organisation or a user, and is evaluated by a spatial test before it applies: "diesel vehicles may not enter this polygon between 07:00 and 19:00"; "drones may not fly in this volume below 120 m"; "personal data of residents of this region must be stored inside this region"; "buildings in this zone may not exceed 25 m".

**What exists today.** One polygon per city, stored in a column the migration declares as text, in the warehouse ([global-api/migrations/versions/d84e47e54741_…](../../../global-api/migrations/versions/)); one spatial predicate in the entire repository, a point-in-polygon lookup ([city_boundaries_endpoint.py:97](../../../global-api/routes/legacy/city_boundaries_endpoint.py)); area computed in two different projections, one of them valid only for the contiguous United States; every dataset joined by identifier, not by geometry; the grid crosswalks that once joined gridded emissions to cities dropped; hierarchy held as flat country and region attributes; no validity dates on boundaries; no 3D, no building data; no graph or ontology tooling anywhere; geospatial Python libraries declared but never imported. The app's `City.shape` field accepts only a GeoJSON point ([app/src/util/validation.ts](../../../app/src/util/validation.ts)). In short, the core is not spatial today.

## 2. Standards and reference implementations

### 2.1 The Spatial Web: IEEE 2874-2025

The IEEE Standard for Spatial Web Protocol, Architecture and Governance was approved on 29 May 2025 after about five years of working-group development. It defines a reference model plus the Hyperspace Modeling Language (a vocabulary for people, places, things, agents and their rules) and the Hyperspace Transaction Protocol (which encodes permissions and policies into interactions) ([IEEE SA](https://standards.ieee.org/ieee/2874/11717/); [Spatial Web Foundation, 3 June 2025](https://spatialwebfoundation.org/spatial-web-foundation-announces-ieee-approval-of-spatial-web-standard/)). The Foundation states that the implementation standards and reference implementations are "under development" ([SWF FAQ](https://spatialwebfoundation.org/swf/faq/)); VERSES AI describes itself as the first company applying the standard and the primary contributor of staff ([VERSES](https://www.verses.ai/blog/blogs/spatial-web-standards-approval)). No published schema, open-source reference implementation, conformance suite or government deployment was found (**UNVERIFIED** that none exist). An independent March 2026 review calls it "technically serious" while noting structural limits ([constable.blog](https://constable.blog/2026/03/13/spatial-web/)). **Inference:** treat IEEE 2874 as a vocabulary and governance reference to align terminology with (space, agent, activity, credential, policy), not as a dependency. Everything it describes can be built today on OGC, W3C and ETSI standards that have running code.

### 2.2 The OGC and ISO base

| Standard | What it does | Status |
|---|---|---|
| OGC API Features, Tiles, Processes | REST and JSON access to features with bounding-box and time filters; tiles; server-side processes | Approved 2022, 2022, 2021; implemented by pygeoapi, GeoServer, QGIS |
| GeoSPARQL 1.1 | Spatial vocabulary and functions for graph queries | January 2024; Apache Jena (partial 1.1), GraphDB plugin, KnowWhereGraph |
| JSON-FG 1.0 | GeoJSON extensions for other coordinate systems, time and solids | Approved 25 August 2025, published 30 April 2026 ([OGC](https://docs.ogc.org/is/21-045r1/21-045r1.html)); the right exchange format for dated 3D features |
| CityGML 3.0 and CityJSON 2.0 | Semantic 3D city models with extension mechanism and, in 3.0, versioning and dynamic data; a compact JSON encoding | Encoding approved 10 May 2023; CityJSON an OGC community standard since November 2023; used by Helsinki, Rotterdam, German states |
| OGC 3D Tiles 1.1 | Streaming large 3D tilesets | Community standard, December 2022; Cesium, Google |
| OGC API Discrete Global Grid Systems, Part 1 | A web API for data by grid zone (hexagons or squares) at a resolution and time | Approved 24 October 2025 ([OGC](https://www.ogc.org/announcement/ogc-membership-approves-ogc-api-discrete-global-grid-systems-part-1-core-as-an-official-ogc-standard/)); H3, S2, rHEALPix |
| ISO 19152 LADM edition II | Land administration: parties, rights, restrictions and responsibilities, spatial units, 3D parcels; part 5 on spatial plan information | Part 1 published January 2024, parts 2 to 5 through 2025 ([FIG, June 2025](https://www.fig.net/figfoundation/images/LADM_Progress_Report__June_2025.pdf)); the closest formal ISO model of "policy bound to geometry" |
| INSPIRE Administrative Units | The EU harmonised schema for administrative units with nesting and shared "condominium" units | Technical guidelines v3.0.1 ([INSPIRE](https://knowledge-base.inspire.ec.europa.eu/publications/inspire-data-specification-administrative-units-technical-guidelines_en)) |
| W3C and OGC Spatial Data on the Web Best Practices | Persistent identifiers for spatial things, link to geometry, expose via APIs, version | 2017; design reference |
| GeoDCAT-AP 3.0 | Metadata profile for geospatial datasets | 9 July 2024 |

### 2.3 Boundary registries and identifiers

- **UN Second Administrative Level Boundaries** collects boundaries from national mapping agencies and codes historic changes since 1990 and 2000; the only global source with an authoritative change history ([SALB](https://salb.un.org/)).
- **geoBoundaries** (CC BY 4.0, v6, September 2023) has the best open agreement with SALB at the second level; GADM restricts commercial use.
- **OpenStreetMap** administrative relations carry no temporal validity; OpenHistoricalMap adds start and end dates.
- **Overture Maps Divisions**: a conflation of OSM and geoBoundaries under ODbL; twelve subtypes from country to neighbourhood; `admin_level` added February 2026; the 23 September 2026 release holds 4,688,229 divisions with stable 128-bit identifiers and roughly one percent monthly churn ([Overture](https://docs.overturemaps.org/guides/divisions/); [release notes](https://docs.overturemaps.org/blog/2026/09/23/release-notes/)). Disputed territory is modelled "from a given political perspective"; there is no temporal validity on features, only monthly snapshots.
- **Wikidata**'s "located in the administrative territorial entity" property accepts start time, end time and "statement disputed by" qualifiers, so Wikidata is already a temporal jurisdiction graph, uneven in coverage ([P131](https://www.wikidata.org/wiki/Property:P131)).
- **UN/LOCODE** is a point gazetteer for transport nodes with no boundaries and no change history. **Inference:** a reasonable external key for a city, not a jurisdiction identifier; districts, basins and utilities have no LOCODE.
- **Who's On First** uses extended date formats for inception, cessation and supersession, the cleanest open model of place lifecycle ([WOF](https://www.whosonfirst.org/docs/dates/)).
- **National cadastres.** Estonia's address data system gives every address, parcel, building and geometry a unique identifier served over X-Road; India's ULPIN is a 14-digit parcel identifier derived from coordinates; Brazil's SINTER links the rural environmental registry and the property registry. All show that a parcel identifier is the atomic unit of land governance and that registry integration, not geometry, is the hard part.
- **3D.** No global registry models floors, airspace or subsurface; the relevant standards are LADM edition II, CityGML 3.0 storeys and the drone "U-space" geographical zones.

### 2.4 Geospatial knowledge graphs and graph logic

- **KnowWhereGraph**, one of the largest public geo-knowledge graphs, represents every region as a set of S2 cells at level 13 so that "what is inside" becomes cell-set intersection rather than polygon geometry ([arXiv 2502.13874](https://arxiv.org/abs/2502.13874v2)). **Inference:** the most directly reusable design for a jurisdiction graph.
- **Property graphs.** Neo4j has native points but no polygons; Apache AGE adds graph queries to PostgreSQL so one database can hold both PostGIS geometry and a graph ([AGE](https://age.apache.org/overview/)).
- **NGSI-LD** (ETSI, v1.9.1, July 2025) has entities, properties, relationships and geo-properties with a built-in geoquery, used by FIWARE and the EU local digital twin work ([ETSI](https://cim.etsi.org/NGSI-LD/official/front-page.html)). **Inference:** the pragmatic middle ground between a full RDF graph and a relational schema.
- **Ontologies.** schema.org AdministrativeArea, the GeoNames ontology, the EU Core Location Vocabulary 2.1 (February 2024). None models *authority*; LADM's rights, restrictions and responsibilities is the closest formal construct.

### 2.5 Policy bound to geometry

- **ODRL 2.2** has spatial constraint operands, but a February 2026 paper shows that coordinate constraints are ambiguous because every ODRL constraint compares a single scalar; it proposes a spatial axis profile ([arXiv 2602.19878](https://arxiv.org/pdf/2602.19878)). A W3C Digital Policy working group charter is in draft.
- **GeoXACML 3.0** (OGC, August 2023) extends the XACML policy language with geometry types and spatial functions; an open-source implementation exists on AuthzForce ([OGC](https://docs.ogc.org/is/22-049r1/22-049r1.html)). It is the only standardised spatial policy engine.
- **Open Policy Agent and Cedar** have no built-in geometry; geofencing is done by pre-computing region tags or cell identifiers. **Inference:** the practical pattern is to resolve a location to jurisdictions or grid cells in the spatial layer, then pass identifiers to a conventional policy engine.
- **Regulation already does this.** Drone geographical zones under Regulation (EU) 2021/664 with the EUROCAE data model; low-emission zones digitised in DATEX II with over 500 regulations; data residency as a geographic constraint on where records live.
- **Digital twins.** The EU Local Digital Twin Toolbox launched in Valencia on 16 and 17 June 2026 with eleven tools and six AI models, moving to "European public infrastructure" under the LDT CitiVERSE consortium ([LDT CitiVERSE EDIC](https://ldtcitiverse-edic.eu/eu-ldt-toolbox-launch-box/)); Destination Earth enters its third phase from June 2026.
- **Building-level rules.** The CHEK project chains BIM design files, information requirements and CityGML city context for automated building-permit checks ([Zenodo](https://zenodo.org/records/18374246)).

### 2.6 AI and spatial

Benchmarks of language models on multi-step geospatial tool use (GeoBenchX, 2025; GeoAnalystBench, September 2025) show tool-calling agents are usable but error-prone ([arXiv 2503.18129](https://arxiv.org/abs/2503.18129v2)). **Inference:** "agents constrained by jurisdiction" is not a model capability; it is an enforcement layer where the agent's tool calls are intercepted and checked against the space the agent is authorised for. Earth observation as evidence is served by geometry: Copernicus held about 80 petabytes online in 2024, Google Earth Engine exceeds 80 petabytes, Microsoft's Planetary Computer Pro is in preview; all serve through STAC catalogues, so a jurisdiction geometry is the natural query key. OPIN, the Open Planetary Intelligence Network, was launched by Brazil and India on 21 February 2026 and framed as DPI for climate implementation; no technical architecture document was found, so its spatial model is **UNVERIFIED**.

## 3. Primitives for a spatial-first core

| Primitive | What it is | Tier | Cost | Build or integrate |
|---|---|---|---|---|
| Place or Jurisdiction entity with geometry versions and validity (valid from, valid to, superseded by) | Replaces "city keyed on LOCODE" as root; LOCODE becomes one crosswalk | Adopt now | Medium: schema plus migration of existing cities; JSON-FG for exchange | Build the table; borrow the model from INSPIRE, LADM part 1 and Who's On First |
| Containment and authority graph with typed, dated edges (contains, governs, services, protects, overlaps) | The nested and overlapping layer | Adopt now as a relational edge table; graph engine later | Low to start; Apache AGE or Neo4j only if traversal depth grows | Build; no RDF store yet |
| Identifiers and crosswalks | Internal identifier plus UN/LOCODE, ISO 3166-2, Overture GERS, Wikidata, OSM relation, cadastre identifier | Adopt now | Low | Integrate Overture Divisions as bootstrap geometry, Wikidata for names and history |
| Spatial index for "what is inside" | PostGIS indexes plus a grid cell set per place (H3 via `h3-pg`, or S2 as KnowWhereGraph) | Adopt now | Low; extensions exist | Integrate |
| Policy objects attached to spaces | Rule records with ODRL-style action, target, constraint, validity and authority, evaluated after spatial resolution | Design for: schema now, engine later | Medium | ODRL vocabulary; GeoXACML only if true geometric predicates in policy are needed |
| Georeferenced events and records | Every record, dataset, document and agent action carries a place identifier and optionally a point or cell | Adopt now | Low to medium; touches many tables | Build |
| 3D readiness | Allow 3D multipolygons and height bands; reserve a volume type; no buildings yet | Design for | Low now | Integrate CityJSON and 3D Tiles when a use case appears |
| APIs | OGC API Features for places and boundaries; later a GeoSPARQL or NGSI-LD endpoint for the graph | Adopt Features now | Medium; pygeoapi fronts PostGIS with little code | Integrate pygeoapi or GeoServer |

**Inference on sequencing.** The single highest-leverage step is the place entity plus the edge table plus crosswalks, because every later capability (policy, agents, 3D, Earth-observation evidence) keys on it, and because it fixes the current single-parent, single-code assumption without forcing a graph database. A ticket worth opening now: the area calculation's projection.

## 4. Real deployments

- **Singapore.** Virtual Singapore (SGD 73 million) built on the national 3D map; OneMap3D launched 15 September 2021 as the public interface. Right: one authoritative base map and identifier system shared across agencies. Wrong (**Inference**): the flagship model stayed largely closed, so the open value accrued to OneMap.
- **Helsinki.** Semantic CityGML and reality-mesh models, both CC BY 4.0, enabling energy, solar and noise analyses; still CityGML 2.0, so no native versioning.
- **Rotterdam.** Open Urban Platform live 15 January 2025 after a programme of about EUR 9 million, explicitly built on open standards; platform first, application second.
- **Zurich.** City 3D model of about 50,000 buildings released under CC0.
- **Estonia.** X-Road connects cadastre, land register and address system without centralising data; stable identifiers plus federated exchange, which is the pattern an open core should copy.
- **UN-GGIM Integrated Geospatial Information Framework.** Adopted 2018; implementation guide 2020 after consultation with 730 experts from 133 countries; nine strategic pathways. A national-level framework, not software, but the vocabulary ministries expect ([UN-GGIM](https://ggim.un.org/UN-IGIF/part2.cshtml)).

## 5. Three open research questions

1. **Temporal containment at scale.** Given authoritative boundary histories and monthly Overture snapshots, what is the cheapest representation that answers "which jurisdictions contained this point on date D" correctly, and how should a record keyed to a superseded place be re-attributed on split, merge or rename without losing provenance? No open boundary dataset exposes validity intervals on features.
2. **Policy evaluation across overlapping authorities.** When a space is covered by several authorities with partly contradictory rules, what conflict-resolution semantics should the policy layer implement, and can ODRL's proposed spatial profile or GeoXACML express precedence by authority type?
3. **Agent jurisdiction enforcement.** Can an interception layer that resolves every agent tool call to a place or cell set and checks it against the agent's credential measurably reduce out-of-jurisdiction actions, and how should that be benchmarked?

## 6. Speculative versus standardised

- **Standardised with running code:** OGC APIs, GeoSPARQL 1.1, CityGML 3.0, CityJSON 2.0, 3D Tiles 1.1, OGC API DGGS, JSON-FG, LADM edition II, GeoXACML 3.0, ODRL 2.2, NGSI-LD, INSPIRE administrative units.
- **Standardised on paper, unproven in practice:** IEEE 2874-2025. Vocabulary alignment only.
- **Vision, not standard:** "spatial web" as a general term, metaverse framings, "planetary intelligence", OPIN's architecture.
- **Funded programmes with running code:** the EU Local Digital Twin Toolbox (June 2026) and Destination Earth phase 3 (2026 to 2028). These are the realistic integration partners.

## Sources

- IEEE 2874-2025. IEEE SA. https://standards.ieee.org/ieee/2874/11717/
- Spatial Web Foundation announcement, 3 June 2025. https://spatialwebfoundation.org/spatial-web-foundation-announces-ieee-approval-of-spatial-web-standard/
- Spatial Web Foundation FAQ. https://spatialwebfoundation.org/swf/faq/
- VERSES on the standards approval. https://www.verses.ai/blog/blogs/spatial-web-standards-approval
- Swarp and the Future of the Spatial Web. constable.blog, 13 Mar 2026. https://constable.blog/2026/03/13/spatial-web/
- OGC JSON-FG 1.0.0. https://docs.ogc.org/is/21-045r1/21-045r1.html
- OGC API DGGS Part 1 approved, 24 Oct 2025. https://www.ogc.org/announcement/ogc-membership-approves-ogc-api-discrete-global-grid-systems-part-1-core-as-an-official-ogc-standard/
- LADM Edition II status. FIG, June 2025. https://www.fig.net/figfoundation/images/LADM_Progress_Report__June_2025.pdf
- INSPIRE Administrative Units technical guidelines. https://knowledge-base.inspire.ec.europa.eu/publications/inspire-data-specification-administrative-units-technical-guidelines_en
- UN SALB. https://salb.un.org/
- Overture Divisions guide and release notes, 23 Sept 2026. https://docs.overturemaps.org/guides/divisions/ ; https://docs.overturemaps.org/blog/2026/09/23/release-notes/
- Wikidata P131. https://www.wikidata.org/wiki/Property:P131
- Who's On First dates. https://www.whosonfirst.org/docs/dates/
- KnowWhereGraph ontology. arXiv 2502.13874. https://arxiv.org/abs/2502.13874v2
- Apache AGE. https://age.apache.org/overview/
- NGSI-LD, ETSI GS CIM 009 V1.9.1. https://cim.etsi.org/NGSI-LD/official/front-page.html
- ODRL spatial axis profile. arXiv 2602.19878, Feb 2026. https://arxiv.org/pdf/2602.19878
- GeoXACML 3.0. OGC. https://docs.ogc.org/is/22-049r1/22-049r1.html
- EU LDT Toolbox enters a new phase, June 2026. https://ldtcitiverse-edic.eu/eu-ldt-toolbox-launch-box/
- CHEK GeoBIM specifications. Zenodo. https://zenodo.org/records/18374246
- GeoBenchX. arXiv 2503.18129. https://arxiv.org/abs/2503.18129v2
- UN-GGIM IGIF. https://ggim.un.org/UN-IGIF/part2.cshtml
- h3-pg. https://github.com/postgis/h3-pg
- pygeoapi. https://docs.pygeoapi.io/en/stable/
