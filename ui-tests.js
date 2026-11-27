(async function(){
  'use strict';
  const G=TenRoundsGame,KEY='tenrounds.table.v1',original=localStorage.getItem(KEY),frame=document.getElementById('game'),results=[];
  let doc,win;
  const contrastReports=[];
  const assert=(test,message='Assertion failed')=>{if(!test)throw Error(message);};
  const read=()=>JSON.parse(localStorage.getItem(KEY)).state;
  const $=selector=>doc.querySelector(selector);
  // A separate task lets React commit without chaining timers that hidden tabs throttle.
  const nextTask=()=>new Promise(resolve=>{
    const channel=new MessageChannel();
    channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
    channel.port2.postMessage(null);
  });
  async function wait(ms){await nextTask();if(ms>0)await new Promise(resolve=>setTimeout(resolve,ms));}
  async function click(target){const button=typeof target==='string'?$(target):target;assert(button,'Click target missing');window.uiTestStep='click '+(button.id||button.className);button.click();await wait(0);window.uiTestStep='click settled';}
  async function until(fn,timeout=6000){const end=performance.now()+timeout;while(performance.now()<end){if(fn())return;await wait(30);}throw Error('Timed out waiting for expected UI state');}
  async function test(name,fn){window.uiCurrentTest=name;const started=performance.now();try{await fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}results.at(-1).milliseconds=Math.round(performance.now()-started);document.getElementById('output').textContent=results.map(r=>`${r.pass?'PASS':'FAIL'}  ${r.name} (${r.milliseconds}ms)${r.error?'\n'+r.error:''}`).join('\n');}
  function fixture({hand=[5,5,5,7,7,7,5,12,'skip','wild'],other=[1,2,3,4,6,8,9,10,11,12],phase=0,otherPhase=0,meld=null,otherMeld=null,step='draw'}={}){
    const remaining=G.deck();
    const take=spec=>{
      const i=remaining.findIndex(c=>typeof spec==='number'?c.kind==='number'&&c.value===spec:typeof spec==='object'?c.value===spec.value&&c.color===spec.color:c.kind===spec);
      if(i<0)throw Error(`Fixture exhausted ${spec}`);return remaining.splice(i,1)[0];
    };
    const state=G.newGame();state.turn=0;state.step=step;
    state.players[0].phase=phase;state.players[1].phase=otherPhase;
    state.players[0].melds=meld?G.findPhase(meld.map(take),phase):[];
    state.players[1].melds=otherMeld?G.findPhase(otherMeld.map(take),otherPhase):[];
    state.players[0].hand=hand.map(take);state.players[1].hand=other.map(take);
    state.discard=[take(4)];const next=take(11);state.deck=remaining.concat(next);return state;
  }
  async function load(state,width=1440){
    window.uiTestStep='load: navigating';
    if(state)localStorage.setItem(KEY,JSON.stringify({state,sort:'number',sound:false}));
    frame.style.width=width+'px';
    const target=new URL('./?ui-check='+Math.random(),location.href).href;
    frame.src=target;
    await until(()=>frame.contentWindow.location.href===target&&frame.contentDocument?.querySelector('#human-hand .card'),10000);
    win=frame.contentWindow;doc=frame.contentDocument;window.uiTestStep='load: waiting for fonts';await win.document.fonts.ready;window.uiTestStep='load: ready';
    assert($('#human-hand .card'),'Game initialized with a hand');assertBranding();
    return read();
  }
  async function selectCard(predicate){const card=read().players[0].hand.find(predicate);assert(card,'Fixture card missing');const button=$(`#human-hand [data-id="${card.id}"]`);assert(button&&!button.disabled,'Card must be enabled');await click(button);return card;}
  const handNodes=()=>new Map([...doc.querySelectorAll('#human-hand .card')].map(button=>[button.dataset.id,button]));
  function retainedHand(before){
    for(const [id,button] of handNodes())if(before.has(id))assert(button===before.get(id),`Card ${id} was rebuilt instead of updated`);
  }
  function finishDealing(){for(const button of handNodes().values())for(const animation of button.getAnimations())animation.finish();}
  const isDealing=animation=>(animation.id==='deal'||animation.animationName==='deal')&&animation.playState==='running';
  function assertBranding(){
    assert(doc.title==='TenRounds'&&$('.brand').textContent.trim()==='TenRounds','The game and document must use the chosen name');
    assert($('.brand').getAttribute('aria-label')==='TenRounds home','Accessible branding must use the chosen name');
    const labels=[...doc.querySelectorAll('[aria-label],[title],[alt]')].flatMap(element=>['aria-label','title','alt'].map(name=>element.getAttribute(name)||'')).join(' ');
    assert(!/\bphase\b/i.test(doc.body.textContent+' '+labels),'Retired terminology must not appear in text, dialogs, or accessible labels');
    assert(!doc.querySelector('#modal-content .rules-link'),'Help must not link to retired branded instructions');
  }
  function conserve(){
    const s=read(),all=[...s.deck,...s.discard,...s.players.flatMap(p=>[...p.hand,...p.melds.flatMap(m=>m.cards)])];
    assert(all.length===108&&new Set(all.map(c=>c.id)).size===108,'UI must conserve all 108 cards');
  }
  function checkContrast(){
    assertBranding();
    // Measure resting-state colors, not the intermediate opacity of a fade.
    if(!$('#contrast-resting-state')){
      const style=doc.createElement('style');style.id='contrast-resting-state';
      style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';doc.head.append(style);
    }
    finishDealing();
    const report=auditTextContrast(doc,$('#modal').open?$('#modal'):doc.body);
    contrastReports.push(report);
    assert(report.checked>=5,'Contrast audit must examine rendered text');
    assert(!report.unknown.length,`Unmeasured gradient: ${JSON.stringify(report.unknown)}`);
    assert(!report.failures.length,`Text contrast must be at least 4.5:1: ${JSON.stringify(report.failures)}`);
  }
  try{
    await test('Initial controls require drawing; a double draw is blocked',async()=>{
      await load(fixture());assert($('#discard-button').disabled&&$('#lay-button').disabled&&$('#hint-button').disabled);
      assert([...doc.querySelectorAll('#human-hand .card')].every(e=>e.disabled));
      await click('#draw-pile');assert(read().players[0].hand.length===11);const before=read().deck.length;await click('#draw-pile');assert(read().deck.length===before);assert($('#draw-pile').disabled);conserve();
    });
    await test('Number/color sorting preserves selection; discard step follows selection',async()=>{
      await selectCard(c=>c.kind==='number');const selected=$('#human-hand [aria-pressed="true"]').dataset.id;await click('#sort-button');
      assert($('#sort-label').textContent==='color');assert($('#human-hand [aria-pressed="true"]').dataset.id===selected);assert(!$('#discard-button').disabled);assert($('#step-discard').classList.contains('active'));
    });
    await test('Reload resumes mid-turn; unavailable saves warn without breaking controls',async()=>{
      const before=read();await load();assert(read().step==='play');assert(read().deck.length===before.deck.length);assert(read().players[0].hand.length===11);assert($('#draw-pile').disabled);assert($('#sort-label').textContent==='color');conserve();
      const setItem=win.Storage.prototype.setItem;
      try{
        win.Storage.prototype.setItem=()=>{throw Error('Storage unavailable');};
        await click('#sort-button');
        assert($('#sort-label').textContent==='number','Controls must work when saving fails');
        await until(()=>$('#toast').classList.contains('visible')&&$('#toast').textContent.includes('without saves'));
        assert($('#toast').classList.contains('visible')&&$('#toast').textContent.includes('without saves'),'Save failures must still warn without a footer');
        $('#toast').textContent='Existing notice';await click('#sort-button');
        assert($('#toast').textContent==='Existing notice','Repeated save failures must not spam notices');
      }finally{win.Storage.prototype.setItem=setItem;}
      await click('#sort-button');await click('#sort-button');assert(JSON.parse(localStorage.getItem(KEY)).sort==='color','Saving must recover when storage becomes available');
    });
    await test('Hint selects a goal; Lay goal removes cards and renders both completed groups',async()=>{
      await click('#hint-button');assert(doc.querySelectorAll('#human-hand [aria-pressed="true"]').length===6);await click('#lay-button');
      assert(read().players[0].melds.length===2);assert(read().players[0].hand.length===5);assert(doc.querySelectorAll('#human-melds .meld-group').length===2);assert($('#lay-button').disabled);conserve();
    });
    await test('Hit hints highlight a group; real group click adds a card during the same turn',async()=>{
      await click('#hint-button');assert($('#human-melds .hit-ready'));await click('#human-melds .hit-ready');assert(read().players[0].hand.length===4);assert(read().players[0].melds.reduce((n,m)=>n+m.cards.length,0)===7);conserve();
    });
    await test('Discard passes to Arlo; help pauses the computer, closing it resumes the turn',async()=>{
      await selectCard(c=>c.kind==='number'&&c.value===12);await click('#discard-button');assert(read().turn===1);await click('#help-button');assert($('#modal').open);const before=JSON.stringify(read());await wait(1200);assert(JSON.stringify(read())===before,'Computer should pause while help is open');
      await click('#close-modal');await until(()=>read().turn===0||read().status!=='playing');assert(read().log.some(l=>l.includes('Arlo drew')));conserve();
    });
    await test('New game cancel keeps progress; confirm resets both players',async()=>{
      await load(fixture());await click('#draw-pile');const before=JSON.stringify(read());await click('#new-button');assert($('#modal').open);await click('#cancel-new');assert(JSON.stringify(read())===before);
      await click('#new-button');await click('#confirm-new');assert(read().round===1&&read().players.every(p=>p.phase===0&&p.score===0&&p.hand.length===10));conserve();
    });
    await test('Wild hitting prompts for either end, then locks the chosen value',async()=>{
      await load(fixture({phase:1,hand:['wild',10,'skip'],meld:[9,9,9,3,4,5,6],step:'play'}));
      await selectCard(c=>c.kind==='wild');const groups=[...doc.querySelectorAll('#human-melds .hit-ready')],run=groups.find(e=>e.textContent.includes('Run'));assert(run);await click(run);assert($('#wild-start')&&$('#wild-end'));await click('#wild-start');
      const m=read().players[0].melds.find(m=>m.type==='run');assert(m.start===2&&m.cards[0].kind==='wild'&&m.cards[0].as===2);assert(read().players[0].hand.length===2);conserve();
    });
    await test('Going out shows round scoring; next-round button resets hands and advances only laid players',async()=>{
      await load(fixture({hand:[2],other:[9,10,'skip','wild'],meld:[5,5,5,7,7,7],step:'play'}));
      await selectCard(c=>c.value===2);await click('#discard-button');assert(read().status==='round'&&$('#modal').open);assert(read().players[1].score===55);assert(read().players[0].phase===1&&read().players[1].phase===0);
      await click('#next-round');assert(read().round===2&&read().status==='playing');assert(read().players.every(p=>p.hand.length===10&&p.melds.length===0));conserve();
    });
    await test('Game-over screen honors lower total score, not just who went out',async()=>{
      const state=fixture({phase:9,otherPhase:9,hand:[2],other:['wild'],meld:[5,5,5,5,5,7,7,7],otherMeld:[2,2,2,2,2,3,3,3],step:'play'});state.players[0].score=100;
      await load(state);await selectCard(c=>c.value===2);await click('#discard-button');assert(read().status==='game'&&read().result.gameWinner===1);assert($('#modal-title').textContent.includes('Arlo'));conserve();
      await click('#next-round');assert(read().round===1&&read().players.every(p=>p.score===0&&p.phase===0));
    });
    await test('Corrupt JSON and impossible saved goals recover to a fresh playable game',async()=>{
      localStorage.setItem(KEY,'not-json');await load();assert(read().status==='playing'&&read().round===1);conserve();
      const state=fixture();state.players[0].phase=10;await load(state);assert(read().players[0].phase===0);conserve();
    });
    for(const width of [1440,1024,768,680,390,320]){
      await test(`Responsive layout at ${width}px: no page overflow, accessible cards and controls`,async()=>{
        await load(fixture(),width);const root=doc.documentElement;
        assert(win.innerWidth===width,`Expected viewport ${width}, got ${win.innerWidth}`);
        assert(root.scrollWidth<=width+1,`Page overflows: ${root.scrollWidth}px on ${width}px`);
        assert(!$('.edition')&&!$('.page-heading h1')&&!$('.page-heading .eyebrow'),'Decorative headings must be removed');
        assert(!$('footer')&&!$('.little-note')&&!$('#tip-text')&&!$('#save-status'),'Footer and encouragement note must be removed');
        assert($('.sidebar').children.length===2,'Sidebar must contain only progress and scores');
        if(width<=680)assert(win.getComputedStyle($('.journey-panel')).gridRowEnd==='auto','Removed note must not leave an empty sidebar grid row');
        assert(doc.title==='TenRounds','Browser title must use only the game name');
        assert($('.game-layout').getBoundingClientRect().top-$('.site-header').getBoundingClientRect().bottom<=50,'Intro row must not leave wasted vertical space');
        assert($('#round-label').textContent==='ROUND 01','Round indicator must remain visible and up to date');
        const cards=[...doc.querySelectorAll('#human-hand .card')];assert(cards.length===10&&cards.every(e=>e.getAttribute('aria-label')));
        const hand=$('#human-hand'),h=hand.getBoundingClientRect();assert(h.width>0&&h.width<=width);
        const actions=$('.hand-actions').getBoundingClientRect();assert(actions.right<=width+1,'Actions overflow');
        assert($('#discard-button').getBoundingClientRect().width>=60);
        if(width>680)assert(hand.scrollWidth<=hand.clientWidth+1,'Desktop hand should fit without scrolling');
        else assert(win.getComputedStyle(hand).overflowX==='auto','Mobile hand should allow horizontal scrolling when needed');
        await click('#draw-pile');await selectCard(c=>c.kind==='number');assert(!$('#discard-button').disabled);
        await click('#help-button');assert($('#modal').open);await click('#close-modal');conserve();
      });
    }
    await test('Selecting and deselecting retain every card, face, keyboard focus, and mobile scroll position',async()=>{
      await load(fixture({step:'play'}),390);finishDealing();
      const hand=$('#human-hand'),before=handNodes(),button=[...before.values()][4],face=button.firstElementChild;
      hand.scrollLeft=80;const scroll=hand.scrollLeft;button.focus({preventScroll:true});
      const mutations=[],observer=new win.MutationObserver(batch=>mutations.push(...batch));observer.observe(hand,{childList:true,subtree:true});
      try{
        for(let i=0;i<4;i++){
          await click(button);retainedHand(before);
          assert(button.getAttribute('aria-pressed')===String(i%2===0),'Selection must toggle on the same button');
          assert(button.firstElementChild===face,'Card face must not be rebuilt');
          assert(doc.activeElement===button,'Keyboard focus must remain on the card');
          assert(hand.scrollLeft===scroll,'Selecting must not move the hand');
          assert([...before.values()].every(card=>!card.getAnimations().some(isDealing)),'Selection must not replay dealing');
        }
        assert(![...mutations,...observer.takeRecords()].length,'Selection must not insert, remove, or move any hand content');
      }finally{observer.disconnect();}
    });
    await test('Drawing from either pile inserts only the new sorted card without replaying the hand',async()=>{
      for(const source of ['draw-pile','discard-pile']){
        await load(fixture(),390);finishDealing();
        const hand=$('#human-hand'),before=handNodes();hand.scrollLeft=70;const scroll=hand.scrollLeft;
        const mutations=[],observer=new win.MutationObserver(batch=>mutations.push(...batch));observer.observe(hand,{childList:true});
        try{
          await click('#'+source);retainedHand(before);
          const records=[...mutations,...observer.takeRecords()],added=records.flatMap(r=>[...r.addedNodes]),removed=records.flatMap(r=>[...r.removedNodes]);
          assert(added.length===1&&!removed.length,'Drawing must insert one card and leave the other ten attached');
          assert(hand.scrollLeft===scroll,'Drawing must preserve mobile scroll position');
          assert([...before.values()].every(card=>!card.disabled&&!card.getAnimations().some(isDealing)),'Existing cards must enable without re-dealing');
          const cards=read().players[0].hand,values=[...hand.children].map(button=>{const card=cards.find(c=>String(c.id)===button.dataset.id);return card.kind==='number'?card.value:card.kind;});
          assert(values.join(',')===(source==='draw-pile'?'5,5,5,5,7,7,7,11,12,wild,skip':'4,5,5,5,5,7,7,7,12,wild,skip'),'Drawn card must appear in its sorted position');
          const drawn=added[0],animations=drawn.getAnimations().filter(isDealing);
          assert(animations.length===(win.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1),'Only the new card should animate, unless reduced motion is requested');
          assert(animations.every(animation=>animation.effect.getTiming().delay===0),'Drawing must not wait for a whole-hand stagger');
          await click(drawn);await click(drawn);
          assert(drawn.getAttribute('aria-pressed')==='false','A just-drawn card can be toggled repeatedly');
          assert(drawn.getAnimations().filter(isDealing).every(animation=>animations.includes(animation)),'Toggling a new card must not restart its entrance');
          conserve();
        }finally{observer.disconnect();}
      }
    });
    await test('Sorting reorders existing cards without losing selection, focus, scroll, or restarting dealing',async()=>{
      await load(fixture({hand:[{value:12,color:'red'},{value:1,color:'yellow'},{value:8,color:'blue'},{value:3,color:'green'},5,5,7,7,'wild','skip'],step:'play'}),390);finishDealing();
      const hand=$('#human-hand'),before=handNodes(),order=[...before.keys()],button=[...before.values()][4];
      await click(button);button.focus({preventScroll:true});hand.scrollLeft=60;const scroll=hand.scrollLeft;
      await click('#sort-button');retainedHand(before);
      assert([...handNodes().keys()].join(',')!==order.join(','),'Sort must actually reorder the cards');
      assert(button.getAttribute('aria-pressed')==='true'&&doc.activeElement===button,'Sort must keep the selected and focused button');
      assert(hand.scrollLeft===scroll,'Sort must retain mobile scroll');
      assert([...before.values()].every(card=>!card.getAnimations().some(isDealing)),'Sort must not re-deal cards');
      await click('#sort-button');retainedHand(before);assert([...handNodes().keys()].join(',')===order.join(','),'Number order must be restored');
    });
    await test('Hints, laying, hitting, discarding, and the computer turn preserve surviving hand elements',async()=>{
      await load(fixture({step:'play'}));finishDealing();const before=handNodes();
      await click('#hint-button');retainedHand(before);assert(doc.querySelectorAll('#human-hand .selected').length===6);
      await click('#lay-button');retainedHand(before);assert(handNodes().size===4);
      await click('#hint-button');retainedHand(before);await click('#human-melds .hit-ready');retainedHand(before);assert(handNodes().size===3);
      await selectCard(c=>c.value===12);await click('#discard-button');retainedHand(before);
      assert([...handNodes().values()].every(button=>button.disabled),'Hand must disable during the computer turn');
      await until(()=>read().turn===0||read().status!=='playing');retainedHand(before);conserve();
    });
    await test('New games and rounds deal fresh elements even when canonical card IDs repeat',async()=>{
      for(const mode of ['game','round']){
        const state=G.newGame(()=>.5);state.turn=0;state.step='play';
        if(mode==='round'){state.deck.push(...state.players[1].hand.splice(1));state.turn=1;G.discard(state,1,state.players[1].hand[0].id);}
        await load(state);finishDealing();const before=handNodes();win.Math.random=()=>.5;
        if(mode==='game'){await click('#new-button');await click('#confirm-new');}else await click('#next-round');
        assert(handNodes().size===10&&[...handNodes().keys()].every(id=>before.has(id)),'Fixture must repeat the same ten card IDs');
        assert([...handNodes()].every(([id,button])=>button!==before.get(id)&&!before.get(id).isConnected),'A genuinely new deal must not reuse the previous hand');
        conserve();
      }
    });
    await test('Text contrast: all four card colors, Wild, Skip, metadata, inactive steps, and disabled controls',async()=>{
      const hand=[{value:1,color:'red'},{value:2,color:'blue'},{value:3,color:'green'},{value:4,color:'yellow'},5,5,7,7,'wild','skip'];
      await load(fixture({hand}));checkContrast();
      assert(win.matchMedia('(prefers-color-scheme: dark)').matches===window.matchMedia('(prefers-color-scheme: dark)').matches,'Game follows the browser color preference');
      const background=win.getComputedStyle(doc.body).backgroundColor;
      assert(background===(win.matchMedia('(prefers-color-scheme: dark)').matches?'rgb(19, 27, 23)':'rgb(246, 245, 240)'),'Theme applies to the actual page');
    });
    await test('Text contrast: completed/current/future goals, melds, selected card/checkmark, and Wild choice dialog',async()=>{
      await load(fixture({phase:1,hand:['wild',10,'skip'],meld:[9,9,9,3,4,5,6],step:'play'}));
      await selectCard(c=>c.kind==='wild');checkContrast();
      await click([...doc.querySelectorAll('#human-melds .hit-ready')].find(e=>e.textContent.includes('Run')));checkContrast();
    });
    await test('Text contrast: help, new-game confirmation, toast, and mobile layouts',async()=>{
      for(const width of [1440,390,320]){
        await load(fixture(),width);await click('#draw-pile');await click('#hint-button');checkContrast();
        await click('#help-button');checkContrast();await click('#close-modal');
        await click('#new-button');checkContrast();await click('#cancel-new');
      }
    });
    await test('Text contrast: round and game summary scores',async()=>{
      for(const phase of [0,9]){
        await load(fixture({phase,hand:[2],other:[9,10,'skip','wild'],meld:phase===0?[5,5,5,7,7,7]:[5,5,5,5,5,7,7,7],step:'play'}));
        await selectCard(c=>c.value===2);await click('#discard-button');checkContrast();
      }
    });
  }finally{
    frame.remove();if(original===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,original);
    window.uiTestResults=results;window.contrastReports=contrastReports;window.uiTestsDone=true;
    const failures=results.filter(r=>!r.pass);document.title=`${failures.length?'FAIL':'PASS'} · ${results.length} interface tests`;
    document.getElementById('output').textContent+='\n\n'+(results.length-failures.length)+'/'+results.length+' passed. Original saved game restored.';
  }
})();
