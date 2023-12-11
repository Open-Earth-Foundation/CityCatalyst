import argparse
import csv
from datetime import datetime
import os
from pathlib import Path
import psycopg2
from sqlalchemy import create_engine, insert, MetaData, Table
from sqlalchemy.orm import sessionmaker


def get_tables(database_uri):
    """get the import order list"""

    def topological_sort(graph, node, visited, stack):
        visited[node] = True
        for neighbor in graph[node]:
            if not visited[neighbor]:
                topological_sort(graph, neighbor, visited, stack)
        stack.append(node)

    def get_topological_order(graph):
        visited = {node: False for node in graph}
        stack = []
        for node in graph:
            if not visited[node]:
                topological_sort(graph, node, visited, stack)
        return stack

    engine = create_engine(database_uri)
    metadata_obj = MetaData()
    metadata_obj.reflect(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Create a dictionary to represent the dependency graph
    table_dependencies = {}

    # Iterate through tables and their foreign key constraints
    for table_name, table in metadata_obj.tables.items():
        dependent_tables = []
        for constraint in table.foreign_key_constraints:
            dependent_table_name = constraint.referred_table.name
            dependent_tables.append(dependent_table_name)
        table_dependencies[table_name] = dependent_tables

    session.close()

    return get_topological_order(table_dependencies)


def get_pkeys(database_uri):
    """get primary keys dict"""
    engine = create_engine(database_uri)
    metadata_obj = MetaData()
    metadata_obj.reflect(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Initialize an empty dictionary to store table names and primary keys
    pkeys = {}

    # Iterate through tables and retrieve primary key columns
    for table_name, table in metadata_obj.tables.items():
        primary_key_columns = []
        for column in table.primary_key.columns:
            primary_key_columns.append(column.name)
        pkeys[table_name] = primary_key_columns

    session.close()

    return pkeys


def get_table_fields(table, metadata_obj, engine):
    """get the fields from a table"""
    table_obj = Table(table, metadata_obj, autoload_with=engine)
    return [col.name for col in table_obj.columns]


def import_row(curs, table, pkey, row):

    # TODO: check that these always return in order

    columns = list(row.keys())
    vals = list(map(lambda v: None if v == "" else v, row.values()))

    now = datetime.now()

    # Append create and update timestamp

    columns.append("last_updated")
    vals.append(now)

    columns.append("created")
    vals.append(now)

    # These are used for update; remove the pkey!

    nonkeys = list(filter(lambda col: col not in pkey, columns))

    # Remove create timestamp

    toupdate = nonkeys[:-1]

    if len(toupdate) > 1:
        qry = f"""
        INSERT INTO "{table}" ({", ".join(map(lambda col: f'"{col}"', columns))})
        VALUES ({", ".join(['%s'] * len(vals))})
        ON CONFLICT ({", ".join(map(lambda col: f'"{col}"', pkey))})
        DO UPDATE
            SET ({", ".join(map(lambda col: f'"{col}"', toupdate))}) = ({", ".join(map(lambda col: f'EXCLUDED."{col}"', toupdate))})
            WHERE {" OR ".join(map(lambda col: f'("{table}"."{col}" IS NULL AND EXCLUDED."{col}" IS NOT NULL) OR ("{table}"."{col}" IS NOT NULL AND EXCLUDED."{col}" IS NULL) OR ("{table}"."{col}" != EXCLUDED."{col}")', toupdate[:-1]))}
        """
    else:
        qry = f"""
        INSERT INTO "{table}" ({", ".join(map(lambda col: f'"{col}"', columns))})
        VALUES ({", ".join(['%s'] * len(vals))})
        ON CONFLICT ({", ".join(map(lambda col: f'"{col}"', pkey))})
        DO NOTHING
        """

    curs.execute(qry, vals)


def import_table(curs, table, pkey, path):

    with path.open() as f:
        data = csv.DictReader(f)
        for row in data:
            import_row(curs, table, pkey, row)


def delete_row(curs, table, pkey, row):

    vals = list(map(lambda v: None if v == "" else v, row.values()))

    qry = f"""
    DELETE FROM "{table}"
    WHERE {" AND ".join(list(map(lambda x: f'{x} = %s', list(row.keys()))))}
    """

    curs.execute(qry, vals)


def delete_from_table(curs, table, pkey, path):
    with path.open() as f:
        data = csv.DictReader(f)
        for row in data:
            delete_row(curs, table, pkey, row)


def import_citycatalyst_data(tables, pkeys, csv_dir, host, dbname, user, password):

    with psycopg2.connect(
        dbname=dbname, user=user, password=password, host=host
    ) as conn:

        with conn.cursor() as curs:

            for table in tables:
                p = Path(csv_dir) / f"{table}.csv"
                if p.is_file():
                    import_table(curs, table, pkeys[table], p)

            # For deletions, we work in reverse order!
            for table in reversed(tables):
                p = Path(csv_dir) / f"{table}.delete.csv"
                if p.is_file():
                    delete_from_table(curs, table, pkeys[table], p)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dbname", help="database name", default=os.environ.get("CC_DATABASE")
    )
    parser.add_argument(
        "--user", help="database user", default=os.environ.get("CC_USER")
    )
    parser.add_argument(
        "--password", help="database password", default=os.environ.get("CC_PASSWORD")
    )
    parser.add_argument(
        "--host", help="database host", default=os.environ.get("CC_HOST")
    )
    parser.add_argument("dir", help="directory with CSV files for CityCatalyst tables")
    args = parser.parse_args()

    # build databse URI
    components = [f"postgresql://{args.user}"]
    if args.password:
        components.append(f":{args.password}")
    components.extend([f"@{args.host}", f"/{args.dbname}"])
    database_uri = "".join(components)

    # get list of tables and dictionary of primary keys
    TABLES = get_tables(database_uri)
    PKEYS = get_pkeys(database_uri)

    import_citycatalyst_data(
        tables=TABLES,
        pkeys=PKEYS,
        csv_dir=args.dir,
        host=args.host,
        dbname=args.dbname,
        user=args.user,
        password=args.password,
    )
