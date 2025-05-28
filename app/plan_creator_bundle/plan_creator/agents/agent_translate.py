from pathlib import Path
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from plan_creator_bundle.plan_creator_legacy.state.agent_state import AgentState

# Create the agents
model = ChatOpenAI(model="gpt-4o", temperature=0.0, seed=42)

# Define prompts for each agent
system_prompt_agent_translate = SystemMessage(
    """
<role>
You are a translator specializing in climate action implementation plans.
</role>

<task>
Your task is to translate the given climate action implementation plan into the specified language. You must translate the entire document but keep the same formatting.
Try to keep the same tone and style as the original document.
If you cannot translate a specific word or phrase e.g. because it is a proper noun or a scientific term, leave it in English.
</task>

<input>
text to translate: The input is the climate action implementation plan in english.
target language: The target language that the text should be translated into. It is a 2 letter ISO language code like "en", "es", "pt", etc.
</input>

<output>
The output must follow all the same formatting as the input. It must be translated into the specified language.

<example>
Input:
## Header

**Bold text**

### Subheader

Text

Output:
## Translated Header

**Translated bold text**

### Translated subheader

Translated text

</example>
</output>

<important>
Do not add any additional text or formatting to the output like ```json```, ```html```, ```markdown```, etc.
You return only the plain translated text.
</important>
"""
)

OUTPUT_PATH = Path(__file__).parent.parent / "data" / "output"


def custom_agent_translate(state: AgentState) -> AgentState:

    # Get meta data for saving the output
    climate_action_id = state["climate_action_data"]["ActionID"]
    city_locode = state["city_data"]["locode"]

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
                f"""
                The target language is: {language}

                This is the text to translate: 
                {response_agent_combine}
                """
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
