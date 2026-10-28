#!/usr/bin/env python3
"""
Send Slack notifications for CI/CD failures.
"""

import json
import sys
import argparse
from typing import Dict, List, Any


def build_migration_failure_payload(args: argparse.Namespace) -> Dict[str, Any]:
    """Build Slack payload for migration failures."""

    # Determine environment and alert level
    if args.branch == "main":
        alert = "<!channel> "
        env_label = "Production"
    else:
        alert = ""
        env_label = "Development"

    short_sha = args.commit_sha[:8]

    # Build blocks
    blocks: List[Dict[str, Any]] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🚨 Database Migration Failed",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{alert}Migration failed during deployment to *{args.branch}* branch.\n\n⚠️ *Deployment halted. Immediate action required.*",
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Branch:*\n`{args.branch}`"},
                {"type": "mrkdwn", "text": f"*Environment:*\n{env_label}"},
                {"type": "mrkdwn", "text": f"*Author:*\n{args.author}"},
                {
                    "type": "mrkdwn",
                    "text": f"*SHA:*\n<{args.commit_url}|`{short_sha}`>",
                },
            ],
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Commit:* {args.commit_message}"},
        },
    ]

    # Add error section if we have error logs
    if args.error_logs and args.error_logs.strip():
        blocks.extend(
            [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Key Error:*\n```{args.error_logs}```",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"💡 <{args.workflow_url}|View full logs in workflow> for complete error details",
                        }
                    ],
                },
            ]
        )

    # Add action buttons
    blocks.append(
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "📋 View Full Logs",
                        "emoji": True,
                    },
                    "url": args.workflow_url,
                    "style": "danger",
                },
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "🔍 View Commit",
                        "emoji": True,
                    },
                    "url": args.commit_url,
                },
            ],
        }
    )

    return {"text": f"🚨 Migration Failed on {args.branch}", "blocks": blocks}


def build_deployment_failure_payload(args: argparse.Namespace) -> Dict[str, Any]:
    """Build Slack payload for deployment failures."""

    # Set emoji based on failed stage
    emoji_map = {"Tests": "🧪", "Docker Build": "🐳", "Deployment": "🚀"}
    emoji = emoji_map.get(args.failed_stage, "❌")

    # Determine environment and alert level
    if args.branch == "main":
        alert = "<!channel> "
        env_label = "Production ⚠️"
        stage_desc = (
            f"*PRODUCTION DEPLOYMENT FAILED*\n\n{args.failed_stage} stage failed"
        )
    else:
        alert = ""
        env_label = "Development"
        stage_desc = f"{args.failed_stage} stage failed"

    short_sha = args.commit_sha[:8]

    return {
        "text": f"{emoji} Deployment Failed on {args.branch}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} Deployment Failed - {args.failed_stage}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{alert}{stage_desc} on `{args.branch}` branch",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Branch:*\n`{args.branch}`"},
                    {"type": "mrkdwn", "text": f"*Environment:*\n{env_label}"},
                    {"type": "mrkdwn", "text": f"*Failed Stage:*\n{args.failed_stage}"},
                    {"type": "mrkdwn", "text": f"*Author:*\n{args.author}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Commit:* {args.commit_message}\n*SHA:* <{args.commit_url}|`{short_sha}`>",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"💡 <{args.workflow_url}|Click here to view full logs and debug>",
                    }
                ],
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "📋 View Workflow",
                            "emoji": True,
                        },
                        "url": args.workflow_url,
                        "style": "danger",
                    },
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "🔍 View Commit",
                            "emoji": True,
                        },
                        "url": args.commit_url,
                    },
                ],
            },
        ],
    }


def build_deployment_success_payload(args: argparse.Namespace) -> Dict[str, Any]:
    """Build Slack payload for deployment successes."""

    emoji = "🚀"

    # Determine environment and alert level
    if args.environment == "prod":
        alert = "<!channel> "
        env_label = "Production ✅"
        stage_desc = "*PRODUCTION DEPLOYMENT FINISHED*"
        deployed_url = "https://citycatalyst.io"
    elif args.environment == "test":
        alert = ""
        env_label = "Test ⚙️"
        stage_desc = f"{args.failed_stage} stage failed"
        deployed_url = "https://citycatalyst-test.openearth.dev"

    short_sha = args.commit_sha[:8]

    return {
        "text": f"{emoji} Deployment finished on {args.branch}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} Deployment finished - {args.environment}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{alert}{stage_desc} on `{args.branch}` branch",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Branch:*\n`{args.branch}`"},
                    {"type": "mrkdwn", "text": f"*Environment:*\n{env_label}"},
                    {"type": "mrkdwn", "text": f"*Author:*\n{args.author}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Commit:* {args.commit_message}\n*SHA:* <{args.commit_url}|`{short_sha}`>",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"💡 <{args.workflow_url}|Click here to view full deployment logs>",
                    }
                ],
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "🔍 View Commit",
                            "emoji": True,
                        },
                        "url": args.commit_url,
                    },
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "🚀 Open deployed app",
                            "emoji": True,
                        },
                        "url": deployed_url,
                        "style": "primary",
                    },
                ],
            },
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Send Slack notifications")
    parser.add_argument(
        "--type",
        required=True,
        choices=["migration_failure", "deployment_failure", "deployment_success"],
    )
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--commit-message", required=True)
    parser.add_argument("--author", required=True)
    parser.add_argument("--workflow-url", required=True)
    parser.add_argument("--commit-url", required=True)
    parser.add_argument("--error-logs", default="")
    parser.add_argument("--failed-stage", default="")
    parser.add_argument("--output-file", default="/tmp/slack-payload.json")

    args = parser.parse_args()

    # Build payload based on type
    if args.type == "migration_failure":
        payload = build_migration_failure_payload(args)
    elif args.type == "deployment_failure":
        payload = build_deployment_failure_payload(args)
    elif args.type == "deployment_success":
        payload = build_deployment_failure_payload(args)
    else:
        print(f"Error: Unknown notification type: {args.type}", file=sys.stderr)
        sys.exit(1)

    # Write payload to file
    try:
        with open(args.output_file, "w") as f:
            json.dump(payload, f, indent=2)
        print(f"✅ Payload written to {args.output_file}")
    except Exception as e:
        print(f"Error writing payload: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

