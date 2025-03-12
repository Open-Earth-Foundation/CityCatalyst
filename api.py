from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
import httpx

# Import the existing plan generation components
from graph_definition import create_graph
from state.agent_state import AgentState
from langchain_core.messages import AIMessage

# Configure longer timeout for external requests
httpx._config.DEFAULT_TIMEOUT_CONFIG.connect = 300.0  # 30 seconds
httpx._config.DEFAULT_TIMEOUT_CONFIG.read = 300.0     # 30 seconds

app = FastAPI(
    title="Climate Action Plan Creator API",
    description="API for generating climate action implementation plans",
    version="1.0.0"
)

# Define output directory
output_dir = Path(__file__).parent / "data" / "output"

class PlanRequest(BaseModel):
    action: Dict[str, Any]
    city: Dict[str, Any]

@app.post("/create_plan")
async def create_plan(request: PlanRequest):
    try:
        # 1. Initialize the graph and state with request data
        graph = create_graph()
        
        initial_state = AgentState(
            climate_action_data=request.action,
            city_data=request.city,
            response_agent_1=AIMessage(""),
            response_agent_2=AIMessage(""),
            response_agent_3=AIMessage(""),
            response_agent_4=AIMessage(""),
            response_agent_5=AIMessage(""),
            response_agent_6=AIMessage(""),
            response_agent_7=AIMessage(""),
            response_agent_8=AIMessage(""),
            response_agent_combine="",
            messages=[],
        )

        # 2. Generate the plan with timeout handling
        try:
            result = graph.invoke(input=initial_state)
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=500,
                detail="Timeout while generating diagrams. Please try again."
            )
        
        # 3. Save the plan
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename = f"{timestamp}_{request.action.get('ActionID', 'unknown')}_climate_action_implementation_plan.md"
        output_path = output_dir / filename
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result["response_agent_combine"])
            
        return FileResponse(
            path=output_path,
            filename=filename,
            media_type="text/markdown"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating plan: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 