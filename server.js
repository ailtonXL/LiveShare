'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const MAX_VIEWERS = Number(process.env.MAX_VIEWERS || 12);
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 100);
const ROOT = path.resolve(__dirname, 'public');
const rooms = new Map();
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const uid = (bytes = 6) => crypto.randomBytes(bytes).toString('base64url');

function send(res, status, obj) {
  if (res.writableEnded) return;
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
}
function push(res, obj) {
  if (!res || res.destroyed || res.writableEnded) return false;
  try { res.write(`data: ${JSON.stringify(obj)}\n\n`); return true; } catch { return false; }
}
function postBody(req) {
  return new Promise((resolve,reject) => {
    let data = ''; let len = 0;
    req.on('data', c => { len += c.length; if (len > 256*1024) { reject(new Error('Dados muito grandes')); req.destroy(); } else data += c.toString(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
function roomPublic(r) { return {id:r.id, live:r.live, viewers:r.viewers.size, maxViewers:MAX_VIEWERS, quality:r.quality, codec:r.codec, createdAt:r.createdAt}; }
function broadcastStatus(r) { const item = {type:'status',...roomPublic(r)}; for (const v of r.viewers.values()) push(v.response, item); push(r.hostResponse, item); }
function removeViewer(r,id) { const v=r.viewers.get(id); if(!v) return; r.viewers.delete(id); if(v.response && !v.response.writableEnded) v.response.end(); push(r.hostResponse,{type:'viewer-left',viewerId:id}); broadcastStatus(r); }
function serveStatic(req,res,url) {
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  try { rel = decodeURIComponent(rel); } catch { send(res,400,{error:'URL inválida'}); return; }
  const filepath = path.resolve(ROOT, '.' + rel);
  if (filepath !== ROOT && !filepath.startsWith(ROOT + path.sep)) { send(res,403,{error:'Bloqueado'}); return; }
  fs.stat(filepath,(err,stat) => {
    if (err || !stat.isFile()) { send(res,404,{error:'Página não encontrada'}); return; }
    res.writeHead(200,{'Content-Type':MIME[path.extname(filepath)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'display-capture=(self), microphone=(self), camera=()'});
    if(req.method==='HEAD') res.end(); else fs.createReadStream(filepath).pipe(res);
  });
}
async function handler(req,res) {
  const url = new URL(req.url,'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/config') {
    const iceServers = [{urls: 'stun:stun.l.google.com:19302'}];
    if(process.env.TURN_URL) iceServers.push({urls:process.env.TURN_URL.split(','),username:process.env.TURN_USERNAME||'',credential:process.env.TURN_CREDENTIAL||''});
    return send(res,200,{iceServers,maxViewers:MAX_VIEWERS});
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/rooms/')) {
    const room=rooms.get(url.pathname.split('/').pop());
    return room ? send(res,200,roomPublic(room)) : send(res,404,{error:'Sala não encontrada ou encerrada'});
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    const roomId=url.searchParams.get('roomId'), role=url.searchParams.get('role'), token=url.searchParams.get('token');
    const r=rooms.get(roomId);
    if (!r) return send(res,404,{error:'Sala não encontrada'});
    const viewer=role==='viewer' ? r.viewers.get(url.searchParams.get('viewerId')) : null;
    if (role==='host' ? token!==r.hostToken : (role!=='viewer' || !viewer || token!==viewer.token)) return send(res,403,{error:'Acesso não autorizado'});
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(': connected\n\n');
    if (role==='host') {
      if(r.hostResponse && r.hostResponse!==res) r.hostResponse.end();
      r.hostResponse=res;
      push(res,{type:'hello',viewers:[...r.viewers.values()].filter(v=>v.response).map(v=>({viewerId:v.id,codecs:v.codecs}))});
    } else {
      if(viewer.response && viewer.response!==res) viewer.response.end();
      const first=!viewer.response;
      viewer.response=res; viewer.seen=Date.now();
      push(res,{type:'status',...roomPublic(r)});
      if(first) push(r.hostResponse,{type:'viewer-joined',viewerId:viewer.id,codecs:viewer.codecs});
      broadcastStatus(r);
    }
    const ping=setInterval(()=> { if(res.destroyed) return clearInterval(ping); res.write(': ping\n\n'); if(viewer) viewer.seen=Date.now(); },20000);
    res.on('close',()=> {
      clearInterval(ping);
      if(role==='host' && r.hostResponse===res) {
        r.hostResponse=null;
        // Permite reconexões breves de EventSource sem derrubar a transmissão.
        setTimeout(()=>{if(!r.hostResponse && r.live){r.live=false;broadcastStatus(r);}},5000).unref();
      }
      if(viewer && viewer.response===res) { viewer.response=null; viewer.seen=Date.now(); push(r.hostResponse,{type:'viewer-left',viewerId:viewer.id}); }
    });
    return;
  }
  if(req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let data; try { data=await postBody(req); } catch(e) { return send(res,400,{error:e.message}); }
    if(url.pathname==='/api/rooms') {
      if(rooms.size>=MAX_ROOMS) return send(res,503,{error:'Limite de salas alcançado'});
      const id=uid(9), hostToken=uid(24);
      const room={id,hostToken,viewers:new Map(),hostResponse:null,live:false,quality:'Automático',codec:'Automático',createdAt:Date.now()};
      rooms.set(id,room);
      return send(res,201,{roomId:id,hostToken,...roomPublic(room)});
    }
    const r=rooms.get(data.roomId);
    if(!r) return send(res,404,{error:'Sala não encontrada'});
    if(url.pathname==='/api/join') {
      if(r.viewers.size>=MAX_VIEWERS) return send(res,429,{error:'Sala cheia. Limite de espectadores simultâneos atingido.'});
      const id=uid(10),token=uid(24);
      const codecs=Array.isArray(data.codecs)?data.codecs.filter(x=>typeof x==='string').slice(0,20):[];
      r.viewers.set(id,{id,token,codecs,response:null,seen:Date.now()});
      return send(res,201,{viewerId:id,viewerToken:token,...roomPublic(r)});
    }
    if(url.pathname==='/api/status') {
      if(data.token!==r.hostToken) return send(res,403,{error:'Acesso negado'});
      r.live=Boolean(data.live);
      r.quality=String(data.quality||'Automático').slice(0,30);
      r.codec=String(data.codec||'Automático').slice(0,24);
      broadcastStatus(r);
      return send(res,200,{ok:true});
    }
    if(url.pathname==='/api/signal') {
      if(!['offer','answer','ice'].includes(data.kind) || typeof data.payload!=='object' || data.payload===null) return send(res,400,{error:'Sinalização inválida'});
      if(data.role==='host') {
        if(data.token!==r.hostToken) return send(res,403,{error:'Acesso negado'});
        const v=r.viewers.get(data.viewerId);
        if(!v) return send(res,404,{error:'Espectador desconectado'});
        push(v.response,{type:'signal',kind:data.kind,payload:data.payload});
      } else if(data.role==='viewer') {
        const v=r.viewers.get(data.viewerId);
        if(!v || v.token!==data.token) return send(res,403,{error:'Acesso negado'});
        v.seen=Date.now();
        push(r.hostResponse,{type:'signal',viewerId:v.id,kind:data.kind,payload:data.payload});
      } else return send(res,400,{error:'Papel inválido'});
      return send(res,200,{ok:true});
    }
    if(url.pathname==='/api/leave') {
      if(data.role==='viewer') {
        const v=r.viewers.get(data.viewerId);
        if(!v || data.token!==v.token) return send(res,403,{error:'Acesso negado'});
        removeViewer(r,v.id); return send(res,200,{ok:true});
      }
      if(data.role==='host' && data.token===r.hostToken) {
        r.live=false;broadcastStatus(r);return send(res,200,{ok:true});
      }
      return send(res,403,{error:'Acesso negado'});
    }
    return send(res,404,{error:'API desconhecida'});
  }
  if(req.method==='GET'||req.method==='HEAD') return serveStatic(req,res,url);
  send(res,405,{error:'Método não permitido'});
}
const server=http.createServer((req,res)=> { handler(req,res).catch(e=> {console.error(e);send(res,500,{error:'Erro interno'});}); });
server.keepAliveTimeout=65_000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`LiveForge disponível em http://localhost:${PORT}`));
}
module.exports = server;
setInterval(()=>{
  const now=Date.now();
  for(const [id,r] of rooms) {
    for(const v of r.viewers.values()) if(!v.response && now-v.seen>45000) removeViewer(r,v.id);
    if(now-r.createdAt>24*60*60*1000 && !r.hostResponse && r.viewers.size===0) rooms.delete(id);
  }
},30000).unref();
