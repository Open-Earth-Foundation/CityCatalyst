import csv
from pathlib import Path
import uuid


def uuid_generate_v4():
    """generate a version 4 UUID"""
    return str(uuid.uuid4())


def write_dic_to_csv(output_dir, name, dic) -> None:
    """writes dictionary to a csv

    Parameters
    -----------
    output_dir: str
        path where csv will be created

    name: str
        the name of the CSV file without the .csv extension

    dic: List[Dict] or Dict
        data to store in CSV

    Returns
    --------
    None:
        a csv is created at {output_dir}/{name}.csv

    Example
    ---------
    write_dic_to_csv('./', 'test', {'id': 1, 'value': 2})
    """
    if isinstance(dic, dict):
        dic = [dic]

    with open(f"{output_dir}/{name}.csv", mode="w") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=dic[0].keys())
        writer.writeheader()
        writer.writerows(dic)


def make_dir(path: str) -> None:
    """Create a new directory at this given path if one does not exist already

    Parameters
    ----------
    path: str
        the path to the directory you want to create

    Returns
    ---------
    None:

    Example
    --------
    make_dir('/path/to/new/directory')
    """
    assert isinstance(
        path, str
    ), f"ERROR: the path must be a string; you passed a {type(path)}"

    # settings mimic "mkdir -p <path>"
    Path(path).mkdir(parents=True, exist_ok=True)
