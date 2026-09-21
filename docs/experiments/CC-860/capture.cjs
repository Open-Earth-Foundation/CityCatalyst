// Capture real CNB UI states for a model-input experiment; no video or chat submissions.
// Usage: node output/ui-context-comparison/capture.cjs from repository root.
const {chromium} = require('../../app/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 try {
  await require('../browser-demo-recording/cc860-five-questions/auth.cjs')(context);
  const page=await context.newPage();
  const dashboard='https://citycatalyst.openearth.dev/en/cities/04d2a48c-d2a2-42e9-868f-c30aeec96a07/concept-notes/';
  await page.goto(dashboard,{waitUntil:'domcontentloaded'});
  const source='CC-860 UI verification — 21 Sep 2026 (copy)';
  await page.getByRole('button',{name:'Duplicate: '+source,exact:true}).waitFor({timeout:30000});
  const decline=page.getByRole('button',{name:'Decline',exact:true});
  if(await decline.isVisible()) await decline.click();
  const resume=page.getByRole('link',{name:'Resume: '+source+' (copy)',exact:true});
  if(!await resume.count()) await page.getByRole('button',{name:'Duplicate: '+source,exact:true}).click();
  await resume.waitFor({timeout:45000});
  await resume.click();
  await page.getByRole('heading',{name:'Applicant identity and contacts',exact:true}).waitFor({timeout:45000});
  await page.getByTestId('concept-note-chat-input').waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({path:path.join(__dirname,'screenshot.png')});
  const data={url:page.url(),draft:await page.locator('body').ariaSnapshot()};
  await page.getByRole('heading',{name:'Applicant identity and contacts',exact:true}).click();
  data.editableAfterClick=await page.locator('[contenteditable=true]').count();
  await page.getByRole('tab',{name:'Context',exact:true}).click();
  data.context=await page.locator('body').ariaSnapshot();
  await page.getByRole('button',{name:'Change',exact:true}).click();
  data.funding=await page.getByRole('dialog').ariaSnapshot();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('tab',{name:'Draft preview',exact:true}).click();
  await page.getByRole('button',{name:'Review & export',exact:true}).click();
  await page.getByRole('button',{name:'Continue to conflicts & logic',exact:true}).waitFor({timeout:180000});
  await page.getByRole('button',{name:'Continue to conflicts & logic',exact:true}).click();
  await page.getByRole('button',{name:'Continue to decision',exact:true}).click();
  await page.getByRole('button',{name:/^(Export anyway|Continue to export)$/i}).click();
  data.export=await page.getByRole('dialog').ariaSnapshot();
  fs.writeFileSync(path.join(__dirname,'observed-ui.json'),JSON.stringify(data,null,2));
  console.log(JSON.stringify({captured:true,editableAfterClick:data.editableAfterClick,pdfDisabled:await page.getByRole('button',{name:'Export PDF',exact:true}).isDisabled()}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
