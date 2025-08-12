/* Celtic Leaves — Single Style Clean (No Libs)
 * - Color: ~15% green, ~85% yellow
 * - Timing: 10 leaves randomly within each 10s window
 * - Pausing: auto-pause on page/tab hidden; also expose LeafFX.pause()/resume()
 * - Placement: canvas inserted BEFORE #fx-layer (z-index:1) so your UI stays on top
 * - Performance: offscreen textures, object pooling, DPR cap, active cap
 */
(function(){
  // Clean up any prior instances
  try {
    document.querySelectorAll("canvas[id^='leaf-fx-canvas']").forEach(el=>el.remove());
    if (window.__leafFxTimeouts) { window.__leafFxTimeouts.forEach(clearTimeout); }
    if (window.__leafFxIntervals) { window.__leafFxIntervals.forEach(clearInterval); }
  } catch(e){}
  window.__leafFxTimeouts = [];
  window.__leafFxIntervals = [];

  if (window.__leafFxV3Inited) return;
  window.__leafFxV3Inited = true;

  // Insert canvas before #fx-layer
  const fxLayer = document.getElementById('fx-layer');
  const cvs = document.createElement('canvas');
  cvs.id = 'leaf-fx-canvas-v3';
  cvs.style.position = 'fixed';
  cvs.style.inset = '0';
  cvs.style.pointerEvents = 'none';
  cvs.style.zIndex = '1';
  if (fxLayer && fxLayer.parentNode) {
    fxLayer.parentNode.insertBefore(cvs, fxLayer);
  } else {
    document.body.appendChild(cvs);
  }
  const ctx = cvs.getContext('2d', { alpha:true });

  // DPR cap
  const DPR_MAX = 1.5;
  function getDPR(){ return Math.min(DPR_MAX, Math.max(1, window.devicePixelRatio||1)); }
  let dpr = getDPR();
  function resize(){
    dpr = getDPR();
    const w = window.innerWidth, h = window.innerHeight;
    cvs.style.width = w+'px'; cvs.style.height = h+'px';
    cvs.width = Math.floor(w*dpr); cvs.height = Math.floor(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ===== Textures (single style; no side veins). 3 greens + 1 yellow =====
  const SHOW_CENTRAL_VEIN = true; // set false to remove even the central vein

  function makeLeafTexture(base0, base1){
    const off = document.createElement('canvas');
    off.width = 120; off.height = 120;
    const g = off.getContext('2d');
    g.translate(60,60);

    // Fill
    const base = g.createLinearGradient(-40,-40,40,40);
    base.addColorStop(0, base0);
    base.addColorStop(1, base1);
    g.fillStyle = base;

    // Shape: slender laurel
    g.beginPath();
    g.moveTo(0,-42);
    g.bezierCurveTo(18,-38, 28,-20, 24,-6);
    g.bezierCurveTo(18,12, 12,22, 0,42);
    g.bezierCurveTo(-12,22, -18,12, -24,-6);
    g.bezierCurveTo(-28,-20, -18,-38, 0,-42);
    g.closePath();
    g.fill();

    // Gold rim
    g.lineWidth = 1.4;
    const rim = g.createLinearGradient(-30,-30,30,30);
    rim.addColorStop(0,'#d4af37ee');
    rim.addColorStop(1,'#b08d57aa');
    g.strokeStyle = rim;
    g.stroke();

    // Central vein only (optional)
    if (SHOW_CENTRAL_VEIN){
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(28,28,28,0.28)'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(0,-34); g.lineTo(0,34); g.stroke();
      g.strokeStyle = 'rgba(255,255,230,0.55)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(-0.5,-34.5); g.lineTo(-0.5,33.5); g.stroke();
    }

    // Soft highlight (no speckles)
    g.save();
    g.globalCompositeOperation = 'screen';
    const hi = g.createRadialGradient(-14,-20,0, -14,-20,56);
    hi.addColorStop(0, 'rgba(255,255,240,0.28)');
    hi.addColorStop(0.22, 'rgba(255,255,240,0.08)');
    hi.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = hi;
    g.beginPath(); g.arc(-14,-20,56,0,Math.PI*2); g.fill();
    g.restore();

    return off;
  }

  const TEXES = [
    // Greens
    makeLeafTexture('#6f8f59', '#93ab73'),
    makeLeafTexture('#728e5f', '#a0b07a'),
    makeLeafTexture('#789563', '#a2865e'),
    // Yellow
    makeLeafTexture('#cdb55f', '#d4c46e')
  ];
  const TEX_W = TEXES[0].width, TEX_H = TEXES[0].height;

  // Weighted color: ~15% green, ~85% yellow
  function pickTexture(){
    const r = Math.random();
    if (r < 0.15) {
      // among 3 greens
      const idx = (Math.random()*3)|0;
      return TEXES[idx];
    }
    return TEXES[3]; // yellow
  }

  // ===== Pool & config =====
  const pool = [];
  function getLeaf(){
    return pool.length ? pool.pop() : {
      x:0,y:0,rot:0,scale:1, vx:0,vy:0, rotSpd:0, swayP:0, swayAmp:0, swaySpd:0,
      trailX:new Float32Array(8),
      trailY:new Float32Array(8),
      trailR:new Float32Array(8),
      trailS:new Float32Array(8),
      trailIdx:0, trailLen:0, alive:true, tex:null
    };
  }
  function freeLeaf(L){ L.alive=false; pool.push(L); }

  const leaves = [];
  const MAX_ACTIVE = 22;

  function spawnLeaf(){
    if (leaves.length >= MAX_ACTIVE) return;
    const L = getLeaf();
    L.tex = pickTexture();
    L.scale = 0.40 + Math.random()*0.50;
    L.x = Math.random()*window.innerWidth;
    L.y = -50 - Math.random()*60;
    L.rot = Math.random()*Math.PI*2;
    L.vy = 0.5 + Math.random()*0.9;
    L.vx = (Math.random()-0.5)*0.42;
    L.rotSpd = (Math.random()-0.5)*0.02;
    L.swayP = Math.random()*Math.PI*2;
    L.swayAmp = 14 + Math.random()*22;
    L.swaySpd = 0.010 + Math.random()*0.018;
    L.trailIdx = 0; L.trailLen = 0; L.alive = true;
    leaves.push(L);
  }

  // ===== Scheduling: 10 leaves within 10s (randomly distributed) =====
  function scheduleBatch(){
    for(let i=0;i<10;i++){
      const tid = window.setTimeout(spawnLeaf, Math.random()*10000);
      window.__leafFxTimeouts.push(tid);
    }
  }
  function clearScheduled(){
    window.__leafFxTimeouts.forEach(clearTimeout);
    window.__leafFxTimeouts.length = 0;
  }
  let intervalId = null;
  function startScheduler(){
    if (intervalId) return;
    scheduleBatch();
    intervalId = window.setInterval(scheduleBatch, 10000);
    window.__leafFxIntervals.push(intervalId);
  }
  function stopScheduler(){
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
    clearScheduled();
  }

  // ===== Animation loop with pause/resume =====
  let last = performance.now();
  let running = true; // paused state

  function loop(now){
    const dt = Math.min(60, (now - last) / 16.6667); last = now;
    if (running){
      ctx.clearRect(0,0,cvs.width/dpr, cvs.height/dpr);
      for (let i=leaves.length-1; i>=0; i--){
        const L = leaves[i];
        // trail ring buffer
        L.trailIdx = (L.trailIdx + 1) & 7;
        L.trailX[L.trailIdx] = L.x;
        L.trailY[L.trailIdx] = L.y;
        L.trailR[L.trailIdx] = L.rot;
        L.trailS[L.trailIdx] = L.scale;
        if (L.trailLen < 8) L.trailLen++;

        // motion
        L.swayP += L.swaySpd * dt;
        const sway = Math.sin(L.swayP) * L.swayAmp;
        L.x += (L.vx + sway*0.02) * dt;
        L.y += L.vy * dt;
        L.rot += L.rotSpd * dt;

        // draw trail
        for (let k=L.trailLen-1; k>=0; k--){
          const idx = (L.trailIdx - k) & 7;
          const t = (L.trailLen-1-k) / Math.max(1,(L.trailLen-1));
          const a = 0.15 * t;
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          const s = L.trailS[idx] * (0.985 - 0.02*(L.trailLen-1-k));
          ctx.save();
          ctx.translate(L.trailX[idx], L.trailY[idx]);
          ctx.rotate(L.trailR[idx]);
          ctx.scale(s, s);
          ctx.drawImage(L.tex, -TEX_W/2, -TEX_H/2);
          ctx.restore();
        }

        // main leaf
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(L.x, L.y);
        ctx.rotate(L.rot);
        ctx.scale(L.scale, L.scale);
        ctx.drawImage(L.tex, -TEX_W/2, -TEX_H/2);
        ctx.restore();

        // wrap & cleanup
        if (L.x < -100) L.x = window.innerWidth + 100;
        if (L.x > window.innerWidth + 100) L.x = -100;
        if (L.y > window.innerHeight + 100){
          freeLeaf(L);
          leaves.splice(i,1);
        }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function pause(){
    if (!running) return;
    running = false;
    stopScheduler();
  }
  function resume(){
    if (running) return;
    running = true;
    startScheduler();
  }

  // Auto pause on page/tab hidden
  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden) pause();
    else resume();
  });

  // Start
  startScheduler();

  // Expose manual controls for your main interface switching:
  window.LeafFX = {
    pause, resume,
    setCentralVein(v){
      // toggle vein next reload; for runtime you'd need to rebuild textures
      console.warn('Central vein toggle will apply on next page load. Current SHOW_CENTRAL_VEIN:', v);
    }
  };
})();