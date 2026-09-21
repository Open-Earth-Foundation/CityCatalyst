"""Exercise the committed CNB prompt contract with the verified browser fixture.

Reads current prompt files and existing provider credentials; sends five real
isolated navigation calls. This is an API evaluation, not a deployed test.
Usage: climate-advisor/.venv/Scripts/python.exe output/ui-context-comparison/runtime-check.py
"""
import asyncio
import json
from pathlib import Path

import httpx
import yaml
from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent

async def main():
    cfg=yaml.safe_load((ROOT/'climate-advisor/llm_config.yaml').read_text())
    env={**dotenv_values(ROOT/'.env'),**dotenv_values(ROOT/'climate-advisor/.env')}
    system='\n\n'.join((ROOT/'climate-advisor'/cfg['prompts'][p]).read_text(encoding='utf-8') for p in ['core','cnb_chat'])
    context={'workflow_step':'editing_document','document_context':None,'selected_sources':[],
      'funder_context':{'funder':'European Union LIFE Programme','programme':'EUCF Call 7'},
      'ui_state':{'version':'cnb-desktop-v1','active_tab':None,'draft':{'exists':True,'chapters':4},'pending_proposal':None,
        'export':{'enabled':False,'blockers':['25 critical gaps; fill through reviewed chat edits'],'missing_upload_blocks_export':False},
        'review':{'failed_chapters':None,'failure_blocks_export':None}}}
    questions=json.loads((ROOT/'docs/testing/CC-860-cnb-navigation-answers.json').read_text(encoding='utf-8-sig'))
    results={'scope':'API evaluation of runtime prompt, fixture-derived context, not a deployed test','system_prompt':system,'context':context,'results':[]}
    async with httpx.AsyncClient(timeout=150) as client:
        async def ask(q):
            r=await client.post('https://openrouter.ai/api/v1/chat/completions',headers={'Authorization':'Bearer '+env['OPENROUTER_API_KEY']},json={
              'model':cfg['models']['cnb_chat']['name'],'reasoning':{'effort':'high'},'max_tokens':2400,
              'messages':[{'role':'system','content':system},{'role':'user','content':'CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n'+json.dumps(context)},{'role':'user','content':q['prompt']}]})
            r.raise_for_status(); data=r.json()
            row={'question':q['number'],'prompt':q['prompt'],'answer':data['choices'][0]['message']['content'],'usage':data['usage'],'model':data['model']}
            results['results'].append(row)
            (OUT/'runtime-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(row,ensure_ascii=True),flush=True)
        await asyncio.gather(*(ask(q) for q in questions))

if __name__=='__main__':
    asyncio.run(main())
