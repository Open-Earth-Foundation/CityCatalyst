import os
import openai
from dotenv import load_dotenv
from langsmith.wrappers import wrap_openai
import json
from typing import Optional

from openai import AsyncOpenAI


load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

if not openai.api_key:
    raise ValueError("API key not found. Please set it in your environment variables.")

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0.0

# Auto-trace LLM calls in-context
# client = wrap_openai(openai.Client())
client = wrap_openai(AsyncOpenAI())


async def generate_response(
    prompt: str, model: str = DEFAULT_MODEL, temperature: float = DEFAULT_TEMPERATURE
) -> Optional[str]:
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        return response.choices[0].message.content
    except openai.OpenAIError as e:
        print(f"OpenAI API error: {e}")
        return json.dumps({"error": str(e)})  # Return as a JSON string
    except Exception as e:
        print(f"Unexpected error: {e}")
        return json.dumps(
            {"error": "An unexpected error occurred"}
        )  # Return as a JSON string
