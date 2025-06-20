import os
from plan_creator_bundle.plan_creator_legacy.state.agent_state import AgentState
from pathlib import Path
from datetime import datetime

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from plan_creator_bundle.plan_creator_legacy.prompts.agent_translate_prompt import (
    agent_translate_system_prompt,
    agent_translate_user_prompt,
)

OPENAI_MODEL_NAME_PLAN_CREATOR_LEGACY = os.getenv(
    "OPENAI_MODEL_NAME_PLAN_CREATOR_LEGACY", "gpt-4.1-mini"
)

# Create the agents
model = ChatOpenAI(
    model=OPENAI_MODEL_NAME_PLAN_CREATOR_LEGACY, temperature=0.0, seed=42
)

# Define prompts for each agent
system_prompt_agent_translate = SystemMessage(agent_translate_system_prompt)

OUTPUT_PATH = Path(__file__).parent.parent / "data" / "output"


def custom_agent_translate(state: AgentState) -> AgentState:

    # Get the language from the state
    language = state["language"]

    if not language == "en":
        print(f"Translating into '{language}'...")

        # Get the response from the combine agent
        response_agent_combine = state["response_agent_combine"]

        # Create messages for the translation
        messages = [
            system_prompt_agent_translate,
            HumanMessage(
                agent_translate_user_prompt.format(
                    language=language,
                    response_agent_combine=response_agent_combine,
                )
            ),
        ]

        # Get the translation from the model
        response = model.invoke(messages)

        # Convert the response to a string
        response_str = str(response.content)

        # Create a new state with the translated response
        result_state = AgentState(state)
        result_state["response_agent_translate"] = response_str

        print(f"Translation into {language} complete.\n")

        return result_state

    else:
        print("Language is English, no translation needed\n")

        # Copy the response from the combine agent
        response_agent_combine = state["response_agent_combine"]

        # Create a new state with the translated response
        result_state = AgentState(state)
        result_state["response_agent_translate"] = response_agent_combine

        return result_state
