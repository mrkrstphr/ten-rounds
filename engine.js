(function (root) {
  'use strict';
  const COLORS = ['red', 'blue', 'green', 'yellow'];
  const PHASES = [
    {label:'2 sets of 3', groups:[['set',3],['set',3]]},
    {label:'1 set of 3 + 1 run of 4', groups:[['set',3],['run',4]]},
    {label:'1 set of 4 + 1 run of 4', groups:[['set',4],['run',4]]},
    {label:'1 run of 7', groups:[['run',7]]},
    {label:'1 run of 8', groups:[['run',8]]},
    {label:'1 run of 9', groups:[['run',9]]},
    {label:'2 sets of 4', groups:[['set',4],['set',4]]},
    {label:'7 cards of one color', groups:[['color',7]]},
    {label:'1 set of 5 + 1 set of 2', groups:[['set',5],['set',2]]},
    {label:'1 set of 5 + 1 set of 3', groups:[['set',5],['set',3]]}
  ];
  function deck() {
    let id=0;
    const cards=[];
    for (const color of COLORS) for(let value=1;value<=12;value++) for(let copy=0;copy<2;copy++) cards.push({id:id++,kind:'number',color,value});
    for(let i=0;i<8;i++) cards.push({id:id++,kind:'wild',color:'wild',value:0});
    for(let i=0;i<4;i++) cards.push({id:id++,kind:'skip',color:'skip',value:0});
    return cards;
  }
  function shuffle(cards, rng=Math.random) {
    const result=cards.slice();
    for(let i=result.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
  function points(card) {return card.kind==='wild'?25:card.kind==='skip'?15:card.value>=10?10:5;}
  function log(state,message) {state.log.unshift(message);state.log=state.log.slice(0,12);}
  function newGame(rng=Math.random) {
    const state={version:1,round:0,turn:0,step:'draw',status:'playing',players:[{name:'You',phase:0,score:0,hand:[],melds:[]},{name:'Arlo',phase:0,score:0,hand:[],melds:[]}],deck:[],discard:[],log:[],result:null,tieBreak:false};
    startRound(state,rng);return state;
  }
  function startRound(state,rng=Math.random) {
    if(state.status==='game') throw Error('Start a new game to play again.');
    state.round++;state.deck=shuffle(deck(),rng);state.discard=[];state.result=null;state.status='playing';state.turn=(state.round-1)%2;state.step='draw';
    for(const p of state.players){p.hand=[];p.melds=[];}
    for(let i=0;i<10;i++) for(const p of state.players) p.hand.push(state.deck.pop());
    state.discard.push(state.deck.pop());
    log(state,`Round ${state.round}. A fresh start.`);
    if(state.discard[0].kind==='skip'){log(state,`${state.players[state.turn].name} ${state.turn===0?'are':'is'} skipped by the opening card.`);state.turn=1-state.turn;}
    return state;
  }
  function assertTurn(state,index,step) {
    if(state.status!=='playing') throw Error('This round has ended.');
    if(state.turn!==index) throw Error('Wait for your turn.');
    if(step&&state.step!==step) throw Error(step==='draw'?'You already drew a card.':'Draw a card first.');
  }
  function draw(state,index,source='deck',rng=Math.random) {
    assertTurn(state,index,'draw');
    if(source!=='deck'&&source!=='discard') throw Error('Choose a draw pile.');
    if(source==='discard'&&(!state.discard.length||state.discard.at(-1).kind==='skip')) throw Error('Skip cards cannot be picked up.');
    if(source==='deck'&&!state.deck.length){
      const top=state.discard.pop();
      state.deck=shuffle(state.discard,rng);state.discard=top?[top]:[];
      if(!state.deck.length) throw Error('No cards left to draw. Pick up the discard.');
      log(state,'The discard pile was shuffled into a fresh deck.');
    }
    const card=state[source].pop();state.players[index].hand.push(card);state.step='play';
    log(state,`${state.players[index].name} drew ${source==='deck'?'from the deck':cardName(card)}.`);
    return card;
  }
  function cardName(card) {return card.kind==='number'?`${card.color} ${card.value}`:card.kind==='wild'?'a wild card':'a skip card';}
  function partialValid(cards,type,length) {
    if(cards.length>length||cards.some(c=>c.kind==='skip')) return false;
    const nums=cards.filter(c=>c.kind==='number');
    if(!nums.length) return true;
    if(type==='set') return nums.every(c=>c.value===nums[0].value);
    if(type==='color') return nums.every(c=>c.color===nums[0].color);
    const values=nums.map(c=>c.value);
    return new Set(values).size===values.length&&Math.max(...values)-Math.min(...values)<length;
  }
  function makeMeld(cards,type) {
    const natural=cards.filter(c=>c.kind==='number');
    const meld={type,cards:[],value:natural[0]?.value||1,color:natural[0]?.color||'green'};
    if(type==='run') {
      const values=natural.map(c=>c.value);
      meld.start=Math.max(1,values.length?Math.max(...values)-cards.length+1:1);
      const wilds=cards.filter(c=>c.kind==='wild').slice();
      for(let value=meld.start;value<meld.start+cards.length;value++) meld.cards.push({...natural.find(c=>c.value===value)||wilds.shift(),as:value});
    }else meld.cards=cards.map(c=>({...c,as:type==='set'?meld.value:meld.color}));
    return meld;
  }
  function candidates(hand,type,length) {
    const result=[];
    function choose(start,chosen,mask) {
      if(chosen.length===length) {if(partialValid(chosen,type,length))result.push({mask,meld:makeMeld(chosen,type),wilds:chosen.filter(c=>c.kind==='wild').length,points:chosen.reduce((n,c)=>n+points(c),0)});return;}
      for(let i=start;i<=hand.length-(length-chosen.length);i++){
        if(hand[i].kind==='skip')continue;
        const next=chosen.concat(hand[i]);
        if(partialValid(next,type,length))choose(i+1,next,mask|(1<<i));
      }
    }
    choose(0,[],0);return result;
  }
  function findPhase(hand,phase) {
    if(!PHASES[phase])return null;
    const groups=PHASES[phase].groups.map(([type,n])=>candidates(hand,type,n));
    let best=null,bestScore=-Infinity;
    function visit(index,mask,melds,score){
      if(index===groups.length){
        if(!melds.some(m=>m.cards.some(c=>c.kind==='number')))return;
        if(score>bestScore){bestScore=score;best=melds;}
        return;
      }
      for(const c of groups[index]) if(!(mask&c.mask))visit(index+1,mask|c.mask,melds.concat(c.meld),score-c.wilds*100+c.points);
    }
    visit(0,0,[],0);return best;
  }
  function progress(hand,phase) {
    const defs=PHASES[phase].groups,n=hand.length,limit=1<<n;
    if(!hand.some(c=>c.kind==='number'))return Math.min(hand.filter(c=>c.kind==='wild').length,defs.reduce((sum,g)=>sum+g[1],0)-1);
    const counts=new Uint8Array(limit);
    for(let mask=1;mask<limit;mask++)counts[mask]=counts[mask>>1]+(mask&1);
    const scores=defs.map(([type,len])=>{
      const result=new Uint8Array(limit);
      for(let mask=1;mask<limit;mask++){
        if(counts[mask]>len)continue;
        const cards=[];for(let i=0;i<n;i++)if(mask&(1<<i))cards.push(hand[i]);
        if(partialValid(cards,type,len))result[mask]=counts[mask];
      }
      return result;
    });
    if(defs.length===1)return Math.max(...scores[0]);
    const second=scores[1];
    for(let bit=0;bit<n;bit++)for(let mask=0;mask<limit;mask++)if(mask&(1<<bit))second[mask]=Math.max(second[mask],second[mask^(1<<bit)]);
    let best=second[limit-1];
    for(let mask=1;mask<limit;mask++)if(scores[0][mask])best=Math.max(best,scores[0][mask]+second[(limit-1)^mask]);
    return best;
  }
  function lay(state,index,ids) {
    assertTurn(state,index,'play');
    const p=state.players[index];
    if(p.melds.length)throw Error('Your goal is already on the table.');
    if(new Set(ids).size!==ids.length)throw Error('A card cannot be used twice.');
    const cards=ids.map(id=>p.hand.find(c=>c.id===id));
    if(cards.some(c=>!c))throw Error('Choose cards from your hand.');
    const needed=PHASES[p.phase].groups.reduce((n,g)=>n+g[1],0);
    if(cards.length!==needed)throw Error(`Select exactly ${needed} cards for this goal.`);
    const melds=findPhase(cards,p.phase);
    if(!melds)throw Error(`Those cards don’t make ${PHASES[p.phase].label}.`);
    p.melds=melds;p.hand=p.hand.filter(c=>!ids.includes(c.id));
    log(state,`${p.name} laid down Goal ${p.phase+1}.`);
    if(!p.hand.length)finishRound(state,index);
    return melds;
  }
  function hitOptions(meld,card) {
    if(card.kind==='skip')return [];
    if(meld.type==='set')return card.kind==='wild'||card.value===meld.value?['end']:[];
    if(meld.type==='color')return card.kind==='wild'||card.color===meld.color?['end']:[];
    const first=meld.start,last=first+meld.cards.length-1,result=[];
    if(first>1&&(card.kind==='wild'||card.value===first-1))result.push('start');
    if(last<12&&(card.kind==='wild'||card.value===last+1))result.push('end');
    return result;
  }
  function hit(state,index,id,target,group,side) {
    assertTurn(state,index,'play');
    const p=state.players[index];
    if(!p.melds.length)throw Error('Lay your own goal before adding to others.');
    const card=p.hand.find(c=>c.id===id),meld=state.players[target]?.melds[group];
    if(!card||!meld)throw Error('Choose a card and a completed group.');
    const options=hitOptions(meld,card);
    if(!options.length)throw Error('That card doesn’t fit this group.');
    side=side||options.at(-1);
    if(!options.includes(side))throw Error('That card doesn’t fit that end of the run.');
    if(meld.type==='run'){
      const placed={...card,as:side==='start'?meld.start-1:meld.start+meld.cards.length};
      if(side==='start'){meld.start--;meld.cards.unshift(placed);}else meld.cards.push(placed);
    }else meld.cards.push({...card,as:meld.type==='set'?meld.value:meld.color});
    p.hand=p.hand.filter(c=>c.id!==id);
    log(state,`${p.name} added ${cardName(card)} to a ${meld.type}.`);
    if(!p.hand.length)finishRound(state,index);
  }
  function discard(state,index,id) {
    assertTurn(state,index,'play');
    const p=state.players[index],card=p.hand.find(c=>c.id===id);
    if(!card)throw Error('Select one card to discard.');
    p.hand=p.hand.filter(c=>c.id!==id);state.discard.push(card);
    log(state,`${p.name} discarded ${cardName(card)}.`);
    if(!p.hand.length){finishRound(state,index);return;}
    state.turn=card.kind==='skip'?index:1-index;state.step='draw';
    if(card.kind==='skip')log(state,`${state.players[1-index].name} ${index===1?'are':'is'} skipped. ${p.name} ${index===0?'go':'goes'} again.`);
  }
  function finishRound(state,winner) {
    const gained=state.players.map(p=>p.hand.reduce((n,c)=>n+points(c),0));
    const advanced=state.players.map(p=>p.melds.length>0),phases=state.players.map(p=>p.phase);
    state.players.forEach((p,i)=>{p.score+=gained[i];if(advanced[i])p.phase++;});
    let gameWinner=null;
    if(state.tieBreak)gameWinner=winner;
    else {
      const finished=state.players.map((p,i)=>p.phase===10?i:-1).filter(i=>i>=0);
      if(finished.length===1)gameWinner=finished[0];
      else if(finished.length===2){
        if(state.players[0].score!==state.players[1].score)gameWinner=state.players[0].score<state.players[1].score?0:1;
        else {state.tieBreak=true;state.players.forEach(p=>p.phase=9);}
      }
    }
    state.status=gameWinner===null?'round':'game';
    state.result={winner,gameWinner,gained,advanced,phases,tieBreak:state.tieBreak};
    log(state,`${state.players[winner].name} went out. Round ${state.round} complete.`);
  }
  function chooseDiscard(state,index) {
    const p=state.players[index];let best=null,bestScore=-Infinity;
    for(const card of p.hand){
      const rest=p.hand.filter(c=>c.id!==card.id);
      let score=(p.melds.length?0:progress(rest,p.phase))*100+points(card)+(card.kind==='skip'?25:0);
      if(card.kind==='wild'&&!p.melds.length)score-=35;
      if(card.kind!=='skip'&&state.players[1-index].melds.some(m=>hitOptions(m,card).length))score-=8;
      if(score>bestScore){bestScore=score;best=card;}
    }
    return best;
  }
  function computerTurn(state,index=1) {
    assertTurn(state,index);
    const p=state.players[index];
    if(state.step==='draw'){
      const top=state.discard.at(-1);let take=false;
      if(top&&top.kind!=='skip'){
        take=p.melds.length?state.players.some(pl=>pl.melds.some(m=>hitOptions(m,top).length)):progress(p.hand.concat(top),p.phase)>progress(p.hand,p.phase);
      }
      draw(state,index,take?'discard':'deck');
    }
    if(!p.melds.length){
      const phase=findPhase(p.hand,p.phase);
      if(phase)lay(state,index,phase.flatMap(m=>m.cards.map(c=>c.id)));
    }
    if(state.status!=='playing')return;
    if(p.melds.length){
      let moved=true;
      while(moved&&state.status==='playing'){
        moved=false;
        for(const card of p.hand.slice().sort((a,b)=>(a.kind==='wild')-(b.kind==='wild'))){
          for(let target=0;target<2&&!moved;target++)for(let group=0;group<state.players[target].melds.length&&!moved;group++){
            if(hitOptions(state.players[target].melds[group],card).length){hit(state,index,card.id,target,group);moved=true;}
          }
          if(moved)break;
        }
      }
    }
    if(state.status==='playing')discard(state,index,chooseDiscard(state,index).id);
  }
  const api={COLORS,PHASES,deck,shuffle,points,newGame,startRound,draw,findPhase,partialValid,progress,lay,hitOptions,hit,discard,computerTurn,chooseDiscard,cardName};
  root.TenRoundsGame=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
