// Part extents vs the render budget. A part whose shapes reach past the
// viewBox gets silently cropped on the biggest frame — the artifact looks
// like a "trumpet" where only the taper of a tail survives. Exported so the
// smoke suite guards against it; run directly for a report.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parts = JSON.parse(readFileSync(join(root, 'data/parts.json'), 'utf8')).parts;
const frames = JSON.parse(readFileSync(join(root, 'data/frames.json'), 'utf8')).frames;
const VB = 230; // viewBox half-extent
function ext(shapes) {
  let x0=0,x1=0,y0=0,y1=0;
  for (const s of shapes) {
    let xs=[],ys=[];
    if (s.type==='rect'){xs=[s.x,s.x+s.width];ys=[s.y,s.y+s.height];}
    else if (s.type==='circle'){xs=[s.cx-s.r,s.cx+s.r];ys=[s.cy-s.r,s.cy+s.r];}
    else if (s.type==='ellipse'){xs=[s.cx-s.rx,s.cx+s.rx];ys=[s.cy-s.ry,s.cy+s.ry];}
    else if (s.type==='polygon'){for(const p of s.points.split(/\s+/)){const[a,b]=p.split(',').map(Number);xs.push(a);ys.push(b);}}
    else if (s.type==='path'){const n=(s.d.match(/-?\d+\.?\d*/g)||[]).map(Number);xs=n.filter((_,i)=>i%2===0);ys=n.filter((_,i)=>i%2===1);}
    if (s.transform && /scale\(-1/.test(s.transform)) xs = xs.map(v=>-v);
    x0=Math.min(x0,...xs);x1=Math.max(x1,...xs);y0=Math.min(y0,...ys);y1=Math.max(y1,...ys);
  }
  return {x0,x1,y0,y1};
}
// Every socket a slot type can occupy — a part must fit in ALL of them, so
// adding a bay (Theater Tier II's organ2) is covered without a code edit.
const SOCK = {
  head: ['head'],
  forelimbs: ['forelimb_far', 'forelimb_near'],
  hindlimbs: ['hindlimb_far', 'hindlimb_near'],
  tail: ['tail'],
  organ: ['organ', 'organ2'],
};
export function overflowingParts() {
const bad = [];
for (const p of parts) {
  if (p.slot === 'hide') continue;
  const e = ext(p.shapes);
  for (const f of frames) {
   for (const sockName of SOCK[p.slot] ?? []) {
    const sock = f.sockets[sockName];
    if (!sock) continue;
    const S = f.scale, k = sock.scale ?? 1;
    const reach = {
      left:  Math.abs((e.x0*k + sock.x) * S), right: Math.abs((e.x1*k + sock.x) * S),
      up:    Math.abs((e.y0*k + sock.y) * S), down:  Math.abs((e.y1*k + sock.y) * S),
    };
    const worst = Math.max(reach.left, reach.right, reach.up, reach.down);
    if (worst > VB) bad.push({ part: p.id, frame: f.id, socket: sockName, over: Math.round(worst - VB) });
   }
  }
}
return bad;
}

const bad = overflowingParts();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (!bad.length) console.log('all parts fit the viewBox on every frame ✓');
else {
  console.log(`${bad.length} part/frame combos overflow the viewBox:`);
  const byPart = {};
  for (const b of bad) (byPart[b.part] ??= []).push(`${b.frame}+${b.over}`);
  for (const [k,v] of Object.entries(byPart)) console.log(`  ${k.padEnd(26)} ${v.join(' ')}`);
}
}
