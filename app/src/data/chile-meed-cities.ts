/**
 * Snapshot of hiap-meed/data/1_city/city.csv for Chile bulk import matching.
 * Identity is INE (comuna_code). locode is UN/LOCODE when MEED has one.
 */
export interface ChileMeedCity {
  name: string;
  locode: string | null;
  ineCode: string;
  regionName: string;
  regionCode: string;
}

export const CHILE_MEED_CITIES: ChileMeedCity[] = [
  {
    "name": "Iquique",
    "locode": "CL IQQ",
    "ineCode": "CL01101",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Alto Hospicio",
    "locode": "CL AHP",
    "ineCode": "CL01107",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Tocopilla",
    "locode": null,
    "ineCode": "CL01401",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Camiña",
    "locode": "CL CMA",
    "ineCode": "CL01402",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Colchane",
    "locode": "CL CNE",
    "ineCode": "CL01403",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Huara",
    "locode": "CL HUA",
    "ineCode": "CL01404",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Pica",
    "locode": "CL PIC",
    "ineCode": "CL01405",
    "regionName": "Tarapacá",
    "regionCode": "CL01"
  },
  {
    "name": "Antofagasta",
    "locode": "CL ANF",
    "ineCode": "CL02101",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Mejillones",
    "locode": "CL MJS",
    "ineCode": "CL02102",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Sierra Gorda",
    "locode": "CL SIG",
    "ineCode": "CL02103",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Taltal",
    "locode": "CL TTC",
    "ineCode": "CL02104",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Calama",
    "locode": "CL CJC",
    "ineCode": "CL02201",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Ollagüe",
    "locode": "CL OLL",
    "ineCode": "CL02202",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "San Pedro de Atacama",
    "locode": "CL SPA",
    "ineCode": "CL02203",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Tocopilla",
    "locode": "CL TOQ",
    "ineCode": "CL02301",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "María Elena",
    "locode": "CL MAE",
    "ineCode": "CL02302",
    "regionName": "Antofagasta",
    "regionCode": "CL02"
  },
  {
    "name": "Copiapó",
    "locode": "CL CPO",
    "ineCode": "CL03101",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Caldera",
    "locode": "CL CLD",
    "ineCode": "CL03102",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Tierra Amarilla",
    "locode": "CL TAM",
    "ineCode": "CL03103",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Chañaral",
    "locode": "CL CNR",
    "ineCode": "CL03201",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Diego de Almagro",
    "locode": "CL DDA",
    "ineCode": "CL03202",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Vallenar",
    "locode": "CL VLR",
    "ineCode": "CL03301",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Alto del Carmen",
    "locode": "CL ADC",
    "ineCode": "CL03302",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Freirina",
    "locode": "CL FRN",
    "ineCode": "CL03303",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "Huasco",
    "locode": null,
    "ineCode": "CL03304",
    "regionName": "Atacama",
    "regionCode": "CL03"
  },
  {
    "name": "La Serena",
    "locode": "CL LSC",
    "ineCode": "CL04101",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Coquimbo",
    "locode": "CL CQQ",
    "ineCode": "CL04102",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Andacollo",
    "locode": "CL AND",
    "ineCode": "CL04103",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "La Higuera",
    "locode": null,
    "ineCode": "CL04104",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Paihuano",
    "locode": null,
    "ineCode": "CL04105",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Vicuña",
    "locode": "CL VIC",
    "ineCode": "CL04106",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Illapel",
    "locode": "CL ILL",
    "ineCode": "CL04201",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Canela",
    "locode": "CL CAN",
    "ineCode": "CL04202",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Los Vilos",
    "locode": "CL LOS",
    "ineCode": "CL04203",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Salamanca",
    "locode": "CL SAL",
    "ineCode": "CL04204",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Ovalle",
    "locode": "CL OVL",
    "ineCode": "CL04301",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Combarbalá",
    "locode": "CL CBB",
    "ineCode": "CL04302",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Monte Patria",
    "locode": "CL MTP",
    "ineCode": "CL04303",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Punitaqui",
    "locode": "CL PUN",
    "ineCode": "CL04304",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Río Hurtado",
    "locode": "CL RHU",
    "ineCode": "CL04305",
    "regionName": "Coquimbo",
    "regionCode": "CL04"
  },
  {
    "name": "Valparaíso",
    "locode": "CL VAP",
    "ineCode": "CL05101",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Casablanca",
    "locode": "CL CAS",
    "ineCode": "CL05102",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Concón",
    "locode": "CL CON",
    "ineCode": "CL05103",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Juan Fernández",
    "locode": null,
    "ineCode": "CL05104",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Puchuncaví",
    "locode": "CL PCI",
    "ineCode": "CL05105",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Quintero",
    "locode": null,
    "ineCode": "CL05107",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Viña del Mar",
    "locode": "CL KNA",
    "ineCode": "CL05109",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Isla de Pascua",
    "locode": "CL IPC",
    "ineCode": "CL05201",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Los Andes",
    "locode": "CL LIB",
    "ineCode": "CL05301",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Calle Larga",
    "locode": "CL CLL",
    "ineCode": "CL05302",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Rinconada",
    "locode": "CL RIN",
    "ineCode": "CL05303",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "San Esteban",
    "locode": "CL SES",
    "ineCode": "CL05304",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "La Ligua",
    "locode": "CL LIG",
    "ineCode": "CL05401",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Cabildo",
    "locode": null,
    "ineCode": "CL05402",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Papudo",
    "locode": "CL PAP",
    "ineCode": "CL05403",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Petorca",
    "locode": "CL PET",
    "ineCode": "CL05404",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Zapallar",
    "locode": null,
    "ineCode": "CL05405",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Quillota",
    "locode": "CL QTA",
    "ineCode": "CL05501",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Calera",
    "locode": "CL LCL",
    "ineCode": "CL05502",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Hijuelas",
    "locode": "CL HIJ",
    "ineCode": "CL05503",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "La Cruz",
    "locode": "CL LCZ",
    "ineCode": "CL05504",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Nogales",
    "locode": "CL NOG",
    "ineCode": "CL05506",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "San Antonio",
    "locode": "CL SAI",
    "ineCode": "CL05601",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Algarrobo",
    "locode": "CL ALG",
    "ineCode": "CL05602",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Cartagena",
    "locode": "CL CGN",
    "ineCode": "CL05603",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "El Quisco",
    "locode": "CL ELQ",
    "ineCode": "CL05604",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "El Tabo",
    "locode": "CL ELT",
    "ineCode": "CL05605",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Santo Domingo",
    "locode": "CL RSD",
    "ineCode": "CL05606",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "San Felipe",
    "locode": "CL SFP",
    "ineCode": "CL05701",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Catemu",
    "locode": "CL CAT",
    "ineCode": "CL05702",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Llaillay",
    "locode": "CL LLA",
    "ineCode": "CL05703",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Panquehue",
    "locode": "CL PQH",
    "ineCode": "CL05704",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Putaendo",
    "locode": "CL PTO",
    "ineCode": "CL05705",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Santa María",
    "locode": "CL SMA",
    "ineCode": "CL05706",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Quilpué",
    "locode": "CL QIL",
    "ineCode": "CL05801",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Limache",
    "locode": "CL LIM",
    "ineCode": "CL05802",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Olmué",
    "locode": "CL OLM",
    "ineCode": "CL05803",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Villa Alemana",
    "locode": "CL VIA",
    "ineCode": "CL05804",
    "regionName": "Valparaíso",
    "regionCode": "CL05"
  },
  {
    "name": "Rancagua",
    "locode": "CL QRC",
    "ineCode": "CL06101",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Codegua",
    "locode": "CL COD",
    "ineCode": "CL06102",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Coinco",
    "locode": "CL COO",
    "ineCode": "CL06103",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Coltauco",
    "locode": "CL CTC",
    "ineCode": "CL06104",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Doñihue",
    "locode": "CL DOH",
    "ineCode": "CL06105",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Graneros",
    "locode": "CL GRA",
    "ineCode": "CL06106",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Las Cabras",
    "locode": "CL LCB",
    "ineCode": "CL06107",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Machalí",
    "locode": "CL MCI",
    "ineCode": "CL06108",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Malloa",
    "locode": "CL MAL",
    "ineCode": "CL06109",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Mostazal",
    "locode": "CL MOS",
    "ineCode": "CL06110",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Olivar",
    "locode": "CL OLI",
    "ineCode": "CL06111",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Peumo",
    "locode": "CL PEU",
    "ineCode": "CL06112",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Pichidegua",
    "locode": "CL PDH",
    "ineCode": "CL06113",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Quinta de Tilcoco",
    "locode": "CL QDT",
    "ineCode": "CL06114",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Rengo",
    "locode": "CL RGO",
    "ineCode": "CL06115",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Requínoa",
    "locode": "CL REQ",
    "ineCode": "CL06116",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "San Vicente",
    "locode": "CL SVT",
    "ineCode": "CL06117",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Pichilemu",
    "locode": "CL PLM",
    "ineCode": "CL06201",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "La Estrella",
    "locode": "CL LES",
    "ineCode": "CL06202",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Litueche",
    "locode": null,
    "ineCode": "CL06203",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Marchigüe",
    "locode": null,
    "ineCode": "CL06204",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Navidad",
    "locode": "CL NAV",
    "ineCode": "CL06205",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Paredones",
    "locode": "CL PAR",
    "ineCode": "CL06206",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "San Fernando",
    "locode": "CL SFD",
    "ineCode": "CL06301",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Chépica",
    "locode": "CL CHE",
    "ineCode": "CL06302",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Chimbarongo",
    "locode": "CL CBG",
    "ineCode": "CL06303",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Lolol",
    "locode": "CL LOL",
    "ineCode": "CL06304",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Nancagua",
    "locode": "CL NCG",
    "ineCode": "CL06305",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Palmilla",
    "locode": "CL PMA",
    "ineCode": "CL06306",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Peralillo",
    "locode": "CL PER",
    "ineCode": "CL06307",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Placilla",
    "locode": "CL PLA",
    "ineCode": "CL06308",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Pumanque",
    "locode": "CL PUM",
    "ineCode": "CL06309",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Santa Cruz",
    "locode": "CL SCZ",
    "ineCode": "CL06310",
    "regionName": "Libertador Bernardo O'Higgins",
    "regionCode": "CL06"
  },
  {
    "name": "Talca",
    "locode": "CL TLX",
    "ineCode": "CL07101",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Constitución",
    "locode": "CL CST",
    "ineCode": "CL07102",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Curepto",
    "locode": "CL CRT",
    "ineCode": "CL07103",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Empedrado",
    "locode": "CL EMP",
    "ineCode": "CL07104",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Maule",
    "locode": "CL MAU",
    "ineCode": "CL07105",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Pelarco",
    "locode": "CL PEL",
    "ineCode": "CL07106",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Pencahue",
    "locode": "CL PEN",
    "ineCode": "CL07107",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Río Claro",
    "locode": "CL RCL",
    "ineCode": "CL07108",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "San Clemente",
    "locode": "CL SCT",
    "ineCode": "CL07109",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "San Rafael",
    "locode": "CL SRA",
    "ineCode": "CL07110",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Cauquenes",
    "locode": "CL CAU",
    "ineCode": "CL07201",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Chanco",
    "locode": "CL CHA",
    "ineCode": "CL07202",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Pelluhue",
    "locode": "CL PLH",
    "ineCode": "CL07203",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Curicó",
    "locode": "CL CUR",
    "ineCode": "CL07301",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Hualañé",
    "locode": "CL HLE",
    "ineCode": "CL07302",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Licantén",
    "locode": "CL LIC",
    "ineCode": "CL07303",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Molina",
    "locode": "CL MOL",
    "ineCode": "CL07304",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Rauco",
    "locode": "CL RAU",
    "ineCode": "CL07305",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Romeral",
    "locode": "CL ROM",
    "ineCode": "CL07306",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Sagrada Familia",
    "locode": "CL SAF",
    "ineCode": "CL07307",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Teno",
    "locode": "CL TEN",
    "ineCode": "CL07308",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Vichuquén",
    "locode": "CL VCQ",
    "ineCode": "CL07309",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Linares",
    "locode": "CL LIN",
    "ineCode": "CL07401",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Colbún",
    "locode": "CL COB",
    "ineCode": "CL07402",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Longaví",
    "locode": "CL LON",
    "ineCode": "CL07403",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Parral",
    "locode": "CL PRL",
    "ineCode": "CL07404",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Retiro",
    "locode": "CL RET",
    "ineCode": "CL07405",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "San Javier",
    "locode": "CL SJV",
    "ineCode": "CL07406",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Villa Alegre",
    "locode": "CL VAG",
    "ineCode": "CL07407",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Yerbas Buenas",
    "locode": "CL YBU",
    "ineCode": "CL07408",
    "regionName": "Maule",
    "regionCode": "CL07"
  },
  {
    "name": "Concepción",
    "locode": "CL CCP",
    "ineCode": "CL08101",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Coronel",
    "locode": "CL CNL",
    "ineCode": "CL08102",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Chiguayante",
    "locode": "CL CHI",
    "ineCode": "CL08103",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Florida",
    "locode": "CL FLO",
    "ineCode": "CL08104",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Hualqui",
    "locode": "CL HQI",
    "ineCode": "CL08105",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Lota",
    "locode": "CL LTA",
    "ineCode": "CL08106",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Penco",
    "locode": "CL PEO",
    "ineCode": "CL08107",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "San Pedro de la Paz",
    "locode": "CL SPP",
    "ineCode": "CL08108",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Santa Juana",
    "locode": "CL SJU",
    "ineCode": "CL08109",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Talcahuano",
    "locode": "CL TAL",
    "ineCode": "CL08110",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Tomé",
    "locode": "CL TOM",
    "ineCode": "CL08111",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Hualpén",
    "locode": "CL HPN",
    "ineCode": "CL08112",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Lebu",
    "locode": "CL LEB",
    "ineCode": "CL08201",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Arauco",
    "locode": "CL ARA",
    "ineCode": "CL08202",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Cañete",
    "locode": "CL CTE",
    "ineCode": "CL08203",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Contulmo",
    "locode": "CL CTM",
    "ineCode": "CL08204",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Curanilahue",
    "locode": "CL CRN",
    "ineCode": "CL08205",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Los Alamos",
    "locode": "CL LAL",
    "ineCode": "CL08206",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Tirúa",
    "locode": "CL TIR",
    "ineCode": "CL08207",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Los Angeles",
    "locode": "CL LSQ",
    "ineCode": "CL08301",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Antuco",
    "locode": "CL ANT",
    "ineCode": "CL08302",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Cabrero",
    "locode": "CL CAB",
    "ineCode": "CL08303",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Laja",
    "locode": "CL LAJ",
    "ineCode": "CL08304",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Mulchén",
    "locode": "CL MUL",
    "ineCode": "CL08305",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Nacimiento",
    "locode": "CL NAC",
    "ineCode": "CL08306",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Negrete",
    "locode": "CL NEG",
    "ineCode": "CL08307",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Quilaco",
    "locode": null,
    "ineCode": "CL08308",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Quilleco",
    "locode": "CL QLO",
    "ineCode": "CL08309",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "San Rosendo",
    "locode": "CL SRO",
    "ineCode": "CL08310",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Santa Bárbara",
    "locode": "CL SBA",
    "ineCode": "CL08311",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Tucapel",
    "locode": "CL TUC",
    "ineCode": "CL08312",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Yumbel",
    "locode": "CL YUM",
    "ineCode": "CL08313",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Alto Biobío",
    "locode": null,
    "ineCode": "CL08314",
    "regionName": "Bío-Bío",
    "regionCode": "CL08"
  },
  {
    "name": "Temuco",
    "locode": "CL ZCO",
    "ineCode": "CL09101",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Carahue",
    "locode": "CL CAR",
    "ineCode": "CL09102",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Cunco",
    "locode": "CL CUN",
    "ineCode": "CL09103",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Curarrehue",
    "locode": "CL CRE",
    "ineCode": "CL09104",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Freire",
    "locode": "CL FRE",
    "ineCode": "CL09105",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Galvarino",
    "locode": "CL GAL",
    "ineCode": "CL09106",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Gorbea",
    "locode": "CL GOR",
    "ineCode": "CL09107",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Lautaro",
    "locode": "CL LAU",
    "ineCode": "CL09108",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Loncoche",
    "locode": "CL LNC",
    "ineCode": "CL09109",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Melipeuco",
    "locode": "CL MLP",
    "ineCode": "CL09110",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Nueva Imperial",
    "locode": "CL NIM",
    "ineCode": "CL09111",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Padre Las Casas",
    "locode": "CL PLC",
    "ineCode": "CL09112",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Perquenco",
    "locode": "CL PQC",
    "ineCode": "CL09113",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Pitrufquén",
    "locode": "CL PIT",
    "ineCode": "CL09114",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Pucón",
    "locode": "CL PUC",
    "ineCode": "CL09115",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Saavedra",
    "locode": "CL SAA",
    "ineCode": "CL09116",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Teodoro Schmidt",
    "locode": "CL TEO",
    "ineCode": "CL09117",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Toltén",
    "locode": "CL TOL",
    "ineCode": "CL09118",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Vilcún",
    "locode": "CL VCN",
    "ineCode": "CL09119",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Villarrica",
    "locode": "CL VIL",
    "ineCode": "CL09120",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Cholchol",
    "locode": "CL CHL",
    "ineCode": "CL09121",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Angol",
    "locode": "CL ANG",
    "ineCode": "CL09201",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Collipulli",
    "locode": "CL CPI",
    "ineCode": "CL09202",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Curacautín",
    "locode": "CL CCN",
    "ineCode": "CL09203",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Ercilla",
    "locode": "CL ERC",
    "ineCode": "CL09204",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Lonquimay",
    "locode": "CL LQY",
    "ineCode": "CL09205",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Los Sauces",
    "locode": "CL LSA",
    "ineCode": "CL09206",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Lumaco",
    "locode": "CL LUM",
    "ineCode": "CL09207",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Purén",
    "locode": "CL PUR",
    "ineCode": "CL09208",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Renaico",
    "locode": "CL RNO",
    "ineCode": "CL09209",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Traiguén",
    "locode": "CL TRA",
    "ineCode": "CL09210",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Victoria",
    "locode": "CL ZIC",
    "ineCode": "CL09211",
    "regionName": "La Araucanía",
    "regionCode": "CL09"
  },
  {
    "name": "Puerto Montt",
    "locode": "CL PMC",
    "ineCode": "CL10101",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Calbuco",
    "locode": "CL CBC",
    "ineCode": "CL10102",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Cochamó",
    "locode": null,
    "ineCode": "CL10103",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Fresia",
    "locode": "CL FRS",
    "ineCode": "CL10104",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Frutillar",
    "locode": "CL FRT",
    "ineCode": "CL10105",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Los Muermos",
    "locode": "CL LMU",
    "ineCode": "CL10106",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Llanquihue",
    "locode": "CL LIA",
    "ineCode": "CL10107",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Maullín",
    "locode": "CL MLL",
    "ineCode": "CL10108",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Puerto Varas",
    "locode": "CL PVS",
    "ineCode": "CL10109",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Castro",
    "locode": "CL WCA",
    "ineCode": "CL10201",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Ancud",
    "locode": "CL ZUD",
    "ineCode": "CL10202",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Chonchi",
    "locode": "CL CHO",
    "ineCode": "CL10203",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Curaco de Vélez",
    "locode": "CL CDV",
    "ineCode": "CL10204",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Dalcahue",
    "locode": "CL DCH",
    "ineCode": "CL10205",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Puqueldón",
    "locode": "CL PQD",
    "ineCode": "CL10206",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Queilén",
    "locode": "CL QLN",
    "ineCode": "CL10207",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Quellón",
    "locode": "CL PTE",
    "ineCode": "CL10208",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Quemchi",
    "locode": "CL QMC",
    "ineCode": "CL10209",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Quinchao",
    "locode": "CL QCO",
    "ineCode": "CL10210",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Osorno",
    "locode": "CL ZOS",
    "ineCode": "CL10301",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Puerto Octay",
    "locode": "CL POC",
    "ineCode": "CL10302",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Purranque",
    "locode": "CL PRQ",
    "ineCode": "CL10303",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Puyehue",
    "locode": "CL CSA",
    "ineCode": "CL10304",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Río Negro",
    "locode": "CL RNE",
    "ineCode": "CL10305",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "San Juan de la Costa",
    "locode": "CL SJC",
    "ineCode": "CL10306",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "San Pablo",
    "locode": "CL SPB",
    "ineCode": "CL10307",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Chaitén",
    "locode": "CL WCH",
    "ineCode": "CL10401",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Futaleufú",
    "locode": "CL FFU",
    "ineCode": "CL10402",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Hualaihué",
    "locode": null,
    "ineCode": "CL10403",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Palena",
    "locode": "CL PAL",
    "ineCode": "CL10404",
    "regionName": "Los Lagos",
    "regionCode": "CL10"
  },
  {
    "name": "Coyhaique",
    "locode": "CL CXQ",
    "ineCode": "CL11101",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Lago Verde",
    "locode": "CL LVD",
    "ineCode": "CL11102",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Aysén",
    "locode": "CL PSN",
    "ineCode": "CL11201",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Cisnes",
    "locode": null,
    "ineCode": "CL11202",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Guaitecas",
    "locode": null,
    "ineCode": "CL11203",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Cochrane",
    "locode": "CL COC",
    "ineCode": "CL11301",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "O'Higgins",
    "locode": "CL OHI",
    "ineCode": "CL11302",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Tortel",
    "locode": null,
    "ineCode": "CL11303",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Chile Chico",
    "locode": "CL CCH",
    "ineCode": "CL11401",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Río Ibáñez",
    "locode": "CL RIB",
    "ineCode": "CL11402",
    "regionName": "Aysén del Gral. Ibañez del Campo",
    "regionCode": "CL11"
  },
  {
    "name": "Punta Arenas",
    "locode": "CL PUQ",
    "ineCode": "CL12101",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Laguna Blanca",
    "locode": null,
    "ineCode": "CL12102",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Río Verde",
    "locode": "CL RVE",
    "ineCode": "CL12103",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "San Gregorio",
    "locode": "CL SGR",
    "ineCode": "CL12104",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Cabo de Hornos",
    "locode": null,
    "ineCode": "CL12201",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Porvenir",
    "locode": "CL PVR",
    "ineCode": "CL12301",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Primavera",
    "locode": "CL PRI",
    "ineCode": "CL12302",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Timaukel",
    "locode": "CL TIM",
    "ineCode": "CL12303",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Natales",
    "locode": "CL CVJ",
    "ineCode": "CL12401",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Torres del Paine",
    "locode": "CL TDP",
    "ineCode": "CL12402",
    "regionName": "Magallanes y Antártica Chilena",
    "regionCode": "CL12"
  },
  {
    "name": "Santiago",
    "locode": "CL SCL",
    "ineCode": "CL13101",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Cerrillos",
    "locode": "CL CER",
    "ineCode": "CL13102",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Cerro Navia",
    "locode": null,
    "ineCode": "CL13103",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Conchalí",
    "locode": null,
    "ineCode": "CL13104",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "El Bosque",
    "locode": null,
    "ineCode": "CL13105",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Estación Central",
    "locode": null,
    "ineCode": "CL13106",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Huechuraba",
    "locode": "CL HUE",
    "ineCode": "CL13107",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Independencia",
    "locode": "CL IND",
    "ineCode": "CL13108",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "La Cisterna",
    "locode": "CL LCI",
    "ineCode": "CL13109",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "La Florida",
    "locode": "CL LFL",
    "ineCode": "CL13110",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "La Granja",
    "locode": null,
    "ineCode": "CL13111",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "La Pintana",
    "locode": null,
    "ineCode": "CL13112",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "La Reina",
    "locode": "CL REI",
    "ineCode": "CL13113",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Las Condes",
    "locode": null,
    "ineCode": "CL13114",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Lo Barnechea",
    "locode": "CL LBA",
    "ineCode": "CL13115",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Lo Espejo",
    "locode": "CL LEJ",
    "ineCode": "CL13116",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Lo Prado",
    "locode": "CL LPR",
    "ineCode": "CL13117",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Macul",
    "locode": "CL MAC",
    "ineCode": "CL13118",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Maipú",
    "locode": "CL MAI",
    "ineCode": "CL13119",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Ñuñoa",
    "locode": "CL NUN",
    "ineCode": "CL13120",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Pedro Aguirre Cerda",
    "locode": null,
    "ineCode": "CL13121",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Peñalolén",
    "locode": "CL PLN",
    "ineCode": "CL13122",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Providencia",
    "locode": "CL PRO",
    "ineCode": "CL13123",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Pudahuel",
    "locode": "CL PUD",
    "ineCode": "CL13124",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Quilicura",
    "locode": "CL QUI",
    "ineCode": "CL13125",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Quinta Normal",
    "locode": null,
    "ineCode": "CL13126",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Recoleta",
    "locode": "CL REC",
    "ineCode": "CL13127",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Renca",
    "locode": "CL REN",
    "ineCode": "CL13128",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "San Joaquín",
    "locode": "CL SJQ",
    "ineCode": "CL13129",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "San Miguel",
    "locode": "CL SMG",
    "ineCode": "CL13130",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "San Ramón",
    "locode": null,
    "ineCode": "CL13131",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Vitacura",
    "locode": "CL VIT",
    "ineCode": "CL13132",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Puente Alto",
    "locode": "CL PTA",
    "ineCode": "CL13201",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Pirque",
    "locode": "CL PIR",
    "ineCode": "CL13202",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "San José de Maipo",
    "locode": "CL SJM",
    "ineCode": "CL13203",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Colina",
    "locode": "CL CLN",
    "ineCode": "CL13301",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Lampa",
    "locode": "CL LAM",
    "ineCode": "CL13302",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Tiltil",
    "locode": "CL TIL",
    "ineCode": "CL13303",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "San Bernardo",
    "locode": "CL SBD",
    "ineCode": "CL13401",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Buin",
    "locode": "CL BUI",
    "ineCode": "CL13402",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Calera de Tango",
    "locode": "CL CDT",
    "ineCode": "CL13403",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Paine",
    "locode": "CL PNE",
    "ineCode": "CL13404",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Melipilla",
    "locode": "CL MEL",
    "ineCode": "CL13501",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Alhué",
    "locode": "CL ALH",
    "ineCode": "CL13502",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Curacaví",
    "locode": "CL CRV",
    "ineCode": "CL13503",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "María Pinto",
    "locode": "CL MPI",
    "ineCode": "CL13504",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "San Pedro",
    "locode": "CL SPE",
    "ineCode": "CL13505",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Talagante",
    "locode": "CL TLG",
    "ineCode": "CL13601",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "El Monte",
    "locode": "CL ELM",
    "ineCode": "CL13602",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Isla de Maipo",
    "locode": "CL IDM",
    "ineCode": "CL13603",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Padre Hurtado",
    "locode": "CL PHU",
    "ineCode": "CL13604",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Peñaflor",
    "locode": "CL PFL",
    "ineCode": "CL13605",
    "regionName": "Metropolitana de Santiago",
    "regionCode": "CL13"
  },
  {
    "name": "Valdivia",
    "locode": "CL ZAL",
    "ineCode": "CL14101",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Corral",
    "locode": "CL CRR",
    "ineCode": "CL14102",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Lanco",
    "locode": "CL LAN",
    "ineCode": "CL14103",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Los Lagos",
    "locode": "CL LLG",
    "ineCode": "CL14104",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Máfil",
    "locode": "CL MAF",
    "ineCode": "CL14105",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Mariquina",
    "locode": null,
    "ineCode": "CL14106",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Paillaco",
    "locode": "CL PAO",
    "ineCode": "CL14107",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Panguipulli",
    "locode": "CL PAN",
    "ineCode": "CL14108",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "La Unión",
    "locode": "CL LUN",
    "ineCode": "CL14201",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Futrono",
    "locode": "CL FUT",
    "ineCode": "CL14202",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Lago Ranco",
    "locode": "CL RNC",
    "ineCode": "CL14203",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Río Bueno",
    "locode": null,
    "ineCode": "CL14204",
    "regionName": "Los Ríos",
    "regionCode": "CL14"
  },
  {
    "name": "Arica",
    "locode": "CL ARI",
    "ineCode": "CL15101",
    "regionName": "Arica y Parinacota",
    "regionCode": "CL15"
  },
  {
    "name": "Camarones",
    "locode": "CL CAM",
    "ineCode": "CL15102",
    "regionName": "Arica y Parinacota",
    "regionCode": "CL15"
  },
  {
    "name": "Putre",
    "locode": "CL PUT",
    "ineCode": "CL15201",
    "regionName": "Arica y Parinacota",
    "regionCode": "CL15"
  },
  {
    "name": "General Lagos",
    "locode": "CL GLG",
    "ineCode": "CL15202",
    "regionName": "Arica y Parinacota",
    "regionCode": "CL15"
  },
  {
    "name": "Chillán",
    "locode": "CL YAI",
    "ineCode": "CL16101",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Bulnes",
    "locode": "CL BUL",
    "ineCode": "CL16102",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Chillán Viejo",
    "locode": "CL CHV",
    "ineCode": "CL16103",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "El Carmen",
    "locode": "CL ELC",
    "ineCode": "CL16104",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Pemuco",
    "locode": "CL PEM",
    "ineCode": "CL16105",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Pinto",
    "locode": "CL PIN",
    "ineCode": "CL16106",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Quillón",
    "locode": "CL QIN",
    "ineCode": "CL16107",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "San Ignacio",
    "locode": "CL SIN",
    "ineCode": "CL16108",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Yungay",
    "locode": "CL YUN",
    "ineCode": "CL16109",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Quirihue",
    "locode": "CL QRH",
    "ineCode": "CL16201",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Cobquecura",
    "locode": "CL CBQ",
    "ineCode": "CL16202",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Coelemu",
    "locode": "CL COE",
    "ineCode": "CL16203",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Ninhue",
    "locode": "CL NIN",
    "ineCode": "CL16204",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Portezuelo",
    "locode": "CL POR",
    "ineCode": "CL16205",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Ranquil",
    "locode": "CL RAN",
    "ineCode": "CL16206",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Treguaco",
    "locode": "CL TRE",
    "ineCode": "CL16207",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "San Carlos",
    "locode": "CL SCR",
    "ineCode": "CL16301",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Coihueco",
    "locode": "CL COI",
    "ineCode": "CL16302",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "Ñiquén",
    "locode": "CL NQN",
    "ineCode": "CL16303",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "San Fabián",
    "locode": "CL SFN",
    "ineCode": "CL16304",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  },
  {
    "name": "San Nicolás",
    "locode": "CL SNI",
    "ineCode": "CL16305",
    "regionName": "Ñuble",
    "regionCode": "CL16"
  }
];

