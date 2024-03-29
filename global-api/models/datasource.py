from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Datasource(Base):
    __tablename__ = 'datasource'

    datasource_id = Column(String, primary_key=True)
    publisher_id = Column(String)
    source_type = Column(String)
    dataset_url = Column(Text)
    access_type = Column(String)
    geographical_location = Column(String)
    start_year = Column(Integer)
    end_year = Column(Integer)
    latest_accounting_year = Column(Integer)
    frequency_of_update = Column(String)
    spatial_resolution = Column(String)
    language = Column(String)
    accessibility = Column(String)
    data_quality = Column(String)
    notes = Column(String)
    units = Column(String)
    methodology_url = Column(Text)
    retrieval_method = Column(String)
    api_endpoint = Column(String)
    gpc_reference_number = Column(String)
    created_date = Column(DateTime)
    modified_date = Column(DateTime)
    datasource_name = Column(String)
    dataset_name = Column(Text)
    methodology_description = Column(Text)
    transformation_description = Column(Text)
    scope = Column(String)
    dataset_description = Column(Text)

    def to_dict(self):
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}