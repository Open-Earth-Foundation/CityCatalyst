from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_community.tools.tavily_search import TavilySearchResults

from langgraph.checkpoint.memory import MemorySaver
import json
from pathlib import Path

# Load JSON data from files
with open(Path("./data/climateAction.json"), "r") as file:
    climateAction = json.load(file)

with open(Path("./data/city.json"), "r") as file:
    city = json.load(file)

# Initialize the model
model = ChatOpenAI(model="gpt-4o-mini", temperature=0.0, seed=42)

# Create prompt for the model
systemPromptPlanerLLM = SystemMessage(
    """
<role>
You are a project manager specialized in implementing climate actions for a given city.
</role>
                                      
<task>                              
You are tasked with identifying the required steps for creating an climate action plan for a climate action project in a city.
</task>
                                      
<climateActionPlanTemplate>                             
Below is the generic template of a climate action plan.
                                      
1. In-depth main action description
[Provide a detailed description]

2. Proposed sub-actions
[Action 1]
[Action 2]
[...

3. Involved municipal institutions and partners
[Institution 1]
[Institution 2]
[...]

4. Goals and milestones
[Goal 1]
[Goal 2]
[...]

5. Action timeline
Short term (Year 1):
[Activities]
Medium term (Year 2-3):
[Activities]
Long term (Year 4-5):
[Activities]

6. Costs and budget considerations
[Cost consideration 1]
[Cost consideration 2]
[...]

7. Monitoring, Evaluation and Reporting (MER) indicators
[Indicator 1]
[Indicator 2]
[...]

8. Relationship with SDGs
SDG [Number]: [Description]
SDG [Number]: [Description]
[...]
</climateActionPlanTemplate> 

<input>
You are provided with the details of the climate action in JSON format. 
You are also provided with the details of the city in JSON format.
</input>

<output>
For each part of the climate action plan, you output the required steps for creating the climate action plan for the given city.
You do not need to provide the actual content of the climate action plan, but rather the steps required to create it.
The steps must be striclty related to the given city and the climate action.
For example to create the main action description, it might be necessary to research about the city's and country's climate strategies and policies in general and in regards to the specifc climate action.                                     
</output>
"""
)

userPromptPlanerLLM = HumanMessage(
    f"""
<climateAction>
This is the climate action that needs to be implemented in the city:
{json.dumps(climateAction, indent=4)}
</climateAction>
<city>
This is the city where the climate action needs to be implemented:
{json.dumps(city, indent=4)}
</city>
"""
)

# Create a model with tools
# model_with_tools = model.bind_tools(tools)


messages: list = []

messages.append(systemPromptPlanerLLM)
messages.append(userPromptPlanerLLM)


memory = MemorySaver()
config = {"configurable": {"thread_id": "0001"}}

search = TavilySearchResults(max_results=2)
tools = [search]

# Create a react agent
agent = create_react_agent(model, tools, checkpointer=memory)


agentPrompt = HumanMessage(
    """
<role>
You are a project manager specialized in implementing climate actions for a given city.
</role>

<task>
Your task is to fill out the climate action plan template with specific information for the given city and climate action.
Follow the suggested steps outlined by the previous response.

Use your provided tools to look up information and to perform internet search.
</task>

<input>
You are provided with the details of the climate action in JSON format.
You are also provided with the details of the city in JSON format.
You are also provided with the steps required to create the climate action plan for the given city.
</input>

<output>
You need to fill out the climate action plan template with specific information for the given city and climate action.
Your response is the climate action plan in markdown language and formatted for a human to read. 
If you look up information on the internet, you need to provide the source of the information.
</output>
"""
)


def main():
    response = model.invoke(messages)  # type: ignore
    print(response.content)

    messages.append(AIMessage(response.content))

    messages.append(agentPrompt)

    agent_response = agent.invoke({"messages": messages}, config=config)  # type: ignore
    print(agent_response["messages"][-1].content)


if __name__ == "__main__":

    load_dotenv()

    main()
