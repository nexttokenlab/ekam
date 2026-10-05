import {test,expect} from '@playwright/test';
test.use({channel:'chrome',viewport:{width:390,height:844}});
test('spoken language is clear and change applies to the same live session',async({page})=>{
 let person={id:'a',name:'Neha',language:'Hindi',languages:['Hindi']};
 let session:any={id:'same-session',a:'a',b:'b',language_a:'Hindi',language_b:'English',status:'listening',epoch:0,started:Date.now()/1000,ended:null,resume_by:null,turns:[],peer:{id:'b',name:'Y',language:'English'}};
 let changes=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let body:any={};
  if(path==='/api/me')body=person;
  else if(path==='/api/state')body={incoming:[],outgoing:null,session};
  else if(path==='/api/conversations')body=[];
  else if(path.endsWith('/resume/respond')){session={...session,status:'listening',resume_by:null};body={ok:true};}
  else if(path==='/api/sessions/same-session/language'){
   const language=route.request().postDataJSON().language;
   person={...person,language,languages:[language]};session={...session,language_a:language,epoch:session.epoch+1};changes++;body=person;
  } else if(path==='/api/profile')throw Error('Live language change must not use profile endpoint');
  await route.fulfill({json:body});
 });
 await page.goto('http://127.0.0.1:5176');
 await expect(page.locator('.session-language-picker strong')).toHaveText('हिन्दी');
 await expect(page.locator('.listening-panel')).toHaveCount(0);
 // Before the microphone is enabled there is a single button; End appears after it splits.
 await expect(page.locator('.session-controls .voice-main')).toHaveText('माइक्रोफ़ोन सक्षम करें');
 await expect(page.locator('.session-controls .voice-end')).toBeHidden();
 await expect(page.locator('.session-controls .voice-end')).toHaveAttribute('aria-label','बातचीत समाप्त करें');
 await page.screenshot({path:'/private/tmp/ekam-spoken-language-mobile.png',fullPage:true});
 await page.locator('.session-language-picker').click();
 await page.locator('input[value="Kannada"]').check({force:true});
 await page.locator('dialog form button.primary').click();
 await expect.poll(()=>changes).toBe(1);
 await expect(page.locator('.session-language-picker strong')).toHaveText('ಕನ್ನಡ');
 await expect(page.locator('.session-peer-language')).toContainText('English');
 expect(session.id).toBe('same-session');
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'/private/tmp/ekam-spoken-language-desktop.png',fullPage:true});
 // Our own resume request waits inside the voice bar, with no popup.
 session={...session,status:'resume-request',resume_by:'a'};
 await expect(page.locator('.voice-main')).toHaveAttribute('aria-label',/Y/,{timeout:6000});
 await expect(page.locator('.voice-end')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 // The other person's request is answered in a popup, not an embedded card.
 session={...session,status:'resume-request',resume_by:'b'};
 const resumeDialog=page.getByRole('dialog');
 await expect(resumeDialog).toBeVisible({timeout:6000});
 await expect(page.locator('.resume-card')).toHaveCount(0);
 await page.screenshot({path:'/private/tmp/ekam-resume-popup-mobile.png'});
 await resumeDialog.locator('button.primary').click();
 await expect(resumeDialog).toHaveCount(0);

});
