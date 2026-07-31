const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const intro = document.querySelector('#intro');
const startButton = document.querySelector('#startButton');
const joystick = document.querySelector('#joystick');
const joystickKnob = joystick.querySelector('i');
const fireButton = document.querySelector('#fireButton');
const roomInput = document.querySelector('#roomInput');
const hostButton = document.querySelector('#hostButton');
const joinButton = document.querySelector('#joinButton');
const roomStatus = document.querySelector('#roomStatus');
const hud = { score:document.querySelector('#score'), timer:document.querySelector('#timer'), health:document.querySelector('#health'), message:document.querySelector('#message'), damage:document.querySelector('#damage') };

const map = [
  '111111111111','100000000001','101110111101','100010100001','101010101101','101000001001','101111101101','100000100001','111101101101','100000000001','111111111111'
];
const player = { x:1.55, y:1.55, angle:0, health:100 };
const keys = new Set(); let last = 0, running = false, score = 0, timeLeft = 60, flash = 0, messageTimer = 0;
let enemies = [], particles = [];
let moveX = 0, moveY = 0, stickPointer = null, aimTouch = null;
let peer, connection, online = false, isHost = false, remotePlayer = null, networkTick = 0;

const sharedRoom = new URLSearchParams(location.search).get('room');
if(sharedRoom) roomInput.value = sharedRoom.toUpperCase();

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
function start(){
  if(online && !isHost && !connection?.open){announce('HOST CONNECTION REQUIRED',true);return;}
  reset(); if(remotePlayer)remotePlayer.health=100; running=true; intro.style.display='none'; canvas.requestPointerLock?.(); announce(online?'CO-OP LINKED':'DRONES INBOUND');
  if(online && isHost){send({type:'start'});broadcastState();}
}
startButton.addEventListener('click',start); canvas.addEventListener('click',()=>{ if(running && document.pointerLockElement!==canvas) canvas.requestPointerLock?.(); else if(running) shoot(); });
document.addEventListener('pointerlockchange',()=>{if(running && document.pointerLockElement!==canvas) announce('CLICK TO AIM');});
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyR')start();if(e.code==='Space'){e.preventDefault();shoot();}});addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas && running)player.angle+=e.movementX*.0027;});

// Mobile: left virtual stick moves; drag anywhere else to look around; FIRE shoots.
function setStick(event){
  const r=joystick.getBoundingClientRect(), dx=event.clientX-(r.left+r.width/2), dy=event.clientY-(r.top+r.height/2), max=r.width*.32;
  const length=Math.hypot(dx,dy), scale=length>max?max/length:1;
  moveX=(dx*scale)/max; moveY=(-dy*scale)/max;
  joystickKnob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;
}
function clearStick(){moveX=0;moveY=0;stickPointer=null;joystickKnob.style.transform='translate(0,0)';}
joystick.addEventListener('pointerdown',event=>{if(!running)return;stickPointer=event.pointerId;joystick.setPointerCapture(event.pointerId);setStick(event);event.preventDefault();});
joystick.addEventListener('pointermove',event=>{if(event.pointerId===stickPointer)setStick(event);});
joystick.addEventListener('pointerup',clearStick);joystick.addEventListener('pointercancel',clearStick);
fireButton.addEventListener('pointerdown',event=>{if(running){shoot();event.preventDefault();}});
canvas.addEventListener('touchstart',event=>{if(!running)return;const touch=event.changedTouches[0];aimTouch={id:touch.identifier,x:touch.clientX};event.preventDefault();},{passive:false});
canvas.addEventListener('touchmove',event=>{if(!running||!aimTouch)return;for(const touch of event.changedTouches)if(touch.identifier===aimTouch.id){player.angle+=(touch.clientX-aimTouch.x)*.006;aimTouch.x=touch.clientX;event.preventDefault();break;}},{passive:false});
canvas.addEventListener('touchend',event=>{for(const touch of event.changedTouches)if(aimTouch&&touch.identifier===aimTouch.id)aimTouch=null;});

// P2P lobby: the host owns the round and sends a compact game state to one guest.
function roomCode(){return roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);}
function setRoomStatus(text){roomStatus.textContent=text;}
function send(message){if(connection?.open)connection.send(message);}
function connectData(conn){
  connection=conn;
  conn.on('open',()=>{online=true;setRoomStatus(isHost?'참가자 대기 중…':'호스트에 연결됨 · 훈련 시작을 누르세요');send({type:'hello'});if(isHost)broadcastState();});
  conn.on('data',receiveData); conn.on('close',()=>{online=false;connection=null;remotePlayer=null;setRoomStatus('연결이 종료됐습니다');});
  conn.on('error',()=>setRoomStatus('연결 오류 · 다시 시도해 주세요'));
}
function createHost(){
  const code=roomCode()||Math.random().toString(36).slice(2,7).toUpperCase(); roomInput.value=code; isHost=true; setRoomStatus('방 생성 중…');
  peer=new Peer(`neon-frontier-${code}`); peer.on('open',()=>{online=true;const link=`${location.origin}${location.pathname}?room=${code}`;setRoomStatus(`초대 링크를 공유하세요: ${link}`);history.replaceState(null,'',`?room=${code}`);});
  peer.on('connection',conn=>{if(connection?.open){conn.close();return;}connectData(conn);});
  peer.on('error',error=>setRoomStatus(error.type==='unavailable-id'?'이미 사용 중인 방 코드입니다':'방 생성 오류 · 다른 코드로 시도하세요'));
}
function joinRoom(){
  const code=roomCode(); if(!code){setRoomStatus('방 코드를 입력하세요');return;}isHost=false;setRoomStatus('호스트에 연결 중…');peer=new Peer();
  peer.on('open',()=>connectData(peer.connect(`neon-frontier-${code}`,{reliable:true})));
  peer.on('error',()=>setRoomStatus('방을 찾지 못했습니다 · 코드를 확인하세요'));
}
hostButton.addEventListener('click',createHost);joinButton.addEventListener('click',joinRoom);

function lineOfSight(from,x,y){
  const dx=x-from.x,dy=y-from.y,dist=Math.hypot(dx,dy),steps=Math.ceil(dist/.05);
  for(let i=1;i<steps;i++)if(solid(from.x+dx*i/steps,from.y+dy*i/steps))return false;
  return true;
}
function shootFrom(shooter){
  if(!running)return; flash=.09; let target=null, best=.12;
  enemies.forEach(e=>{const a=Math.atan2(e.y-shooter.y,e.x-shooter.x), diff=Math.atan2(Math.sin(a-shooter.angle),Math.cos(a-shooter.angle)), d=Math.hypot(e.x-shooter.x,e.y-shooter.y);if(Math.abs(diff)<best && lineOfSight(shooter,e.x,e.y)){best=Math.abs(diff);target=e;}});
  if(target){ target.hp--; for(let i=0;i<16;i++)particles.push({x:target.x,y:target.y,z:.5,life:.45,dx:(Math.random()-.5)*2,dy:(Math.random()-.5)*2}); if(target.hp<=0){score+=100; enemies= enemies.filter(e=>e!==target); announce('+100  TARGET ELIMINATED');} } else announce('MISS');
  updateHud();
}
function shoot(){if(online&&!isHost){flash=.09;send({type:'shoot',player:{x:player.x,y:player.y,angle:player.angle}});return;}shootFrom(player);}
function broadcastState(){send({type:'state',player:{x:player.x,y:player.y,angle:player.angle,health:player.health},remotePlayer,enemies,score,timeLeft,running});}
function receiveData(data){
  if(data.type==='hello'&&isHost){if(running)send({type:'start'});broadcastState();}
  if(data.type==='player'&&isHost){remotePlayer={...data.player,health:remotePlayer?.health??100};}
  if(data.type==='shoot'&&isHost&&running&&remotePlayer){remotePlayer={...remotePlayer,...data.player};shootFrom(remotePlayer);}
  if(data.type==='start'&&!isHost){reset();running=true;intro.style.display='none';announce('CO-OP LINKED');}
  if(data.type==='state'&&!isHost){remotePlayer=data.player;enemies=data.enemies||[];score=data.score??score;timeLeft=data.timeLeft??timeLeft;running=data.running;if(data.remotePlayer)player.health=data.remotePlayer.health;updateHud();}
  if(data.type==='end'&&!isHost)finish(data.text,false);
}
function update(dt){
  if(!running)return; if(!online||isHost){timeLeft-=dt;if(timeLeft<=0){finish('TIME UP // SCORE '+score);return;}}
  let mx=0,my=0; const speed=2.4*dt; if(keys.has('KeyW')){mx+=Math.cos(player.angle)*speed;my+=Math.sin(player.angle)*speed}if(keys.has('KeyS')){mx-=Math.cos(player.angle)*speed;my-=Math.sin(player.angle)*speed}if(keys.has('KeyA')){mx+=Math.cos(player.angle-Math.PI/2)*speed;my+=Math.sin(player.angle-Math.PI/2)*speed}if(keys.has('KeyD')){mx+=Math.cos(player.angle+Math.PI/2)*speed;my+=Math.sin(player.angle+Math.PI/2)*speed}
  mx+=(Math.cos(player.angle)*moveY+Math.cos(player.angle+Math.PI/2)*moveX)*speed;my+=(Math.sin(player.angle)*moveY+Math.sin(player.angle+Math.PI/2)*moveX)*speed;
  if(!solid(player.x+mx,player.y))player.x+=mx;if(!solid(player.x,player.y+my))player.y+=my;
  if(!online||isHost){enemies.forEach(e=>{e.t+=dt;const targets=remotePlayer?[player,remotePlayer]:[player];const target=targets.reduce((near,current)=>Math.hypot(current.x-e.x,current.y-e.y)<Math.hypot(near.x-e.x,near.y-e.y)?current:near);const d=Math.hypot(e.x-target.x,e.y-target.y);if(d>1.15&&lineOfSight(target,e.x,e.y)){e.x+=Math.cos(Math.atan2(target.y-e.y,target.x-e.x))*dt*.38;e.y+=Math.sin(Math.atan2(target.y-e.y,target.x-e.x))*dt*.38;}if(d<.72){target.health=Math.max(0,target.health-Math.ceil(dt*20));hud.damage.style.opacity='.75';if(target.health===0)finish('SIMULATION FAILED');}});}
  particles=particles.filter(p=>(p.life-=dt)>0);particles.forEach(p=>{p.x+=p.dx*dt;p.y+=p.dy*dt});hud.damage.style.opacity=Math.max(0,Number(hud.damage.style.opacity||0)-dt*2);if(messageTimer>0 && (messageTimer-=dt)<=0)hud.message.classList.remove('show');if((!online||isHost)&&enemies.length===0){score+=Math.ceil(timeLeft*10);finish('RANGE CLEARED // SCORE '+score)}networkTick+=dt;if(online&&networkTick>.07){networkTick=0;if(isHost)broadcastState();else send({type:'player',player:{x:player.x,y:player.y,angle:player.angle}});}updateHud();
}
function finish(text,notify=true){running=false;document.exitPointerLock?.();if(notify&&online&&isHost)send({type:'end',text});intro.style.display='flex';intro.querySelector('.eyebrow').textContent='SIMULATION COMPLETE';intro.querySelector('p:not(.eyebrow)').innerHTML=`${text}<br>다시 한 번 도전할까요?`;startButton.textContent='다시 시작';}
function render(){
  const w=canvas.width,h=canvas.height,half=h/2, fov=Math.PI/3, rays=Math.min(420,Math.max(180,Math.floor(w/3))), col=w/rays;
  const sky=ctx.createLinearGradient(0,0,0,half);sky.addColorStop(0,'#08192c');sky.addColorStop(1,'#123151');ctx.fillStyle=sky;ctx.fillRect(0,0,w,half);const floor=ctx.createLinearGradient(0,half,0,h);floor.addColorStop(0,'#132537');floor.addColorStop(1,'#02050b');ctx.fillStyle=floor;ctx.fillRect(0,half,w,half);
  ctx.strokeStyle='#183b4a';ctx.lineWidth=1;for(let i=0;i<20;i++){const yy=half+(i/20)**2*half;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();}for(let i=-9;i<10;i++){ctx.beginPath();ctx.moveTo(w/2,half);ctx.lineTo(w/2+i*w/10,h);ctx.stroke();}
  const depth=[]; for(let r=0;r<rays;r++){const angle=player.angle-fov/2+r/rays*fov,dx=Math.cos(angle),dy=Math.sin(angle);let d=.02;while(d<16&&!solid(player.x+dx*d,player.y+dy*d))d+=.025;d*=Math.cos(angle-player.angle);depth[r]=d;const wallH=Math.min(h*1.7,h/d);const shade=Math.max(16,110-d*9);ctx.fillStyle=`rgb(${Math.floor(shade*.26)},${Math.floor(shade*.95)},${shade})`;ctx.fillRect(r*col,half-wallH/2,col+1,wallH);ctx.fillStyle='rgba(0,8,14,.28)';ctx.fillRect(r*col,half+wallH*.15,col+1,wallH*.35);}
  const sprites=[...enemies.map(e=>({...e,kind:'enemy'})),...(remotePlayer?[{...remotePlayer,kind:'ally'}]:[]),...particles.map(p=>({...p,kind:'particle'}))].sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y));
  sprites.forEach(s=>{const dx=s.x-player.x,dy=s.y-player.y,d=Math.hypot(dx,dy),a=Math.atan2(Math.sin(Math.atan2(dy,dx)-player.angle),Math.cos(Math.atan2(dy,dx)-player.angle));if(Math.abs(a)>fov*.65)return;const sx=w/2+(a/(fov/2))*w/2,ray=Math.floor(sx/col);if(d>depth[Math.max(0,Math.min(rays-1,ray))]+.12)return;if(s.kind==='particle'){const z=5/d;ctx.fillStyle=`rgba(64,245,255,${s.life*2})`;ctx.fillRect(sx-z/2,half-z/2,z,z);return;}const size=Math.min(h*1.2,h/d*.76),sy=half-size*.05;ctx.save();ctx.translate(sx,sy);ctx.shadowBlur=22;const ally=s.kind==='ally';ctx.shadowColor=ally?'#25dcff':'#ff245f';ctx.fillStyle=ally?'#123c58':'#451326';ctx.fillRect(-size*.38,-size*.42,size*.76,size*.84);ctx.fillStyle=ally?'#2ddff5':'#ff315f';ctx.fillRect(-size*.23,-size*.27,size*.46,size*.22);ctx.fillStyle='#c4faff';ctx.fillRect(-size*.12,-size*.19,size*.24,size*.07);ctx.strokeStyle=ally?'#b3faff':'#75f6ff';ctx.lineWidth=Math.max(1,size*.025);ctx.strokeRect(-size*.38,-size*.42,size*.76,size*.84);ctx.restore();});
  if(flash>0){ctx.fillStyle=`rgba(132,248,255,${flash*2})`;ctx.fillRect(0,0,w,h);flash-=.016;}
}
function loop(ts){const dt=Math.min(.05,(ts-last||0)/1000);last=ts;update(dt);render();requestAnimationFrame(loop);}requestAnimationFrame(loop);render();
