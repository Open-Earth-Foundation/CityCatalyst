from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
import json
from datetime import datetime
import time
import logging
from typing import Optional, List, Dict, Any
import httpx
import uvicorn

# Import the existing plan generation components
from graph_definition import create_graph
from state.agent_state import AgentState
from langchain_core.messages import AIMessage

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

# Configure longer timeout for external requests
httpx._config.DEFAULT_TIMEOUT_CONFIG.connect = 3000.0  # 300 seconds
httpx._config.DEFAULT_TIMEOUT_CONFIG.read = 3000.0     # 300 seconds

app = FastAPI(
    title="Climate Action Plan Creator API",
    description="API for generating climate action implementation plans",
    version="1.0.0"
)

# Define output directory
output_dir = Path(__file__).parent / "data" / "output"
logger.info(f"Output directory set to: {output_dir}")

class PlanRequest(BaseModel):
    action: Dict[str, Any]
    city: Dict[str, Any]

@app.get("/")
async def root():
    logger.info("Health check endpoint called")
    return {"message": "Hello World"}

@app.post("/create_plan")
async def create_plan(request: PlanRequest):
    start_time = time.time()
    action_id = request.action.get('ActionID', 'unknown')
    logger.info(f"Starting plan creation for action ID: {action_id}")
    logger.debug(f"Request data - Action: {request.action}")
    logger.debug(f"Request data - City: {request.city}")

    try:
        # 1. Initialize the graph and state
        logger.info("Creating computation graph")
        graph = create_graph()
        logger.info("Graph created successfully")
        
        logger.info("Initializing agent state")
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
        logger.info("Agent state initialized successfully")

        # 2. Generate the plan with timeout handling
        try:
            logger.info("Starting graph execution for plan generation")
            result = graph.invoke(input=initial_state)
            logger.info("Graph execution completed successfully")
            logger.debug(f"Graph execution result length: {len(result['response_agent_combine'])}")
        except httpx.TimeoutException:
            logger.error("Timeout occurred during graph execution", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Timeout while generating diagrams. Please try again."
            )
        except Exception as e:
            logger.error(f"Other Error during graph execution: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error during graph execution: {str(e)}"
            )
        # 3. Save the plan
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename = f"{timestamp}_{request.action.get('ActionID', 'unknown')}_climate_action_implementation_plan.md"
        output_path = output_dir / filename
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Saving plan to file: {output_path}")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result["response_agent_combine"])
        logger.info("Plan file saved successfully")
            
        process_time = time.time() - start_time
        logger.info(f"Plan generation completed in {process_time:.2f} seconds")
        
        return FileResponse(
            path=output_path,
            filename=filename,
            media_type="text/markdown"
        )
        
    except HTTPException as he:
        logger.error(f"HTTP Exception during plan generation: {str(he)}", exc_info=True)
        raise
    except Exception as e:
        logger.error(f"Unexpected error during plan generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error generating plan: {str(e)}"
        )

if __name__ == "__main__":
    logger.info("Configuring Uvicorn logging")
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["access"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(client_addr)s - '%(request_line)s' %(status_code)s"
    
    logger.info("Starting Uvicorn server")
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_config=log_config
    ) 