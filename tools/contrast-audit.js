/* Test-only WCAG relative-luminance audit of real computed text colors.
   Transparent surfaces are composited. Table gradients are checked at both
   extremes, not averaged. Every text size uses the stricter 4.5:1 threshold. */
(function(){
  const rgba=value=>{
    const parts=value.match(/[\d.]+/g).map(Number);
    return parts.length===3?[...parts,1]:parts;
  };
  const blend=(front,back)=>{
    const alpha=front[3]+back[3]*(1-front[3]);
    return alpha?[...front.slice(0,3).map((v,i)=>(v*front[3]+back[i]*back[3]*(1-front[3]))/alpha),alpha]:[0,0,0,0];
  };
  const luminance=color=>color.slice(0,3).map(v=>{
    v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  }).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{
    const x=luminance(a),y=luminance(b);
    return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
  };
  window.auditTextContrast=function(doc,scope=doc.body){
    const win=doc.defaultView,rows=[],unknown=[];
    function backgrounds(element){
      const ancestors=[];for(let e=element;e;e=e.parentElement)ancestors.unshift(e);
      let candidates=[[255,255,255,1]];
      for(const node of ancestors){
        const style=win.getComputedStyle(node);
        candidates=candidates.map(bg=>blend(rgba(style.backgroundColor),bg));
        if(style.backgroundImage!=='none'){
          if(node.classList.contains('game-table')){
            const probe=doc.createElement('span');probe.style.color='var(--table-highlight)';doc.body.append(probe);
            const highlight=rgba(win.getComputedStyle(probe).color);probe.remove();
            candidates=candidates.concat(candidates.map(bg=>blend(highlight,bg)));
          }else unknown.push({element:node.className,image:style.backgroundImage});
        }
      }
      return candidates;
    }
    function record(element,text,pseudo){
      const style=win.getComputedStyle(element,pseudo),color=rgba(style.color);
      let bgs=backgrounds(element);
      if(pseudo)bgs=bgs.map(bg=>blend(rgba(style.backgroundColor),bg));
      const contrast=Math.min(...bgs.map(bg=>ratio(blend(color,bg),bg)));
      rows.push({text:text.trim().slice(0,70),element:element.id||element.className||element.tagName,contrast});
    }
    const walker=doc.createTreeWalker(scope,win.NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode,element=node.parentElement;
      if(!node.textContent.trim()||['SCRIPT','STYLE','NOSCRIPT'].includes(element.tagName))continue;
      let hidden=false;
      for(let e=element;e;e=e.parentElement){
        const style=win.getComputedStyle(e);
        if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0){hidden=true;break;}
      }
      if(hidden||parseFloat(win.getComputedStyle(element).fontSize)===0)continue;
      record(element,node.textContent);
    }
    for(const element of scope.querySelectorAll('.card.selected'))record(element,'Selection checkmark','::after');
    return {
      checked:rows.length,
      minimum:Math.min(...rows.map(r=>r.contrast)),
      worst:rows.slice().sort((a,b)=>a.contrast-b.contrast).slice(0,3),
      failures:rows.filter(r=>r.contrast<4.5),
      unknown
    };
  };
})();
