"""
functions to estimate waste emissions
GPC version 7

Resources
---------
- https://www.ipcc-nggip.iges.or.jp/public/2019rf/index.html
- https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol5.html
"""


def ef_approach(activity: float, ef: float, conversion: float = 1, loss: float = 0):
    """Generalized version of the emission factor approach to estimating emissions

    $$
    emissions =  [(A * EF) * conversion] - loss
    $$

    Parameters
    ----------
    activity: float
        activity value
        Units: variable, depends on activity

    ef: float
        emissions factor
        Units: mass gas per unit activity

    conversion: float (optional)
        conversion factor (default = 1)
        Units: variable

    loss: float (optional)
        loss term (default = 0)
        Units: mass of gas

    Returns
    -------
    emissions: float
        emissions of gas
        Units: mass of gas (depends on ef)
    """

    return ((activity * ef) * conversion) - loss


def doc(A=0, B=0, C=0, D=0, E=0, F=0, *args, **kwargs):
    """Degradable organic carbon (DOC)
    Units: (tonnes C / tonnes waste)

    $$
    DOC = (0.15 * A) + (0.2 x B) + (0.4 * C) + (0.43 * D) + (0.24 * E) + (0.15 * F)
    $$

    Parameters
    ----------
    A float:
        Fraction of solid waste that is food
    B float:
        Fraction of solid waste that is garden waste and other plant debris
    C float:
        Fraction of solid waste that is paper
    D float:
        Fraction of solid waste that is wood
    E float:
        Fraction of solid waste that is textiles
    F float:
        Fraction of solid waste that is industrial waste

    Returns
    -------
    doc: float
        degradable of organic carbon
        units: (tonnes C / tonnes waste)

    References
    ----------
    GPC version 7 Equation 8.1
        https://ghgprotocol.org/ghg-protocol-cities

    Adapted from equation 5.4 in
    "Good Practice Guidance and Uncertainty Management in National Greenhouse Gas Inventories"
    https://www.ipcc-nggip.iges.or.jp/public/gp/english/5_Waste.pdf

    fractions from table 2.4 in
    "2006 IPCC Guidelines for National Greenhouse Gas Inventories Volume 5 Waste"
    https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/5_Volume5/V5_2_Ch2_Waste_Data.pdf

    Notes
    -----
    - Rubber and leather not included in DOC (see sources in table 2.4 in "2006 IPCC Guidelines ..." )
    """
    assert all(
        0 <= v <= 1 for v in [A, B, C, D, E, F]
    ), "All fractions should be between 0 and 1"

    # DOC content in wet waste (table 2.4 in "2006 IPCC Guidelines ...")
    frac = {
        "food": 0.15,
        "garden": 0.2,
        "paper": 0.4,
        "wood": 0.43,
        "textiles": 0.24,
        "industrial": 0.15,  # unsure where GPC gets this value
    }

    doc = (
        (frac["food"] * A)
        + (frac["garden"] * B)
        + (frac["paper"] * C)
        + (frac["wood"] * D)
        + (frac["textiles"] * E)
        + (frac["industrial"] * F)
    )

    return doc


def management_level_to_mcf(management_level: str, *args, **kwargs):
    """methane correction factor (MCF) from management level

    Parameters
    ----------
    management_level: str
        one of the following:
        - managed
        - managed_well
        - managed_poorly
        - unmanaged_more5m
        - unmanaged_less5m
        - uncategorized

    Returns
    -------
    mcf: float
        methane correction factor
        Units: dimesionless
    """
    dic = {
        "managed": 1,
        "managed_well": 0.5,
        "managed_poorly": 0.7,
        "unmanaged_more5m": 0.8,
        "unmanaged_less5m": 0.4,
        "uncategorized": 0.6,
    }

    mcf = dic.get(management_level.lower())

    if mcf is None:
        raise Exception(f"Error: {management_level} not in {dic.keys()}")

    return mcf


def management_level_to_oxidation_factor(management_level: str, *args, **kwargs):
    """oxidation factor from management level

    Parameters
    ----------
    management_level: str
        one of the following:
        - managed
        - managed_well
        - managed_poorly
        - unmanaged_more5m
        - unmanaged_less5m
        - uncategorized

    Returns
    -------
    ox: float
        oxidation factor
        Units: dimensionless
    """
    dic = {
        "managed": 0.1,
        "managed_well": 0.1,
        "managed_poorly": 0.1,
        "unmanaged_more5m": 0,
        "unmanaged_less5m": 0,
        "uncategorized": 0,
    }

    ox = dic.get(management_level.lower())

    if ox is None:
        raise Exception(f"Error: {management_level} not in {dic.keys()}")

    return ox


def methane_generation_potential(
    mcf, doc, docf: float = 0.6, f: float = 0.5, *args, **kwargs
):
    """Methane Generation Potential

    specifies the amount of methane generated per ton of solid waste

    $$
    L_o = MCF x DOC x DOC_F x F x CH4:C
    $$

    Parameters
    ----------
    mcf: float
        methane correction factor
            managed= 1
            managed well = 0.5
            managed poorly = 0.7
            unmanaged (>5m deep) = 0.8
            unmanaged (<5m deep) = 0.4
            uncategorized = 0.6
        Units: dimensionless

    doc: float
        Degradable organic carbon
        Units: (tonnes C / tonnes waste)

    docf: float
        Fraction of DOC that is ultimately degraded.
        Reflects that some carbon does not degrade
        Assumed equal to 0.6
        Units: dimensionless

    f: float
        fraction of methane in landfill gas
        Default range 0.4-0.6 (usually taken to be 0.5)
        Units: dimensionless


    Returns
    -------
    Lo: float
        Methane generation potential
        Units: tonnes of CH4

    References
    ----------
    GPC version 7 Equation 8.4
        https://ghgprotocol.org/ghg-protocol-cities
    """

    # converts from carbon units to methane units
    CH4_TO_C = 16 / 12

    return mcf * doc * docf * f * CH4_TO_C


def methane_commitment(msw, lo, frec, ox, *args, **kwargs):
    """Methane commitment (MC) estimate for solid waste sent to landfill

    MC assigns landfill emissions based on waste disposed in a given year.
    It takes a lifecycle and mass-balance approach and calculates landfill emissions
    based on the amount of waste disposed in a given year,
    regardless of when the emissions actually occur.
    A portion of emissions are released every year after the waste is disposed.

    $$
    CH_4 = MSW x L_o x (1 - f_{ref}) x (1 - OX)
    $$

    Parameters
    ----------
    msw: float
        mass of solid waste (MSW) sent to landfill
        Units: Metric tonnes

    lo: float
        methane generation potential
        Units: dimensionless

    frec: float
        Fraction of methane recovered at the landfill (flared or energy recovery)
        Units: dimensionless

    ox: float
        oxidation factor
        Units: dimensionless

    Returns
    -------
    emissions: float
        methane emissions
        Units: Tonnes CH4

    References
    ----------
    GPC version 7 Equation 8.3
        https://ghgprotocol.org/ghg-protocol-cities
    """

    assert 0 <= frec <= 1, "frec must be between 0 and 1"
    assert 0 <= ox <= 1, "oxidation factor (ox) must be between 0 and 1"

    return msw * lo * (1 - frec) * (1 - ox)
