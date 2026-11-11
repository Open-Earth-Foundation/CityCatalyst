"""Registry of supported (region, methodology, methodologyVersion) combinations.

The registry key is `(region, methodology, version)`. `modality`
(`mitigation` | `adaptation`) selects the pipeline inside the resolved
combination. Unsupported combinations raise `UnsupportedCombinationError`.
Each registration validates its own caller inputs and its own backend config.
"""

from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from typing import Any

from pydantic import BaseModel

from app.methodologies.ccc.v1.config_schema import MethodologyConfig
from app.methodologies.ccc.v1.models import PrioritizationInputs
from app.methodologies.ccc.v1.pipeline import run_adaptation, run_mitigation
from app.regions.BR.sources import load_items, load_methodology_params
from app.shared.contracts import RankableItem, RankingResult

# Each pipeline receives the items, its own validated backend config and its
# own validated caller inputs. The concrete model types are owned by the
# registration, so the registry only knows them as pydantic models.
Pipeline = Callable[[list[RankableItem], BaseModel, BaseModel], RankingResult]
CombinationKey = tuple[str, str, str]


@dataclass(frozen=True)
class RegisteredCombination:
    """Everything needed to run one region + methodology + version.

    Each registration supplies its own models, so combinations never share a
    schema:
    - `inputs_model` validates the caller's `inputs` object (strictly).
    - `load_config` returns the server-owned settings, validated against the
      registration's own config model.
    The registry is the only place where region code and methodology code meet.
    """

    pipelines: dict[str, Pipeline]
    inputs_model: type[BaseModel]
    load_items: Callable[[str, BaseModel], list[RankableItem]]
    load_config: Callable[[], BaseModel]

    def validate_inputs(self, raw_inputs: dict[str, Any]) -> BaseModel:
        """Validate the caller's `inputs` object with this registration's model.

        Args:
            raw_inputs: The `inputs` object from the request.

        Returns:
            The validated inputs model.

        Raises:
            pydantic.ValidationError: On missing fields, wrong types or unexpected fields.
        """
        return self.inputs_model.model_validate(raw_inputs)


def validate_config(
    config_model: type[BaseModel], load_raw: Callable[[], dict[str, Any]]
) -> BaseModel:
    """Validate raw region settings with a methodology's own config model.

    Args:
        config_model: The registration's config model (it should reject unknown settings).
        load_raw: Returns the raw settings from the region.

    Returns:
        The validated config.

    Raises:
        pydantic.ValidationError: If the settings do not fit the model.
    """
    return config_model.model_validate(load_raw())


class UnsupportedCombinationError(Exception):
    """Raised when no registered pipeline matches the requested combination."""

    def __init__(
        self,
        region: str,
        methodology: str,
        methodology_version: str,
        modality: str,
        modality_is_reason: bool,
        supported_modalities: list[str],
    ) -> None:
        """Store the requested combination and why it was rejected.

        Args:
            region: Requested region code.
            methodology: Requested methodology identifier.
            methodology_version: Requested methodology version.
            modality: Requested modality.
            modality_is_reason: True when region/methodology/version exist but
                have no pipeline for `modality`.
            supported_modalities: Modalities available for the combination
                (empty when the combination itself is unknown).
        """
        self.region = region
        self.methodology = methodology
        self.methodology_version = methodology_version
        self.modality = modality
        self.modality_is_reason = modality_is_reason
        self.supported_modalities = supported_modalities
        super().__init__(
            f"unsupported combination region={region} methodology={methodology} "
            f"methodologyVersion={methodology_version} modality={modality}"
        )


REGISTRY: dict[CombinationKey, RegisteredCombination] = {
    ("BR", "ccc", "v1"): RegisteredCombination(
        pipelines={"mitigation": run_mitigation, "adaptation": run_adaptation},
        inputs_model=PrioritizationInputs,
        load_items=load_items,
        load_config=partial(
            validate_config,
            MethodologyConfig,
            partial(load_methodology_params, "ccc", "v1"),
        ),
    ),
}


def resolve(
    region: str, methodology: str, methodology_version: str, modality: str
) -> tuple[RegisteredCombination, Pipeline]:
    """Find the combination and the pipeline for the requested modality.

    Args:
        region: Region code, e.g. `BR`.
        methodology: Methodology identifier, e.g. `ccc`.
        methodology_version: Methodology version, e.g. `v1`.
        modality: `mitigation` or `adaptation`.

    Returns:
        The registered combination and the pipeline to run.

    Raises:
        UnsupportedCombinationError: If the combination or its modality is not registered.
    """
    # Step 1: resolve the (region, methodology, version) key
    combination = REGISTRY.get((region, methodology, methodology_version))
    if combination is None:
        raise UnsupportedCombinationError(
            region, methodology, methodology_version, modality, False, []
        )

    # Step 2: modality picks the pipeline inside the methodology
    pipeline = combination.pipelines.get(modality)
    if pipeline is None:
        raise UnsupportedCombinationError(
            region,
            methodology,
            methodology_version,
            modality,
            True,
            sorted(combination.pipelines),
        )
    return combination, pipeline
