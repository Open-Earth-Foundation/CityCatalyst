import csv
import hashlib
from pathlib import Path
import random
import sys
import uuid


def get_filename():
    """returns the file name"""
    return Path(sys.argv[0]).name


def string_to_hash(string):
    """generate reproducible hash from a string

    Parameters
    -----------
    string: str
        string you want to hash

    Returns
    --------
    hash: int
        a sha256 hash of the string

    Example
    ---------
    hash_value = string_to_hash('oef')
    # ans: 41573739547895909249334528024575358810890736899293161579861901619623096988500
    """
    hasher = hashlib.sha256()
    hasher.update(string.encode("utf-8"))
    return int(hasher.hexdigest(), 16)


def set_seed(seed_value):
    """sets seed of random number generator"""
    random.seed(seed_value)


def uuid_generate_v4():
    """generate a version 4 UUID"""
    return uuid.UUID(int=random.getrandbits(128), version=4)


def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))


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
