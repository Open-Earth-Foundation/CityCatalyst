"""Registry of supported (region, methodology, methodologyVersion) combinations.

The registry key is `(region, methodology, version)`. `modality`
(`mitigation` | `adaptation`) selects the pipeline inside the resolved
combination. Unsupported combinations raise `UnsupportedCombinationError`.
"""

from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from typing import Any

from app.methodologies.ccc.v1.config_schema import MethodologyConfig
from app.methodologies.ccc.v1.pipeline import run_adaptation, run_mitigation
from app.regions.BR.sources import load_items, load_methodology_params
from app.shared.contracts import RankableItem, RankingResult

Pipeline = Callable[[list[RankableItem], MethodologyConfig], RankingResult]
CombinationKey = tuple[str, str, str]


@dataclass(frozen=True)
class RegisteredCombination:
    """Everything needed to run one region + methodology + version.

    The registry is the only place where region code and methodology code meet:
    the region supplies raw parameters, the methodology's model validates them.
    """

    pipelines: dict[str, Pipeline]
    load_items: Callable[[str], list[RankableItem]]
    load_raw_config: Callable[[], dict[str, Any]]

    def load_config(self) -> MethodologyConfig:
        """Return the region parameters validated as a methodology config.

        Raises:
            pydantic.ValidationError: If the region parameters do not fit the methodology schema.
        """
        return MethodologyConfig(**self.load_raw_config())


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
        load_items=load_items,
        load_raw_config=partial(load_methodology_params, "ccc", "v1"),
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
