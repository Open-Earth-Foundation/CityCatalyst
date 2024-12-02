from pathlib import Path
import argparse


def main(input: str, is_mitigation: bool, is_adaptation: bool):
    print(input, is_mitigation, is_adaptation)


if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description="Extract mitigation and/or adaptation actions from a a string of text using an LLM."
    )
    parser.add_argument("--input", type=str, required=True, help="Input text")
    parser.add_argument(
        "--mitigation",
        action="store_true",
        help="Flag to indicate whether to extract mitigation actions",
    )

    parser.add_argument(
        "--adaptation",
        action="store_true",
        help="Flag to indicate whether to extract adaptation actions",
    )

    args = parser.parse_args()

    main(args.input, args.mitigation, args.adaptation)
