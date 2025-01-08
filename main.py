from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage

from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()


# Initialize the model
model = ChatOpenAI(model="gpt-4o-mini", temperature=0.0)


@tool
def add_numbers(a: float, b: float) -> float:
    """Function to add two numbers together

    Args:
        a (float): first number
        b (float): second number

    Returns:
        float: the sum of the two numbers
    """
    return a + b


@tool
def mul_numbers(a: float, b: float) -> float:
    """Function to multiply two numbers together

    Args:
        a (float): first number
        b (float): second number

    Returns:
        float: the product of the two numbers
    """
    return a * b


tools = [add_numbers, mul_numbers]

# Create a model with tools
model_with_tools = model.bind_tools(tools)

# Create a react agent
agent = create_react_agent(model, tools, checkpointer=memory)
config = {"configurable": {"thread_id": "abc123"}}


def main(prompt: str):

    print("---------------------------")
    print("Pure LLM Model")
    # Invoke the pure llm model
    response = model.invoke(prompt)
    print(response.content)
    print("---------------------------\n\n")

    print("---------------------------")
    print("LLM Model with tools")
    # Invoke the llm model with tools
    response = model_with_tools.invoke(prompt)
    print(response.additional_kwargs["tool_calls"][0])
    print("---------------------------\n\n")

    print("---------------------------")
    print("Agent")
    # messages: list = []
    while True:
        prompt = input("User: ")
        # messages.append(HumanMessage(prompt))
        # Get the response from the agent
        # response = agent.invoke({"messages": messages})
        response = agent.invoke({"messages": prompt}, config)  # type: ignore

        # Append last message to the list
        # messages.append(AIMessage(response["messages"][-1].content))

        print(response["messages"][-1].content)

        # print(memory.get(config)) # type: ignore


if __name__ == "__main__":

    load_dotenv()

    main("What is 13.5 times 2.145?")
