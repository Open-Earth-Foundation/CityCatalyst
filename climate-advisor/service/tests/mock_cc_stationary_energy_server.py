from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


LOAD_CONTEXT_CAPABILITY = "ghgi.stationary_energy.load_context"
COMMIT_ACCEPTED_CAPABILITY = "ghgi.stationary_energy.commit_accepted"
ALLOWED_CAPABILITIES_PATH = "/api/v1/internal/ca/capabilities/allowed-capabilities"
LOAD_CONTEXT_PATH = (
    "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context"
)
COMMIT_ACCEPTED_PATH = (
    "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted"
)


class MockStationaryEnergyCCServer(ThreadingHTTPServer):
    fixture_payload: dict[str, Any]
    requests_seen: list[dict[str, Any]]


class MockStationaryEnergyCCHandler(BaseHTTPRequestHandler):
    server: MockStationaryEnergyCCServer

    def do_POST(self) -> None:
        body = self._read_json_body()
        self.server.requests_seen.append(
            {
                "method": "POST",
                "path": self.path,
                "body": body,
                "has_authorization": bool(self.headers.get("Authorization")),
            }
        )

        if self.path == ALLOWED_CAPABILITIES_PATH:
            workflow_step = body.get("workflow_step")
            capabilities = (
                [LOAD_CONTEXT_CAPABILITY]
                if workflow_step == "draft"
                else [COMMIT_ACCEPTED_CAPABILITY]
            )
            self._send_json({"capabilities": capabilities})
            return

        if self.path == LOAD_CONTEXT_PATH:
            self._send_json(self.server.fixture_payload)
            return

        if self.path == COMMIT_ACCEPTED_PATH:
            rows = body.get("rows") or []
            self._send_json(
                {
                    "draft_run_id": body.get("draft_run_id"),
                    "inventory_id": body.get("inventory_id"),
                    "results": [
                        {
                            "proposal_id": row.get("proposal_id"),
                            "decision_version": row.get("decision_version"),
                            "row_type": row.get("row_type"),
                            "selected_source_id": row.get("selected_source_id"),
                            "manual_value": row.get("manual_value"),
                            "manual_unit": row.get("manual_unit"),
                            "status": "committed",
                        }
                        for row in rows
                    ],
                }
            )
            return

        self._send_json({"error": "not found", "path": self.path}, status=404)

    def log_message(self, format: str, *args: object) -> None:
        return None

    def _read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length") or "0")
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        if not raw:
            return {}
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {"_unparsed": raw.decode("utf-8", errors="replace")}
        return payload if isinstance(payload, dict) else {"_payload": payload}

    def _send_json(self, payload: dict[str, Any], *, status: int = 200) -> None:
        raw = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def start_mock_cc_server(
    fixture_path: Path,
    *,
    host: str = "127.0.0.1",
    port: int = 0,
) -> tuple[MockStationaryEnergyCCServer, str]:
    with fixture_path.open("r", encoding="utf-8") as handle:
        fixture_payload = json.load(handle)

    server = MockStationaryEnergyCCServer((host, port), MockStationaryEnergyCCHandler)
    server.fixture_payload = fixture_payload
    server.requests_seen = []

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    bound_host, bound_port = server.server_address
    return server, f"http://{bound_host}:{bound_port}"
