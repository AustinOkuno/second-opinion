/* Second Opinion - Scampy mascot + accessibility settings.
 * Images load from assets/ (see U()). */
(function(){
var U=function(n){return 'assets/'+n},R=document.documentElement,$$=function(q){return [].slice.call(document.querySelectorAll(q))};
/* greeting sprite in the check box (the old ask-scampy disc sprites) */
var gi=document.getElementById('greetImg'),L=['d-sleep.gif','d-thinking.gif','d-grooming.gif'],n=Math.floor(Math.random()*3);
function sp(){gi.src=U(L[n%3])}sp();setInterval(function(){n++;sp()},9000);
/* accessibility */
var st={size:0,font:'',pick:'',rm:false},SZ=[19,22,26];
try{Object.assign(st,JSON.parse(localStorage.getItem('so-a11y')||'{}'))}catch(e){}
function apply(save){R.style.fontSize=SZ[st.size]+'px';
st.font?R.dataset.font=st.font:delete R.dataset.font;st.pick?R.dataset.theme=st.pick:delete R.dataset.theme;R.classList.toggle('rm',st.rm);
$$('[data-size]').forEach(function(b){b.setAttribute('aria-pressed',+b.dataset.size===st.size)});
$$('[data-font]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.font===st.font)});
$$('[data-pick]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.pick===st.pick)});
document.getElementById('rm').setAttribute('aria-pressed',st.rm);
if(save)try{localStorage.setItem('so-a11y',JSON.stringify(st))}catch(e){}}
$$('[data-size]').forEach(function(b){b.onclick=function(){st.size=+b.dataset.size;apply(1)}});
$$('[data-font]').forEach(function(b){b.onclick=function(){st.font=b.dataset.font;apply(1)}});
$$('[data-pick]').forEach(function(b){b.onclick=function(){st.pick=b.dataset.pick;apply(1)}});
document.getElementById('rm').onclick=function(){st.rm=!st.rm;apply(1)};
document.getElementById('accReset').onclick=function(){st={size:0,font:'',pick:'',rm:false};apply(1)};
apply();
/* silhouettes while loading, Scampy only after the answer */
var K=function(){return innerWidth>720?1.5:1};
function sil(p,name,cls){var u=U(name),d=document.createElement('div'),i=new Image();d.className='sil '+cls;d.setAttribute('aria-hidden','true');
d.style.webkitMaskImage=d.style.maskImage='url("'+u+'")';i.onload=function(){d.style.width=Math.round(i.naturalWidth*K())+'px';d.style.height=Math.round(i.naturalHeight*K())+'px'};i.src=u;p.appendChild(d)}
var RX={ok:'r-hop.gif',scam:'r-scared.gif',suspicious:'r-shock.gif'};
window.Scampy={thinking:function(el){sil(el,'run.gif','run')},
verdict:function(el,v){var b=el.querySelector('.summary'),d=document.createElement('div'),i=new Image();d.className='vmasc';i.alt='';i.src=U(RX[v]||RX.ok);i.onload=function(){i.style.width=Math.round(i.naturalWidth*K())+'px'};d.appendChild(i);b&&b.appendChild(d)}};
})();
