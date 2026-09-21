// Read-only preflight: real auth and current verification note; no saved secrets.
// Run with node from the recording artifact directory.
const {chromium} = require('../../../app/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext();
  try {
    await require('./auth.cjs')(context);
    const page = await context.newPage();
    const response = await page.goto('https://citycatalyst.openearth.dev/en/cities/04d2a48c-d2a2-42e9-868f-c30aeec96a07/concept-notes/', {waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('heading',{name:'Concept notes',exact:true}).waitFor({timeout:30000});
    await page.getByRole('button',{name:'Duplicate: CC-860 UI verification — 21 Sep 2026',exact:true}).waitFor({timeout:30000});
    fs.writeFileSync(path.join(__dirname,'preflight.json'),JSON.stringify({authenticated:true,status:response.status(),url:page.url(),fixtureAvailable:true},null,2));
    console.log('Authenticated development site ready; original verification note available.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
