
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const C=$('#conv'),F=$('#feed'),Q=$('#q'),RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const root=document.documentElement;
function logo(small){const n='http://www.w3.org/2000/svg',s=document.createElementNS(n,'svg'),u=document.createElementNS(n,'use');s.setAttribute('class','lg'+(small?' sm':''));s.setAttribute('aria-hidden','true');u.setAttribute('href','#lq');s.append(u);return s}
function el(tag,cls,text){const d=document.createElement(tag);if(cls)d.className=cls;if(text!=null)d.textContent=text;return d}
function add(node,parent){(parent||C).append(node);scroll();return node}
const near=()=>F.scrollHeight-F.scrollTop-F.clientHeight<160;
function scroll(){F.scrollTop=F.scrollHeight}
let toastT=0;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1800)}
const badge=(kind,text)=>el('span','badge c-'+kind,text);

/* ---------- theme ---------- */
try{const s=localStorage.getItem('lq-theme');if(s)root.dataset.theme=s}catch(e){}
const curTheme=()=>root.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
$('#th').onclick=()=>{const n=curTheme()==='dark'?'light':'dark';root.dataset.theme=n;try{localStorage.setItem('lq-theme',n)}catch(e){}toast('Theme: '+n)};

/* ---------- panels ---------- */
const narrowSb=()=>matchMedia('(max-width:719px)').matches,narrowRp=()=>matchMedia('(max-width:959px)').matches;
function panel(side,on){
  const b=document.body,nar=side==='sb'?narrowSb():narrowRp();
  const cur=nar?b.classList.contains('show-'+side):!b.classList.contains('hide-'+side);
  if(on===undefined)on=!cur;
  if(nar){b.classList.toggle('show-'+side,on);if(on)b.classList.remove('show-'+(side==='sb'?'rp':'sb'))}
  else b.classList.toggle('hide-'+side,!on);
}
document.body.classList.add('hide-rp');
$('#tsb').onclick=()=>panel('sb');$('#trp').onclick=()=>panel('rp');$('#crp').onclick=()=>panel('rp',false);
$('#scrim').onclick=()=>{document.body.classList.remove('show-sb','show-rp')};
function tab(n){$$('.tabs [data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===n));$$('.pane').forEach(p=>p.classList.toggle('on',p.id==='p-'+n))}
$$('.tabs [data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));

/* ---------- state vocabulary ---------- */
const GL={running:'◐',done:'✓',failed:'✗',queued:'○'};
const SC={running:'c-info',done:'c-ok',failed:'c-err',queued:'c-faint'};
const SB={running:'info',done:'ok',failed:'err',queued:'warn'};
let busy=false,abort=false,pend=null,tools=0,hist=[],hi=0,t0=0,tick=0,thread=null;
let currentModel=localStorage.getItem('lq-model')||'gemma4:31b';
let currentMode='act';
const sleep=ms=>new Promise((r,j)=>setTimeout(()=>abort?j('abort'):r(),RM?Math.min(ms,20):ms));

/* ---------- the linked queue ---------- */
const QUE=[{id:1,t:'Bump dependencies',s:'done',dep:null},{id:2,t:'Migrate to ESM',s:'done',dep:1}];
let qid=2;
function addQ(t,s){const last=QUE[QUE.length-1];const q={id:++qid,t,s,dep:last?last.id:null};QUE.push(q);drawQueue();return q}
function drawQueue(){
  const p=$('#p-queue');p.replaceChildren();
  QUE.forEach((x,i)=>{
    if(i)p.append(el('div','qlink'));
    const r=el('div','card qi'),t=el('div','qt');
    t.append(el('div','','#'+x.id+'  '+x.t),el('div','qd',x.dep?'after #'+x.dep:'no dependency'));
    r.append(el('span','qg '+SC[x.s],GL[x.s]),t,badge(SB[x.s],x.s));p.append(r);
  });
  $('#ne').textContent=QUE.length;
  const w=QUE.filter(x=>x.s==='queued').length;$('#qn').textContent=w;$('#qp').classList.toggle('on',w>0);
}

/* ---------- files / changes ---------- */
const FILES={};
function diffLines(arr,start){
  let o=start,n=start;
  return arr.map(([k,t])=>{const d=el('div','dl '+k);let num;
    if(k==='del'){num=o;o++}else if(k==='add'){num=n;n++}else if(k==='hunk'){num=''}else{num=n;o++;n++}
    d.append(el('span','n',String(num)),el('span','g',k==='add'?'+':k==='del'?'−':''),t||' ');return d});
}
function textLines(body){return body.split('\n').map((t,i)=>{const d=el('div','dl add');d.append(el('span','n',String(i+1)),el('span','g','+'),t||' ');return d})}
function openFile(n){
  const f=FILES[n];$('#vt').textContent=n;
  $('#vb').replaceChildren(...(f.type==='diff'?diffLines(f.lines,f.start):textLines(f.body)));
  const b=$('#vbadge');b.textContent=f.type==='diff'?'modified':'new file';b.className='badge '+(f.type==='diff'?'c-warn':'c-ok');
  $('#viewer').classList.add('on');panel('rp',true);tab('files');
}
function railFile(n){
  $('#fe').style.display='none';
  const o=$('#flist').querySelector('[data-n="'+n+'"]');if(o)o.remove();
  const b=el('button','row');b.dataset.n=n;b.append(el('span','ico c-info','✎'),el('span','tt mono',n),el('span','meta','view'));b.onclick=()=>openFile(n);$('#flist').append(b);
  $('#nf').textContent=$('#flist').children.length;
}

/* ---------- sidebar threads ---------- */
function addThread(title,state,done){
  const run=state==='run';
  const b=el('button','row th'+(run?' on':''));
  const dot=el('span','dot '+(run?'c-info':done?'c-ok':'faint'),run?'◐':done?'✓':'○');
  b.append(dot,el('span','tt',title),el('span','meta',run?'now':state));
  b.onclick=()=>{toast('Mockup: thread history not wired up')};
  $('#threads').insertBefore(b,$('#threads').children[1]);
  return {el:b,dot,meta:b.querySelector('.meta')};
}
function endThread(ok){if(!thread)return;thread.dot.textContent=ok?'✓':'✗';thread.dot.className='dot '+(ok?'c-ok':'c-err');thread.meta.textContent='just now';thread.el.classList.remove('on')}
addThread('Bump dependencies','1d',true);addThread('Migrate to ESM','3h',true);

/* ---------- library ---------- */
[['◈','Skills','/skills'],['⊞','MCP servers','/install'],['LQ','Queue','/queue'],['▤','Changes','/artifacts'],['◧','Design system','/design']].forEach(([i,t,c])=>{
  const b=el('button','row'),ic=el('span','ico');if(i==='LQ')ic.append(logo(true));else ic.textContent=i;b.append(ic,el('span','tt',t));b.onclick=()=>{if(!busy)cmd(c);if(narrowSb())panel('sb',false)};$('#lib').append(b);
});
$('#newth').onclick=()=>{if(busy)return;newThread();if(narrowSb())panel('sb',false);Q.focus()};
$('#srch').onclick=$('#pk').onclick=()=>{if(!busy)palOpen_()};
$('#cfg').onclick=()=>{if(!busy)cmd('/config')};

/* ---------- status ---------- */
const PH='Ask LinkedQueue to build, fix, or explain…  /  for commands';
function setSt(){
  document.body.classList.toggle('busy',busy);document.body.classList.toggle('wait',!!pend);
  const s=pend?'awaiting approval':busy?'working':'ready';
  $('#ss').textContent=s;$('#sn').textContent=tools+' tool call'+(tools===1?'':'s');
  Q.placeholder=busy?'LinkedQueue is working…  esc to stop':PH;
  const g=$('#go');g.textContent=busy?'■':'↑';g.setAttribute('aria-label',busy?'Stop':'Send');g.disabled=!busy&&!Q.value.trim();
}
function spin(on){clearInterval(tick);if(!on)return;t0=Date.now();tick=setInterval(()=>{const w=$('.working .t');if(w)w.textContent='Working '+Math.floor((Date.now()-t0)/1000)+'s'},500)}

/* ---------- empty state ---------- */
function showEmpty(){
  const e=el('div','');e.id='empty';
  const mk=el('div','mark');mk.append(logo());e.append(mk,el('h1','','What are we building?'),el('p','','LinkedQueue plans, runs tools, and asks before it changes anything. Tasks you add are queued and linked in order.'));
  const g=el('div','sug');
  [['/fix','Fix failing tests','Run the suite, find the bug, patch it'],['/explore','Explore this repo','Map the architecture and write it down'],['/commit','Commit changes','Review the diff and write the message'],['/install','Add an MCP server','Connect a tool from a URL (with approval)']].forEach(([c,t,d])=>{const b=el('button');b.append(el('b','',t),el('span','',d));b.onclick=()=>{if(!busy)cmd(c)};g.append(b)});
  e.append(g);C.append(e);
}
function newThread(){C.replaceChildren();P.el=null;P.todos=[];$('#p-plan').replaceChildren(el('div','empty','No plan yet.\nRun a command to see steps.'));$('#ttl').textContent='New thread';if(thread)thread.el.classList.remove('on');thread=null;showEmpty()}

/* ---------- plan ---------- */
const P={todos:[],at:0,el:null};
function drawPlan(){
  if(!P.el){P.el=add(el('div','card plan'));P.el.onclick=()=>P.el.classList.toggle('collapsed')}
  const n=P.todos.length,d=Math.min(P.at,n);
  P.el.replaceChildren();
  const h=el('div','ph');const bar=el('div','pbar');bar.append(Object.assign(el('i'),{style:'width:'+(d/n*100)+'%'}));h.append('Plan',bar,el('span','dim',d+'/'+n));P.el.append(h);
  P.todos.forEach((t,i)=>{const r=el('div','pi '+(i<P.at?'done':i===P.at?'now':''));r.append(el('span','g',i<P.at?'✓':i===P.at?'▸':'○'),t);P.el.append(r)});
  const pp=$('#p-plan');pp.replaceChildren(P.el.cloneNode(true));pp.firstChild.classList.remove('collapsed');
}

/* ---------- steps ---------- */
async function type(node,text){for(let i=0;i<text.length;i+=3){node.textContent=text.slice(0,i+3);if(near())scroll();await sleep(RM?0:12)}node.textContent=text}
function toolRow(name,arg){
  const w=el('div','tl'),h=el('button'),ic=el('span','ti dim'),sum=el('span','sum'),ch=el('span','chev','›');
  ic.append(el('span','spin','◐'));
  h.append(ic,el('span','tn',name),el('span','ta dim',arg?'('+arg+')':''),sum,ch);
  const out=el('pre','out card');w.append(h,out);
  h.onclick=()=>w.classList.toggle('open');
  add(w);return {w,ic,sum,out};
}
function toolDone(r,out,fail){
  r.ic.replaceChildren();r.ic.className='ti '+(fail?'c-err':'c-ok');r.ic.textContent=fail?'✗':'✓';
  r.sum.textContent=out[0];r.out.textContent=out.join('\n');if(fail)r.sum.style.color='var(--err)';
}
async function step(e){
  if(e.t==='say'){const d=add(el('div','ai'));await type(d,e.x);await sleep(150)}
  else if(e.t==='plan'){P.todos=e.todos;P.at=0;P.el=null;drawPlan();await sleep(250)}
  else if(e.t==='at'){P.at=e.i;drawPlan();await sleep(120)}
  else if(e.t==='tool'){const r=toolRow(e.name,e.arg);await sleep(e.ms||600);tools++;setSt();toolDone(r,e.out,e.fail)}
  else if(e.t==='ask'){await ask(e)}
  else if(e.t==='file'){file(e.name,e.body)}
  else if(e.t==='diff'){diff(e.name,e.start,e.lines)}
}
function fileCard(name,plus,minus){
  const c=add(el('div','card fc'));
  c.append(el('span','fi','✎'),el('span','nm mono',name),el('span','pl','+'+plus));
  if(minus!=null)c.append(el('span','mi','−'+minus));
  c.append(el('span','sp'),el('span','btn ghost','Review'));
  c.onclick=()=>openFile(name);railFile(name);toast('Changed '+name);if(!narrowRp())openFile(name);
}
function file(name,body){FILES[name]={type:'text',body};fileCard(name,body.split('\n').length)}
function diff(name,start,lines){FILES[name]={type:'diff',start,lines};fileCard(name,lines.filter(l=>l[0]==='add').length,lines.filter(l=>l[0]==='del').length)}
function ask(e){
  const lvl=e.lvl||'warn';
  return new Promise(res=>{
    const a=add(el('div','ask lvl-'+lvl)),h=el('div','ah');
    h.append(el('span','shield c-'+lvl,lvl==='err'?'⛨':'◈'),el('span','b','Approve '),el('span','mono b',e.name+'?'),el('span','sp'),badge(lvl,e.risk));a.append(h);
    const body=el('div','ab');
    if(e.diff){const dc=el('div','dcard');dc.append(el('div','fh',e.file));diffLines(e.diff.lines,e.diff.start).forEach(d=>dc.append(d));body.append(dc)}
    else body.append(el('pre','code',e.body.join('\n')));
    if(e.note){const c=el('div','callout '+lvl);c.append(e.note);body.append(c)}
    a.append(body);
    const f=el('div','af'),n=el('button','btn'),y=el('button','btn pri');
    n.append('Reject ',el('span','kbd','n'));y.append('Approve once ',el('span','kbd','y'));f.append(n,y);a.append(f);
    scroll();
    const decide=ok=>{if(!pend)return;pend=null;a.classList.add('done');a.append(el('div','res '+(ok?'c-ok':'c-err'),ok?'✓ Approved once':'✗ Rejected'));setSt();res(ok)};
    pend={decide};setSt();y.onclick=()=>decide(true);n.onclick=()=>decide(false);y.focus({preventScroll:true});
  }).then(async ok=>{
    await sleep(400);tools++;setSt();
    const r=toolRow(e.name,e.file||'');toolDone(r,ok?e.yes:['Rejected by user.'],!ok);
    if(ok&&e.after)for(const s of [].concat(e.after))await step(s);
  });
}

/* ---------- scripted sessions (simulated; no backend) ---------- */
const S={
fix:{title:'Fix failing tests',steps:[
 {t:'plan',todos:['Run the test suite','Locate the failing test','Read the source','Patch the bug','Re-run the tests']},
 {t:'tool',name:'run_tests',arg:'npm test',out:['43 tests · 42 passed · 1 failed','FAIL  src/queue.test.ts › retries with backoff','  expected 3 attempts, received 2','  at src/queue.test.ts:58:22'],fail:1,ms:900},
 {t:'at',i:1},
 {t:'tool',name:'grep',arg:'"maxRetries" src/',out:['3 matches','src/queue.ts:14     const maxRetries = opts.retries ?? 3','src/queue.ts:43     if (attempt >= maxRetries) throw err','src/queue.test.ts:55  new Queue({ retries: 3 })'],ms:450},
 {t:'at',i:2},
 {t:'tool',name:'read_file',arg:'src/queue.ts:40-46',out:['lines 40-46','  for (let attempt = 0; ; attempt++) {','    try { return await task() }','    catch (err) {','      if (attempt >= maxRetries) throw err','      await sleep(backoff(attempt))','    }'],ms:400},
 {t:'say',x:'Found it. The retry guard uses `>=` against a zero-based attempt counter, so the final retry never runs. It should be `>`. Here is the patch.'},
 {t:'at',i:3},
 {t:'ask',name:'edit_file',file:'src/queue.ts',risk:'Modifies files',lvl:'warn',diff:{start:40,lines:[['hunk','@@ -40,6 +40,6 @@ run()'],['ctx','  for (let attempt = 0; ; attempt++) {'],['ctx','    try { return await task() }'],['ctx','    catch (err) {'],['del','      if (attempt >= maxRetries) throw err'],['add','      if (attempt > maxRetries) throw err'],['ctx','      await sleep(backoff(attempt))']]},
  yes:['Applied 1 edit to src/queue.ts'],
  after:[{t:'diff',name:'src/queue.ts',start:40,lines:[['hunk','@@ -40,6 +40,6 @@ run()'],['ctx','  for (let attempt = 0; ; attempt++) {'],['ctx','    try { return await task() }'],['ctx','    catch (err) {'],['del','      if (attempt >= maxRetries) throw err'],['add','      if (attempt > maxRetries) throw err'],['ctx','      await sleep(backoff(attempt))']]},
   {t:'at',i:4},
   {t:'tool',name:'run_tests',arg:'npm test',out:['43 tests · 43 passed','done in 2.4s'],ms:900},
   {t:'say',x:'All 43 tests pass. I only touched src/queue.ts. Run /commit when you want me to commit it.'}]}]},
explore:{title:'Explore this repo',steps:[
 {t:'plan',todos:['List the project files','Read entry points and config','Write ARCHITECTURE.md']},
 {t:'tool',name:'list_dir',arg:'.',out:['8 entries','src/        library source','test/       vitest suites','package.json','tsconfig.json','README.md'],ms:400},{t:'at',i:1},
 {t:'tool',name:'read_file',arg:'package.json',out:['name     lq-core','scripts  build · test · lint','deps     zod, undici'],ms:400},
 {t:'say',x:'lq-core is a small job-queue library. `Queue` in src/queue.ts runs tasks with retries and backoff, `Link` chains jobs so one starts only after another succeeds, and `store/` persists state to disk. I’ll write that down.'},{t:'at',i:2},
 {t:'file',name:'ARCHITECTURE.md',body:'# lq-core\n\nsrc/queue.ts    Queue: run tasks, retry with backoff\nsrc/link.ts     Link: start a job after another succeeds\nsrc/store/      persist queue state to disk\ntest/           vitest suites, one per module\n\nflow: enqueue -> link -> run -> retry -> persist'}]},
commit:{title:'Commit changes',steps:[
 {t:'plan',todos:['Check git status','Review the diff','Write the commit message','Commit after approval']},
 {t:'tool',name:'git_status',arg:'',out:['2 changed','M  src/queue.ts','?? ARCHITECTURE.md'],ms:400},{t:'at',i:1},
 {t:'tool',name:'git_diff',arg:'src/queue.ts',out:['1 file changed, 1 insertion(+), 1 deletion(-)'],ms:450},{t:'at',i:2},
 {t:'say',x:'One logical change, so one commit. I’ll leave ARCHITECTURE.md out of it.'},{t:'at',i:3},
 {t:'ask',name:'git_commit',risk:'Writes to git history',lvl:'warn',body:['git add src/queue.ts','git commit -m "fix(queue): run the final retry attempt"'],yes:['[main 3f9a2c1] fix(queue): run the final retry attempt'],after:{t:'say',x:'Committed. Nothing was pushed.'}}]},
install:{title:'Add an MCP server',steps:[
 {t:'plan',todos:['Fetch the server manifest','Connect the server','List its tools']},
 {t:'say',x:'Connecting an MCP server means running code from a URL. Read it first, then decide.'},{t:'at',i:0},
 {t:'ask',name:'add_mcp_server',risk:'Runs arbitrary code',lvl:'err',body:['url   https://example.com/mcp/linear.js','name  linear'],note:'MCP servers run with full local access. Only connect code you have read and trust.',yes:['connected linear · 3 tools'],after:[{t:'at',i:2},{t:'tool',name:'list_tools',arg:'linear',out:['3 tools','linear.search_issues','linear.create_issue','linear.update_issue'],ms:500}]},
 {t:'at',i:3}]}
};
async function play(k){
  const sc=S[k];busy=true;abort=false;thread=addThread(sc.title,'run');$('#ttl').textContent=sc.title;
  const q=addQ(sc.title,'running');
  const w=el('div','working');w.append(el('span','spin','◐'),Object.assign(el('span','shimmer t'),{textContent:'Working…'}));
  setSt();spin(true);let ok=true;
  try{for(const e of sc.steps){await step(e);C.append(w)}if(P.el&&P.todos.length)P.at=P.todos.length,drawPlan()}
  catch(x){if(x!=='abort')throw x;ok=false;if(pend)pend.decide(false);add(el('div','dim','⎯ Stopped'))}
  finally{busy=false;pend=null;spin(false);w.remove();endThread(ok);q.s=ok?'done':'failed';drawQueue();setSt()}
}
/* keep the working indicator at the bottom while a script runs */
new MutationObserver(()=>{const w=$('.working');if(w&&w.nextSibling)C.append(w)}).observe(C,{childList:true});

/* ---------- design system page ---------- */
function sect(t){add(el('div','faint b',t.toUpperCase())).style.cssText='font-size:11px;letter-spacing:.08em;margin-top:10px'}
function design(){
  add(el('div','ai head','LinkedQueue design system'));
  add(el('div','ai dim','Monospace throughout, neutral surfaces, one green accent. Amber, red and blue are reserved for state and risk.'));
  sect('Palette');
  const g=add(el('div','card'));g.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:12px';
  [['--bg','Background'],['--side','Sidebar'],['--card','Card'],['--hover','Hover'],['--line','Border'],['--dim','Muted text'],['--ac','Accent'],['--ok','Success'],['--warn','Caution'],['--err','Danger'],['--info','Active']].forEach(([v,n])=>{const d=el('div');d.style.cssText='display:flex;gap:8px;align-items:center';const s=el('span');s.style.cssText='width:22px;height:22px;border-radius:6px;border:1px solid var(--line);flex:none;background:var(--'+v.slice(2)+')';d.append(s,el('span','',n));g.append(d)});
  sect('Radius');
  const rr=add(el('div','card'));rr.style.cssText='display:flex;gap:14px;padding:12px;align-items:center';
  [['r1','6px'],['r2','10px'],['r3','14px']].forEach(([n,v])=>{const b=el('div');b.style.cssText='width:56px;height:36px;border:1px solid var(--faint);border-radius:'+v;const w=el('div','dim',n+' · '+v);w.style.cssText='display:flex;flex-direction:column;gap:4px;align-items:flex-start';w.prepend(b);rr.append(w)});
  sect('Buttons');
  const bt=add(el('div','card'));bt.style.cssText='display:flex;gap:8px;padding:12px;flex-wrap:wrap';
  const b1=el('span','btn pri');b1.append('Approve once ',el('span','kbd','y'));const b2=el('span','btn');b2.append('Reject ',el('span','kbd','n'));bt.append(b1,b2,el('span','btn ghost','Ghost'),el('span','btn','Neutral'));
  sect('Badges');
  const bb=add(el('div','card'));bb.style.cssText='display:flex;gap:8px;padding:12px;flex-wrap:wrap';['ok','info','warn','err'].forEach(k=>bb.append(badge(k,k)));
  sect('Task states');
  const st=add(el('div','card'));st.style.cssText='display:flex;gap:18px;padding:12px;flex-wrap:wrap';Object.keys(GL).forEach(k=>st.append(el('span',SC[k],GL[k]+' '+k)));
  sect('Callouts');
  ['info','ok','warn','err'].forEach(k=>{const c=add(el('div','callout '+k));c.style.margin='0';c.append(k==='err'?'Runs arbitrary code.':k==='warn'?'This changes files on disk.':k==='ok'?'Finished cleanly.':'Neutral guidance.')});
  sect('Diff');
  const df=add(el('div','card'));df.style.overflow='hidden';
  diffLines([['hunk','@@ src/queue.ts @@'],['ctx','  catch (err) {'],['del','    if (attempt >= maxRetries) throw err'],['add','    if (attempt > maxRetries) throw err']],42).forEach(d=>df.append(d));
  sect('Tool rows');
  const tr=toolRow('grep','"maxRetries"');toolDone(tr,['3 matches','src/queue.ts:14','src/queue.ts:43']);
  const tf=toolRow('run_tests','npm test');toolDone(tf,['1 failed'],true);
}

/* ---------- commands ---------- */
const CM=[['/fix','Fix failing tests'],['/explore','Explore this repo'],['/commit','Commit changes'],['/install','Add an MCP server'],['/queue','Show the task queue'],['/artifacts','List changed files'],['/design','Design system'],['/models','Model picker'],['/config','Agent config'],['/skills','Installed skills'],['/sessions','Sessions'],['/theme','Toggle theme'],['/clear','New thread'],['/help','Show help']];
function msg(t){add(el('div','user',t))}
function cmd(s){
  s=s.trim();if(!s)return;hist.push(s);hi=hist.length;
  const em=$('#empty');if(em)em.remove();
  const l=s.toLowerCase();
  if(l==='/clear')return newThread();
  msg(s);
  if(l==='/help'||l==='help'){const c=add(el('div','card'));c.style.cssText='padding:8px 12px;display:grid;grid-template-columns:auto 1fr;gap:2px 20px';CM.forEach(([a,b])=>{c.append(el('span','mono',a),el('span','dim',b))});return}
  if(l==='/theme')return $('#th').click();
  if(l==='/design')return design();
  if(l==='/queue'||l==='/experiments'){panel('rp',true);tab('queue');return add(el('div','ai dim','Showing the task queue in the review panel.'))}
  if(l==='/artifacts'){const k=Object.keys(FILES);if(!k.length)return add(el('div','ai dim','No changes yet. Try /fix.'));panel('rp',true);tab('files');return add(el('div','ai dim',k.length+' changed file'+(k.length===1?'':'s')+' in the review panel.'))}
  if(l==='/models'){const c=add(el('div','card'));c.style.padding='8px 12px';[['qwen3-coder','free · local · default',1],['gpt-4o-mini','',0],['claude-haiku','',0]].forEach(([n,d,on])=>{const r=el('div');r.append(el('span',on?'c-ok':'faint',on?'● ':'○ '),el('span','mono',n),el('span','dim','  '+d));c.append(r)});return}
  if(l==='/config'){const c=add(el('div','card'));c.style.cssText='padding:8px 12px;display:grid;grid-template-columns:auto 1fr;gap:2px 20px';[['model','qwen3-coder'],['base','http://localhost:11434/v1'],['skills','/skills'],['mcp','/install']].forEach(([a,b])=>c.append(el('span','dim',a),el('span','mono',b)));return}
  if(l==='/skills'){const c=add(el('div','card'));c.style.padding='4px';['code-review','test-writer','repo-explorer'].forEach(n=>{const r=el('div','row');r.append(el('span','ico','◈'),el('span','tt mono',n),badge('ok','installed'));c.append(r)});return}
  if(l==='/sessions')return add(el('div','ai dim','1 active · lq-core (act) · 2 archived'));
  const k={'/fix':'fix','/explore':'explore','/commit':'commit','/install':'install','/mcp':'install'}[l]||(/fix|failing test/.test(l)?'fix':/explore|architecture/.test(l)?'explore':/commit/.test(l)?'commit':/mcp/.test(l)?'install':null);
  if(k)return play(k);
  /* anything else becomes a queued task, linked after the previous one */
  const prev=QUE[QUE.length-1],q=addQ(s.length>48?s.slice(0,47)+'…':s,'queued');
  add(el('div','ai')).append('Queued as ',Object.assign(el('code','','#'+q.id)),prev?' — it starts after #'+prev.id+' finishes.':'.');
  toast('Added to queue');
}

/* ---------- composer ---------- */
function grow(){Q.style.height='auto';Q.style.height=Math.min(Q.scrollHeight,200)+'px';setSt()}
Q.addEventListener('input',grow);

async function runHarness(v){
  if(!window.harness){cmd(v);return}
  const empty=$('#empty');if(empty)empty.remove();
  msg(v);hist.push(v);hi=hist.length;
  busy=true;abort=false;thread=addThread('LinkedQueue','run');$('#ttl').textContent='LinkedQueue run';
  const q=addQ(v.length>48?v.slice(0,47)+'…':v,'running');
  const w=el('div','working');w.append(el('span','spin','◐'),Object.assign(el('span','shimmer t'),{textContent:'Working…'}));
  C.append(w);setSt();spin(true);let ok=true;
  try{
    await window.harness.run({
      prompt:v,
      mode:(document.querySelector('#mode button.on')?.dataset.m||'Act').toLowerCase(),
      model:currentModel,
      emit:(e)=>{
        if(!e)return;
        if(e.type==='text'&&e.text){const d=add(el('div','ai'));d.textContent=e.text}
        else if(e.type==='tool'){
          const r=toolRow(e.name,e.args?JSON.stringify(e.args).slice(0,80):'');
          tools++;setSt();
          toolDone(r,[JSON.stringify(e.result).slice(0,1000)],!!(e.result&&e.result.error));
        } else if(e.type==='plan'){
          P.todos=e.todos||[];P.at=0;P.el=null;drawPlan();
        } else if(e.type==='error'){
          add(el('div','ai dim','Error: '+e.message));
        }
      },
      approve:async({name})=>window.confirm('Approve tool: '+name+'?')
    });
  }catch(e){ok=false;add(el('div','ai dim','Error: '+(e&&e.message?e.message:e)))}
  finally{busy=false;pend=null;spin(false);w.remove();endThread(ok);q.s=ok?'done':'failed';drawQueue();setSt()}
}

function send(){if(busy){abort=true;pend&&pend.decide(false);return}const v=Q.value;if(!v.trim())return;Q.value='';grow();
  if(v.startsWith('!')){$('#empty')?.remove();msg(v);return add(el('div','ai dim mono','mock shell: '+v.slice(1)))}
  if(v.startsWith('/')){cmd(v);return}
  runHarness(v)}
$('#go').onclick=send;
Q.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!busy)send()}
  if(e.key==='ArrowUp'&&!Q.value&&hi>0){e.preventDefault();Q.value=hist[--hi];grow()}
  if(e.key==='ArrowDown'&&hi<hist.length&&Q.value===hist[hi]){e.preventDefault();hi++;Q.value=hist[hi]||'';grow()}
});
$$('#mode button').forEach(b=>b.onclick=()=>{$$('#mode button').forEach(x=>x.classList.toggle('on',x===b));toast('Mode: '+b.dataset.m)});
const MODELS=['qwen3-coder','gpt-4o-mini','claude-haiku'];let mi=0;
$('#mdl').onclick=()=>{mi=(mi+1)%MODELS.length;currentModel=MODELS[mi];$('#mdl').firstChild.textContent=currentModel+' ';$('#smd').textContent=currentModel;try{localStorage.setItem('lq-model',currentModel)}catch(e){};toast('Model: '+currentModel)};
$('#att').onclick=()=>toast('Attachments: not in this mockup');

/* ---------- command palette ---------- */
let palIsOpen=false,palQuery='',palIdx=0;
const palItems=()=>{const q=palQuery.toLowerCase().replace(/^\//,'');return CM.filter(c=>!q||c[0].toLowerCase().includes(q)||c[1].toLowerCase().includes(q))};
function palRender(){const o=$('#pal-o');o.replaceChildren();palItems().forEach((c,i)=>{const r=el('div','pal-i'+(i===palIdx?' on':''));r.append(el('span','c',c[0]),el('span','dim',c[1]));r.onclick=()=>palExec(c);o.append(r)})}
function palOpen_(){palIsOpen=true;palQuery='';palIdx=0;$('#pal').style.display='flex';const l=$('#pal-l');l.value='';palRender();l.focus()}
function palClose_(){palIsOpen=false;$('#pal').style.display='none';Q.focus()}
function palExec(c){palClose_();if(!busy)cmd(c[0])}
$('#pal-l').addEventListener('input',e=>{palQuery=e.target.value;palIdx=0;palRender()});
$('#pal').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();palClose_()}
  if(e.key==='ArrowDown'){e.preventDefault();palIdx=Math.min(palIdx+1,palItems().length-1);palRender()}
  if(e.key==='ArrowUp'){e.preventDefault();palIdx=Math.max(palIdx-1,0);palRender()}
  if(e.key==='Enter'){e.preventDefault();const n=palItems();if(n[palIdx])palExec(n[palIdx])}
});
$('#pal').addEventListener('mousedown',e=>{if(e.target.id==='pal')palClose_()});

addEventListener('keydown',e=>{
  const m=e.metaKey||e.ctrlKey;
  if(e.key==='Escape'&&busy&&!palIsOpen){abort=true;pend&&pend.decide(false)}
  if(pend&&!palIsOpen&&!m&&!Q.value&&(e.key==='y'||e.key==='n')){e.preventDefault();pend.decide(e.key==='y')}
  if(m&&e.key==='k'){e.preventDefault();Q.focus()}
  if(m&&e.key==='p'){e.preventDefault();if(!busy&&!palIsOpen)palOpen_()}
  if(m&&e.key==='n'){e.preventDefault();if(!busy)newThread()}
  if(m&&e.key==='b'){e.preventDefault();panel('sb')}
});

drawQueue();showEmpty();setSt();
if(matchMedia('(pointer: fine)').matches)Q.focus();
