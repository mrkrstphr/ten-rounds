(function(){
  'use strict';
  const G=TenRoundsGame,results=[];let uid=200;
  const number=(value,color='red')=>({id:uid++,kind:'number',color,value});
  const wild=()=>({id:uid++,kind:'wild',color:'wild',value:0});
  const skip=()=>({id:uid++,kind:'skip',color:'skip',value:0});
  const nums=(...values)=>values.map(v=>number(v));
  const assert=(test,message='Assertion failed')=>{if(!test)throw Error(message);};
  const throws=(fn,pattern)=>{let error;try{fn();}catch(e){error=e;}assert(error&&(!pattern||pattern.test(error.message)),`Expected error ${pattern}, got ${error?.message}`);};
  function test(name,fn){try{fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}}
  function stateFor(hand,phase=0){const s=G.newGame();s.players[0].hand=hand;s.players[0].phase=phase;s.players[0].melds=[];s.turn=0;s.step='play';s.status='playing';return s;}
  function conserve(s){
    const cards=[...s.deck,...s.discard,...s.players.flatMap(p=>[...p.hand,...p.melds.flatMap(m=>m.cards)])];
    assert(cards.length===108,`Expected 108 cards, got ${cards.length}`);
    assert(new Set(cards.map(c=>c.id)).size===108,'Duplicate or missing card ID');
  }
  function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  test('Deck: 96 numbered, 8 Wild, 4 Skip; every ID unique',()=>{
    const d=G.deck();assert(d.length===108);assert(d.filter(c=>c.kind==='number').length===96);assert(d.filter(c=>c.kind==='wild').length===8);assert(d.filter(c=>c.kind==='skip').length===4);
    for(const color of G.COLORS)for(let v=1;v<=12;v++)assert(d.filter(c=>c.color===color&&c.value===v).length===2);assert(new Set(d.map(c=>c.id)).size===108);
  });
  test('Goal definitions and independent complete fixtures, all ten goals',()=>{
    const labels=['2 sets of 3','1 set of 3 + 1 run of 4','1 set of 4 + 1 run of 4','1 run of 7','1 run of 8','1 run of 9','2 sets of 4','7 cards of one color','1 set of 5 + 1 set of 2','1 set of 5 + 1 set of 3'];
    const fixtures=[[2,2,2,9,9,9],[7,7,7,2,3,4,5],[9,9,9,9,3,4,5,6],[1,2,3,4,5,6,7],[3,4,5,6,7,8,9,10],[4,5,6,7,8,9,10,11,12],[2,2,2,2,8,8,8,8],[1,3,5,7,9,11,12],[4,4,4,4,4,10,10],[6,6,6,6,6,2,2,2]];
    fixtures.forEach((f,i)=>{assert(G.PHASES[i].label===labels[i]);const hand=nums(...f);assert(!!G.findPhase(hand,i),`Goal ${i+1} should be possible`);assert(!G.findPhase(hand.slice(1),i),`Goal ${i+1} needs all required cards`);});
  });
  test('Example: 5,5,5 and 7,7,7 form Goal 1',()=>assert(!!G.findPhase(nums(5,5,5,7,7,7),0)));
  test('Example: 3,4,Wild,6 completes the run in Goal 2',()=>{
    const hand=[...nums(9,9,9,3,4),wild(),number(6)],m=G.findPhase(hand,1);assert(!!m);const run=m.find(x=>x.type==='run');assert(run.cards.map(c=>c.as).join(',')==='3,4,5,6');
  });
  test('Independent negative fixtures reject mismatched sets and duplicated / wrapping runs',()=>{
    assert(!G.findPhase(nums(2,2,3,8,8,9),0));assert(!G.findPhase(nums(1,2,3,4,5,6,6),3));assert(!G.findPhase(nums(9,10,11,12,1,2,3),3));
    const colors=nums(1,2,3,4,5,6,7);colors[6].color='blue';assert(!G.findPhase(colors,7));
  });
  test('Two sets may have the same number; individual cards cannot be reused',()=>{
    assert(!!G.findPhase(nums(4,4,4,4,4,4),0));assert(!G.findPhase(nums(4,4,4,8,9,10),0));
    const s=stateFor(nums(5,5,5,7,7,7));throws(()=>G.lay(s,0,Array(6).fill(s.players[0].hand[0].id)),/twice/);
  });
  test('Wilds: many allowed, at least one natural in the complete goal; skips never count',()=>{
    assert(!!G.findPhase([number(7),wild(),wild(),wild(),wild(),wild()],0));assert(!G.findPhase(Array.from({length:6},wild),0));assert(!G.findPhase([...nums(5,5,5,7,7),skip()],0));
  });
  test('Wild run boundary assignments stay within 1–12',()=>{
    const m=G.findPhase([wild(),...nums(6,7,8,9,10,11,12)],4)[0];
    assert(m.start===5);assert(m.cards[0].as===5);assert(m.cards.at(-1).as===12);
  });
  test('Setup deals ten cards each and conserves 108 cards',()=>{
    for(let i=1;i<=12;i++){const s=G.newGame(rng(i));assert(s.players.every(p=>p.hand.length===10));assert(s.deck.length===87);assert(s.discard.length===1);conserve(s);}
  });
  test('Opening Skip skips the first player; opening Wild may be picked up',()=>{
    let s;for(let seed=1;seed<1000;seed++){s=G.newGame(rng(seed));if(s.discard[0].kind==='skip')break;}
    assert(s.discard[0].kind==='skip');assert(s.turn===1);
    const w=G.newGame();const card=G.deck().find(c=>c.kind==='wild');w.discard=[card];w.turn=0;assert(G.draw(w,0,'discard').kind==='wild');
  });
  test('Turn guards: no wrong-player draw, double draw, premature discard, or actions after round',()=>{
    const s=G.newGame(rng(4));s.turn=0;throws(()=>G.draw(s,1),/turn/);throws(()=>G.discard(s,0,s.players[0].hand[0].id),/Draw/);
    G.draw(s,0);throws(()=>G.draw(s,0),/already/);s.status='round';throws(()=>G.discard(s,0,s.players[0].hand[0].id),/ended/);
  });
  test('Drawing a Skip from discards is prohibited without mutation',()=>{
    const s=G.newGame();s.turn=0;s.discard=[skip()];const size=s.players[0].hand.length;throws(()=>G.draw(s,0,'discard'),/Skip/);assert(s.step==='draw'&&s.players[0].hand.length===size);
  });
  test('All-at-once laying rejects too few or invalid cards without losing them',()=>{
    const s=stateFor(nums(2,2,2,3,3,4));const ids=s.players[0].hand.map(c=>c.id);throws(()=>G.lay(s,0,ids.slice(0,5)),/exactly 6/);throws(()=>G.lay(s,0,ids),/don’t make/);assert(s.players[0].hand.length===6&&s.players[0].melds.length===0);
  });
  test('Laying a goal, same-turn hit, and going out by hitting',()=>{
    const cards=nums(5,5,5,7,7,7,5),s=stateFor(cards);G.lay(s,0,cards.slice(0,6).map(c=>c.id));assert(s.players[0].hand.length===1);throws(()=>G.lay(s,0,[]),/already/);
    G.hit(s,0,cards[6].id,0,0);assert(s.status==='round'&&s.result.winner===0&&s.players[0].phase===1);
  });
  test('You must lay your own goal before hitting another player’s',()=>{
    const s=stateFor(nums(5,6));s.players[1].melds=G.findPhase(nums(5,5,5,7,7,7),0);throws(()=>G.hit(s,0,s.players[0].hand[0].id,1,0),/own goal/);
  });
  test('Hitting example: extend 3,4,5,6 with 2,7,8 without moving existing wilds',()=>{
    const run=G.findPhase([...nums(9,9,9,3,4),wild(),number(6)],1)[1];
    const s=stateFor(nums(2,7,8,12));s.players[0].melds=[run];
    for(const value of [2,7,8]){const card=s.players[0].hand.find(c=>c.value===value);G.hit(s,0,card.id,0,0);}
    assert(run.start===2&&run.cards.map(c=>c.as).join(',')==='2,3,4,5,6,7,8');assert(run.cards.find(c=>c.kind==='wild').as===5);
    throws(()=>G.hit(s,0,s.players[0].hand[0].id,0,0),/doesn’t fit/);
  });
  test('Wild hitting at either end is explicit and fixed; full 1–12 runs reject all hits',()=>{
    const run=G.findPhase([...nums(8,8,8),...nums(3,4,5,6)],1)[1];const w=wild(),s=stateFor([w,number(11)]);s.players[0].melds=[run];
    assert(G.hitOptions(run,w).length===2);G.hit(s,0,w.id,0,0,'start');assert(run.start===2&&run.cards[0].as===2);
    const full={type:'run',start:1,cards:nums(1,2,3,4,5,6,7,8,9,10,11,12)};assert(!G.hitOptions(full,wild()).length);
  });
  test('Color groups accept matching numbered cards and wilds, not another color or Skip',()=>{
    const m=G.findPhase(nums(1,2,3,4,5,6,7),7)[0];assert(G.hitOptions(m,number(12)).length);assert(G.hitOptions(m,wild()).length);assert(!G.hitOptions(m,number(3,'blue')).length);assert(!G.hitOptions(m,skip()).length);
  });
  test('A Skip resolves immediately; consecutive Skips allowed',()=>{
    const a=skip(),b=skip(),s=stateFor([a,b,number(4)]);G.discard(s,0,a.id);assert(s.turn===0&&s.step==='draw');G.draw(s,0);G.discard(s,0,b.id);assert(s.turn===0&&s.step==='draw');
  });
  test('Point values: 1–9 = 5, 10–12 = 10, Skip = 15, Wild = 25',()=>{
    assert(nums(1,9,10,12).map(G.points).join(',')==='5,5,10,10');assert(G.points(skip())===15);assert(G.points(wild())===25);
  });
  test('Round scoring, both laid players advance, alternate first player',()=>{
    const s=stateFor([number(1)]);s.players[0].melds=G.findPhase(nums(5,5,5,7,7,7),0);s.players[1].melds=G.findPhase(nums(2,2,2,3,3,3),0);s.players[1].hand=[...nums(9,10),skip(),wild()];
    G.discard(s,0,s.players[0].hand[0].id);assert(s.status==='round');assert(s.players[1].score===55);assert(s.players.every(p=>p.phase===1));G.startRound(s,()=>0);assert(s.turn===1&&s.round===2);
  });
  test('Unlaid players repeat their goal even if they had the cards for it',()=>{
    const s=stateFor([number(1)]);s.players[0].melds=G.findPhase(nums(5,5,5,7,7,7),0);s.players[1].hand=nums(2,2,2,3,3,3);G.discard(s,0,s.players[0].hand[0].id);assert(s.players[1].phase===0&&s.players[0].phase===1);
  });
  test('Goal 10 wins only at round end; lower total score breaks simultaneous completion',()=>{
    const s=stateFor([number(1)],9);s.players[0].melds=G.findPhase(nums(5,5,5,5,5,7,7,7),9);s.players[1].phase=9;s.players[1].melds=G.findPhase(nums(2,2,2,2,2,3,3,3),9);s.players[0].score=100;s.players[1].score=0;s.players[1].hand=[number(8)];
    G.discard(s,0,s.players[0].hand[0].id);assert(s.status==='game'&&s.result.gameWinner===1);
  });
  test('Equal Goal 10 scores trigger a playoff; first to go out wins the replay',()=>{
    const s=stateFor([number(1)],9);s.players.forEach(p=>{p.phase=9;p.melds=G.findPhase(nums(5,5,5,5,5,7,7,7),9);p.score=0;});s.players[1].hand=[];G.discard(s,0,s.players[0].hand[0].id);
    assert(s.status==='round'&&s.tieBreak&&s.players.every(p=>p.phase===9));G.startRound(s);s.turn=0;s.step='play';s.players[0].hand=[number(2)];s.players[0].melds=G.findPhase(nums(5,5,5,5,5,7,7,7),9);s.players[0].score=500;
    G.discard(s,0,s.players[0].hand[0].id);assert(s.status==='game'&&s.result.gameWinner===0);
  });
  test('Empty stock recycles discards, preserves top discard, and conserves every card',()=>{
    const s=G.newGame(rng(7));s.turn=0;s.discard.push(...s.deck);s.deck=[];const top=s.discard.at(-1).id;G.draw(s,0);assert(s.discard.length===1&&s.discard[0].id===top);assert(s.deck.length===86);conserve(s);
  });
  test('Progress counts distinct run numbers, not duplicate numbers, and never reuses a Wild',()=>{
    assert(G.progress(nums(1,2,3,3,3,3,3),3)===3);assert(G.progress([...nums(4,4,5,5),wild()],0)===5);assert(G.progress([...nums(4,4,5,5),wild(),wild()],0)===6);
    assert(G.progress(Array.from({length:6},wild),0)===5);
  });
  test('Computer decisions are invariant under changes to the hidden opponent hand',()=>{
    const a=G.newGame(rng(14));a.turn=1;const b=JSON.parse(JSON.stringify(a));b.players[0].hand=nums(12,12,12,12,12,12,12,12,12,12);
    assert(G.chooseDiscard(a,1).id===G.chooseDiscard(b,1).id);
  });
  test('Computer resumes a saved mid-turn without drawing a second time',()=>{
    const s=G.newGame(rng(20));s.turn=1;G.draw(s,1);const before=s.deck.length;G.computerTurn(s,1);assert(s.deck.length===before);conserve(s);
  });
  test('Four complete games through the real computer entry point; all ten goals, bounded turns, card conservation',()=>{
    const summaries=[];
    for(const seed of [31,79,107,333]){
      const s=G.newGame(rng(seed));let turns=0,rounds=1;
      while(s.status!=='game'&&turns<3000){
        if(s.status==='round'){G.startRound(s,rng(seed+rounds++));conserve(s);}
        G.computerTurn(s,s.turn);turns++;conserve(s);
      }
      assert(s.status==='game',`Seed ${seed} stalled at round ${s.round}, phases ${s.players.map(p=>p.phase)}, after ${turns} turns`);
      assert(s.players[s.result.gameWinner].phase===10);summaries.push({seed,turns,rounds:s.round,scores:s.players.map(p=>p.score)});
    }
    globalThis.matchSummaries=summaries;
  });
  globalThis.testResults=results;globalThis.testsDone=true;
  if(typeof document==='undefined')return;
  const failed=results.filter(r=>!r.pass);
  document.getElementById('output').textContent=results.map(r=>`${r.pass?'PASS':'FAIL'}  ${r.name}${r.error?'\n'+r.error:''}`).join('\n')+`\n\n${results.length-failed.length}/${results.length} passed\n`+JSON.stringify(globalThis.matchSummaries,null,2);
  document.title=`${failed.length?'FAIL':'PASS'} · ${results.length} TenRounds tests`;
})();
