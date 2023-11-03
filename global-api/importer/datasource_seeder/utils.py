import csv
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import uuid

def insert_record(engine, table, pkey, record):
    """insert record into table"""
    fields = [col.name for col in table.columns]

    table_data = {key: record.get(key) for key in record.keys() if key in fields}

    pkey_value = table_data.get(pkey)

    with engine.begin() as conn:
        pkey_exists = conn.execute(
            table.select().where(table.columns[pkey] == pkey_value)
        ).fetchone()

        if not pkey_exists:
            ins = table.insert().values(**table_data)
            conn.execute(ins)

def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))


def write_dic_to_csv(output_dir, name, dic) -> None:
    """writes dictionary to a csv"""
    if isinstance(dic, dict):
        dic = [dic]

    with open(f"{output_dir}/{name}.csv", mode="w") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=dic[0].keys())
        writer.writeheader()
        writer.writerows(dic)


def make_dir(path: str) -> None:
    """Create a new directory at this given path if one does not exist already"""
    assert isinstance(
        path, str
    ), f"ERROR: the path must be a string; you passed a {type(path)}"

    # settings mimic "mkdir -p <path>"
    Path(path).mkdir(parents=True, exist_ok=True)


@dataclass
class Publisher:
    """publisher dataclass"""
    publisher_id: str # UUID(name+URL)
    name: str
    URL: str
    created_date: str = field(default_factory=lambda: datetime.now().isoformat())
    modified_date: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class DataSource:
    """datasource dataclass"""
    datasource_id: str # UUID(publisher_id+name+gpc_reference_number)
    publisher_id: str
    name: str
    description: str
    source_type: str
    access_type: str
    url: str
    geographical_location: str
    start_year: int
    end_year: int
    latest_accounting_year: int
    frequency_of_update: str
    spatial_resolution: str
    language: str
    accessibility: str
    data_quality: str
    notes: str
    units: str
    methodology_url: str
    retrieval_method: str
    api_endpoint: str
    gpc_reference_number: str
    created_date: str = field(default_factory=lambda: datetime.now().isoformat())
    modified_date: str = field(default_factory=lambda: datetime.now().isoformat())