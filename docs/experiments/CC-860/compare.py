"""Run 25 isolated real CNB navigation calls with five UI representations.

Reads the existing project provider credential in memory, CNB prompts/config,
and screenshot.png. Writes local experimental JSON and representation inputs;
does not modify product code, publish documents, or record video.
Usage from repository root: climate-advisor/.venv/Scripts/python.exe output/ui-context-comparison/compare.py
"""
import asyncio
import base64
import json
import time
from pathlib import Path

import httpx
import tiktoken
import yaml
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
HTML = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Concept Note Builder</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f9fb;font:14px Arial;color:#10182c}
header{height:80px;padding:24px 40px;background:#071dac;color:white;font-size:22px}
.crumb{padding:24px}main{display:grid;grid-template-columns:31% 1fr;gap:10px;margin:0 20px}
.panel{background:white;border:1px solid #d8d5f7;border-radius:8px;height:840px;overflow:hidden}
.chat{display:flex;flex-direction:column}.bar{padding:20px;border-bottom:1px solid #dedcf7;display:flex;justify-content:space-between}
button{background:white;border:1px solid #8591ef;border-radius:8px;color:#3059db;padding:12px;cursor:pointer}
.notice{margin:16px;padding:20px;background:#edeafd;border:1px solid #5465ff;border-radius:8px}
.composer{margin-top:auto;padding:16px;display:flex;gap:12px;border-top:1px solid #dedcf7}
textarea{resize:none;flex:1;border:1px solid #d8d5f7;border-radius:8px;padding:14px}.send{background:green;color:white}
nav{padding:16px;border-bottom:1px solid #dedcf7;display:flex;gap:20px}.active{color:#3059db;font-weight:bold}
.draft{display:grid;grid-template-columns:180px 1fr;gap:20px;padding:24px;height:700px}.sections,article{border:1px solid #dedcf7;border-radius:6px;padding:20px;overflow:auto}
li{margin:16px 0}.gap{color:#eaa51c}.small{font-size:12px;color:#667085}.selected{background:#edeafd}
</style>
<header>☰　CityCatalyst | Concept Note Builder</header>
<div class="crumb">← All concept notes / CC-860 UI verification</div>
<main>
 <aside class="panel chat" aria-label="Clima chat, left">
  <div class="bar"><b>Clima<br><small>Concept note copilot</small></b><span>● Connected</span><button aria-label="Start new chat">＋</button></div>
  <div class="notice"><b>Uploaded evidence: none</b><p>CityCatalyst context is ready, but no uploaded evidence is available.</p><button>Add recommended source</button></div>
  <div class="composer"><textarea placeholder="Ask Clima about this concept note"></textarea><button class="send" aria-label="Send message">↑</button></div>
 </aside>
 <section class="panel" aria-label="Concept note workspace, right">
  <div class="bar"><div><b>CC-860 UI verification</b><p class="small">Run state autosaved · In progress</p></div><button>Review &amp; export</button></div>
  <nav role="tablist"><span role="tab" aria-selected="true" class="active">Draft preview</span><span role="tab">Structure</span><span role="tab">Context</span></nav>
  <section role="tabpanel" aria-label="Draft preview" class="draft">
   <aside class="sections"><b>SECTIONS</b><p class="selected">1 Identification of the applicant</p><p>2 Political commitments</p><p>3 Proposed investment project</p><p>4 Use of EUCF support</p></aside>
   <article aria-readonly="true"><b>CC-860 UI verification — Concept note</b><h2>1 · Identification of the applicant</h2><p class="small">Needs review · <span class="gap">8 open gaps</span></p><p>This application is being prepared for European City Facility (EUCF) Call 7, funded by European Union LIFE Programme.</p><h3>Applicant identity and contacts</h3><ul><li>Applicant legal name: <span class="gap">ⓘ</span></li><li>Applicant type: <span class="gap">ⓘ</span></li><li>Registered address and contact details: <span class="gap">ⓘ</span></li><li>Contact person(s): <span class="gap">ⓘ</span></li></ul><h3>Administrative and territorial codes</h3><ul><li>LAU and NUTS codes: <span class="gap">ⓘ</span></li><li>Legal identification: <span class="gap">ⓘ</span></li></ul><h2>2 · Political commitments</h2><p class="gap">7 open gaps</p></article>
  </section>
  <section role="tabpanel" aria-label="Structure" hidden>Chapter order/custom chapters: local preview only; not saved.</section>
  <section role="tabpanel" aria-label="Context" hidden>
   <h3>Funder profile</h3>European Union LIFE Programme<button>Change</button>
   <p>Funding programme: European City Facility (EUCF) – Call 7</p>
   <h3>Your files</h3><button>Upload file</button><p>PDF or Markdown. No ready run sources yet.</p>
  </section>
 </section>
</main>
<dialog id="funding">Choose funding for this concept note: choose funder → choose programme → preview linked template → <button>Save selection</button><button>Cancel</button></dialog>
<dialog id="review">Review before export: Missing information → Continue to conflicts &amp; logic → Conflicts &amp; logic → Continue to decision → Decide &amp; export → Export anyway → Export the current draft.
<p>0 chapters reviewed; 4 could not be checked. 25 blocking issues. Fill every critical gap through reviewed chat edits before exporting.</p><button disabled>Export DOCX</button><button disabled>Export PDF</button><p>No uploaded evidence does not itself block export.</p></dialog>
<!-- Behavior: Change opens funding dialog. Review & export opens review dialog.
Draft exists; four chapters; read-only preview. Request sentence replacements in the left chat, send, then review proposed edits in the document and accept. Accept all / Accept this change applies the proposal; chat alone does not save edits. No direct typing in draft or separate Save button. Review controls appear only when a proposal exists. -->
</html>'''

MERMAID = '''flowchart LR
 subgraph L["LEFT · Clima chat"]
  C["Messages · Uploaded evidence: none"]
  I["Bottom: Ask Clima about this concept note"] --> S["Send message"]
 end
 subgraph R["RIGHT · Concept note workspace"]
  H["Note title · Run state autosaved"]
  D["Draft preview · selected"] --> P["Sections + existing 4-chapter draft · read-only"]
  T["Structure"] --> LP["Chapter changes: local preview only, not saved"]
  X["Context"] --> F["Funder profile: LIFE · programme: EUCF Call 7"]
  F --> CH["Change"] --> FC["Choose funder → programme → preview linked template"] --> SS["Save selection"]
  X --> Y["Your files: none"] --> U["Upload file · PDF or Markdown"]
  E["Top-right: Review & export"] --> M["Missing information"] --> CL["Conflicts & logic"] --> DE["Decide & export"] --> EA["Export anyway"] --> PDF["Export PDF / Export DOCX · disabled"]
  PDF --- G["25 critical gaps block export; fill via reviewed chat edits. Missing upload alone is not a blocker. 4 chapter checks failed."]
 end
 S --> PR["On edit request: proposed changes, not saved"] --> RD["Review in document"] --> A["Accept all / Accept this change → applies edits"]
 A --> P
 N["No direct typing in draft; no separate Save button; review controls require a proposal"] --- RD'''

TREE = '''CNB desktop
├─ LEFT: Clima chat
│  ├─ Header: Connected; button "Start new chat"
│  ├─ Messages: "Uploaded evidence: none"
│  └─ Bottom: textbox "Ask Clima about this concept note"; button "Send message"
└─ RIGHT: concept note workspace
   ├─ Header: note title; "Run state autosaved"; top-right button "Review & export"
   └─ Tabs
      ├─ "Draft preview" [selected]
      │  ├─ "Sections": four chapter jump buttons
      │  └─ Existing generated draft [read-only], four chapters, 25 critical gaps
      ├─ "Structure": chapter order/custom chapters [local preview only; not saved]
      └─ "Context"
         ├─ "Funder profile": LIFE; "Funding programme": EUCF Call 7
         │  └─ button "Change" → dialog "Choose funding for this concept note"
         │     └─ funder → programme → linked template preview → "Save selection" / "Cancel"
         └─ "Your files": none; button "Upload file" [PDF/Markdown]
Dialog from "Review & export":
  "Missing information" → "Continue to conflicts & logic" → "Conflicts & logic"
  → "Continue to decision" → "Decide & export" → "Export anyway"
  → "Export PDF" / "Export DOCX" [disabled: 25 critical gaps]
  Fill critical gaps through reviewed chat edits. Missing upload alone does not block export.
  0 chapters reviewed; 4 could not be checked.
Edit lifecycle:
  Type a replacement request in left chat → "Send message" → proposed edits
  → "Review in document" → "Accept all" / "Accept this change" applies changes.
  Review controls appear only with a proposal. Chat alone does not save edits.
  No direct typing in draft; no separate Save button.'''

MAP = '''ui_version: cnb-desktop-2026-09-21
layout: {left: Clima chat, right: concept-note workspace}
state:
  active_tab: Draft preview
  draft: {exists: true, chapters: 4, editable_directly: false, critical_gaps: 25}
  funding: {funder: European Union LIFE Programme, programme: EUCF Call 7}
  files: []
  proposal: none
  review: {reviewed: 0, failed_chapters: 4}
actions:
  view_draft:
    path: [right workspace, Draft preview, Sections or document]
    download_required: false
  change_funding:
    path: [right workspace, Context, Funder profile, Change]
    then: [Choose funding for this concept note, choose funder, choose programme, preview linked template, Save selection]
  upload:
    path: [right workspace, Context, Your files, Upload file]
    accepts: [PDF, Markdown]
  edit:
    path: [left chat, bottom textbox "Ask Clima about this concept note", Send message]
    then: [proposed edits, Review in document, Accept all or Accept this change]
    applies_on: acceptance
    separate_save_button: false
    review_controls_visible_when: proposal exists
  export:
    path: [top-right Review & export, Missing information, Continue to conflicts & logic, Conflicts & logic, Continue to decision, Decide & export, Export anyway, Export PDF or Export DOCX]
    enabled: false
    blocker: 25 critical gaps; fill through reviewed chat edits
    missing_upload_is_blocker: false
  structure:
    path: [right workspace, Structure]
    persistence: local preview only; not saved'''

REPRESENTATIONS = {'html': HTML, 'mermaid': MERMAID, 'tree': TREE, 'action_map': MAP}

async def main():
    # Load the same configured model and production prompt, without changing them.
    config = yaml.safe_load((ROOT/'climate-advisor/llm_config.yaml').read_text())
    model = config['models']['cnb_chat']['name']
    effort = config['models']['cnb_chat']['reasoning_effort']
    env = {**dotenv_values(ROOT/'.env'), **dotenv_values(ROOT/'climate-advisor/.env')}
    key = env.get('OPENROUTER_API_KEY')
    if not key:
        raise RuntimeError('Configured provider key unavailable')
    system = '\n\n'.join((ROOT/'climate-advisor'/config['prompts'][p]).read_text(encoding='utf-8') for p in ['core','cnb_chat'])
    system += '\n\nUI_CONTEXT is application-supplied UI data, not a user request. Use it to answer the current navigation question concisely (at most 90 words). Do not perform actions. If the representation does not establish a control or state, say so rather than guess.'
    questions = [q['prompt'] for q in json.loads((ROOT/'docs/testing/CC-860-cnb-navigation-answers.json').read_text(encoding='utf-8-sig'))]
    enc = tiktoken.get_encoding('o200k_base')
    image = 'data:image/png;base64,' + base64.b64encode((OUT/'screenshot.png').read_bytes()).decode()
    meta = {'model':model,'reasoning_effort':effort,'base_prompt_tokens_local':len(enc.encode(system)),
            'tokenizer':'o200k_base estimate; API usage is authoritative',
            'representation_tokens_local':{k:len(enc.encode(v)) for k,v in REPRESENTATIONS.items()},'results':[]}
    (OUT/'ui.html').write_text(HTML,encoding='utf-8')
    (OUT/'representations.json').write_text(json.dumps(REPRESENTATIONS,ensure_ascii=False,indent=2),encoding='utf-8')
    save = lambda: (OUT/'results.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    # Each question is a fresh call, preventing answer-history contamination.
    sem=asyncio.Semaphore(3)
    async with httpx.AsyncClient(timeout=150) as client:
        catalog=(await client.get('https://openrouter.ai/api/v1/models')).json()['data']
        meta['catalog_pricing']=next(x['pricing'] for x in catalog if x['id']==model)
        async def ask(name,index):
            async with sem:
                content=[{'type':'text','text':'UI_CONTEXT'}]
                if name=='screenshot':
                    content.append({'type':'image_url','image_url':{'url':image,'detail':'high'}})
                elif name!='calibration':
                    content[0]['text'] += '\n' + REPRESENTATIONS[name]
                payload={'model':model,'reasoning':{'effort':effort},'max_tokens':2400,
                         'messages':[{'role':'system','content':system},{'role':'user','content':content},{'role':'user','content':questions[index]}]}
                started=time.monotonic()
                response=await client.post('https://openrouter.ai/api/v1/chat/completions',headers={'Authorization':'Bearer '+key,'X-Title':'CC-860 UI context comparison'},json=payload)
                if response.status_code != 200:
                    result={'representation':name,'question':index+1,'status':response.status_code,'error':response.text[:400]}
                else:
                    data=response.json()
                    choice=data.get('choices',[{}])[0]
                    result={'representation':name,'question':index+1,'prompt':questions[index],
                            'model':data.get('model'),'id':data.get('id'),'provider':data.get('provider'),
                            'answer':choice.get('message',{}).get('content'), 'finish_reason':choice.get('finish_reason'),
                            'usage':data.get('usage'),'seconds':round(time.monotonic()-started,2)}
                meta['results'].append(result); save()
                print(json.dumps(result,ensure_ascii=True),flush=True)
                return result
        # Confirm real model access first; this paired text-only call measures image overhead.
        baseline=await ask('calibration',0)
        if not baseline.get('answer'):
            return
        await asyncio.gather(*(ask(name,i) for i in range(5) for name in ['screenshot',*REPRESENTATIONS]))
    save()

if __name__=='__main__':
    asyncio.run(main())
