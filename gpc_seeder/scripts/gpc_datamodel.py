from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Sector:
    name: str
    refno: str

    def __eq__(self, other):
        if isinstance(other, Sector):
            return (self.name, self.refno) == (other.name, other.refno)
        return False

    def __hash__(self):
        return hash((self.name, self.refno))


@dataclass
class SubSector:
    sector: Sector
    name: str
    refno: str
    scope: str
    reporting_level: str

    def __eq__(self, other):
        if isinstance(other, SubSector):
            return (
                self.sector,
                self.name,
                self.refno,
                self.scope,
                self.reporting_level,
            ) == (
                other.sector,
                other.name,
                other.refno,
                other.scope,
                other.reporting_level,
            )
        return False

    def __hash__(self):
        return hash(
            (self.sector, self.name, self.refno, self.scope, self.reporting_level)
        )


@dataclass
class SubCategory:
    subsector: SubSector
    name: str
    refno: str
    scope: str
    reporting_level: str

    def __eq__(self, other):
        if isinstance(other, SubCategory):
            return (
                self.subsector,
                self.name,
                self.refno,
                self.scope,
                self.reporting_level,
            ) == (
                other.subsector,
                other.name,
                other.refno,
                other.scope,
                other.reporting_level,
            )
        return False

    def __hash__(self):
        return hash(
            (self.subsector, self.name, self.refno, self.scope, self.reporting_level)
        )


@dataclass
class GPC:
    sectors: List[Sector]
    subsectors: List[SubSector]
    subcategories: List[SubCategory]

    def list_sectors(self) -> List[str]:
        return list(set(sector.name for sector in self.sectors))

    def list_subsectors(self, sector: str) -> List[str]:
        return list(
            subsector.name
            for subsector in self.subsectors
            if subsector.sector.name == sector
        )

    def list_subcategories(self, sector: str, subsector: str) -> List[str]:
        return list(
            subcategory_obj.name
            for subcategory_obj in self.subcategories
            if subcategory_obj.subsector.sector.name == sector
            and subcategory_obj.subsector.name == subsector
        )

    def list_scopes(self) -> List[str]:
        return list(set([item.scope for item in self.subcategories]))

    def list_reporting_levels(self) -> List[str]:
        return list(set([item.reporting_level for item in self.subcategories]))

    def _find_subsector(self, sector: str, subsector: str) -> Optional[SubSector]:
        for subsector_obj in self.subsectors:
            if subsector_obj.sector.name == sector and subsector_obj.name == subsector:
                return subsector_obj
        return None

    def _find_subcategory(
        self, sector: str, subsector: str, subcategory: str
    ) -> Optional[SubCategory]:
        for subcategory_obj in self.subcategories:
            if (
                subcategory_obj.subsector.sector.name == sector
                and subcategory_obj.subsector.name == subsector
                and subcategory_obj.name == subcategory
            ):
                return subcategory_obj
        return None

    def subsector_refno(self, sector: str, subsector: str) -> Optional[str]:
        subsector = self._find_subsector(sector, subsector)
        return subsector.refno if subsector else None

    def subsector_scope(self, sector: str, subsector: str) -> Optional[str]:
        subsector = self._find_subsector(sector, subsector)
        return subsector.scope if subsector else None

    def subsector_reporting_level(self, sector: str, subsector: str) -> Optional[str]:
        subsector = self._find_subsector(sector, subsector)
        return subsector.reporting_level if subsector else None

    def subcategory_refno(
        self, sector: str, subsector: str, subcategory: str
    ) -> Optional[str]:
        subcategory = self._find_subcategory(sector, subsector, subcategory)
        return subcategory.refno if subcategory else None

    def subcategory_scope(
        self, sector: str, subsector: str, subcategory: str
    ) -> Optional[str]:
        subcategory = self._find_subcategory(sector, subsector, subcategory)
        return subcategory.scope if subcategory else None

    def subcategory_reporting_level(
        self, sector: str, subsector: str, subcategory: str
    ) -> Optional[str]:
        subcategory = self._find_subcategory(sector, subsector, subcategory)
        return subcategory.reporting_level if subcategory else None
