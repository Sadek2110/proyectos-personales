// Insert with <script src="https://YOUR-GLOVI/widget.js" defer></script>.
(() => {
  const script=document.currentScript;
  if(!script)return;
  const origin=new URL(script.src).origin;
  const frame=document.createElement('iframe');
  frame.src=origin+'/widget';frame.title='GLOVI · Ceuta';frame.width=script.dataset.width||'100%';frame.height=script.dataset.height||'720';
  frame.allow='geolocation';frame.setAttribute('loading','lazy');
  const fallback=document.createElement('a');fallback.href=origin;fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.textContent='Abrir GLOVI / Open GLOVI';
  script.after(frame,fallback);
})();
