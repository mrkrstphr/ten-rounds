(async()=>{
  await document.fonts.ready;
  return {
    title:document.title,width:innerWidth,height:innerHeight,
    cards:document.querySelectorAll('.human-hand .card').length,
    text:document.body.innerText.slice(0,2000),
    overflow:document.documentElement.scrollWidth>innerWidth,
    cardBounds:[...document.querySelectorAll('.human-hand .card')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})
  };
})()
