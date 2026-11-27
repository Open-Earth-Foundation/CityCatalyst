"""Extraction contract and checks that do not depend on model judgment."""

from typing import Annotated, Literal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

Page = Annotated[int, Field(strict=True, ge=1)]
Text = Annotated[str, Field(min_length=1)]


class Contract(BaseModel):
    """Reject extra fields so callers receive a stable contract."""

    model_config = ConfigDict(extra="forbid")


class TaxonomyField(Contract):
    """An extractable field identified in the supplied taxonomy."""

    id: Text
    label: Text
    definition: Text
    allowed_units: list[str]
    taxonomy_pages: Annotated[list[Page], Field(min_length=1)]


class Evidence(Contract):
    """A source passage, using one-based physical PDF page numbers."""

    pdf_page: Page
    printed_page: str | None
    quote: Text


class Observation(Contract):
    """One reported value, preserving its year, unit, and geographic boundary."""

    value: Text
    unit: str | None
    year: str | None
    geography: str | None
    evidence: Annotated[list[Evidence], Field(min_length=1)]
    notes: list[str]


class FieldResult(Contract):
    """An explicit outcome for one taxonomy field, including unresolved searches."""

    field_id: Text
    status: Literal[
        "found", "ambiguous", "not_found_after_search", "unreadable", "not_searched"
    ]
    observations: list[Observation]
    searched_pages: list[Page]
    explanation: Text

    @model_validator(mode="after")
    def consistent_status(self) -> "FieldResult":
        """Prevent a missing-field result from silently carrying accepted values."""
        if self.status == "found" and not self.observations:
            raise ValueError("found requires at least one observation")
        if (
            self.status in {"not_found_after_search", "unreadable", "not_searched"}
            and self.observations
        ):
            raise ValueError("unresolved fields cannot contain observations")
        if self.status != "not_searched" and not self.searched_pages:
            raise ValueError("a searched field must identify searched_pages")
        if self.status == "not_searched" and self.searched_pages:
            raise ValueError("not_searched cannot identify searched pages")
        return self


class ExtractionResult(Contract):
    """Candidate records and an honest account of document coverage."""

    schema_version: Literal["1.0"]
    city: Text
    taxonomy: Annotated[list[TaxonomyField], Field(min_length=1)]
    taxonomy_pages_reviewed: list[Page]
    city_pages_reviewed: list[Page]
    fields: list[FieldResult]
    warnings: list[str]

    @model_validator(mode="after")
    def complete_field_accounting(self) -> "ExtractionResult":
        """Require exactly one outcome per taxonomy field and unique field IDs."""
        expected = [field.id for field in self.taxonomy]
        actual = [field.field_id for field in self.fields]
        if len(set(expected)) != len(expected) or len(set(actual)) != len(actual):
            raise ValueError("taxonomy and result field IDs must be unique")
        if set(expected) != set(actual):
            raise ValueError(
                "results must cover exactly the supplied taxonomy field IDs"
            )
        return self

    def check_sources(
        self, city: str, city_pages: int, taxonomy_pages: int
    ) -> list[str]:
        """Check document bounds and return coverage warnings, not accuracy claims."""
        if self.city != city:
            raise ValueError("result city does not match the request")
        city_refs = list(self.city_pages_reviewed)
        taxonomy_refs = list(self.taxonomy_pages_reviewed)
        for field in self.taxonomy:
            taxonomy_refs.extend(field.taxonomy_pages)
        for field in self.fields:
            city_refs.extend(field.searched_pages)
            for observation in field.observations:
                city_refs.extend(e.pdf_page for e in observation.evidence)
        if any(page > city_pages for page in city_refs):
            raise ValueError("city page reference is outside the submitted PDF")
        if any(page > taxonomy_pages for page in taxonomy_refs):
            raise ValueError("taxonomy page reference is outside the submitted PDF")
        warnings = []
        if len(set(self.city_pages_reviewed)) != city_pages:
            warnings.append("The agent did not report reviewing every city PDF page.")
        if len(set(self.taxonomy_pages_reviewed)) != taxonomy_pages:
            warnings.append(
                "The agent did not report reviewing every taxonomy PDF page."
            )
        return warnings


class SchemaExtractionResult(Contract):
    """Typed data requested through JSON Schema, with a separate evidence record."""

    schema_version: Literal["1.0"]
    city: Text
    data: dict[str, Any]
    fields: list[FieldResult]
    city_pages_reviewed: list[Page]
    warnings: list[str]

    def check_sources(self, city: str, city_pages: int) -> list[str]:
        """Check page references and require evidence for every populated data leaf."""
        from extractor.schema import leaf_paths

        if self.city != city:
            raise ValueError("result label does not match the request")
        ids = [field.field_id for field in self.fields]
        if len(ids) != len(set(ids)):
            raise ValueError("result field paths must be unique")
        populated = set(leaf_paths(self.data))
        if not set(leaf_paths(self.data, include_null=True)).issubset(set(ids)):
            raise ValueError(
                "every data leaf, including null, requires a field outcome"
            )
        supported = {field.field_id for field in self.fields if field.observations}
        if not populated.issubset(supported):
            raise ValueError("every populated data leaf requires source evidence")
        all_leaves = set(leaf_paths(self.data, include_null=True))
        if not supported.issubset(all_leaves):
            raise ValueError("observation paths must identify existing data leaves")
        null_evidence = [
            field.field_id
            for field in self.fields
            if field.observations
            and field.field_id not in populated
            and field.status != "ambiguous"
        ]
        if null_evidence:
            raise ValueError(
                "evidence for a null value must be marked ambiguous: "
                + ", ".join(null_evidence[:20])
            )
        refs = list(self.city_pages_reviewed)
        for field in self.fields:
            if not field.field_id.startswith("/"):
                raise ValueError(
                    "schema field IDs must be JSON Pointers beginning with /"
                )
            refs.extend(field.searched_pages)
            for observation in field.observations:
                refs.extend(item.pdf_page for item in observation.evidence)
        if any(page > city_pages for page in refs):
            raise ValueError("page reference is outside the submitted PDF")
        return (
            []
            if len(set(self.city_pages_reviewed)) == city_pages
            else ["The agent did not report reviewing every report page."]
        )
