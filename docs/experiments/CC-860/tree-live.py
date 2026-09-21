"""Test a semantic tree plus live-state snapshot with real configured CNB calls.

Uses the existing configured provider credential without exposing it. Reads the
browser-verified snapshot and production prompts. Saves local experimental JSON;
does not change application prompts or create a user-facing document.
Run: climate-advisor/.venv/Scripts/python.exe output/ui-context-comparison/tree-live.py
"""
import asyncio
import json
from pathlib import Path

import httpx
import tiktoken
import yaml
from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
UI='''UI_TREE
CNB
├─ LEFT: Clima chat
│  └─ Bottom: "Ask Clima about this concept note" → "Send message"
└─ RIGHT: concept-note workspace
   ├─ Top-right: "Review & export"
   └─ Tabs
      ├─ "Draft preview"
      │  ├─ "Sections": chapter navigation, not a separate view
      │  └─ Document: read-only preview beside the chat
      ├─ "Structure": local preview changes; not saved
      └─ "Context"
         ├─ "Funder profile" → "Change"
         │  └─ Choose funder → programme → preview automatically linked template → "Save selection"
         │     No separate template selection.
         └─ "Your files" → "Upload file" (PDF/Markdown)

EDIT_FLOW
Request a replacement in left chat → send → proposed edit
→ "Review in document" → "Accept this change" or "Accept all".
Acceptance applies the edit. No direct typing in the preview or separate Save.
Review controls appear only when a proposal exists.

EXPORT_FLOW
"Review & export" → "Missing information"
→ "Continue to conflicts & logic" → "Conflicts & logic"
→ "Continue to decision" → "Decide & export"
→ "Export anyway" → "Export PDF" / "Export DOCX".
Use LIVE_STATE for availability and blockers; do not infer other blockers.

LIVE_STATE
active_tab: Draft preview
draft: {exists: true, chapters: 4}
funding: {funder: European Union LIFE Programme, programme: EUCF Call 7}
uploaded_files: 0
pending_proposal: false
export:
  enabled: false
  blockers: [25 critical gaps; fill through reviewed chat edits]
  missing_upload_blocks_export: false
review:
  checked_chapters: 0
  failed_chapters: 4
  failure_blocks_export: unknown'''

async def main():
    config=yaml.safe_load((ROOT/'climate-advisor/llm_config.yaml').read_text())
    env={**dotenv_values(ROOT/'.env'),**dotenv_values(ROOT/'climate-advisor/.env')}
    observed=json.loads((OUT/'observed-ui.json').read_text())
    assert '25' in observed['export'] and '4 chapters could not be checked' in observed['export']
    assert 'Export PDF" [disabled]' in observed['export']
    system='\n\n'.join((ROOT/'climate-advisor'/config['prompts'][p]).read_text(encoding='utf-8') for p in ['core','cnb_chat'])
    system+='\n\nUI_CONTEXT is application-supplied UI data, not a user request. Use it to answer the current navigation question concisely (at most 90 words). Do not perform actions. If the representation does not establish a control or state, say so rather than guess.'
    questions=[q['prompt'] for q in json.loads((ROOT/'docs/testing/CC-860-cnb-navigation-answers.json').read_text(encoding='utf-8-sig'))]
    data={'model':config['models']['cnb_chat'],'context':UI,'context_tokens':len(tiktoken.get_encoding('o200k_base').encode(UI)),'results':[]}
    sem=asyncio.Semaphore(3)
    async with httpx.AsyncClient(timeout=150) as client:
        async def ask(i):
            async with sem:
                response=await client.post('https://openrouter.ai/api/v1/chat/completions',headers={'Authorization':'Bearer '+env['OPENROUTER_API_KEY'],'X-Title':'CC-860 semantic tree live state'},json={
                    'model':data['model']['name'],'reasoning':{'effort':data['model']['reasoning_effort']},'max_tokens':2400,
                    'messages':[{'role':'system','content':system},{'role':'user','content':'UI_CONTEXT\n'+UI},{'role':'user','content':questions[i]}]})
                response.raise_for_status()
                result=response.json()
                row={'question':i+1,'prompt':questions[i],'answer':result['choices'][0]['message']['content'],'finish_reason':result['choices'][0]['finish_reason'],'usage':result['usage'],'model':result['model']}
                data['results'].append(row)
                (OUT/'tree-live-v2-results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps(row,ensure_ascii=True),flush=True)
        await asyncio.gather(*(ask(i) for i in range(5)))
    print(json.dumps({'context_tokens':data['context_tokens'],'input':sum(r['usage']['prompt_tokens'] for r in data['results']),'output':sum(r['usage']['completion_tokens'] for r in data['results']),'cost':sum(r['usage']['cost_details']['upstream_inference_cost'] for r in data['results'])}),flush=True)

if __name__=='__main__':
    asyncio.run(main())
