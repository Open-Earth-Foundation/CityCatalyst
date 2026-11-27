"""Brief: Serve an authenticated PDF extraction API backed by hosted Codex sessions.

Inputs:
- Environment: OPENAI_API_KEY, EXTRACTION_API_KEY (32+ characters), and optional
  EXTRACTION_MODEL and EXTRACTION_REASONING_EFFORT. See README.md. Credentials
  stay outside the agent sandbox.
- Multipart POST: optional city label, city_pdf, and exactly one of taxonomy_pdf
  or data_schema (JSON Schema text), plus optional system_prompt, user_prompt,
  use_mistral_ocr, auto_repair, and max_repairs (1-5). OCR additionally uses
  MISTRAL_API_KEY and MISTRAL_OCR_MODEL.
Outputs:
- HTTP job state and candidate JSON. Agent execution lives in OpenAI sessions;
  local SQLite persists validation, repair decisions, and cancellation intent.
Usage (from repository root, with service dependencies installed):
- python -m uvicorn extractor.api:create_app --factory --app-dir pdf-extraction
  --host 127.0.0.1 --port 8080
"""

import asyncio
import hmac
import io
import time
from contextlib import asynccontextmanager
from pathlib import Path as FilePath
from typing import Annotated
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Path, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader
from starlette.types import ASGIApp, Receive, Scope, Send

from extractor.config import Settings
from extractor.benchmarks import BenchmarkCatalog
from extractor.jobs import JobController, TERMINAL
from extractor.provider import AgentsProvider, ProviderError
from extractor.ocr import MistralOCR
from extractor.prompting import default_prompts, resolve_prompts
from extractor.schema import parse_schema
from extractor.reproducibility import implementation_fingerprint

JobID = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,256}$")]


class RequestGuard:
    """Authenticate before parsing multipart data and bound streamed body size."""

    def __init__(self, app: ASGIApp, key: str, max_bytes: int):
        """Store shared server authentication and a total request-byte limit."""
        self.app, self.key, self.max_bytes = app, key, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Guard every HTTP route except the non-sensitive health probe."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        if not self.key:
            host = urlsplit("http://" + headers.get(b"host", b"").decode()).hostname
            origin = headers.get(b"origin")
            client_host = (scope.get("client") or ("",))[0]
            same_origin = not origin or urlsplit(
                origin.decode()
            ).netloc.encode() == headers.get(b"host")
            if (
                host not in {"localhost", "127.0.0.1", "::1"}
                or client_host not in {"127.0.0.1", "::1"}
                or not same_origin
            ):
                await JSONResponse(
                    {
                        "detail": "Local demo access only. Set EXTRACTION_API_KEY for remote access."
                    },
                    status_code=403,
                )(scope, receive, send)
                return
        public = scope["method"] == "GET" and (
            scope["path"] in {"/", "/health", "/v1/config"}
            or scope["path"].startswith("/assets/")
        )
        expected = f"Bearer {self.key}".encode()
        if (
            self.key
            and not public
            and not hmac.compare_digest(headers.get(b"authorization", b""), expected)
        ):
            await JSONResponse(
                {"detail": "Invalid bearer token."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
            return
        consumed = 0

        async def limited_receive() -> dict:
            """Count actual bytes, including clients using chunked transfer."""
            nonlocal consumed
            message = await receive()
            consumed += len(message.get("body", b""))
            if consumed > self.max_bytes:
                raise HTTPException(413, "Upload request is too large.")
            return message

        await self.app(scope, limited_receive, send)


def pdf_pages(data: bytes) -> int:
    """Reject malformed, empty, or encrypted PDFs and return physical page count."""
    try:
        if not data.startswith(b"%PDF-"):
            raise ValueError("missing PDF signature")
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("encrypted PDF")
        pages = len(reader.pages)
        if pages < 1:
            raise ValueError("empty PDF")
        return pages
    except Exception as exc:
        raise HTTPException(
            422, "Provide a readable, unencrypted PDF with at least one page."
        ) from exc


def create_app(
    settings: Settings | None = None,
    provider: AgentsProvider | None = None,
    ocr_provider: MistralOCR | None = None,
    benchmark_catalog: BenchmarkCatalog | None = None,
) -> FastAPI:
    """Build the production app or inject an offline provider for contract tests."""
    settings = settings or Settings.from_env()
    loaded_fingerprint = implementation_fingerprint()
    benchmarks = benchmark_catalog or BenchmarkCatalog()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Create a pooled upstream connection and close it on server shutdown."""
        async with (
            httpx.AsyncClient(
                base_url="https://api.openai.com",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "OpenAI-Beta": "agents=v1",
                },
                timeout=httpx.Timeout(settings.request_timeout),
                follow_redirects=False,
            ) as client,
            httpx.AsyncClient(
                base_url="https://api.mistral.ai", follow_redirects=False
            ) as ocr_client,
        ):
            app.state.provider = provider or AgentsProvider(settings, client)
            app.state.ocr = ocr_provider or MistralOCR(settings, ocr_client)
            app.state.jobs = JobController(app.state.provider, settings.state_path)
            app.state.jobs.recover()
            try:
                yield
            finally:
                await app.state.jobs.close()

    app = FastAPI(
        title="Document extraction lab",
        version="0.2.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(
        RequestGuard,
        key=settings.service_api_key,
        max_bytes=2 * settings.max_file_bytes + 512 * 1024,
    )
    static_dir = FilePath(__file__).with_name("static")
    app.mount("/assets", StaticFiles(directory=static_dir), name="assets")

    @app.get("/")
    async def frontend():
        """Serve the standalone upload and result-review page."""
        return FileResponse(static_dir / "index.html")

    @app.get("/v1/config")
    async def configuration():
        """Expose setup state without exposing either API credential."""
        return {
            "ready": bool(settings.openai_api_key),
            "authentication_required": bool(settings.service_api_key),
            "model": settings.model,
            "reasoning_effort": settings.reasoning_effort,
            "mistral_ocr_model": settings.mistral_ocr_model,
            "implementation_fingerprint": loaded_fingerprint,
            "default_prompts": default_prompts(),
            "mistral_ocr_ready": bool(settings.mistral_api_key),
        }

    @app.exception_handler(ProviderError)
    async def provider_error_handler(_, exc: ProviderError):
        """Return safe provider failures with a stable HTTP error envelope."""
        return JSONResponse(
            {
                "detail": exc.detail,
                "submission_uncertain": exc.uncertain,
                "upstream_status": exc.upstream_status,
            },
            status_code=exc.status,
        )

    @app.get("/health")
    async def health():
        """Report process health without making a paid or authenticated API call."""
        return {"status": "ok"}

    @app.get("/v1/benchmarks")
    async def benchmark_list():
        """List local test readiness without sending expected answers to the agent."""
        return {"cases": benchmarks.listing()}

    @app.get("/v1/benchmarks/{case_id}")
    async def benchmark_definition(case_id: JobID):
        """Load a known case's schema and extraction instructions."""
        try:
            return benchmarks.load(case_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/v1/benchmarks/{case_id}/pdf")
    async def benchmark_pdf(case_id: JobID):
        """Serve only an installed catalogue PDF under the normal API access guard."""
        try:
            case = benchmarks.get(case_id)
            path = benchmarks.path(case["pdf"])
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        if not path.is_file():
            raise HTTPException(
                404, "This benchmark PDF is not installed. See benchmarks/README.md."
            )
        return FileResponse(path, media_type="application/pdf", filename=path.name)

    @app.get("/openapi.json")
    async def openapi():
        """Return the API schema behind the same authentication as job endpoints."""
        return app.openapi()

    @app.post("/v1/extractions", status_code=202)
    async def submit(
        city_pdf: Annotated[UploadFile, File()],
        city: Annotated[str, Form(min_length=1, max_length=200)] = "Uploaded report",
        taxonomy_pdf: Annotated[UploadFile | None, File()] = None,
        data_schema: Annotated[str | None, Form()] = None,
        system_prompt: Annotated[str | None, Form(max_length=65536)] = None,
        user_prompt: Annotated[str | None, Form(max_length=65536)] = None,
        use_mistral_ocr: Annotated[bool, Form()] = False,
        auto_repair: Annotated[bool, Form()] = False,
        max_repairs: Annotated[int, Form(ge=1, le=5)] = 3,
        benchmark_case: Annotated[str | None, Form(max_length=100)] = None,
    ):
        """Validate both inputs before uploading either; return a durable session ID."""
        if not city.strip():
            raise HTTPException(422, "city must not be blank.")
        try:
            if not settings.openai_api_key:
                raise HTTPException(
                    503,
                    "Set OPENAI_API_KEY in the demo's .env file and restart the server.",
                )
            if (taxonomy_pdf is not None) == (data_schema is not None):
                raise HTTPException(
                    422, "Provide exactly one definition: taxonomy_pdf or data_schema."
                )
            if use_mistral_ocr and not settings.mistral_api_key:
                raise HTTPException(
                    503,
                    "Set MISTRAL_API_KEY in .env and restart to enable Mistral OCR.",
                )
            try:
                target_schema = (
                    parse_schema(data_schema) if data_schema is not None else None
                )
                prompts = resolve_prompts(system_prompt, user_prompt)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            city_data = await city_pdf.read(settings.max_file_bytes + 1)
            taxonomy_data = (
                await taxonomy_pdf.read(settings.max_file_bytes + 1)
                if taxonomy_pdf is not None
                else None
            )
            if max(len(city_data), len(taxonomy_data or b"")) > settings.max_file_bytes:
                raise HTTPException(413, "Each PDF must be 45 MiB or smaller.")
            if benchmark_case:
                try:
                    benchmarks.verify(benchmark_case, city_data)
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from exc
            city_count, taxonomy_count = await asyncio.gather(
                asyncio.to_thread(pdf_pages, city_data),
                (
                    asyncio.to_thread(pdf_pages, taxonomy_data)
                    if taxonomy_data is not None
                    else asyncio.sleep(0, result=0)
                ),
            )
            ocr_context = None
            ocr_started = time.monotonic()
            if use_mistral_ocr:
                tasks = [
                    asyncio.create_task(
                        app.state.ocr.extract(
                            city_data, "/workspace/city.pdf", city_count
                        )
                    )
                ]
                if taxonomy_data is not None:
                    tasks.append(
                        asyncio.create_task(
                            app.state.ocr.extract(
                                taxonomy_data, "/workspace/taxonomy.pdf", taxonomy_count
                            )
                        )
                    )
                try:
                    ocr_documents = await asyncio.gather(*tasks)
                except BaseException:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
                    raise
                ocr_context = {
                    "provider": "mistral",
                    "model": settings.mistral_ocr_model,
                    "documents": ocr_documents,
                }
            ocr_seconds = time.monotonic() - ocr_started if use_mistral_ocr else 0
            session = await app.state.provider.submit(
                city,
                city_data,
                taxonomy_data,
                city_count,
                taxonomy_count,
                data_schema=target_schema,
                ocr_context=ocr_context,
                auto_repair=auto_repair,
                max_repairs=max_repairs,
                **prompts,
            )
            job_id = session["id"]
            preprocessing = {
                "ocr_provider": "mistral" if use_mistral_ocr else "none",
                "ocr_model": settings.mistral_ocr_model if use_mistral_ocr else None,
                "ocr_seconds": ocr_seconds,
                "ocr_documents": [
                    {
                        "source_pdf": document["source_pdf"],
                        "page_count": document["page_count"],
                        "missing_pages": document["missing_pages"],
                        "model": document["model"],
                        "usage_info": document["usage_info"],
                    }
                    for document in (ocr_context or {}).get("documents", [])
                ],
            }
            app.state.jobs.register(
                job_id, auto_repair, max_repairs, benchmark_case, preprocessing
            )
            return {
                "job_id": job_id,
                "status": "submitted",
                "status_url": f"/v1/extractions/{job_id}",
                "result_url": f"/v1/extractions/{job_id}/result",
            }
        finally:
            await city_pdf.close()
            if taxonomy_pdf is not None:
                await taxonomy_pdf.close()

    @app.get("/v1/extractions/{job_id}")
    async def status(job_id: JobID):
        """Report controller progress, or inspect a pre-controller hosted session."""
        job = app.state.jobs.get(job_id)
        if job:
            return app.state.jobs.snapshot(job)
        session, turn, state = await app.state.provider.inspect(job_id)
        return {
            "job_id": job_id,
            "status": state,
            "turn_id": turn["id"] if turn else None,
            "usage": session.get("usage"),
            "required_action_types": [
                action.get("type") for action in session.get("required_actions", [])
            ],
            "error": (
                "Inspect this session in OpenAI logs."
                if state in {"failed", "needs_input"}
                else None
            ),
        }

    @app.get("/v1/extractions/{job_id}/result")
    async def result(job_id: JobID):
        """Return the last checked candidate and unresolved issues after the loop ends."""
        job = app.state.jobs.get(job_id)
        if job:
            if job["status"] not in TERMINAL:
                raise HTTPException(409, "Validation/repair is still running.")
            envelope = job["result"] or {
                "job_id": job_id,
                "result": None,
                "requires_review": True,
                "validation": {"structure_and_page_bounds": "failed"},
            }
            response = {
                **envelope,
                "preprocessing": {
                    **envelope.get("preprocessing", {}),
                    **job.get("preprocessing", {}),
                },
                "repair": {
                    key: job.get(key)
                    for key in (
                        "auto_repair",
                        "max_repairs",
                        "repairs",
                        "repair_outcome",
                        "issues",
                        "rounds",
                        "repair_still_needed",
                        "remaining_issue_count",
                    )
                },
                "execution_status": job["status"],
                "usage": job.get("usage"),
            }
            if job.get("benchmark_case"):
                response["benchmark"] = benchmarks.evaluate(
                    job["benchmark_case"], envelope
                )
            return response
        return await app.state.provider.result(job_id)

    @app.get("/v1/extractions/{job_id}/activity")
    async def activity(job_id: JobID, full: bool = False):
        """Return recent public agent/tool activity and the saved controller history."""
        records = await app.state.provider.activity(job_id, full=full)
        job = app.state.jobs.get(job_id)
        return {
            "job_id": job_id,
            **records,
            "controller": app.state.jobs.snapshot(job) if job else None,
        }

    @app.post("/v1/extractions/{job_id}/cancel", status_code=202)
    async def cancel(job_id: JobID):
        """Request cancellation without claiming that remote work has already stopped."""
        await app.state.jobs.cancel(job_id)
        return {"job_id": job_id, "status": "cancellation_requested"}

    @app.delete("/v1/extractions/{job_id}")
    async def delete(job_id: JobID):
        """Delete a stopped job and report any input files still requiring cleanup."""
        pending = await app.state.jobs.delete(job_id)
        return {
            "job_id": job_id,
            "deleted": True,
            "input_files_pending_cleanup": pending,
        }

    return app
