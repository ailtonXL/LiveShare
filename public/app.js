'use strict';

const $ = id => document.getElementById(id);
const codecNames = {AV1:'AV1',H265:'H.265 / HEVC',H264:'H.264 / AVC',VP9:'VP9',VP8:'VP8'};
const codecMime = {AV1:'video/AV1',H265:'video/H265',H264:'video/H264',VP9:'video/VP9',VP8:'video/VP8'};
const codecPriority = ['AV1','H265','VP9','H264','VP8'];
const qualityNames = {auto:'Automático',native:'Nativa',2160:'4K (2160p)',1440:'1440p',1080:'1080p',720:'720p',480:'480p'};
const watchId = new URLSearchParams(location.search).get('watch');
let iceServers = [{urls:'stun:stun.l.google.com:19302'}];
let toastTimeout = 0;
const supportedVideo = typeof RTCRtpSender !== 'undefined' ? (RTCRtpSender.getCapabilities?.('video')?.codecs || []) : [];
const receiveVideo = typeof RTCRtpReceiver !== 'undefined' ? (RTCRtpReceiver.getCapabilities?.('video')?.codecs || []) : [];
const localCodecs = new Set(supportedVideo.map(c=>c.mimeType.toLowerCase()));
const remoteCodecs = new Set(receiveVideo.map(c=>c.mimeType.toLowerCase()));
const host = {roomId:null,token:null,events:null,stream:null,viewers:new Map(),peers:new Map(),live:false,startTime:0,starting:false,statsTimer:null,clockTimer:null};
const audience = {roomId:watchId,viewerId:null,token:null,events:null,pc:null,pendingIce:[],stream:null,live:false,statsTimer:null};

function notify(message,error=false) { const el=$('toast');el.textContent=message;el.className='toast show'+(error?' error':'');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),4500); }
async function api(url, data) {
  const opts = data===undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
  let resp; try { resp=await fetch(url,opts); } catch { throw new Error('Servidor indisponível. Confira sua conexão.'); }
  const json=await resp.json().catch(()=>({}));
  if(!resp.ok) throw new Error(json.error||`Erro HTTP ${resp.status}`);
  return json;
}
function topLive(live) { $('topStatus').className='pill '+(live?'pill-live':'pill-idle');$('statusText').textContent=live?'AO VIVO':'OFFLINE'; }
function formatTime(total) { total=Math.max(0,Math.floor(total));const h=String(Math.floor(total/3600)).padStart(2,'0'),m=String(Math.floor(total/60)%60).padStart(2,'0'),s=String(total%60).padStart(2,'0');return `${h}:${m}:${s}`; }
function prettyCodec(mime) { if (!mime) return '—';return mime.split('/').pop().toUpperCase().replace('H265','H.265').replace('H264','H.264'); }
function hostLink() {return `${location.origin}/?watch=${encodeURIComponent(host.roomId)}`;}
function maxHeight() { const q=$('qualitySelect').value;return q==='auto'||q==='native'?Infinity:Number(q); }
function targetFps() {return $('fpsSelect').value==='auto'?60:Number($('fpsSelect').value);}
function estimateBitrate(height,fps,codec) {
  const h=Math.min(height||1080,4320), area=(h*h*16/9)/(1920*1080);
  const factor=({AV1:.66,H265:.77,VP9:.85,H264:1.08,VP8:1.20})[codec]||.90;
  return Math.max(550_000,Math.min(48_000_000,Math.round(6_000_000*area*(fps/30)*factor)));
}
function chosenOrder() { const selected=$('codecSelect').value;return selected==='auto'?codecPriority:[selected,...codecPriority.filter(x=>x!==selected)]; }
function codecLabels() { return codecPriority.filter(c=>localCodecs.has(codecMime[c].toLowerCase())); }
function videoSettings() {return host.stream?.getVideoTracks()[0]?.getSettings()||{};}
function updateCaptureUi() {
  const s=videoSettings();
  $('metricResolution').innerHTML=s.width&&s.height?`${s.width}×${s.height}`:'—';
  $('metricResolutionNote').textContent=s.width&&s.height?'Resolução da fonte selecionada':'Aguardando fonte';
  $('previewMeta').textContent=host.live?`${s.width||'?'} × ${s.height||'?'} · CAPTURANDO`:'SEM FONTE';
  const q=$('qualitySelect').value;
  $('videoQualityLabel').textContent=q==='auto'?'Melhor resolução disponível':(qualityNames[q]||q);
  $('videoFpsLabel').textContent=$('fpsSelect').value==='auto'?'FPS adaptativo':`${targetFps()} FPS`;
  $('qualityTag').textContent=q==='auto'?'INTELIGENTE':q==='native'?'SEM LIMITE':'MANUAL';
}
function hardwareUi() {
  const platform=navigator.userAgentData?.platform||navigator.platform||'Navegador';
  $('platformName').textContent=platform.replace('Win32','Windows').replace('MacIntel','macOS');
  $('hardwareSummary').textContent='Codificação gerenciada pelo navegador';
  const chips=$('codecChips');
  chips.replaceChildren();
  for(const code of ['AV1','H265','H264','VP9','VP8']) {
    const supported=localCodecs.has(codecMime[code].toLowerCase());
    const span=document.createElement('span');span.className='compat-chip'+(supported?' active':'');
    span.textContent=codecNames[code]+(supported?' ✓':' —');span.title=supported?'Codec anunciado pelo navegador':'Codec não anunciado pelo navegador';chips.append(span);
    const option=$('codecSelect').querySelector(`option[value="${code}"]`);
    if(option) { option.disabled=!supported; if(!supported) option.textContent=codecNames[code]+' (indisponível)'; }
  }
  $('codecInfo').textContent=codecLabels().length ? 'Disponíveis para envio: '+codecLabels().map(c=>codecNames[c]).join(', ') : 'Navegador sem suporte a WebRTC detectado';
  $('bitrateRange').addEventListener('input',()=> {$('bitrateValue').textContent=Number($('bitrateRange').value)===0?'Auto':`${$('bitrateRange').value} Mbps`;});
}
function showHostUi() {
  topLive(host.live);
  $('videoPlaceholder').hidden=host.live;
  $('preview').classList.toggle('visible',host.live);
  $('liveOverlay').hidden=!host.live;
  $('startBtn').hidden=host.live;
  $('stopBtn').hidden=!host.live;
  $('audioToggle').disabled=host.live;
  $('startText').textContent=host.starting?'Abrindo captura...':'Iniciar transmissão';
  $('startBtn').disabled=host.starting;
  updateCaptureUi();
}
async function sendHostStatus() {
  if(!host.roomId) return;
  try { await api('/api/status',{roomId:host.roomId,token:host.token,live:host.live,quality:qualityNames[$('qualitySelect').value]||'Auto',codec:codecNames[$('codecSelect').value]||'Automático'}); }
  catch(e) {console.warn(e);}
}
async function initHost() {
  try {
    const config=await api('/api/config');iceServers=config.iceServers;
    let cached;try {cached=JSON.parse(sessionStorage.getItem('liveforge-host')||'null');} catch{}
    if(cached?.roomId&&cached?.token) {
      try {await api('/api/rooms/'+encodeURIComponent(cached.roomId));host.roomId=cached.roomId;host.token=cached.token;} catch {}
    }
    if(!host.roomId) {
      const room=await api('/api/rooms',{});
      host.roomId=room.roomId;host.token=room.hostToken;
      try {sessionStorage.setItem('liveforge-host',JSON.stringify({roomId:host.roomId,token:host.token}));} catch { /* navegação privada */ }
    }
    $('roomUrlText').textContent=hostLink();
    connectHostEvents();
  } catch(e) {notify(e.message,true);$('roomUrlText').textContent='Servidor indisponível';}
}
function connectHostEvents() {
  host.events?.close();
  const url=`/api/events?roomId=${encodeURIComponent(host.roomId)}&role=host&token=${encodeURIComponent(host.token)}`;
  host.events=new EventSource(url);
  host.events.onmessage=async ({data}) => {
    let ev;try {ev=JSON.parse(data);}catch{return;}
    try {
      if(ev.type==='hello') {
        host.viewers.clear();
        for(const v of ev.viewers) host.viewers.set(v.viewerId,v.codecs||[]);
        $('metricViewers').innerHTML=`${host.viewers.size} <small>online</small>`;
        await sendHostStatus();
        if(host.live) {
          // Recria ofertas após uma interrupção de sinalização.
          for(const id of [...host.peers.keys()]) closeHostPeer(id);
          for(const v of ev.viewers) await ensureHostPeer(v.viewerId,v.codecs);
        }
      } else if(ev.type==='viewer-joined') {
        host.viewers.set(ev.viewerId,ev.codecs||[]);
        $('metricViewers').innerHTML=`${host.viewers.size} <small>online</small>`;
        if(host.live) await ensureHostPeer(ev.viewerId,ev.codecs);
      } else if(ev.type==='viewer-left') {
        host.viewers.delete(ev.viewerId);closeHostPeer(ev.viewerId);
        $('metricViewers').innerHTML=`${host.viewers.size} <small>online</small>`;
      } else if(ev.type==='signal') await handleHostSignal(ev);
      else if(ev.type==='status') $('metricViewers').innerHTML=`${ev.viewers} <small>online</small>`;
    } catch(e) {console.error('Sinalização:',e);}
  };
  host.events.onerror=()=> {if(host.live) notify('Reconectando o canal de sinalização...');};
}
async function hostSignal(viewerId,kind,payload) {
  return api('/api/signal',{roomId:host.roomId,role:'host',token:host.token,viewerId,kind,payload});
}
function closeHostPeer(id) {const peer=host.peers.get(id);if(!peer)return;peer.pc.onconnectionstatechange=null;peer.pc.close();host.peers.delete(id);}
function preferVideoCodec(peer) {
  const transceiver=peer.pc.getTransceivers().find(t=>t.sender===peer.videoSender);
  if(!transceiver?.setCodecPreferences || !supportedVideo.length) return;
  const viewerAvailable=new Set((peer.viewerCodecs||[]).map(c=>c.toLowerCase()));
  const priority=chosenOrder().filter(k=>localCodecs.has(codecMime[k].toLowerCase()));
  const usable=priority.filter(k=>!viewerAvailable.size||viewerAvailable.has(codecMime[k].toLowerCase()));
  // Inclui alternativas para negociação caso um perfil específico não seja compatível.
  const sorted=usable.flatMap(k=>supportedVideo.filter(c=>c.mimeType.toLowerCase()===codecMime[k].toLowerCase()));
  const remaining=supportedVideo.filter(c=>!sorted.includes(c));
  try {transceiver.setCodecPreferences([...sorted,...remaining]);} catch(e) {console.warn('Preferência de codec não aplicada:',e.message);}
}
async function ensureHostPeer(id,viewerCodecs) {
  if(!host.live||!host.stream) return;
  if(host.peers.has(id)) return;
  const pc=new RTCPeerConnection({iceServers});
  const entry={pc,viewerCodecs:viewerCodecs||[],videoSender:null,factor:1,lastBytes:null,lastTimestamp:null,negotiating:false,pendingOffer:false,statsCodec:''};
  host.peers.set(id,entry);
  try {
    for(const track of host.stream.getTracks()) {const sender=pc.addTrack(track,host.stream);if(track.kind==='video') entry.videoSender=sender;}
    pc.onicecandidate=e=>{if(e.candidate) hostSignal(id,'ice',e.candidate.toJSON()).catch(()=>{});};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed') {notify('Falha na conexão com um espectador. Verifique STUN/TURN.',true);}};
    preferVideoCodec(entry);
    await offerPeer(id,entry);
    await applySenderSettings(entry);
  } catch(e) {console.warn(e);closeHostPeer(id);}
}
async function offerPeer(id,peer) {
  if(!peer || peer.pc.signalingState==='closed') return;
  if(peer.negotiating || peer.pc.signalingState!=='stable') {peer.pendingOffer=true;return;}
  peer.negotiating=true;
  try {
    preferVideoCodec(peer);
    const offer=await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await hostSignal(id,'offer',{type:offer.type,sdp:offer.sdp});
  } finally {peer.negotiating=false;}
}
async function handleHostSignal(ev) {
  const peer=host.peers.get(ev.viewerId);if(!peer)return;
  if(ev.kind==='answer') {
    if(peer.pc.signalingState==='have-local-offer') await peer.pc.setRemoteDescription(ev.payload);
    if(peer.pendingOffer && peer.pc.signalingState==='stable') {peer.pendingOffer=false;await offerPeer(ev.viewerId,peer);}
  } else if(ev.kind==='ice') {
    try {await peer.pc.addIceCandidate(ev.payload);}catch(e){console.debug('ICE host:',e.message);}
  }
}
async function applySenderSettings(peer) {
  if(!peer.videoSender || peer.pc.signalingState==='closed')return;
  const track=host.stream?.getVideoTracks()[0];if(!track)return;
  const settings=track.getSettings();const h=settings.height||1080;
  const selectedHeight=Math.min(maxHeight(),h);
  const extra=$('adaptiveToggle').checked&&peer.factor<.45?1.35:1;
  const scale=Math.max(1,h/selectedHeight)*extra;
  const code=$('codecSelect').value==='auto'?codecPriority.find(c=>localCodecs.has(codecMime[c].toLowerCase()))||'H264':$('codecSelect').value;
  const bitrateOverride=Number($('bitrateRange').value);
  const target=bitrateOverride?bitrateOverride*1_000_000:estimateBitrate(selectedHeight,targetFps(),code);
  const params=peer.videoSender.getParameters();
  if(!params.encodings?.length) return;
  params.encodings[0].maxBitrate=Math.max(200_000,Math.round(target*peer.factor));
  params.encodings[0].maxFramerate=targetFps();
  params.encodings[0].scaleResolutionDownBy=Math.max(1,Number(scale.toFixed(3)));
  params.degradationPreference='maintain-resolution';
  try {await peer.videoSender.setParameters(params);}
  catch(e) {
    // Alguns navegadores rejeitam propriedades opcionais. Repetir só com bitrate e FPS.
    try {const fallback=peer.videoSender.getParameters();if(fallback.encodings?.[0]) {fallback.encodings[0].maxBitrate=Math.max(200_000,Math.round(target*peer.factor));fallback.encodings[0].maxFramerate=targetFps();await peer.videoSender.setParameters(fallback);}}
    catch(err){console.warn('Parâmetros de transmissão:',err.message);}
  }
}
async function applyAllSettings(renegotiate=false) {
  updateCaptureUi();if(!host.live)return;
  await Promise.allSettled([...host.peers.values()].map(p=>applySenderSettings(p)));
  if(renegotiate) for(const [id,peer] of host.peers) await offerPeer(id,peer).catch(console.warn);
  sendHostStatus();
}
async function startLive() {
  if(host.starting||host.live)return;
  if(!host.roomId) {notify('A sala ainda não está disponível.',true);return;}
  if(!navigator.mediaDevices?.getDisplayMedia) {notify('Compartilhamento de tela exige HTTPS ou localhost e navegador compatível.',true);return;}
  host.starting=true;showHostUi();
  try {
    // Sempre capturar em resolução nativa. A redução ocorre no RTCRtpSender,
    // preservando a possibilidade de elevar a qualidade sem nova permissão.
    const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:60}},audio:$('audioToggle').checked});
    const video=stream.getVideoTracks()[0];if(!video)throw new Error('Nenhuma fonte de vídeo selecionada.');
    host.stream=stream;
    host.live=true;host.startTime=Date.now();
    $('preview').srcObject=stream;
    $('preview').play().catch(()=>{});
    video.addEventListener('ended',()=>stopLive());
    showHostUi();
    await sendHostStatus();
    for(const [id,codecs] of host.viewers) await ensureHostPeer(id,codecs);
    clearInterval(host.clockTimer);host.clockTimer=setInterval(()=>{$('timecode').textContent=formatTime((Date.now()-host.startTime)/1000);},1000);
    clearInterval(host.statsTimer);host.statsTimer=setInterval(pollHostStats,4000);
    if($('audioToggle').checked&&!stream.getAudioTracks().length) notify('A captura começou sem áudio: o navegador ou a fonte não oferecem áudio do sistema.');
    else notify('Transmissão iniciada! Compartilhe o link da sala.');
  } catch(e) {
    if(e.name!=='NotAllowedError') notify(e.message||'Falha ao compartilhar a tela.',true);
    else notify('Compartilhamento cancelado pelo usuário.');
    if(host.stream&&!host.live) host.stream.getTracks().forEach(t=>t.stop());
  } finally {host.starting=false;showHostUi();}
}
async function stopLive() {
  if(!host.live && !host.stream) return;
  host.live=false;
  clearInterval(host.statsTimer);clearInterval(host.clockTimer);
  for(const id of [...host.peers.keys()]) closeHostPeer(id);
  host.stream?.getTracks().forEach(t=>t.stop());host.stream=null;
  $('preview').srcObject=null;
  $('metricBitrate').innerHTML='0.0 <small>Mbps</small>';
  $('metricCodec').textContent='—';
  $('timecode').textContent='00:00:00';
  showHostUi();await sendHostStatus();notify('Transmissão encerrada. Sua sala continua disponível.');
}
async function pollHostStats() {
  let totalBps=0;let codec='';
  for(const peer of host.peers.values()) {
    if(peer.pc.signalingState==='closed')continue;
    try {
      const stats=await peer.videoSender.getStats();
      for(const item of stats.values()) {
        if(item.type==='outbound-rtp' && (item.kind==='video'||item.mediaType==='video')) {
          if(peer.lastTimestamp!==null && item.timestamp>peer.lastTimestamp) totalBps+=Math.max(0,(item.bytesSent-peer.lastBytes)*8*1000/(item.timestamp-peer.lastTimestamp));
          peer.lastBytes=item.bytesSent;peer.lastTimestamp=item.timestamp;
          if(item.codecId&&stats.get(item.codecId)) codec=prettyCodec(stats.get(item.codecId).mimeType);
          if($('adaptiveToggle').checked) {
            const bandwidthLimited=item.qualityLimitationReason==='bandwidth';
            const prior=peer.factor;
            if(bandwidthLimited) peer.factor=Math.max(.22,peer.factor*.84);
            else peer.factor=Math.min(1,peer.factor*1.06);
            if(Math.abs(prior-peer.factor)>.015) applySenderSettings(peer).catch(()=>{});
          } else if(peer.factor!==1) {peer.factor=1;applySenderSettings(peer).catch(()=>{});}
        }
      }
    } catch(e) {console.debug(e.message);}
  }
  $('metricBitrate').innerHTML=`${(totalBps/1e6).toFixed(1)} <small>Mbps</small>`;
  if(codec) {$('metricCodec').textContent=codec;$('codecActualNote').textContent='Conexão WebRTC negociada';}
}
async function copyLink() {
  if(!host.roomId) {notify('Sala ainda não foi criada.',true);return;}
  const url=hostLink();
  try {await navigator.clipboard.writeText(url);notify('Link copiado para a área de transferência!');}
  catch {const tmp=document.createElement('textarea');tmp.value=url;tmp.style.position='fixed';document.body.append(tmp);tmp.select();const copied=document.execCommand('copy');tmp.remove();notify(copied?'Link copiado!':'Não foi possível copiar. Selecione o endereço exibido.',!copied);}
}
function setupStudio() {
  hardwareUi();updateCaptureUi();showHostUi();
  $('startBtn').addEventListener('click',startLive);
  $('stopBtn').addEventListener('click',stopLive);
  $('copyLinkBtn').addEventListener('click',copyLink);
  $('fullscreenPreview').addEventListener('click',()=>{$('videoFrame').requestFullscreen?.().catch(()=>{});});
  for(const id of ['qualitySelect','fpsSelect','adaptiveToggle','bitrateRange']) $(id).addEventListener('change',()=>applyAllSettings());
  $('codecSelect').addEventListener('change',()=>applyAllSettings(true));
  initHost();
}

function watchStatusUi(live) {
  audience.live=live;
  $('watchStatus').textContent=live?'● AO VIVO':'AGUARDANDO LIVE';
  $('watchStatus').classList.toggle('on',live);
  topLive(live);
  $('watchSubtitle').textContent=live?'Transmissão em tempo real · conexão WebRTC':'Aguardando o apresentador iniciar a transmissão.';
}
function clearAudienceConnection() {
  audience.pc?.close();audience.pc=null;
  audience.pendingIce=[];audience.stream=null;
  $('remoteVideo').srcObject=null;$('remoteVideo').classList.remove('visible');$('viewerPlaceholder').hidden=false;
  $('watchQuality').textContent='Aguardando vídeo';$('watchCodec').textContent='WebRTC';
  $('watchResolution').textContent='—';$('watchActualCodec').textContent='—';
}
async function viewerSignal(kind,payload) {
  return api('/api/signal',{roomId:audience.roomId,role:'viewer',token:audience.token,viewerId:audience.viewerId,kind,payload});
}
async function onOffer(offer) {
  if(!audience.pc || audience.pc.signalingState==='closed') {
    const pc=new RTCPeerConnection({iceServers});
    audience.pc=pc;
    pc.onicecandidate=e=>{if(e.candidate) viewerSignal('ice',e.candidate.toJSON()).catch(()=>{});};
    pc.ontrack=e=>{
      if(e.track.kind==='video') {
        if(e.streams[0]) audience.stream=e.streams[0];
        else {audience.stream=audience.stream||new MediaStream();audience.stream.addTrack(e.track);}
        const video=$('remoteVideo');video.srcObject=audience.stream;
        video.muted=true;video.play().catch(()=>{});
        video.classList.add('visible');$('viewerPlaceholder').hidden=true;
        $('watchQuality').textContent='Vídeo conectado';
      } else if(audience.stream&&!e.streams[0]) audience.stream.addTrack(e.track);
    };
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='failed') {notify('Falha na conexão P2P. Para redes restritas, configure um servidor TURN.',true);$('viewerMessage').textContent='Conexão falhou. O apresentador pode precisar configurar TURN.';}
      if(pc.connectionState==='connected') $('watchQuality').textContent='Conexão estabelecida';
    };
  }
  const pc=audience.pc;
  if(pc.signalingState==='have-remote-offer') return;
  if(pc.signalingState==='have-local-offer') await pc.setLocalDescription({type:'rollback'});
  await pc.setRemoteDescription(offer);
  while(audience.pendingIce.length) {try {await pc.addIceCandidate(audience.pendingIce.shift());}catch{}}
  const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
  await viewerSignal('answer',{type:answer.type,sdp:answer.sdp});
}
async function onViewerSignal(ev) {
  if(ev.kind==='offer') await onOffer(ev.payload);
  else if(ev.kind==='ice') {
    if(audience.pc?.remoteDescription) {try {await audience.pc.addIceCandidate(ev.payload);}catch(e){console.debug('ICE viewer',e.message);}}
    else audience.pendingIce.push(ev.payload);
  }
}
async function initViewer() {
  $('studioView').hidden=true;$('watchView').hidden=false;
  if(!audience.roomId) return;
  try {
    const config=await api('/api/config');iceServers=config.iceServers;
    await api('/api/rooms/'+encodeURIComponent(audience.roomId));
    const joined=await api('/api/join',{roomId:audience.roomId,codecs:[...remoteCodecs]});
    audience.viewerId=joined.viewerId;audience.token=joined.viewerToken;
    const url=`/api/events?roomId=${encodeURIComponent(audience.roomId)}&role=viewer&viewerId=${encodeURIComponent(audience.viewerId)}&token=${encodeURIComponent(audience.token)}`;
    audience.events=new EventSource(url);
    audience.events.onmessage=async({data})=>{
      let ev;try {ev=JSON.parse(data);}catch{return;}
      try {
        if(ev.type==='status') {
          watchStatusUi(ev.live);$('watchViewers').textContent=ev.viewers;
          if(!ev.live&&audience.pc) clearAudienceConnection();
          $('viewerMessage').textContent=ev.live?'Conectando ao apresentador...':'A transmissão aparecerá automaticamente assim que começar.';
        } else if(ev.type==='signal') await onViewerSignal(ev);
      } catch(e) {console.error(e);notify('Problema ao negociar o vídeo: '+e.message,true);}
    };
    audience.events.onerror=()=>{notify('Reconectando à sala...');};
    audience.statsTimer=setInterval(pollViewerStats,4000);
  } catch(e) {$('viewerMessage').textContent=e.message;notify(e.message,true);}
}
async function pollViewerStats() {
  if(!audience.pc) return;
  try {
    const stats=await audience.pc.getStats();
    for(const item of stats.values()) {
      if(item.type==='inbound-rtp' && (item.kind==='video'||item.mediaType==='video')) {
        const video=$('remoteVideo');
        const w=item.frameWidth||video.videoWidth,h=item.frameHeight||video.videoHeight;
        if(w&&h) {$('watchResolution').textContent=`${w} × ${h}`;$('watchQuality').textContent=`${w} × ${h}${item.framesPerSecond?' · '+Math.round(item.framesPerSecond)+' FPS':''}`;}
        if(item.codecId&&stats.get(item.codecId)) {const codec=prettyCodec(stats.get(item.codecId).mimeType);$('watchActualCodec').textContent=codec;$('watchCodec').textContent=codec;}
      }
    }
  } catch(e) {console.debug(e.message);}
}
function setupViewer() {
  $('remoteVideo').muted=true;
  $('soundBtn').addEventListener('click',async()=>{
    const video=$('remoteVideo');video.muted=!video.muted;
    $('soundBtn').textContent=video.muted?'Ativar som':'Silenciar';
    try {await video.play();}catch{notify('Clique no player para permitir o áudio.',true);}
  });
  $('fullscreenWatch').addEventListener('click',()=>{$('viewerStage').requestFullscreen?.().catch(()=>{});});
  // Keep a viewer slot for a short reconnect grace period; free it on normal exit.
  window.addEventListener('pagehide',()=>{if(audience.token&&navigator.sendBeacon)navigator.sendBeacon('/api/leave',new Blob([JSON.stringify({roomId:audience.roomId,role:'viewer',viewerId:audience.viewerId,token:audience.token})],{type:'application/json'}));});
  initViewer();
}
if(watchId) setupViewer(); else setupStudio();
