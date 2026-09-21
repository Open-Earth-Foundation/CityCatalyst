// Record five real first-time-user navigation questions against deployed CNB.
// Uses a copied verification note with fresh chat, real auth and real LLM calls.
// Run via browser-demo-recorder/scripts/record_demo.cjs; artifacts stay here.
const fs = require('node:fs');
const path = require('node:path');
const base = 'https://citycatalyst.openearth.dev';
const dashboard = base + '/en/cities/04d2a48c-d2a2-42e9-868f-c30aeec96a07/concept-notes/';
const sourceName = 'CC-860 UI verification — 21 Sep 2026';
const questions = [
  "I'm new here. Where can I see the draft you generated? Do I need to download it first?",
  'Where do I click to change the funder and funding programme for this note?',
  'I have a PDF with more project information. Where do I upload it?',
  'I want to correct a sentence in the draft. Where do I type the change, and how do I save it?',
  'How do I download this note as a PDF, and why might the download button be disabled?'
];
module.exports = async ({page, context, step, highlight, wait, finding}) => {
  const artifactDir = process.env.CC860_ARTIFACT_DIR || __dirname;
  const results = {scope:'Current deployed prompt; proposed UI map is NOT installed', questions:[], verification:[], url:null};
  const save = () => fs.writeFileSync(path.join(artifactDir,'answers.json'), JSON.stringify(results,null,2));
  const announce = async text => {
    await step(text);
    await page.locator('[data-demo-recorder-banner]').evaluate(el => {
      el.style.bottom='auto'; el.style.top='85px'; el.style.left='30%';
      el.style.maxWidth='65%'; el.style.fontSize='15px';
    }).catch(()=>{});
  };
  const shot = name => page.screenshot({path:path.join(artifactDir,name+'.png')});
  const tabs = name => page.getByRole('tab',{name,exact:true});
  try {
    await require('./auth.cjs')(context);
    await page.goto(dashboard,{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:'Duplicate: '+sourceName,exact:true}).waitFor({timeout:30000});
    const decline = page.getByRole('button',{name:'Decline',exact:true});
    if(await decline.isVisible()) {
      await announce('Dismiss cookie notice to make the chat controls accessible');
      await decline.click();
    }
    const resume = page.getByRole('link',{name:'Resume: '+sourceName+' (copy)',exact:true});
    if(!await resume.count()) {
      await announce('Setup: copy the verification draft for a fresh conversation');
      await highlight(page.getByRole('button',{name:'Duplicate: '+sourceName,exact:true}));
      await page.getByRole('button',{name:'Duplicate: '+sourceName,exact:true}).click();
    }
    await resume.waitFor({timeout:45000});
    const href = await resume.getAttribute('href');
    await page.goto(new URL(href,base).href,{waitUntil:'domcontentloaded',timeout:45000});
    const input = page.getByTestId('concept-note-chat-input');
    await input.waitFor({timeout:30000});
    await page.waitForFunction(()=>{const i=document.querySelector('[data-testid="concept-note-chat-input"]');return i && !i.disabled;},null,{timeout:60000});
    const chat = page.getByTestId('concept-note-chat-scroll');
    if ((await chat.innerText()).includes('In the first chapter, change the heading')) throw new Error('Duplicate unexpectedly retained earlier chat');
    await page.getByRole('heading',{name:'Applicant identity and contacts',exact:true}).waitFor({timeout:30000});
    results.url=page.url(); save();
    await announce('Fresh chat; existing four-chapter draft visible on the right');
    await wait(2000); await shot('starting-state');
    for (let i=0;i<questions.length;i++) {
      const prompt=questions[i];
      await announce(`Question ${i+1}/5: ${prompt}`);
      await input.fill(prompt);
      await highlight(input); await wait(900);
      const started=Date.now();
      await page.getByRole('button',{name:'Send message',exact:true}).click();
      await wait(800);
      await page.waitForFunction(()=>{const i=document.querySelector('[data-testid="concept-note-chat-input"]');return i && !i.disabled;},null,{timeout:180000});
      await wait(1000);
      const text=await chat.innerText();
      const answer=text.slice(text.lastIndexOf(prompt)+prompt.length).trim();
      const errors=await chat.getByRole('alert').allTextContents();
      results.questions.push({number:i+1,prompt,answer,seconds:Number(((Date.now()-started)/1000).toFixed(1)),errors}); save();
      await announce(`Question ${i+1}/5: response received — compare with actual controls`);
      console.log(JSON.stringify({question:i+1,answer,errors}));
      if (!answer || errors.length) finding('crashed-or-broke',`Question ${i+1}: no usable answer or chat error`,{errors});
      await shot(`q${i+1}-answer`); await wait(5000);
      if(i===0){
        await tabs('Draft preview').click();
        await highlight(page.getByRole('heading',{name:'Applicant identity and contacts',exact:true}));
        results.verification.push({question:1,actual:'Draft preview contains generated document text and Sections chapter navigation. No download required.'});
      } else if(i===1){
        await tabs('Context').click();
        const change=page.getByRole('button',{name:'Change',exact:true});
        await highlight(change); await change.click();
        await page.getByRole('heading',{name:'Choose funding for this concept note',exact:true}).waitFor();
        await page.getByText('Choose a programme',{exact:true}).waitFor({timeout:30000});
        await shot('q2-real-funding-controls'); await wait(3500);
        results.verification.push({question:2,actual:'Context > Funder profile > Change opens the funder/programme catalogue, template preview and Save selection.'});
        await page.getByRole('button',{name:'Cancel',exact:true}).click();
        await tabs('Draft preview').click();
      } else if(i===2){
        await tabs('Context').click();
        await highlight(page.getByRole('button',{name:'Upload file',exact:true}));
        results.verification.push({question:3,actual:'Context > Your files > Upload file. No file uploaded during this guidance test.'});
        await shot('q3-real-upload-control'); await wait(2500); await tabs('Draft preview').click();
      } else if(i===3){
        await highlight(input);
        results.verification.push({question:4,actual:'Chat composer exists on the left. This question asks for instructions only; no edit request or acceptance performed.'});
      } else {
        await highlight(page.getByRole('button',{name:'Review & export',exact:true}));
        await page.getByRole('button',{name:'Review & export',exact:true}).click();
        const next=page.getByRole('button',{name:'Continue to conflicts & logic',exact:true});
        await next.waitFor({timeout:180000});
        const dialog=page.locator('[role="dialog"]');
        const reviewText=await dialog.innerText();
        if(/could not be checked|could not be completed/i.test(reviewText)) finding('needs-work','Review contains failed chapter checks',reviewText.slice(-2000));
        await next.click();
        await page.getByRole('button',{name:'Continue to decision',exact:true}).click();
        await page.getByRole('button',{name:/^(Export anyway|Continue to export)$/i}).click();
        const pdf=page.getByRole('button',{name:'Export PDF',exact:true});
        await pdf.waitFor();
        results.verification.push({question:5,actual:'Review & export > Missing information > Conflicts & logic > Decide & export > PDF/DOCX. PDF button disabled: '+await pdf.isDisabled(),visibleExportText:await dialog.innerText()});
        await shot('q5-real-export-controls'); await wait(4500);
        await dialog.getByRole('button',{name:'Close',exact:true}).click();
      }
      save();
    }
    await announce('Five questions recorded. Answers and actual UI evidence saved; no prompt changes installed.');
    await wait(2500);
  } finally {save();}
};
