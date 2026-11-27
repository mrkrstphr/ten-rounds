(()=>{
  const rgba=value=>{const parts=value.match(/[\d.]+/g).map(Number);return parts.length===3?[...parts,1]:parts;};
  const blend=(front,back)=>{const a=front[3]+back[3]*(1-front[3]);return a?[...front.slice(0,3).map((v,i)=>(v*front[3]+back[i]*back[3]*(1-front[3]))/a),a]:[0,0,0,0];};
  const luminance=color=>color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const rows=[];
  for(const selector of ['.eyebrow','.subtitle','.session-label','.turn-steps','.computer-tag','.player-details>span','.score-chip>span','.pile-label','.table-message','.meld-placeholder','.your-identity strong>span','.your-identity>div>span','.selection-label','.panel-heading>span','.panel-subtitle','.phase-list li:not(.current)','.phase-number','.phase-key','.score-row>span','.score-row small']){
    const element=document.querySelector(selector);if(!element)continue;
    const style=getComputedStyle(element);let background=[0,0,0,0];
    for(let node=element;node;node=node.parentElement)background=blend(background,rgba(getComputedStyle(node).backgroundColor));
    background=blend(background,[255,255,255,1]);const contrast=ratio(blend(rgba(style.color),background),background);
    rows.push({selector,contrast:Math.round(contrast*100)/100,color:style.color,background});
  }
  return {scheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',failures:rows.filter(r=>r.contrast<4.5),minimum:Math.min(...rows.map(r=>r.contrast)),checked:rows.length};
})()
