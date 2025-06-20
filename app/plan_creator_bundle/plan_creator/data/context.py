sdgs = [
    {
        "sdg_number": 1,
        "name": "No Poverty",
        "description": "End poverty in all its forms everywhere.",
    },
    {
        "sdg_number": 2,
        "name": "Zero Hunger",
        "description": "End hunger, achieve food security and improved nutrition and promote sustainable agriculture.",
    },
    {
        "sdg_number": 3,
        "name": "Good Health and Well-being",
        "description": "Ensure healthy lives and promote well-being for all at all ages.",
    },
    {
        "sdg_number": 4,
        "name": "Quality Education",
        "description": "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.",
    },
    {
        "sdg_number": 5,
        "name": "Gender Equality",
        "description": "Achieve gender equality and empower all women and girls.",
    },
    {
        "sdg_number": 6,
        "name": "Clean Water and Sanitation",
        "description": "Ensure availability and sustainable management of water and sanitation for all.",
    },
    {
        "sdg_number": 7,
        "name": "Affordable and Clean Energy",
        "description": "Ensure access to affordable, reliable, sustainable and modern energy for all.",
    },
    {
        "sdg_number": 8,
        "name": "Decent Work and Economic Growth",
        "description": "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all.",
    },
    {
        "sdg_number": 9,
        "name": "Industry, Innovation, and Infrastructure",
        "description": "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation.",
    },
    {
        "sdg_number": 10,
        "name": "Reduced Inequalities",
        "description": "Reduce inequality within and among countries.",
    },
    {
        "sdg_number": 11,
        "name": "Sustainable Cities and Communities",
        "description": "Make cities and human settlements inclusive, safe, resilient and sustainable.",
    },
    {
        "sdg_number": 12,
        "name": "Responsible Consumption and Production",
        "description": "Ensure sustainable consumption and production patterns.",
    },
    {
        "sdg_number": 13,
        "name": "Climate Action",
        "description": "Take urgent action to combat climate change and its impacts.",
    },
    {
        "sdg_number": 14,
        "name": "Life Below Water",
        "description": "Conserve and sustainably use the oceans, seas and marine resources for sustainable development.",
    },
    {
        "sdg_number": 15,
        "name": "Life on Land",
        "description": "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation, and halt biodiversity loss.",
    },
    {
        "sdg_number": 16,
        "name": "Peace, Justice, and Strong Institutions",
        "description": "Promote peaceful and inclusive societies for sustainable development, provide access to justice for all, and build effective, accountable and inclusive institutions at all levels.",
    },
    {
        "sdg_number": 17,
        "name": "Partnerships for the Goals",
        "description": "Strengthen the means of implementation and revitalize the Global Partnership for Sustainable Development.",
    },
]

adaptation = """
Climate risks (hazards) can be one of the following:
- **Droughts**
- **Heatwaves** 
- **Floods**
- **Sea-level-rise**
- **Landslides**
- **Storms**
- **Wildfires**
- **Diseases**
"""

mitigation = """
The following gives an overview of the different climate mitigation sectors.

There are 5 sectors according to the 'Global Protocol for Community-Scale Greenhous Gas Inventories' (GPC):
- **Stationary Energy**,
- **Transportation**,
- **Waste"**
- **Industrial Process And Product Use (IPPU)**
- **Agriculture, Forestry and other Land Use (AFOLU)**

The following is a description of the different sectors:
- Stationary Energy: 
    Stationary energy sources are one of the largest contributors to a city's GHG emissions.
    These emissions come from the combustion of fuel in residential, commercial and
    institutional buildings and facilities and manufacturing industries and construction, as well
    as power plants to generate grid-supplied energy. This sector also includes fugitive
    emissions, which typically occur during extraction, transformation, and transportation of
    primary fossil fuels.

- Transportation:
    Transportation covers all journeys by road, rail, water and air, including inter-city and
    international travel. GHG emissions are produced directly by the combustion of fuel or
    indirectly by the use of grid-supplied electricity. 

- Waste:
    Waste disposal and treatment produces GHG emissions through aerobic or anaerobic
    decomposition, or incineration. GHG emissions from solid waste shall be calculated by disposal
    route, namely landfill, biological treatment and incineration and open burning. If methane is
    recovered from solid waste or wastewater treatment facilities as an energy source, it shall be
    reported under Stationary Energy. Similarly, emissions from incineration with energy recovery
    are reported under Stationary Energy.

- Industrial Process And Product Use (IPPU):
    GHG emissions are produced from a wide variety of non-energy related industrial activities.
    The main emission sources are releases from industrial processes that chemically or physically
    transform materials (e.g., the blast furnace in the iron and steel industry, and ammonia and
    other chemical products manufactured from fossil fuels and used as chemical feedstock).
    During these processes many different GHGs can be produced. In addition, certain products
    used by industry and end-consumers, such as refrigerants, foams or aerosol cans, also contain
    GHGs which can be released during use and disposal.

- Agriculture, Forestry and other Land Use (AFOLU):
    Emissions and removals from the Agriculture, Forestry and Other Land Use (AFOLU) sector are
    produced through a variety of pathways, including livestock (enteric fermentation and manure
    management), land use and land use change (e.g., forested land being cleared for cropland
    or settlements), and aggregate sources and non-CO2 emission sources on land (e.g., fertilizer
    application and rice cultivation).    
"""

institutions_brser = [
    {
        "name": "The Special Municipal Secretariat of Agriculture, Agrotourism, Aquaculture and Fisheries (SEAP)",
        "description": "Seap carries out plans for the rural development of the municipality, elaborates plans, programs, projects, among other actions, to leverage the rural and fisheries sector. It provides guidance to the population to collaborate with the development of producer associations, agribusiness, family farming, agritourism, and cooperatives. Thus, it is possible to improve productivity and market identification for the commercialization of the products of the municipality.",
        "source": "https://www.serra.es.gov.br/secretaria/SEAP",
    },
    {
        "name": "The Municipal Secretariat of Environment (SEMMA)",
        "description": "Created through Municipal Law 2199 of June 16, 1999, SEMMA ensures sustainable development in the city of Serra, improving quality of life and stimulating economic development. It implements public policies of environmental control, develops conservation and awareness actions for sustainable resource use, and oversees the following departments: Environmental Control (DCA), Environmental Inspection (DFA), Natural Resources (NIRN), Environmental Education (DEA), and Environmental Sanitation (DSA).",
        "source": "https://www.serra.es.gov.br/secretaria/SEMMA",
    },
    {
        "name": "The Municipal Secretariat for Urban Development (SEDUR)",
        "description": "SEDUR coordinates discussions for urban development, promotes the Municipal Master Plan, and organizes urban land use and ownership. It creates urban planning, coordinates metropolitan urban policies, and disseminates urban planning data indicators.",
        "source": "https://www.serra.es.gov.br/secretaria/SEDUR",
    },
    {
        "name": "The Department of Education (Sedu)",
        "description": "Sedu educates and trains students through human values, beyond scientific teaching. It ensures proper functioning of teaching units, elaborates pedagogical projects, and mobilizes communities through expanded education plans. The Municipal Education Plan aims to improve education quality and ensure student access and retention.",
        "source": "https://www.serra.es.gov.br/secretaria/SEDU",
    },
    {
        "name": "The Serra Health Department (Sesa)",
        "description": "Sesa formulates and implements public health policy, ensuring universal, equitable, and comprehensive health service access in line with the Unified Health System (SUS). It coordinates health services, promotes public health actions, and oversees disease control, environmental health, worker safety, and social mobilization for SUS.",
        "source": "https://www.serra.es.gov.br/secretaria/SESA",
    },
    {
        "name": "The Municipal Secretariat of Innovation, Science and Technology (SEICIT)",
        "description": "SEICIT leads, prepares, and executes policies, projects, and actions for innovation and scientific and technological development in the municipality.",
        "source": "https://www.serra.es.gov.br/secretaria/SEICIT",
    },
    {
        "name": "The Municipal Secretariat of Works (SEOB)",
        "description": "SEOB oversees the construction, conservation, and maintenance of roads, sanitation, monuments, and public buildings. Duties include planning and supervising public works projects, paving, urban area maintenance, and monitoring contracted public building projects.",
        "source": "https://www.serra.es.gov.br/secretaria/SEOB",
    },
    {
        "name": "The Municipal Housing Department (SEHAB)",
        "description": "SEHAB manages housing policy, develops social housing projects, and handles land regularization. It selects families for housing programs, manages the Housing Grant Project, and targets low-income families. It also prepares annual housing reports to evaluate and improve housing policy.",
        "source": "https://www.serra.es.gov.br/secretaria/SEHAB",
    },
    {
        "name": "The Municipal Secretariat of Management and Planning (SEGEPLAN)",
        "description": "SEGEPLAN manages administration systems, oversees municipal property, and handles human resources, including recruitment, training, and payroll. It executes strategic planning, monitors Secretariat programs, integrates municipal bodies, and promotes occupational health and safety measures.",
        "source": "https://www.serra.es.gov.br/secretaria/SEGEPLAN",
    },
]
