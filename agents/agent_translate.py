from state.agent_state import AgentState
from pathlib import Path
from datetime import datetime

# from styles.styles import styles_block
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

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

        # print(f"Translated text: {response.content}")

        # Convert the response to a string
        response_str = str(response.content)

        # Create a new state with the translated response
        result_state = AgentState(state)
        result_state["response_agent_translate"] = response_str

        print(f"Translation into {language} complete.\n")
        print("Saving translated text to file...")

        # Save the translated text to a file

        # Convert Markdown to HTML
        # html_content = markdown.markdown(combined_markdown, extensions=["extra"])

        # File output
        OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

        # Get current date/time in hh:mm format
        current_time = datetime.now().strftime("%Y%m%d_%H%M")

        file_name = (
            f"{current_time}_{city_locode}_{climate_action_id}_implementation_plan.md"
        )
        # file_name_html = (
        #     f"{current_time}_{city_locode}_{climate_action_id}_implementation_plan.html"
        # )

        # Write the combined Markdown text to a local file
        with open(OUTPUT_PATH / file_name, "w", encoding="utf-8") as md_file:
            md_file.write(response_str)

        print(f"Translated text saved to {OUTPUT_PATH / file_name}\n")

        # # Write the html to a local file
        # with open(OUTPUT_PATH / file_name_html, "w", encoding="utf-8") as md_file:
        #     md_file.write(html_content)

        return result_state

    else:
        print("Language is English, no translation needed\n")

        # Copy the response from the combine agent
        response_agent_combine = state["response_agent_combine"]

        # Create a new state with the translated response
        result_state = AgentState(state)
        result_state["response_agent_translate"] = response_agent_combine

        return result_state
