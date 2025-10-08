from dotenv import dotenv_values
from openai import AsyncOpenAI
import asyncio

vals = dotenv_values('climate-advisor/.env')
client = AsyncOpenAI(api_key=vals['OPENAI_API_KEY'])

async def main():
    async with client.chat.completions.stream(model='gpt-4o-mini', messages=[{'role':'user','content':'hi'}]) as stream:
        async for event in stream:
            print('EVENT', type(event), getattr(event, 'type', None))
            if hasattr(event, 'model_dump'):
                print(event.model_dump())

asyncio.run(main())
