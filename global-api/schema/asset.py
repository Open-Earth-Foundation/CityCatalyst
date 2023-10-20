"""
ClimateTRACE asset table
(see `READ ME`at https://climatetrace.org/downloads for detailed descriptions)
- asset_id = The internal Climate TRACE identifier
- filename  = name of file without extension
- reference_number = GPC reference number data is useful for
- iso3_country = ISO 3166-1 alpha-3 speficication of the country
- original_inventory_sector = IPCC emissions sector to which the asset belongs
- start_time = time in UTC of emissions
- end_time = time in UTC of emissions
- temporal_granularity = Resolution of the data available.
- gas = CO2, CH4, N2O, or CO2-eq. latter uses AR6 GWP 100 year or 20 year  time frame
- emissions_quantity = Quantity metric tonnes. 0 = gas not emitted. empty/null/N-A = not yet available
- emissions_factor = Emissions factor of reported activity. vary by sector, subsector, and asset type
- emissions_factor_units = Units of reported "emissions factor" field.
- capacity = Capacity of the entity producing emissions
- capacity_units = Units of reported "capacity" field
- asset_name = Name of the entity or asset that produced the emissions
- asset_type = Description of the asset's classification
- st_astext = WKT representation of the geometry/geography
- lat = latitude extracted from st_astext
- lon = longitude extracted from st_astext
- created_date = Date asset was added to the Climate TRACE database
- modified_date = Last date on which any updates were made to the dataset for the specific asset.
"""
from base import Base
import datetime
from sqlalchemy import Column, Float, Integer, String, DateTime

class Asset(Base):
    __tablename__ = 'Asset'
    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(Integer, nullable=True)
    filename = Column(String, nullable=True)
    reference_number = Column(String, nullable=True)
    iso3_country = Column(String, nullable=True)
    original_inventory_sector = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    temporal_granularity = Column(String, nullable=True)
    gas = Column(String, nullable=True)
    emissions_quantity = Column(Integer, nullable=True)
    emissions_factor = Column(Float, nullable=True)
    emissions_factor_units = Column(String, nullable=True)
    capacity = Column(Float, nullable=True)
    capacity_units = Column(String, nullable=True)
    capacity_factor = Column(Float, nullable=True)
    activity = Column(Float, nullable=True)
    activity_units = Column(String, nullable=True)
    asset_name = Column(String, nullable=True)
    asset_type = Column(String, nullable=True)
    st_astext = Column(String, nullable=True)
    lat = Column(float, nullable=True)
    lon = Column(float, nullable=True)
    created_date = Column(DateTime, nullable=True)
    modified_date = Column(DateTime, nullable=True)
    database_updated = Column(DateTime, default=datetime.datetime.utcnow(), onupdate=datetime.datetime.utcnow())
