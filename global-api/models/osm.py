from sqlalchemy import Column, Integer, String, Float, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Osm(Base):
    __tablename__ = 'osm'

    locode = Column(String, primary_key=True)
    geometry = Column(Text)
    bbox_north = Column(Float, index=True)
    bbox_south = Column(Float, index=True)
    bbox_east = Column(Float, index=True)
    bbox_west = Column(Float, index=True)
    place_id = Column(Integer)
    osm_type = Column(String)
    osm_id = Column(Integer, unique=True)
    lat = Column(Float)
    lon = Column(Float)
    class_ = Column('class', String)  # 'class' is a reserved keyword in Python, hence the trailing underscore
    type = Column(String)
    place_rank = Column(Integer)
    importance = Column(Float)
    addresstype = Column(String)
    name = Column(String)
    display_name = Column(String)
