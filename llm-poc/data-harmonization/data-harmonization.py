#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# data-harmonization.py
# A script to generate a script for harmonizing data from OpenAI

import os
import openai
from dotenv import load_dotenv
from typing import List, Dict, Optional
import sys

load_dotenv()  # take environment variables from .env.

openai.organization = os.getenv("OPENAI_ORG_ID")
openai.api_key = os.getenv("OPENAI_API_KEY")

def ask_chatgpt(prompt: str):
    """Provide a prompt and have a conversation with ChatGPT

    Args:
        prompt (str): question or statement to pass to chatGPT

    Returns:
        string response
    """

    response = openai.Completion.create(
        model = os.getenv("OPENAI_MODEL"),
        prompt = prompt
    )

    print(response)
    generated_message = ""

    return generated_message

lines = []
with open(sys.argv[1]) as reader:
    lines = reader.readlines()

prompt = f"""
I have a dataset of {len(lines)} lines of data that
I want to harmonize to the OpenClimate 1.0 schema.

Here is the header line:

{lines[0]}

and here are the first 10 lines of data:

{"".join(lines[1:11])}

Can you please give me a Python script that will take this
file as input, harmonize it to the OpenClimate 1.0 schema,
and output CSV files to a directory,
with one file per schema table,
named <table_name>.csv?
"""

print(prompt)

message = ask_chatgpt(prompt)
print(message)