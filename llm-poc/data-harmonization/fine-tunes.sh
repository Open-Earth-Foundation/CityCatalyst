#!/bin/sh

openai tools fine_tunes.prepare_data -f /tmp/openclimate-schema.txt
openai api fine_tunes.create -t /tmp/openclimate-schema_prepared.jsonl -m davinci
