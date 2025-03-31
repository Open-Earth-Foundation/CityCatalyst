#!/usr/bin/env python3

"""
Run the complete pipeline for a given city LOCODE.


Example:
python -m scripts.upload_to_frontend.run_pipeline --locode "BR BHZ"
"""

import argparse
from prioritizer.prioritizer import main as prioritizer_main
from scripts.upload_to_frontend.enrich_for_frontend_schema import main as enricher_main
from scripts.upload_to_frontend.upload_to_s3 import upload_to_s3

# Define supported languages
LANGUAGES = ["en", "es", "pt"]


def main(locode: str):
    """Run the complete pipeline for a given city LOCODE."""

    # print("\nRunning Prioritizer...")
    # prioritizer_main(locode)
    # print("Prioritization done.\n")

    # print("Running Enrich for frontend...")
    # enricher_main(locode, "mitigation")
    # enricher_main(locode, "adaptation")
    # print("Enriching done.\n")

    print("Running Upload to S3...")
    # Upload each language version for both adaptation and mitigation
    for language in LANGUAGES:
        # Upload adaptation files
        upload_to_s3(
            f"output_{locode}_adaptation_enriched_{language}.json",
            f"data/{language}/adaptation/{locode}.json",
        )
        # Upload mitigation files
        upload_to_s3(
            f"output_{locode}_mitigation_enriched_{language}.json",
            f"data/{language}/mitigation/{locode}.json",
        )
    print("Upload to S3 done.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the complete pipeline for climate action prioritization."
    )
    parser.add_argument(
        "--locode",
        type=str,
        required=True,
        help="The UN/LOCODE of the city for which to prioritize actions like 'BR BVB'.",
    )
    args = parser.parse_args()

    main(args.locode)
