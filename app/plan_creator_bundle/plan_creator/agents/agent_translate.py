from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
import json
import logging
from utils.logging_config import setup_logger
from plan_creator_bundle.plan_creator.prompts.agent_translate_prompt import (
    agent_translate_system_prompt,
    agent_translate_user_prompt,
)

from plan_creator_bundle.plan_creator.state.agent_state import AgentState

# Create the agents
model = ChatOpenAI(model="gpt-4.1", temperature=0.0, seed=42)

# Define prompts for each agent
system_prompt_agent_translate = SystemMessage(agent_translate_system_prompt)

setup_logger()
logger = logging.getLogger(__name__)


def custom_agent_translate(state: AgentState) -> AgentState:
    # Get the language from the state
    language = state["language"]

    logger.info(f"Agent Translate start for language: {language}...")

    # Explicitly list the keys to translate (plan content fields)
    plan_content = {}
    if "response_agent_1" in state:
        plan_content["response_agent_1"] = state["response_agent_1"].model_dump()
    if "response_agent_2" in state:
        plan_content["response_agent_2"] = state["response_agent_2"].model_dump()
    if "response_agent_3" in state:
        plan_content["response_agent_3"] = state["response_agent_3"].model_dump()
    if "response_agent_4" in state:
        plan_content["response_agent_4"] = state["response_agent_4"].model_dump()
    if "response_agent_5" in state:
        plan_content["response_agent_5"] = state["response_agent_5"].model_dump()
    if "response_agent_6" in state:
        plan_content["response_agent_6"] = state["response_agent_6"].model_dump()
    if "response_agent_7" in state:
        plan_content["response_agent_7"] = state["response_agent_7"].model_dump()
    if "response_agent_8" in state:
        plan_content["response_agent_8"] = state["response_agent_8"].model_dump()
    if "response_agent_9" in state:
        plan_content["response_agent_9"] = state["response_agent_9"].model_dump()
    if "response_agent_10" in state:
        plan_content["response_agent_10"] = state["response_agent_10"].model_dump()

    if language != "en":
        logger.info(f"Translating full plan into '{language}'...")
        plan_content_json = json.dumps(plan_content, ensure_ascii=False, indent=2)
        user_prompt = agent_translate_user_prompt.format(
            language=language, plan_content_json=plan_content_json
        )
        messages = [
            system_prompt_agent_translate,
            HumanMessage(user_prompt),
        ]
        response = model.invoke(messages)
        response_str = str(response.content)
        try:
            translated_dict = json.loads(response_str)
        except json.JSONDecodeError:
            logger.warning("LLM did not return valid JSON. Returning original content.")
            translated_dict = plan_content
        result_state = AgentState(state)
        result_state["response_agent_translate"] = translated_dict
        logger.info(f"Translation into {language} complete.\n")
        logger.info("Agent Translate done\n")
        return result_state
    else:
        logger.info("Language is English, no translation needed\n")
        result_state = AgentState(state)
        result_state["response_agent_translate"] = plan_content
        logger.info("Agent Translate done\n")
        return result_state
