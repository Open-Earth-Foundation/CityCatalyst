# Global API Schema

- `base.py` contains the `declarative_base()` class which all mapped classes should inherit
- `asset.py` contains the `Asset` class containing the same nomenclature used in the [ClimateTRACE downloadable files](https://static.climatetrace.org/files/6363d37647726.pdf?v=ceafac084711f6e88b915949f9be26a3)
- `create_database.py` creates database user parameters defined as GitHub secrets

## Create database
The following command will create the database. No arguments are needed if database parameters are stored in environment variables.
```python
python create_database.py
```