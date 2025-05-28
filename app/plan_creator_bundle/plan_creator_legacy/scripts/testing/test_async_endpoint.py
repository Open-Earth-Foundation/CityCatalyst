"""
Test the asynchronous plan creation endpoint.

Run with:
python -m plan_creator_legacy.scripts.testing.test_async_endpoint
"""

import json
import requests
import time
from pathlib import Path
from datetime import datetime
import argparse

# API endpoint configuration
# BASE_URL = "https://cap-plan-creator.openearth.dev"
BASE_URL = "http://localhost:8000"  # Uncomment for local testing

# Endpoint URLs
START_PLAN_URL = f"{BASE_URL}/plan-creator-legacy/start_plan_creation"
CHECK_PROGRESS_URL = f"{BASE_URL}/plan-creator-legacy/check_progress"
GET_PLAN_URL = f"{BASE_URL}/plan-creator-legacy/get_plan"

# Configuration
POLLING_INTERVAL = 5  # seconds
MAX_POLLING_TIME = 600  # seconds (10 minutes)
REQUEST_TIMEOUT = 30  # seconds for individual API calls


def load_json_file(filepath: str) -> dict:
    """Load JSON data from a file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {str(e)}")
        raise


def test_async_plan_creation(city_name="Aracruz", language="pt"):
    """Test the asynchronous plan creation workflow."""
    try:
        print("Starting asynchronous plan creation test")

        # Load action data
        action_data = load_json_file("plan_creator_legacy/data/input/c40_0028.json")

        # Prepare request data with city name
        request_data = {
            "action": action_data,
            "city_name": city_name,
            "language": language,
        }

        # Step 1: Start plan creation
        print(f"Step 1: Sending request to {START_PLAN_URL}")
        print(f"Using city name: {city_name}")

        start_response = requests.post(
            START_PLAN_URL, json=request_data, timeout=REQUEST_TIMEOUT
        )

        if start_response.status_code != 202:
            print(f"Error starting plan creation: {start_response.status_code}")
            print(start_response.text)
            return

        # Get task ID from response
        task_data = start_response.json()
        task_id = task_data.get("task_id")

        if not task_id:
            print("Error: No task ID returned")
            return

        print(f"Plan creation started with task ID: {task_id}")
        print(f"Initial status: {task_data.get('status', 'unknown')}")

        # Step 2: Poll for progress
        print("\nStep 2: Polling for progress")
        start_time = time.time()
        completed = False

        while time.time() - start_time < MAX_POLLING_TIME:
            try:
                progress_url = f"{CHECK_PROGRESS_URL}/{task_id}"
                print(f"Checking progress at {progress_url}")

                progress_response = requests.get(progress_url, timeout=REQUEST_TIMEOUT)

                if progress_response.status_code != 200:
                    print(f"Error checking progress: {progress_response.status_code}")
                    print(progress_response.text)
                    time.sleep(POLLING_INTERVAL)
                    continue

                progress_data = progress_response.json()
                status = progress_data.get("status")

                print(f"Current status: {status}")

                if status == "completed":
                    completed = True
                    break
                elif status == "failed":
                    print("Plan creation failed!")
                    if "error" in progress_data:
                        print(f"Error: {progress_data['error']}")
                    return

                # Wait before polling again
                print(f"Waiting {POLLING_INTERVAL} seconds before checking again...")
                time.sleep(POLLING_INTERVAL)

            except requests.exceptions.RequestException as e:
                print(f"Error during polling: {str(e)}")
                time.sleep(POLLING_INTERVAL)

        if not completed:
            print(f"Timed out after {MAX_POLLING_TIME} seconds")
            return

        # Step 3: Get the completed plan
        print("\nStep 3: Retrieving completed plan")
        plan_url = f"{GET_PLAN_URL}/{task_id}"

        try:
            plan_response = requests.get(plan_url, timeout=REQUEST_TIMEOUT)

            if plan_response.status_code != 200:
                print(f"Error retrieving plan: {plan_response.status_code}")
                print(plan_response.text)
                return

            # Save the response to test_output directory
            output_dir = Path("plan_creator_legacy/data/output")
            output_dir.mkdir(exist_ok=True, parents=True)

            # Save with timestamp and action ID
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
            action_id = action_data.get("ActionID", "unknown")
            filename = f"{timestamp}_{action_id}_{city_name.replace(' ', '_')}_{language}_async_test_response.md"
            output_path = output_dir / filename

            with open(output_path, "wb") as f:
                f.write(plan_response.content)

            print(f"Success! Plan saved to: {output_path}")

        except requests.exceptions.RequestException as e:
            print(f"Error retrieving plan: {str(e)}")

    except Exception as e:
        print(f"Test failed: {str(e)}")
        raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--city", default="Aracruz", help="Name of the city")
    parser.add_argument(
        "--language",
        type=str,
        required=True,
        choices=["en", "es", "pt"],
        help="The language of the response. One of 'en', 'es' or 'pt'.",
    )

    args = parser.parse_args()
    test_async_plan_creation(args.city, args.language)
