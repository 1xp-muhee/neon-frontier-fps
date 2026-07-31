const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const intro = document.querySelector('#intro');
const startButton = document.querySelector('#startButton');
const hud = { score:document.querySelector('#score'), timer:document.querySelector('#timer'), health:document.querySelector('#health'), message:document.querySelector('#message'), damage:document.querySelector('#damage') };

const map = [
  '111111111111','100000000001','101110111101','100010100001','101010101101','101000001001','101111101101','100000100001','111101101101','100000000001','111111111111'
];
const player = { x:1.55, y:1.55, angle:0, health:100 };
const keys = new Set(); let last = 0, running = false, score = 0, timeLeft = 60, flash = 0, messageTimer = 0;
let enemies = [], particles = [];

function resize(){ canvas.width=innerWidth; canvas.height=innerHeight; }
addEventListener('resize', resize); resize();
function solid(x,y){ return map[Math.floor(y)]?.[Math.floor(x)] === '1'; }
function reset(){
  player.x=1.55; player.y=1.55; player.angle=0; player.health=100; score=0; timeLeft=60; particles=[];
  enemies=[
    {x:9.5,y:1.5,hp:2,t:0},{x:3.5,y:3.5,hp:2,t:1},{x:8.5,y:3.5,hp:2,t:2},
    {x:5.5,y:5.5,hp:2,t:3},{x:9.5,y:7.5,hp:2,t:4},{x:2.5,y:8.5,hp:2,t:5}, {x:7.5,y:9.2,hp:2,t:6}
  ];
  updateHud();
}
function updateHud(){hud.score.textContent=String(score).padStart(4,'0');hud.timer.textContent=Math.max(0,timeLeft).toFixed(1);hud.health.textContent=Math.max(0,player.health);}
function announce(text,danger=false){hud.message.textContent=text;hud.message.className=`message show${danger?' danger':''}`;messageTimer=1.25;}
function start(){ reset(); running=true; intro.style.display='none'; canvas.requestPointerLock?.(); announce('DRONES INBOUND'); }
startButton.addEventListener('click',start); canvas.addEventListener('click',()=>{ if(running && document.pointerLockElement!==canvas) canvas.requestPointerLock?.(); else if(running) shoot(); });
document.addEventListener('pointerlockchange',()=>{if(running && document.pointerLockElement!==canvas) announce('CLICK TO AIM');});
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyR')start();if(e.code==='Space'){e.preventDefault();shoot();}});addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas && running)player.angle+=e.movementX*.0027;});

function lineOfSight(x,y){
  const dx=x-player.x,dy=y-player.y,dist=Math.hypot(dx,dy),steps=Math.ceil(dist/.05);
  for(let i=1;i<steps;i++)if(solid(player.x+dx*i/steps,player.y+dy*i/steps))return false;
  return true;
}
function shoot(){
  if(!running)return; flash=.09; let target=null, best=.12;
  enemies.forEach(e=>{const a=Math.atan2(e.y-player.y,e.x-player.x), diff=Math.atan2(Math.sin(a-player.angle),Math.cos(a-player.angle)), d=Math.hypot(e.x-player.x,e.y-player.y);if(Math.abs(diff)<best && lineOfSight(e.x,e.y)){best=Math.abs(diff);target=e;}});
  if(target){ target.hp--; for(let i=0;i<16;i++)particles.push({x:target.x,y:target.y,z:.5,life:.45,dx:(Math.random()-.5)*2,dy:(Math.random()-.5)*2}); if(target.hp<=0){score+=100; enemies= enemies.filter(e=>e!==target); announce('+100  TARGET ELIMINATED');} } else announce('MISS');
  updateHud();
}
function update(dt){
  if(!running)return; timeLeft-=dt; if(timeLeft<=0){finish('TIME UP // SCORE '+score);return;}
  let mx=0,my=0; const speed=2.4*dt; if(keys.has('KeyW')){mx+=Math.cos(player.angle)*speed;my+=Math.sin(player.angle)*speed}if(keys.has('KeyS')){mx-=Math.cos(player.angle)*speed;my-=Math.sin(player.angle)*speed}if(keys.has('KeyA')){mx+=Math.cos(player.angle-Math.PI/2)*speed;my+=Math.sin(player.angle-Math.PI/2)*speed}if(keys.has('KeyD')){mx+=Math.cos(player.angle+Math.PI/2)*speed;my+=Math.sin(player.angle+Math.PI/2)*speed}
  if(!solid(player.x+mx,player.y))player.x+=mx;if(!solid(player.x,player.y+my))player.y+=my;
  enemies.forEach(e=>{ e.t+=dt; const d=Math.hypot(e.x-player.x,e.y-player.y); if(d>1.15 && lineOfSight(e.x,e.y)){e.x+=Math.cos(Math.atan2(player.y-e.y,player.x-e.x))*dt*.38;e.y+=Math.sin(Math.atan2(player.y-e.y,player.x-e.x))*dt*.38;} if(d<.72){player.health=Math.max(0,player.health-Math.ceil(dt*20));hud.damage.style.opacity='.75';if(player.health===0)finish('SIMULATION FAILED');} });
  particles=particles.filter(p=>(p.life-=dt)>0);particles.forEach(p=>{p.x+=p.dx*dt;p.y+=p.dy*dt});hud.damage.style.opacity=Math.max(0,Number(hud.damage.style.opacity||0)-dt*2);if(messageTimer>0 && (messageTimer-=dt)<=0)hud.message.classList.remove('show'); if(enemies.length===0){score+=Math.ceil(timeLeft*10);finish('RANGE CLEARED // SCORE '+score)}updateHud();
}
function finish(text){running=false;document.exitPointerLock?.();intro.style.display='flex';intro.querySelector('.eyebrow').textContent='SIMULATION COMPLETE';intro.querySelector('p:not(.eyebrow)').innerHTML=`${text}<br>다시 한 번 도전할까요?`;startButton.textContent='다시 시작';}
function render(){
  const w=canvas.width,h=canvas.height,half=h/2, fov=Math.PI/3, rays=Math.min(420,Math.max(180,Math.floor(w/3))), col=w/rays;
  const sky=ctx.createLinearGradient(0,0,0,half);sky.addColorStop(0,'#08192c');sky.addColorStop(1,'#123151');ctx.fillStyle=sky;ctx.fillRect(0,0,w,half);const floor=ctx.createLinearGradient(0,half,0,h);floor.addColorStop(0,'#132537');floor.addColorStop(1,'#02050b');ctx.fillStyle=floor;ctx.fillRect(0,half,w,half);
  ctx.strokeStyle='#183b4a';ctx.lineWidth=1;for(let i=0;i<20;i++){const yy=half+(i/20)**2*half;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();}for(let i=-9;i<10;i++){ctx.beginPath();ctx.moveTo(w/2,half);ctx.lineTo(w/2+i*w/10,h);ctx.stroke();}
  const depth=[]; for(let r=0;r<rays;r++){const angle=player.angle-fov/2+r/rays*fov,dx=Math.cos(angle),dy=Math.sin(angle);let d=.02;while(d<16&&!solid(player.x+dx*d,player.y+dy*d))d+=.025;d*=Math.cos(angle-player.angle);depth[r]=d;const wallH=Math.min(h*1.7,h/d);const shade=Math.max(16,110-d*9);ctx.fillStyle=`rgb(${Math.floor(shade*.26)},${Math.floor(shade*.95)},${shade})`;ctx.fillRect(r*col,half-wallH/2,col+1,wallH);ctx.fillStyle='rgba(0,8,14,.28)';ctx.fillRect(r*col,half+wallH*.15,col+1,wallH*.35);}
  const sprites=[...enemies.map(e=>({...e,kind:'enemy'})),...particles.map(p=>({...p,kind:'particle'}))].sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y));
  sprites.forEach(s=>{const dx=s.x-player.x,dy=s.y-player.y,d=Math.hypot(dx,dy),a=Math.atan2(Math.sin(Math.atan2(dy,dx)-player.angle),Math.cos(Math.atan2(dy,dx)-player.angle));if(Math.abs(a)>fov*.65)return;const sx=w/2+(a/(fov/2))*w/2,ray=Math.floor(sx/col);if(d>depth[Math.max(0,Math.min(rays-1,ray))]+.12)return;if(s.kind==='particle'){const z=5/d;ctx.fillStyle=`rgba(64,245,255,${s.life*2})`;ctx.fillRect(sx-z/2,half-z/2,z,z);return;}const size=Math.min(h*1.2,h/d*.76),sy=half-size*.05;ctx.save();ctx.translate(sx,sy);ctx.shadowBlur=22;ctx.shadowColor='#ff245f';ctx.fillStyle='#451326';ctx.fillRect(-size*.38,-size*.42,size*.76,size*.84);ctx.fillStyle='#ff315f';ctx.fillRect(-size*.23,-size*.27,size*.46,size*.22);ctx.fillStyle='#c4faff';ctx.fillRect(-size*.12,-size*.19,size*.24,size*.07);ctx.strokeStyle='#75f6ff';ctx.lineWidth=Math.max(1,size*.025);ctx.strokeRect(-size*.38,-size*.42,size*.76,size*.84);ctx.restore();});
  if(flash>0){ctx.fillStyle=`rgba(132,248,255,${flash*2})`;ctx.fillRect(0,0,w,h);flash-=.016;}
}
function loop(ts){const dt=Math.min(.05,(ts-last||0)/1000);last=ts;update(dt);render();requestAnimationFrame(loop);}requestAnimationFrame(loop);render();
