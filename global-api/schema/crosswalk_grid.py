"""
Crosswalk Labs data
(see https://daac.ornl.gov/NACP/guides/Vulcan_V3_Annual_Emissions.html#datadescraccess for detailed descriptions)

'cw_grid_cell'
lat_center = center of the grid cell in degree using WGS84 CRS
lon_center = center of the grid cell in degree using WGS84 CRS
geometry = GeoJSON for grid cell
area = area of the geometry
created_date = date the grid data was added to the database
modified_date = last date on which any updates were made to the dataset for the specific grid

'cw_grid_cell_emissions'
year = year to which the emissions correspond
reference_number = GPC reference number data is useful for
gas = CO, CO2, CH4, N2O
emissions_quantity = quantity Megagrams by squared kilometer by year. empty/null/N-A = not yet available
emissions_quantity_units = units of reported "emissions_quantity" field
grid_id = unique id for grid cell
created_date = date the emissions data was added to the database
modified_date = last date on which any updates were made to the dataset for the specific grid
    
'cw_city_cell_overlap'
locode = a unique identifier for each city or region
gas = CO, CO2
fraction_in_city = percent of the grid cell within city boundary
grid_id = unique id for grid cell
created_date = date the percent information was added to the database
modified_date = last date on which any updates were made to the dataset for the specific grid

"""

from base import Base
import datetime
from sqlalchemy import Column, Float, String, DateTime, Integer

class crosswalk_GridCell(Base):
    __tablename__ = 'crosswalk_GridCell'
    id = Column(Integer, primary_key=True, autoincrement=True),
    lat_center = Column(Float, nullable=False),
    lon_center = Column(Float, nullable=False),
    geometry = Column(String, nullable=False),
    area = Column(Float, nullable=False),
    created_date = Column(DateTime, nullable=False),
    modified_date = Column(DateTime, default=datetime.datetime.utcnow(), onupdate=datetime.datetime.utcnow())

class crosswalk_GridCellEmissions(Base):
    __tablename__ = 'crosswalk_GridCellEmissions'
    id = Column(Integer, primary_key=True, autoincrement=True),
    year = Column(Integer, nullable=False),
    reference_number = Column(String, nullable=False),
    gas = Column(String, nullable=False),
    emissions_quantity = Column(Integer, nullable=False),
    emissions_quantity_units = Column(String, nullable=False),
    grid_id = Column(Integer, nullable=False),
    created_date = Column(DateTime, nullable=False),
    modified_date = Column(DateTime, default=datetime.datetime.utcnow(), onupdate=datetime.datetime.utcnow())
    
class crosswalk_CityGridOverlap(Base):
    __tablename__ = 'crosswalk_CityGridOverlap'
    id = Column(Integer, primary_key=True, autoincrement=True),
    locode = Column(String, nullable=False),
    fraction_in_city = Column(Float, nullable=False),
    grid_id = Column(Integer, nullable=False),
    created_date = Column(DateTime, nullable=False),
    modified_date = Column(DateTime, default=datetime.datetime.utcnow(), onupdate=datetime.datetime.utcnow())
    

