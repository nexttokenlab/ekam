import {test,expect} from '@playwright/test';
test.use({channel:'chrome',viewport:{width:390,height:844}});
const base='http://127.0.0.1:5176';
for(const historyMode of ['failed','slow'] as const) {
 test(`QR owner can accept while conversation history is ${historyMode}`,async({browser})=>{
  const owner=await browser.newContext(),guest=await browser.newContext();
  const host={id:'host',name:'Host',language:'English',languages:['English']};
  const visitor={id:'visitor',name:'Visitor',language:'French',languages:['French']};
  let pending=false,accepted=false;
  for(const [context,person] of [[owner,host],[guest,visitor]] as const){
   await context.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let body:any={};
    if(path==='/api/me')body=person;
    else if(path==='/api/config')body={};
    else if(path==='/api/conversations'){
     if(historyMode==='failed')return route.fulfill({status:503,json:{detail:'Temporary history failure'}});
     await new Promise(resolve=>setTimeout(resolve,15000));
     return route.fulfill({json:[]}).catch(()=>{});
    }
    else if(path==='/api/state')body={incoming:person.id==='host'&&pending?[{id:'request-1',peer:visitor,status:'pending',expires:Date.now()/1000+60}]:[],outgoing:person.id==='visitor'&&pending?{id:'request-1',peer:host,status:'pending',expires:Date.now()/1000+60}:null,session:null};
    else if(path==='/api/qr')body={url:base+'/?connect=owner-qr-code&lang=en',code:'owner-qr-code',expires_in:300};
    else if(path.startsWith('/api/qr/'))body={locale:'en'};
    else if(path==='/api/requests'){pending=true;body={id:'request-1',peer:host,status:'pending'};}
    else if(path==='/api/requests/request-1/respond'){accepted=req.postDataJSON().accept;pending=false;body={ok:true};}
    await route.fulfill({json:body});
   });
  }
  try {
   const hostPage=await owner.newPage();await hostPage.goto(base);
   await hostPage.getByRole('button',{name:'Open profile',exact:true}).click();
   const guestPage=await guest.newPage();await guestPage.goto(base+'/?connect=owner-qr-code&lang=en');
   await expect.poll(()=>pending).toBe(true);
   await expect(guestPage.locator('.connection-waiting')).toBeVisible();
   // Only the headphones advice is shown while the request is pending.
   await expect(guestPage.locator('.connection-waiting')).toHaveText('Mettez vos écouteurs pour une meilleure expérience');
   await expect(guestPage.locator('.my-qr-panel,.nav-scan,.language-picker-trigger,.bottom-nav')).toHaveCount(0);
   await guestPage.screenshot({path:'/private/tmp/ekam-waiting-mobile.png',fullPage:true});
   const accept=hostPage.getByRole('button',{name:'Accept',exact:true});
   await expect(accept).toBeVisible({timeout:5000});
   await expect(hostPage.locator('dialog[open]')).toHaveCount(1);
   await accept.click();
   await expect.poll(()=>accepted).toBe(true);
   await expect(accept).toHaveCount(0);
   await expect(guestPage.locator('.connection-waiting')).toHaveCount(0);
   await expect(guestPage.locator('.my-qr-panel')).toBeVisible();
  }finally{await owner.close();await guest.close();}
 });
}
