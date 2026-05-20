---
name: add-langgraph-tool
description: Add a new tool to a LangGraph-based service (climate-advisor, hiap). Use when the user asks to add a tool, function-call, or capability to the climate advisor or HIAP agent.
---

# add-langgraph-tool

Adding a tool to `climate-advisor` (or `hiap`) is 4 files.

## Workflow (climate-advisor as the example)

### Step 1 — Pydantic input model

`climate-advisor/service/app/tools/<tool>.py`:

```python
from pydantic import BaseModel, Field

class GetCityInventoryInput(BaseModel):
    """Inputs for get_city_inventory."""

    inventory_id: str = Field(..., description="UUID of the inventory")
    year: int | None = Field(None, description="Optional year filter")


async def get_city_inventory(input: GetCityInventoryInput) -> dict:
    """Fetch a CityCatalyst inventory by id (and optional year).

    Use when the user asks about a specific inventory, sector totals,
    or year-over-year emissions.

    Returns a JSON object with the inventory metadata and totals.
    """
    # ... implementation: hit Global API or Next.js API with timeout
```

The **docstring** is the LLM-facing description. Make it instructions to the model, not docs for humans.

### Step 2 — Register on the graph

In `climate-advisor/service/app/agents/<graph>.py`:

```python
from app.tools.get_city_inventory import get_city_inventory, GetCityInventoryInput
from langgraph.prebuilt import ToolNode

TOOLS = [
    # ... existing tools
    get_city_inventory,
]

graph_builder.add_node("tools", ToolNode(TOOLS))
```

### Step 3 — Update the system prompt

In `climate-advisor/service/app/prompts/system.md`, mention the new tool in the `<tools>` block. Use the `prompt-schema-authoring` skill — the prompt structure is enforced.

### Step 4 — Smoke test

`climate-advisor/service/tests/test_<tool>.py`:

```python
import pytest
from app.tools.get_city_inventory import get_city_inventory, GetCityInventoryInput

@pytest.mark.asyncio
async def test_get_city_inventory_smoke(monkeypatch):
    monkeypatch.setattr(
        "app.tools.get_city_inventory._fetch",
        lambda *a, **kw: {"id": "abc", "totals": {}},
    )
    result = await get_city_inventory(GetCityInventoryInput(inventory_id="abc"))
    assert result["id"] == "abc"
```

Mock all network calls — never hit real upstreams in unit tests.

### Step 5 — Document

- Add the tool to the service's `README.md` under "Tools".
- Run the `docs-after-change` skill.

## Anti-patterns

- Tool that does N things — split.
- Tool whose docstring just describes the implementation. The model can't read it; rewrite as instructions.
- Tool with no input model (raw `**kwargs`). LangGraph + the LLM both need the schema.
- Tool that mutates state (DB writes) without an obvious idempotency story. Surface it explicitly in the docstring.
