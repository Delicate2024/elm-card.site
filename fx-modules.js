/*!
 * FX Modules (single file)
 * - 提供 hover 鼠标悬浮特效（当前为默认统一效果）
 * - 提供 explosion 点击爆炸/掠光特效（当前为默认统一效果）
 * - 预留属性路由：地 / 水 / 风 / 火 / 光 / 暗 / 全部 / 默认
 * 之后如需按属性差异化，只需在此文件调整映射或具体实现，无需动 HTML。
 */
(function(){
  if(window.FXModules){ return; }

  // 工具：获取/创建 FX 层的 PIXI 应用（用于爆炸/掠光）
  function getOrCreateFXApp(){
    var fxLayer = document.getElementById('fx-layer');
    if(!fxLayer){
      fxLayer = document.createElement('div');
      fxLayer.id = 'fx-layer';
      fxLayer.style.position = 'fixed';
      fxLayer.style.inset = '0';
      fxLayer.style.pointerEvents = 'none';
      fxLayer.style.zIndex = '9999';
      document.body.appendChild(fxLayer);
    }
    if(!window.__FX_APP__){
      // 需要 PIXI 与 gsap（页面已有CDN）
      window.__FX_APP__ = new PIXI.Application({ resizeTo: window, backgroundAlpha: 0, antialias: true });
      fxLayer.appendChild(window.__FX_APP__.view);
    }
    return window.__FX_APP__;
  }

  // ============ 默认的 Explosion（基于 lens sweep，和原来一致） ============
  // 纹理生成
  function makeGradientTexture(w, h, core, soft){
    w = w||256; h=h||1024; core = (core==null?0.95:core); soft = (soft==null?0.55:soft);
    var cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    var ctx = cvs.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.00, 'rgba(255,255,255,0)');
    grad.addColorStop(0.33, 'rgba(255,255,255,'+soft+')');
    grad.addColorStop(0.50, 'rgba(255,255,255,'+core+')');
    grad.addColorStop(0.67, 'rgba(255,255,255,'+soft+')');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return PIXI.Texture.from(cvs);
  }
  var __SWEEP_TEX_HOVER__ = null;
  var __SWEEP_TEX_CLICK__ = null;

  function defaultExplosion(cardEl, opts){
    opts = opts || {};
    var mode = opts.mode || 'hover';
    var appFX = getOrCreateFXApp();

    if(!__SWEEP_TEX_HOVER__) __SWEEP_TEX_HOVER__ = makeGradientTexture(256,1024,0.9,0.55);
    if(!__SWEEP_TEX_CLICK__) __SWEEP_TEX_CLICK__ = makeGradientTexture(256,1024,1.0,0.7);

    var rect = cardEl.getBoundingClientRect();
    var container = new PIXI.Container();
    appFX.stage.addChild(container);

    var sprite = new PIXI.Sprite(mode==='click' ? __SWEEP_TEX_CLICK__ : __SWEEP_TEX_HOVER__);
    sprite.anchor.set(0.5, 0.5);
    sprite.alpha = 0.0;
    sprite.blendMode = PIXI.BLEND_MODES.ADD;

    var centerX = rect.left + rect.width/2 + window.scrollX;
    var centerY = rect.top + rect.height/2 + window.scrollY;
    container.position.set(centerX, centerY);

    var scaleY = rect.height / 800;
    sprite.scale.set(mode==='click' ? 1.9 : 1.55, scaleY * (mode==='click' ? 1.38 : 1.18));
    sprite.rotation = Math.PI/9;

    try{
      var Bloom = (PIXI.filters && (PIXI.filters.AdvancedBloomFilter || PIXI.filters?.AdvancedBloomFilter));
      if(Bloom){
        container.filters = [ new Bloom({threshold:0.48, bloomScale:(mode==='click'?2.2:1.7), brightness:(mode==='click'?1.55:1.38), blur:(mode==='click'?7:6)}) ];
      }
    }catch(e){}

    container.addChild(sprite);
    var span = rect.width * (mode==='click' ? 1.65 : 1.35);
    sprite.x = -span;

    var tl = gsap.timeline({
      onComplete: function(){
        appFX.stage.removeChild(container);
        container.destroy({children:true});
      }
    });
    tl.to(sprite, { alpha: 1, duration: 0.12, ease: "power2.out" }, 0);
    tl.to(sprite, { x: span, duration: (mode==='click'? 0.72 : 0.58), ease: "power3.inOut" }, 0);
    tl.to(sprite, { alpha: 0, duration: 0.24, ease: "power2.in" }, (mode==='click'? 0.5 : 0.4));
  }

  // ============ 默认的 Hover 悬浮特效（从原 IIFE 移植） ============
  // 为减少耦合，这里实现成可直接传入现有的 canvas（.card-fx）
  function defaultHoverSetup(cardEl, canvas){
    if(!canvas){ return; }
    var inited = defaultHoverSetup.__inited || (defaultHoverSetup.__inited = new WeakSet());
    if(inited.has(cardEl)) return;
    inited.add(cardEl);

    var ctx = canvas.getContext('2d', { alpha: true });
    var dpr = Math.max(1, window.devicePixelRatio || 1);

    var running=false, rafId=null, time=0;
    var particles=[]; var MAX_PARTICLES=260;
    var glowLevel = 0, glowTarget = 0;

    function resize(){
      var r = cardEl.getBoundingClientRect();
      var w = Math.max(1, Math.floor(r.width));
      var h = Math.max(1, Math.floor(r.height));
      canvas.style.width = (w+16)+'px'; canvas.style.height=(h+16)+'px';
      canvas.width = Math.floor((w+16)*dpr); canvas.height=Math.floor((h+16)*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function rand(a,b){ return Math.random()*(b-a)+a; }

    function addBurstCenter(count, speed) {
      if(count==null) count=24;
      if(speed==null) speed=2.4;
      var r = canvas.getBoundingClientRect();
      var x = r.width / 2, y = r.height / 3;
      for (var i = 0; i < count; i++) {
        var ang = Math.random() * Math.PI * 2, v = speed * rand(1.1, 1.6);
        var hue = Math.random() < 0.85 ? rand(48, 54) : rand(130, 150);
        particles.push({
          x:x, y:y,
          vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          life: rand(58, 86),
          alpha: 1,
          size: rand(1.0, 1.9),
          hue: hue,
          shape: 'star',
          rot: rand(0, Math.PI * 2),
          rotSpd: rand(-0.06, 0.06),
          tw: rand(0, Math.PI * 2),
          points: Math.random() < 0.8 ? 5 : 6
        });
      }
    }
    function addTrail(x,y,inten){
      if(inten==null) inten=2;
      for(var k=0;k<inten;k++){
        var ang=Math.random()*Math.PI*2, v=1.1*rand(0.6,1.0);
        var hue = Math.random()<0.85 ? rand(48,54) : rand(130,150);
        particles.push({x:x,y:y,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v,life:rand(26,40),alpha:1,size:rand(0.9,1.9),hue:hue});
      }
      if(particles.length>MAX_PARTICLES) particles.splice(0, particles.length-MAX_PARTICLES);
    }

    function drawSpark(p){
      var r = p.size*7;
      var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      if(p.hue < 100){
        g.addColorStop(0, 'rgba(255,244,204,'+(Math.min(1,p.alpha*1.0))+')');
        g.addColorStop(0.35, 'rgba(255,208,87,'+(Math.min(1,p.alpha*0.95))+')');
        g.addColorStop(0.75, 'rgba(154,107,18,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
      }else{
        g.addColorStop(0, 'rgba(200,255,220,'+(Math.min(1,p.alpha*1.0))+')');
        g.addColorStop(0.35, 'rgba(110,227,160,'+(Math.min(1,p.alpha*0.95))+')');
        g.addColorStop(0.75, 'rgba(30,120,80,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
      }
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=p.alpha;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      if(Math.random()<0.08){
        ctx.globalAlpha = p.alpha*0.9;
        ctx.shadowColor = p.hue<100 ? 'rgba(255,215,120,0.9)' : 'rgba(140,255,190,0.9)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = p.hue<100 ? 'rgba(255,230,150,0.9)' : 'rgba(170,255,210,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x-6, p.y); ctx.lineTo(p.x+6, p.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x, p.y-6); ctx.lineTo(p.x, p.y+6); ctx.stroke();
      }
      ctx.restore();
    }

    function starPath(points, outerR, innerR){
      var angle = -Math.PI/2;
      var step = Math.PI / points;
      ctx.beginPath();
      for(var i=0;i<points*2;i++){
        var r = (i % 2 === 0) ? outerR : innerR;
        ctx.lineTo(Math.cos(angle)*r, Math.sin(angle)*r);
        angle += step;
      }
      ctx.closePath();
    }
    function drawStarParticle(p){
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      var outer = p.size * 7.0;
      var inner = outer * 0.48;
      var g = ctx.createRadialGradient(0,0,0, 0,0, outer);
      if(p.hue < 100){
        g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.20, 'rgba(255,241,200,0.95)');
        g.addColorStop(0.55, 'rgba(255,208,87,0.85)');
        g.addColorStop(0.85, 'rgba(154,107,18,0.42)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
      }else{
        g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.20, 'rgba(210,255,230,0.95)');
        g.addColorStop(0.55, 'rgba(110,227,160,0.85)');
        g.addColorStop(0.85, 'rgba(30,120,80,0.42)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
      }
      ctx.fillStyle = g;
      starPath(p.points || 5, outer, inner);
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = (p.hue < 100) ? 'rgba(255,230,150,0.85)' : 'rgba(170,255,210,0.85)';
      ctx.stroke();
      ctx.globalAlpha = p.alpha * 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(outer*0.16, 1), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.restore();
    }

    function step(){
      var needLoop = running || glowLevel>0.02 || particles.length>0;
      if(!needLoop){ rafId=null; return; }
      var w=canvas.clientWidth,h=canvas.clientHeight;
      var _ctx = canvas.getContext('2d');
      _ctx.clearRect(0,0,w,h);
      time += 1;
      glowLevel += (glowTarget - glowLevel)*0.12;
      for(var i=particles.length-1;i>=0;i--){
        var p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.985; p.vy=p.vy*0.985-0.015;
        p.life -= 1;
        if (p.shape === 'star') {
          if (p.rotSpd) p.rot += p.rotSpd;
          var flicker = 0.72 + 0.28 * Math.abs(Math.sin((time*0.12) + (p.tw || 0)));
          p.alpha = Math.max(0, p.life/60) * flicker;
        } else {
          p.alpha = Math.max(0, p.life/44);
        }
        if(p.x<8||p.y<8||p.x>w-8||p.y>h-8){ p.life=0; p.alpha=0; }
        if(p.alpha<=0){ particles.splice(i,1); continue; }
        if (p.shape === 'star') { drawStarParticle(p); } else { drawSpark(p); }
      }
      rafId=requestAnimationFrame(step);
    }
    function ensureLoop(){ if(!rafId){ rafId=requestAnimationFrame(step); } }
    function onEnter(){ running = true; glowTarget = 1; addBurstCenter(24, 2.4); ensureLoop(); }
    function onMove(ev){
      var r=canvas.getBoundingClientRect();
      addTrail(ev.clientX-r.left, ev.clientY-r.top, 2);
      running = true; glowTarget = 1; ensureLoop();
    }
    function onLeave(){ running = false; glowTarget = 0; ensureLoop(); }
    cardEl.addEventListener('mouseenter', onEnter);
    cardEl.addEventListener('mousemove', onMove);
    cardEl.addEventListener('mouseleave', onLeave);
    try{ var ro=new ResizeObserver(resize); ro.observe(cardEl);}catch(e){ window.addEventListener('resize', resize); }
    resize();
  }

  // ============ 属性路由与公开API ============
  var REGISTRY = {
    "默认": { hover: defaultHoverSetup, explosion: defaultExplosion },
    "地":   { hover: defaultHoverSetup, explosion: defaultExplosion },
    "水":   { hover: defaultHoverSetup, explosion: defaultExplosion },
    "风":   { hover: defaultHoverSetup, explosion: defaultExplosion },
    "火":   { hover: defaultHoverSetup, explosion: defaultExplosion },
    "光":   { hover: defaultHoverSetup, explosion: defaultExplosion },
    "暗":   { hover: defaultHoverSetup, explosion: defaultExplosion },
    "全部": { hover: defaultHoverSetup, explosion: defaultExplosion } // 注意：作为独立属性存在
  };

  var CURRENT_MODE = "默认"; // 现在统一使用默认；未来可切换

function pick(attr){ attr = (attr || '').trim(); return REGISTRY[attr] || REGISTRY['默认']; }

  window.FXModules = {
    // 替换/扩展具体实现
    register: function(attr, impl){
      REGISTRY[attr] = Object.assign({}, REGISTRY["默认"], impl||{});
    },
    // 设置全局模式（若你希望“现在统一用全部/火/水...的样式”，可以这么切）
    setMode: function(attr){
      if(REGISTRY[attr]) CURRENT_MODE = attr; else CURRENT_MODE = "默认";
    },
    // 针对某张卡应用悬浮特效
    applyToCard: function(cardEl, opts){
      opts = opts || {};
      var attr = (opts.attr || "").trim();
      var canvas = opts.canvas || (cardEl.querySelector && cardEl.querySelector('.card-fx'));
      var impl = pick(attr);
      if(impl && impl.hover) impl.hover(cardEl, canvas);
    },
    // 触发爆炸/掠光
    explosion: function(cardEl, opts){
      var attr = (opts && opts.attr) ? String(opts.attr) : "";
      var impl = pick(attr);
      if(impl && impl.explosion) impl.explosion(cardEl, opts);
    }
  };


  /* --- FX plugin template ---
   用法：将下面示例取消注释并替换实现，即可让“水”属性使用自定义特效；其他属性继续走“默认”。
   只需要这一处，无需改 HTML。保持极简。

   示例：
   // FXModules.register('水', {
   //   hover(cardEl, canvas){
   //     // 在这里写水属性的 hover 特效；如果想沿用默认，可写：defaultHoverSetup(cardEl, canvas);
   //   },
   //   explosion(cardEl, opts){
   //     // 在这里写水属性的点击/掠光特效；如果想沿用默认，可写：defaultExplosion(cardEl, opts);
   //   }
   // });
  --- */
// === 水属性（无星形版：仅水滴/水珠 + 蓝色扫光爆炸）===
FXModules.register('水', {
  // 鼠标掠过：水滴/水珠（圆形光斑），柔和水蓝
  hover(cardEl, canvas){
    if(!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    let running=false, rafId=null, time=0;
    let particles=[]; const MAX_PARTICLES=280;
    let glowLevel = 0, glowTarget = 0;

    function resize(){
      const r = cardEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      canvas.style.width = (w+16)+'px'; canvas.style.height=(h+16)+'px';
      canvas.width = Math.floor((w+16)*dpr); canvas.height=Math.floor((h+16)*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function rand(a,b){ return Math.random()*(b-a)+a; }
    try{ new ResizeObserver(resize).observe(cardEl); }catch(e){ window.addEventListener('resize', resize); }
    resize();

    // 中央小爆（与原大形态一致，只是全部改为水滴/圆斑）
    function addBurstCenter(count=26, speed=2.3){
      const r = canvas.getBoundingClientRect();
      const x = r.width / 2, y = r.height / 3;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2, v = speed * rand(1.05, 1.55);
        particles.push({
          x, y,
          vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          life: rand(56, 84),
          alpha: 1,
          size: rand(1.2, 2.4),      // 粒径维持原范围
          tw: rand(0, Math.PI*2)
        });
      }
    }

    // 尾迹（跟鼠标）
    function addTrail(x,y,inten=2){
      for(let k=0;k<inten;k++){
        const ang=Math.random()*Math.PI*2, v=1.05*rand(0.6,1.0);
        particles.push({
          x,y,
          vx:Math.cos(ang)*v, vy:Math.sin(ang)*v,
          life:rand(26,40), alpha:1,
          size:rand(1.0,2.2),
          tw: rand(0,Math.PI*2)
        });
      }
      if(particles.length>MAX_PARTICLES) particles.splice(0, particles.length-MAX_PARTICLES);
    }

    // 水蓝系圆形光斑/水珠
    function drawDrop(p){
      const r = p.size*7.2;
      const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      g.addColorStop(0.00, 'rgba(220,245,255,'+Math.min(1,p.alpha*0.95)+')');
      g.addColorStop(0.35, 'rgba(120,200,255,'+Math.min(1,p.alpha*0.85)+')');
      g.addColorStop(0.75, 'rgba(40,120,220,0.35)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=p.alpha;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      // 小高光点（更像水珠）
      ctx.globalAlpha = p.alpha * 0.85;
      ctx.beginPath();
      ctx.arc(p.x - r*0.18, p.y - r*0.18, Math.max(0.8, r*0.09), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.restore();
    }

    function step(){
      const needLoop = running || glowLevel>0.02 || particles.length>0;
      if(!needLoop){ rafId=null; return; }
      const w=canvas.clientWidth,h=canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      time += 1;
      glowLevel += (glowTarget - glowLevel)*0.12;

      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        p.x += p.vx + Math.sin((time*0.12)+(p.tw||0))*0.05; // 轻微流水感
        p.y += p.vy*0.98 + 0.01;                            // 轻微下沉
        p.vx *= 0.985; p.vy *= 0.985;
        p.life -= 1;
        p.alpha = Math.max(0, p.life/50);                  // 无星闪烁，统一衰减
        if(p.x<8||p.y<8||p.x>w-8||p.y>h-8){ p.life=0; p.alpha=0; }
        if(p.alpha<=0){ particles.splice(i,1); continue; }
        drawDrop(p);
      }
      rafId=requestAnimationFrame(step);
    }
    function ensureLoop(){ if(!rafId){ rafId=requestAnimationFrame(step); } }

    function onEnter(){ running = true; glowTarget = 1; addBurstCenter(26, 2.3); ensureLoop(); }
    function onMove(ev){
      const r=canvas.getBoundingClientRect();
      addTrail(ev.clientX-r.left, ev.clientY-r.top, 2);
      running = true; glowTarget = 1; ensureLoop();
    }
    function onLeave(){ running = false; glowTarget = 0; ensureLoop(); }

    cardEl.addEventListener('mouseenter', onEnter);
    cardEl.addEventListener('mousemove', onMove);
    cardEl.addEventListener('mouseleave', onLeave);
  },

  // 爆炸：蓝色斜向扫光（沿用原触发形式，不改 HTML）
  explosion(cardEl, opts){
    opts = opts || {};
    const mode = opts.mode || 'hover';
    const appFX = (typeof getOrCreateFXApp === 'function') ? getOrCreateFXApp() : null;
    if(!appFX) return;

    function makeBlueSweep(w=256, h=1024, core=0.95, soft=0.60){
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      const c = cvs.getContext('2d');
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.28, 'rgba(140,210,255,'+soft+')');
      g.addColorStop(0.50, 'rgba(200,240,255,'+core+')');
      g.addColorStop(0.72, 'rgba(110,190,255,'+soft+')');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0,0,w,h);
      return PIXI.Texture.from(cvs);
    }
    const TEX = makeBlueSweep(256,1024, (mode==='click'?1.0:0.95), (mode==='click'?0.70:0.60));

    const rect = cardEl.getBoundingClientRect();
    const container = new PIXI.Container();
    const centerX = rect.left + rect.width/2 + window.scrollX;
    const centerY = rect.top + rect.height/2 - rect.height*0.06 + window.scrollY; // 略上移
    appFX.stage.addChild(container);
    container.position.set(centerX, centerY);

    const sprite = new PIXI.Sprite(TEX);
    sprite.anchor.set(0.5); sprite.alpha = 0.0;
    sprite.blendMode = PIXI.BLEND_MODES.ADD;

    const scaleY = rect.height / 800;
    sprite.scale.set(mode==='click' ? 2.05 : 1.75, scaleY * (mode==='click' ? 1.45 : 1.28));
    sprite.rotation = Math.PI/9;

    try{
      const Bloom = PIXI.filters && (PIXI.filters.AdvancedBloomFilter || PIXI.filters?.AdvancedBloomFilter);
      if(Bloom){
        container.filters = [ new Bloom({ threshold:0.48, bloomScale:(mode==='click'?2.1:1.8), brightness:(mode==='click'?1.45:1.30), blur:(mode==='click'?7:6) }) ];
      }
    }catch(e){}

    container.addChild(sprite);
    const span = rect.width * (mode==='click' ? 1.75 : 1.45);
    sprite.x = -span;

    const tl = gsap.timeline({
      onComplete(){ appFX.stage.removeChild(container); container.destroy({children:true}); }
    });
    tl.to(sprite, { alpha: 1, duration: 0.12, ease: "power2.out" }, 0);
    tl.to(sprite, { x: span, duration: (mode==='click'? 0.74 : 0.60), ease: "power3.inOut" }, 0);
    tl.to(sprite, { alpha: 0, duration: 0.26, ease: "power2.in" }, (mode==='click'? 0.52 : 0.42));
  }
});



// === 火属性（深色烈焰版）===
FXModules.register('火', {
  hover(cardEl, canvas){
    if(!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    let running=false, rafId=null, time=0;
    let particles=[]; const MAX_PARTICLES=300; // 稍多，火焰更密
    let glowLevel = 0, glowTarget = 0;

    function resize(){
      const r = cardEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      canvas.style.width = (w+16)+'px'; canvas.style.height=(h+16)+'px';
      canvas.width = Math.floor((w+16)*dpr); canvas.height=Math.floor((h+16)*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function rand(a,b){ return Math.random()*(b-a)+a; }
    try{ new ResizeObserver(resize).observe(cardEl); }catch(e){ window.addEventListener('resize', resize); }
    resize();

    function addBurstCenter(count=28, speed=2.6){
      const r = canvas.getBoundingClientRect();
      const x = r.width / 2, y = r.height / 3;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2, v = speed * rand(1.1, 1.65);
        const type = Math.random() < 0.65 ? 'ember' : 'streak';
        particles.push({
          x, y,
          vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          life: rand(58, 88),
          alpha: 1,
          size: type==='ember' ? rand(1.3, 2.8) : rand(1.0, 2.2),
          type,
          rot: rand(0, Math.PI * 2),
          rotSpd: type==='streak' ? rand(-0.15, 0.15) : rand(-0.08, 0.08),
          tw: rand(0, Math.PI * 2)
        });
      }
    }

    function addTrail(x,y,inten=2){
      for(let k=0;k<inten;k++){
        const ang=Math.random()*Math.PI*2, v=1.15*rand(0.6,1.0);
        const type = Math.random() < 0.35 ? 'streak' : 'ember';
        particles.push({
          x,y,
          vx:Math.cos(ang)*v, vy:Math.sin(ang)*v,
          life:rand(28,42), alpha:1,
          size: type==='ember' ? rand(1.0,2.4) : rand(1.0,1.9),
          type,
          rot: rand(0, Math.PI*2),
          rotSpd: type==='streak' ? rand(-0.15, 0.15) : rand(-0.08,0.08),
          tw: rand(0,Math.PI*2)
        });
      }
      if(particles.length>MAX_PARTICLES) particles.splice(0, particles.length-MAX_PARTICLES);
    }

    function drawEmber(p){
      const r = p.size *6.0;
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      g.addColorStop(0.00, 'rgba(255,220,150,'+Math.min(1,p.alpha)+')'); // 金黄
      g.addColorStop(0.35, 'rgba(255,140,40,' +Math.min(1,p.alpha*0.95)+')'); // 深橙
      g.addColorStop(0.78, 'rgba(180,30,20,'+Math.min(1,p.alpha*0.85)+')'); // 暗红
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=p.alpha;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.globalAlpha = p.alpha*0.4;
      ctx.beginPath(); ctx.arc(p.x, p.y - r*0.25, r*0.55, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,140,40,0.45)';
      ctx.fill();
      ctx.restore();
    }

    function drawStreak(p){
      const len = p.size * 11.5;
      const w   = Math.max(1.0, p.size * 2.0);
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      const grad = ctx.createLinearGradient(-len/2, 0, len/2, 0);
      grad.addColorStop(0.00, 'rgba(255,200,120,0)');
      grad.addColorStop(0.25, 'rgba(255,180,80,0.9)');
      grad.addColorStop(0.55, 'rgba(255,90,20,0.9)');
      grad.addColorStop(0.85, 'rgba(160,20,10,0.45)');
      grad.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      const r = w/2;
      ctx.beginPath();
      ctx.moveTo(-len/2 + r, -r);
      ctx.lineTo( len/2 - r, -r);
      ctx.arc( len/2 - r, 0, r, -Math.PI/2, Math.PI/2);
      ctx.lineTo(-len/2 + r, r);
      ctx.arc(-len/2 + r, 0, r,  Math.PI/2, -Math.PI/2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function step(){
      const needLoop = running || glowLevel>0.02 || particles.length>0;
      if(!needLoop){ rafId=null; return; }
      const w=canvas.clientWidth,h=canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      time += 1;
      glowLevel += (glowTarget - glowLevel)*0.12;

      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        p.x += p.vx + Math.sin((time*0.16)+(p.tw||0))*0.07;
        p.y += p.vy*0.96 - 0.015; // 上浮稍快
        p.vx *= 0.985; p.vy *= 0.985;
        if(p.type==='streak' && p.rotSpd){ p.rot += p.rotSpd; }
        p.life -= 1;
        const flicker = 0.6 + 0.4 * Math.abs(Math.sin((time*0.17) + (p.tw || 0)));
        p.alpha = Math.max(0, (p.type==='streak' ? p.life/48 : p.life/58)) * flicker;
        if(p.x<8||p.y<8||p.x>w-8||p.y>h-8){ p.life=0; p.alpha=0; }
        if(p.alpha<=0){ particles.splice(i,1); continue; }
        (p.type==='streak' ? drawStreak : drawEmber)(p);
      }
      rafId=requestAnimationFrame(step);
    }
    function ensureLoop(){ if(!rafId){ rafId=requestAnimationFrame(step); } }

    cardEl.addEventListener('mouseenter', ()=>{ running = true; glowTarget = 1; addBurstCenter(); ensureLoop(); });
    cardEl.addEventListener('mousemove', ev=>{
      const r=canvas.getBoundingClientRect();
      addTrail(ev.clientX-r.left, ev.clientY-r.top, 2);
      running = true; glowTarget = 1; ensureLoop();
    });
    cardEl.addEventListener('mouseleave', ()=>{ running = false; glowTarget = 0; ensureLoop(); });
  },

  explosion(cardEl, opts){
    opts = opts || {};
    const mode = opts.mode || 'hover';
    const appFX = (typeof getOrCreateFXApp === 'function') ? getOrCreateFXApp() : null;
    if(!appFX) return;

    function makeFireSweep(w=256, h=1024, core=1.0, soft=0.75){
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      const c = cvs.getContext('2d');
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.28, 'rgba(255,150,50,'+soft+')');
      g.addColorStop(0.50, 'rgba(255,200,80,'+core+')');
      g.addColorStop(0.72, 'rgba(180,40,20,'+soft+')');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0,0,w,h);
      return PIXI.Texture.from(cvs);
    }
    const TEX = makeFireSweep(256,1024);

    const rect = cardEl.getBoundingClientRect();
    const container = new PIXI.Container();
    const centerX = rect.left + rect.width/2 + window.scrollX;
    const centerY = rect.top + rect.height/2 - rect.height*0.06 + window.scrollY;
    appFX.stage.addChild(container);
    container.position.set(centerX, centerY);

    const sprite = new PIXI.Sprite(TEX);
    sprite.anchor.set(0.5, 0.5);
    sprite.alpha = 0.0;
    sprite.blendMode = PIXI.BLEND_MODES.ADD;

    const scaleY = rect.height / 800;
    sprite.scale.set(mode==='click' ? 2.2 : 1.8, scaleY * (mode==='click' ? 1.5 : 1.3));
    sprite.rotation = Math.PI/9;

    try{
      const Bloom = PIXI.filters && PIXI.filters.AdvancedBloomFilter;
      if(Bloom){
        container.filters = [ new Bloom({
          threshold:0.48,
          bloomScale:(mode==='click'?2.3:2.0),
          brightness:(mode==='click'?1.5:1.35),
          blur:(mode==='click'?8:6)
        }) ];
      }
    }catch(e){}

    container.addChild(sprite);
    const span = rect.width * (mode==='click' ? 1.8 : 1.55);
    sprite.x = -span;

    const tl = gsap.timeline({
      onComplete(){
        appFX.stage.removeChild(container);
        container.destroy({children:true});
      }
    });
    tl.to(sprite, { alpha: 1, duration: 0.12, ease: "power2.out" }, 0);
    tl.to(sprite, { x: span, duration: (mode==='click'? 0.72 : 0.6), ease: "power3.inOut" }, 0);
    tl.to(sprite, { alpha: 0, duration: 0.28, ease: "power2.in" }, (mode==='click'? 0.5 : 0.42));
  }
});




FXModules.register('暗', {
  
hover(cardEl, canvas){
  if(!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  let running=false, rafId=null, time=0;
  let particles=[]; const MAX_PARTICLES=260;
  let glowLevel=0, glowTarget=0;
  let attractBack = false;              // ← 新增：是否回吸

  function resize(){
    const r=cardEl.getBoundingClientRect();
    const w=Math.max(1, Math.floor(r.width));
    const h=Math.max(1, Math.floor(r.height));
    canvas.style.width=(w+16)+'px'; canvas.style.height=(h+16)+'px';
    canvas.width=Math.floor((w+16)*dpr); canvas.height=Math.floor((h+16)*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function rand(a,b){ return Math.random()*(b-a)+a; }
  try{ new ResizeObserver(resize).observe(cardEl); }catch(e){ window.addEventListener('resize', resize); }
  resize();

  // 中心爆发：刀扇:圆点 = 20:80
  function addBurstCenter(count=30, speed=3.0){
    const r=canvas.getBoundingClientRect();
    const x=r.width/2, y=r.height/3;
    for(let i=0;i<count;i++){
      const ang=Math.random()*Math.PI*2, v=speed*rand(1.05,1.55);
      const type = Math.random()<0.20 ? 'star' : 'orb'; // 20% 刀扇
      particles.push({
        x, y,
        vx:Math.cos(ang)*v, vy:Math.sin(ang)*v,
        life:rand(56,84),
        alpha:1,
        size:rand(1.2,2.6),
        type,
        rot: rand(0, Math.PI*2),
        rotSpd: type==='star' ? rand(-0.10,0.10) : rand(-0.05,0.05),
        blades: (Math.random()<0.5 ? 6 : 7),
        tw: rand(0, Math.PI*2)
      });
    }
  }

  // 轨迹：只要圆点
  function addTrail(x,y,inten=2){
    for(let k=0;k<inten;k++){
      const ang=Math.random()*Math.PI*2, v=1.05*rand(0.6,1.0);
      const type = 'orb'; // ← 固定为圆点
      particles.push({
        x,y,
        vx:Math.cos(ang)*v, vy:Math.sin(ang)*v,
        life:rand(26,40), alpha:1,
        size:rand(1.0,2.2),
        type,
        rot: rand(0, Math.PI*2),
        rotSpd: rand(-0.05,0.05),
        blades: 6,
        tw: rand(0, Math.PI*2)
      });
    }
    if(particles.length>MAX_PARTICLES) particles.splice(0, particles.length-MAX_PARTICLES);
  }

  function drawOrb(p){
    const r=p.size*6.0;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
    g.addColorStop(0.00, 'rgba(40,0,80,'+Math.min(1,p.alpha*0.95)+')');
    g.addColorStop(0.35, 'rgba(120,0,180,'+Math.min(1,p.alpha*0.85)+')');
    g.addColorStop(0.75, 'rgba(15,0,30,0.35)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=p.alpha;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    ctx.restore();
  }

  // 旋转多尖刃（无中心孔）
  function drawSpinStar(p){
    const inner = p.size*2.2;
    const outer = p.size*7.8;
    const curve = 0.55;
    const blades = p.blades || 6;

    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.translate(p.x,p.y);
    ctx.rotate(p.rot||0);
    ctx.globalAlpha=p.alpha;

    const g=ctx.createRadialGradient(0,0,inner*0.3,0,0,outer);
    g.addColorStop(0.00,'rgba(20,0,30,0.9)');
    g.addColorStop(0.35,'rgba(90,0,140,0.85)');
    g.addColorStop(0.72,'rgba(150,0,220,0.9)');
    g.addColorStop(1.00,'rgba(0,0,0,0)');
    ctx.fillStyle=g;

    const stepAng=(Math.PI*2)/blades;
    ctx.beginPath();
    for(let i=0;i<blades;i++){
      const a0=i*stepAng;
      const a1=a0+stepAng*0.6;
      const aMid=(a0+a1)/2;
      const x0=Math.cos(a0)*inner, y0=Math.sin(a0)*inner;
      const x1=Math.cos(a1)*inner, y1=Math.sin(a1)*inner;
      const xt=Math.cos(aMid)*outer, yt=Math.sin(aMid)*outer;
      const c0x=Math.cos(a0+(aMid-a0)*curve)*(inner+(outer-inner)*0.55);
      const c0y=Math.sin(a0+(aMid-a0)*curve)*(inner+(outer-inner)*0.55);
      const c1x=Math.cos(a1-(a1-aMid)*curve)*(inner+(outer-inner)*0.55);
      const c1y=Math.sin(a1-(a1-aMid)*curve)*(inner+(outer-inner)*0.55);
      if(i===0) ctx.moveTo(x0,y0);
      ctx.quadraticCurveTo(c0x,c0y,xt,yt);
      ctx.quadraticCurveTo(c1x,c1y,x1,y1);
    }
    ctx.closePath(); ctx.fill();

    ctx.lineWidth=Math.max(0.6, p.size*0.35);
    ctx.strokeStyle='rgba(170,0,220,0.35)';
    ctx.stroke();
    ctx.restore();
  }

  // 更新
  function step(){
    const needLoop = running || glowLevel>0.02 || particles.length>0 || attractBack;
    if(!needLoop){ rafId=null; return; }
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    time += 1;
    glowLevel += (glowTarget - glowLevel)*0.12;

    // 中心位置（与爆发一致：略上移）
    const cx = w/2, cy = h/3;
    const radialPush = 0.0028;  // 外爆持续推力
    const accelAlong = 1.006;   // 爆散冲劲
    const noiseAmp = 0.06;      // 轻微湍流
    const G = 0.0038;           // ← 回吸引力（mouseleave 时启用）

    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];

      if(!attractBack){
        // 外爆：持续向外 + 噪声
        const dx = p.x - cx, dy = p.y - cy;
        const dist = Math.hypot(dx,dy) + 0.001;
        p.vx += (dx/dist) * radialPush;
        p.vy += (dy/dist) * radialPush;
        p.vx += Math.sin((time*0.09) + (p.tw||0))*noiseAmp*0.01;
        p.vy += Math.cos((time*0.11) + (p.tw||0))*noiseAmp*0.01;
        p.vx *= accelAlong; p.vy *= accelAlong;
      }else{
        // 回吸：朝中心吸
        const dx = cx - p.x, dy = cy - p.y;
        p.vx += dx * G;
        p.vy += dy * G;
      }

      // 移动 & 阻尼
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.988; p.vy *= 0.988;

      if(p.rotSpd) p.rot += p.rotSpd;
      p.life -= 1;
      p.alpha = Math.max(0, (p.type==='star' ? p.life/56 : p.life/50));

      if(p.x<6||p.y<6||p.x>w-6||p.y>h-6){ p.life=0; p.alpha=0; }
      if(p.alpha<=0){ particles.splice(i,1); continue; }

      (p.type==='star' ? drawSpinStar : drawOrb)(p);
    }
    rafId=requestAnimationFrame(step);
  }

  function ensureLoop(){ if(!rafId){ rafId=requestAnimationFrame(step); } }

  // 事件
  function onEnter(){
    attractBack = false;                 // ← 进入时关闭回吸
    running=true; glowTarget=1;
    addBurstCenter(30,3.0);
    ensureLoop();
  }
  function onMove(ev){
    const r=canvas.getBoundingClientRect();
    attractBack = false;                 // ← 移动时也关闭回吸（继续外爆）
    addTrail(ev.clientX-r.left, ev.clientY-r.top, 2);
    running=true; glowTarget=1; ensureLoop();
  }
  function onLeave(){
    // 开启回吸
    attractBack = true;                  // ← 鼠标移出时开始吸回
    running = true;                      // 保持循环直到粒子耗尽
    glowTarget = 0;                      // 逐渐收敛亮度
    ensureLoop();
  }

  cardEl.addEventListener('mouseenter', onEnter);
  cardEl.addEventListener('mousemove', onMove);
  cardEl.addEventListener('mouseleave', onLeave);
},





  // 保持你的扫光爆炸逻辑不变（黑紫色斜扫）
  explosion(cardEl, opts){
    opts = opts || {};
    const mode = opts.mode || 'hover';
    const appFX = (typeof getOrCreateFXApp === 'function') ? getOrCreateFXApp() : null;
    if (!appFX) return;

    function makeDarkSweep(w = 256, h = 1024, core = 0.95, soft = 0.60) {
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      const c = cvs.getContext('2d');
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0.00, 'rgba(0,0,0,0)');
      g.addColorStop(0.28, 'rgba(50,0,100,' + soft + ')');
      g.addColorStop(0.50, 'rgba(120,0,220,' + core + ')');
      g.addColorStop(0.72, 'rgba(25,0,60,' + soft + ')');
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      return PIXI.Texture.from(cvs);
    }

    const TEX = makeDarkSweep(256, 1024);

    const rect = cardEl.getBoundingClientRect();
    const container = new PIXI.Container();
    const centerX = rect.left + rect.width / 2 + window.scrollX;
    const centerY = rect.top + rect.height / 2 - rect.height * 0.06 + window.scrollY;
    appFX.stage.addChild(container);
    container.position.set(centerX, centerY);

    const sprite = new PIXI.Sprite(TEX);
    sprite.anchor.set(0.5, 0.5);
    sprite.alpha = 0.0;
    sprite.blendMode = PIXI.BLEND_MODES.ADD;

    const scaleY = rect.height / 800;
    sprite.scale.set(mode === 'click' ? 2.2 : 1.8, scaleY * (mode === 'click' ? 1.5 : 1.3));
    sprite.rotation = Math.PI / 9;

    try {
      const Bloom = PIXI.filters && (PIXI.filters.AdvancedBloomFilter || PIXI.filters?.AdvancedBloomFilter);
      if (Bloom) {
        container.filters = [new Bloom({
          threshold: 0.48,
          bloomScale: (mode === 'click' ? 2.3 : 2.0),
          brightness: (mode === 'click' ? 1.5 : 1.35),
          blur: (mode === 'click' ? 8 : 6)
        })];
      }
    } catch (e) {}

    container.addChild(sprite);
    const span = rect.width * (mode === 'click' ? 1.8 : 1.55);
    sprite.x = -span;

    const tl = gsap.timeline({
      onComplete() {
        appFX.stage.removeChild(container);
        container.destroy({ children: true });
      }
    });
    tl.to(sprite, { alpha: 1, duration: 0.12, ease: "power2.out" }, 0);
    tl.to(sprite, { x: span, duration: (mode === 'click' ? 0.72 : 0.6), ease: "power3.inOut" }, 0);
    tl.to(sprite, { alpha: 0, duration: 0.28, ease: "power2.in" }, (mode === 'click' ? 0.5 : 0.42));
  }
});



// === 风 / 气元素（小圆点：沿鼠标轨迹带状生成 + 少量全局生成；离开后吹完再停）===
FXModules.register('风', {
  hover(cardEl, canvas){
    if(!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    let running=false, rafId=null, time=0;
    let particles=[]; const MAX_PARTICLES=260;

    // 轨迹缓存（用于“鼠标移过的地方”带状生成）
    const PATH_LEN = 12;
    const path = []; // {x,y}

    // 配置
    const NOISE_SCALE = 0.0032;
    const FLOW_STRENGTH = 0.36;
    const BOUNDS_PAD = 10;

    function resize(){
      const r = cardEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      canvas.style.width = (w+16)+'px'; canvas.style.height=(h+16)+'px';
      canvas.width = Math.floor((w+16)*dpr); canvas.height = Math.floor((h+16)*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    try{ new ResizeObserver(resize).observe(cardEl); }catch(e){ window.addEventListener('resize', resize); }
    resize();

    const rand=(a,b)=>Math.random()*(b-a)+a;
    const clamp=(v,a,b)=>v<a?a:(v>b?b:v);

    // 全局风向（缓慢摆动）
    function globalWindDir(){
      return 0.25 + Math.sin(time*0.006)*0.28; // ≈10°~40°
    }
    // 流场角
    function flow(x,y,t){
      const s=NOISE_SCALE, u=x*s, v=y*s;
      const n1 = Math.sin(u*2.0 + t*0.010) + Math.cos(v*1.8 - t*0.012);
      const n2 = Math.sin((u+v)*1.1 - t*0.022)*0.7;
      return (n1*0.7 + n2*0.6)*0.45 + globalWindDir();
    }

    function spawnDot(x,y,dir){
      const spd = rand(0.7, 1.15);
      return {
        x, y,
        vx: Math.cos(dir)*spd,
        vy: Math.sin(dir)*spd,
        life: rand(100, 170),
        alpha: 1,
        size: rand(0.9, 1.7),
        tw: rand(0, Math.PI*2)
      };
    }

    // —— 关键：沿“鼠标移过的地方”带状生成（不在指针正下）——
    function addTrailFromPath(inten=3){
      if(path.length < 3) return;
      const dir = globalWindDir();
      for(let i=0;i<inten;i++){
        // 从历史路径中取一个较早的点（避开最新 1~2 个，防止“在指针上出现”）
        const idx = Math.max(0, Math.floor(rand(0, path.length-3)));
        const base = path[idx];
        // 在路径周围一个带状区域抖动（让“划过的地方会出现小圆点”）
        const jitterR = rand(8, 26);
        const jitterA = rand(0, Math.PI*2);
        const x = base.x + Math.cos(jitterA)*jitterR;
        const y = base.y + Math.sin(jitterA)*jitterR;
        particles.push(spawnDot(x,y, dir + rand(-0.20, 0.20)));
      }
    }

    // —— 少量全局生成（很稀疏，烘托空气感）——
function addSparseAmbient(count=2, prob=0.4){ // prob 是概率(0~1)
  if(Math.random() > prob) return; // 超过概率就不生成
  const r = canvas.getBoundingClientRect();
  const dir = globalWindDir();
  const side = Math.cos(dir) > 0 ? 'left' : 'right';
  for(let i=0;i<count;i++){
    const x = side==='left' ? BOUNDS_PAD : (r.width-BOUNDS_PAD);
    const y = rand(BOUNDS_PAD, r.height-BOUNDS_PAD);
    particles.push(spawnDot(x + rand(-3,3), y, dir + rand(-0.12, 0.12)));
  }
}

    function drawDot(p){
      const r = p.size*6.6;
      const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      g.addColorStop(0.00, 'rgba(255,255,255,'+Math.min(1,p.alpha*0.95)+')');
      g.addColorStop(0.35, 'rgba(220,245,255,'+Math.min(1,p.alpha*0.85)+')');
      g.addColorStop(0.75, 'rgba(170,220,255,'+Math.min(0.6,p.alpha*0.55)+')');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha = p.alpha;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      // 高光点
      ctx.globalAlpha = p.alpha * 0.85;
      ctx.beginPath();
      ctx.arc(p.x - r*0.20, p.y - r*0.20, Math.max(0.8, r*0.09), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.restore();
    }

    function step(){
      const needLoop = running || particles.length>0;
      if(!needLoop){ rafId=null; return; }

      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      time += 1;

      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        const ang = flow(p.x, p.y, time);
        // 风推动（不围鼠标）
        p.vx += Math.cos(ang) * FLOW_STRENGTH * 0.48;
        p.vy += Math.sin(ang) * FLOW_STRENGTH * 0.48;
        // 轻微湍动
        p.vx += Math.sin((time*0.10)+(p.tw||0))*0.02;
        p.vy += Math.cos((time*0.11)+(p.tw||0))*0.018;

        // 阻尼
        p.vx *= 0.986; p.vy *= 0.986;
        p.x += p.vx; p.y += p.vy;

        p.life -= 1;
        const flick = 0.78 + 0.22*Math.abs(Math.sin(time*0.15 + p.tw));
        p.alpha = Math.max(0, (p.life/120) * flick);

        // 边界裁剪
        if(p.x<BOUNDS_PAD || p.y<BOUNDS_PAD || p.x>w-BOUNDS_PAD || p.y>h-BOUNDS_PAD){ p.life=0; p.alpha=0; }
        if(p.alpha<=0){ particles.splice(i,1); continue; }
        drawDot(p);
      }

      // 控制总量
      if(particles.length > MAX_PARTICLES){
        particles.splice(0, particles.length - MAX_PARTICLES);
      }

      rafId = requestAnimationFrame(step);
    }
    function ensureLoop(){ if(!rafId){ rafId=requestAnimationFrame(step); } }

    // 事件：不在 mouseenter 里生成，只有移动才生成
    function onEnter(){ running = true; ensureLoop(); }
    function onMove(ev){
      const r=canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;

      // 记录路径
      path.push({x:mx, y:my});
      if(path.length > PATH_LEN) path.shift();

      // 生成：沿“鼠标移过的地方”的带状 + 少量全局
      addTrailFromPath(2);       // 主体出现在“划过区域”
      addSparseAmbient(1);       // 其他地方少量

      running = true;
      ensureLoop();
    }
    function onLeave(){
      running = false;           // 停止新增，但让现有粒子自然吹完/淡出
      // 不清空 particles，step 会在数组为空时自动停
      ensureLoop();
      // 清理路径缓存，避免下次进入沿用旧路径
      path.length = 0;
    }

    cardEl.addEventListener('mouseenter', onEnter);
    cardEl.addEventListener('mousemove', onMove);
    cardEl.addEventListener('mouseleave', onLeave);
  }
});

// === 地属性（土/石头：砂尘 + 碎石片；与星星完全不同风格） ===
FXModules.register('地', {
  /* ---------- HOVER：砂尘 + 碎石片 ---------- */
  /* ---------- HOVER：砂尘 + 碎石片（重做悬停效果） ---------- */
hover(cardEl, canvas){
  if(!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  let running = false, rafId = null, t = 0;
  const dust = [];      // 圆形砂尘
  const chips = [];     // 碎石片（矩形/三角形）
  const MAX_DUST  = 260;
  const MAX_CHIPS = 90;

  // 新增：悬停入场的“地表扬尘带”参数（替代原来的中心爆）
  let enterFX = 0;                  // >0 表示入场带仍在播放
  const ENTER_DURATION = 10;        // 入场时长（帧）
  let enterPulse = 0;               // 底部土层压暗脉冲强度

  function resize(){
    const r = cardEl.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    canvas.style.width = (w+16)+'px';
    canvas.style.height= (h+16)+'px';
    canvas.width = Math.floor((w+16)*dpr);
    canvas.height= Math.floor((h+16)*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function rand(a,b){ return Math.random()*(b-a)+a; }
  function pick(arr){ return arr[(Math.random()*arr.length)|0]; }

  // 颜色：赭石、褐黄、灰土
  const DUST_COLORS = [
    'rgba(194,155,93,',  // 褐黄
    'rgba(166,123,63,',  // 赭石
    'rgba(120,105,90,'   // 灰土
  ];
  const CHIP_FILLS = [0x8c6a3a, 0xa07a47, 0x6e5a48];

  function emitDust(x, y, k=3){
    for(let i=0;i<k;i++){
      const col = pick(DUST_COLORS) + rand(0.35,0.7) + ')';
      dust.push({
        x, y,
        vx: rand(-0.7, 0.9),
        vy: rand(-0.25, -0.1),
        g:  0.035,
        life: rand(48, 80),
        size: rand(1.4, 2.8),
        alpha: 1,
        tw: rand(0, Math.PI*2),
        color: col
      });
    }
    if(dust.length > MAX_DUST) dust.splice(0, dust.length - MAX_DUST);
  }

  function emitChips(x, y, k=5){
    for(let i=0;i<k;i++){
      const shape = Math.random()<0.55 ? 'tri' : 'rect';
      chips.push({
        x, y,
        vx: rand(-1.2, 1.2),
        vy: rand(-1.0, -0.3),
        g:  0.06,
        life: rand(50, 90),
        alpha: 1,
        w: rand(3.5, 7.5),
        h: rand(2.5, 6.0),
        rot: rand(0, Math.PI*2),
        vr: rand(-0.06, 0.06),
        color: pick(CHIP_FILLS),
        shape
      });
    }
    if(chips.length > MAX_CHIPS) chips.splice(0, chips.length - MAX_CHIPS);
  }

  // 新增：入场“扬尘带”——在底部宽区域随机点位轻微扬尘，避免中心爆
  function emitEnterDustBand(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const bandY = h * (0.005 + Math.sin((t*0.08))*0.02); // 底部 68% 附近随时间微起伏
    const count = 12 + Math.floor(10 * (enterFX/ENTER_DURATION)); // 前期多、后期少
    for(let i=0;i<count;i++){
      const x = rand(8, w-8);
      const y = bandY + rand(-6, 10);
      emitDust(x, y, 1);
      if(Math.random()<0.10) emitChips(x + rand(-4,4), y + rand(-2,2), 1); // 偶发小碎石
    }
  }

  function drawDust(p){
    const r = p.size*5.5;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.25, p.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = p.alpha;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }

  function drawChip(c){
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = `#${c.color.toString(16).padStart(6,'0')}`;
    ctx.strokeStyle = 'rgba(224,200,160,0.35)';
    ctx.lineWidth = 0.6;
    if(c.shape === 'rect'){
      const hw = c.w*0.5, hh = c.h*0.5;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh);
      ctx.lineTo(hw, hh);   ctx.lineTo(-hw, hh);
      ctx.closePath();
    }else{
      const r = Math.max(c.w, c.h);
      const a = rand(0, Math.PI*2);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      ctx.lineTo(Math.cos(a+2.3)*r*0.78, Math.sin(a+2.3)*r*0.78);
      ctx.lineTo(Math.cos(a+4.1)*r*0.65, Math.sin(a+4.1)*r*0.65);
      ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // 底部“土层”压暗：加入入场脉冲增强（enterPulse）
  function drawStrata(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const baseAlpha = 0.28 + enterPulse; // 原 0.28 基础上加一点脉冲
    const grd = ctx.createLinearGradient(0, h*0.6, 0, h);
    grd.addColorStop(0.0, 'rgba(40,32,22,0.00)');
    grd.addColorStop(1.0, `rgba(40,32,22,${baseAlpha.toFixed(3)})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.08 + enterPulse*0.4;
    for(let i=0;i<4;i++){
      const y = h*0.55 + i*(h*0.08) + Math.sin((t*0.02)+i)*2;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;
  }

  function step(){
    const need = running || dust.length>0 || chips.length>0 || enterFX>0;
    if(!need){ rafId=null; return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    t++;

    // 入场扬尘带：在进入的前几十帧播放
    if(enterFX > 0){
      emitEnterDustBand();
      enterFX--;
    }
    // 入场脉冲：随 enterFX 衰减
    enterPulse = (enterFX>0) ? 0.12 * (enterFX/ENTER_DURATION) : Math.max(0, enterPulse*0.92);

    // 更新砂尘
    for(let i=dust.length-1;i>=0;i--){
      const p = dust[i];
      p.vy += p.g;
      p.x  += p.vx + Math.sin((t*0.03)+p.tw)*0.06;
      p.y  += p.vy;
      p.life -= 1;
      p.alpha = Math.max(0, p.life/64);
      if(p.x<6||p.y<6||p.x>w-6||p.y>h-6) p.alpha=0;
      if(p.alpha<=0){ dust.splice(i,1); continue; }
      drawDust(p);
    }

    // 更新碎石片
    for(let j=chips.length-1;j>=0;j--){
      const c = chips[j];
      c.vy += c.g;
      c.x  += c.vx;
      c.y  += c.vy;
      c.rot+= c.vr;
      c.life -= 1;
      c.alpha = Math.max(0, c.life/80);
      if(c.x<6||c.y<6||c.x>w-6||c.y>h-6) c.alpha=0;
      if(c.alpha<=0){ chips.splice(j,1); continue; }
      drawChip(c);
    }

    drawStrata();
    rafId = requestAnimationFrame(step);
  }
  function ensure(){ if(!rafId) rafId = requestAnimationFrame(step); }

  // 悬停：不再中心爆，改为启动底部“扬尘带”与脉冲
  function onEnter(){
    running = true; ensure();
    enterFX = ENTER_DURATION;          // 播放入场带
    // 不再 emitChips/emitDust（删除中心爆）
  }
  // 鼠标滑过（保留你原来的感觉）
  function onMove(ev){
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    emitDust(x, y, 3);
    if(Math.random()<0.22) emitChips(x, y, 2);
    running = true; ensure();
  }
  function onLeave(){ running = false; ensure(); }

  cardEl.addEventListener('mouseenter', onEnter);
  cardEl.addEventListener('mousemove', onMove);
  cardEl.addEventListener('mouseleave', onLeave);
  try{ const ro=new ResizeObserver(resize); ro.observe(cardEl);}catch(e){ window.addEventListener('resize', resize); }
  resize();
},

  /* ---------- EXPLOSION：断层冲击环 + 石片飞散 + 土尘 ---------- */
  explosion(cardEl, opts){
    const app = (typeof getOrCreateFXApp === 'function') ? getOrCreateFXApp() : null;
    if(!app) return;

    const rect = cardEl.getBoundingClientRect();
    const cx = rect.left + rect.width/2 + window.scrollX;
    const cy = rect.top  + rect.height/2 + window.scrollY;

    const container = new PIXI.Container();
    container.position.set(cx, cy);
    app.stage.addChild(container);

    // 冲击环（暖黄褐渐变）
    function ringTex(size=320){
      const cvs=document.createElement('canvas'); cvs.width=cvs.height=size;
      const c=cvs.getContext('2d');
      const g=c.createRadialGradient(size/2,size/2,size*0.18, size/2,size/2,size*0.5);
      g.addColorStop(0.00,'rgba(255,240,210,0.85)');
      g.addColorStop(0.25,'rgba(210,170,110,0.55)');
      g.addColorStop(0.65,'rgba(130,100,70,0.18)');
      g.addColorStop(1.00,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(size/2,size/2,size*0.5,0,Math.PI*2); c.fill();
      return PIXI.Texture.from(cvs);
    }
    const ring = new PIXI.Sprite(ringTex());
    ring.anchor.set(0.5); ring.alpha=0;
    ring.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(ring);

    // 土尘纹理
    function dustTex(){
      const cvs=document.createElement('canvas'); cvs.width=cvs.height=64;
      const c=cvs.getContext('2d');
      const g=c.createRadialGradient(32,32,0,32,32,28);
      g.addColorStop(0,'rgba(255,255,255,0.05)');
      g.addColorStop(0.25,'rgba(190,150,95,0.5)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(32,32,28,0,Math.PI*2); c.fill();
      return PIXI.Texture.from(cvs);
    }
    const dTex = dustTex();

    // 碎石片（三角石）
    function shard(color=0x8c6a3a){
      const g=new PIXI.Graphics();
      const r=7+Math.random()*11;
      g.beginFill(color, 0.96);
      g.lineStyle(0.6, 0xe0c8a0, 0.65);
      const a=Math.random()*Math.PI*2;
      g.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      g.lineTo(Math.cos(a+2.2)*r*0.86, Math.sin(a+2.2)*r*0.86);
      g.lineTo(Math.cos(a+4.1)*r*0.72, Math.sin(a+4.1)*r*0.72);
      g.closePath();
      return g;
    }

    const shards=[], dusts=[];
    const shardCount = 16, dustCount = 30;
    for(let i=0;i<shardCount;i++){
      const s=shard(Math.random()<0.5?0x8c6a3a:0xa07a47);
      s.x=0; s.y=0; s.alpha=1;
      s.vx = (Math.random()*2-1) * rect.width*0.024;
      s.vy = (Math.random()*2-0.4) * -rect.height*0.032;
      s.g  = 0.72; s.vr = (Math.random()*2-1)*0.14;
      container.addChild(s); shards.push(s);
    }
    for(let i=0;i<dustCount;i++){
      const sp=new PIXI.Sprite(dTex);
      sp.anchor.set(0.5);
      sp.scale.set(0.55+Math.random()*0.85);
      sp.alpha=0.95; sp.blendMode=PIXI.BLEND_MODES.ADD;
      sp.x=0; sp.y=0;
      const ang=Math.random()*Math.PI*2;
      const spd=rect.width*0.008 + Math.random()*rect.width*0.02;
      sp.vx=Math.cos(ang)*spd;
      sp.vy=Math.sin(ang)*spd*0.62 - rect.height*0.016;
      sp.g=0.4;
      container.addChild(sp); dusts.push(sp);
    }

    // 轻微 Bloom（石尘发光）
    try{
      const Bloom = PIXI.filters && (PIXI.filters.AdvancedBloomFilter || PIXI.filters?.AdvancedBloomFilter);
      if(Bloom){ container.filters = [ new Bloom({ threshold:0.5, bloomScale:1.6, brightness:1.22, blur:5 }) ]; }
    }catch(e){}

    // 时间轴：冲击环 + 淡出
    gsap.timeline({
      onComplete(){ app.stage.removeChild(container); container.destroy({children:true}); }
    })
    .to(ring, { alpha:1, duration:0.10, ease:"power2.out" }, 0)
    .fromTo(ring.scale, { x:0.6, y:0.6 }, { x:1.7, y:1.18, duration:0.62, ease:"power3.out" }, 0)
    .to(ring, { alpha:0, duration:0.30, ease:"power2.in" }, 0.36);

    // 简化物理（重力下落）
    const ticker = new PIXI.Ticker(); let life=0;
    ticker.add((delta)=>{
      life+=delta;
      for(const s of shards){
        s.vy += s.g * 0.05 * delta;
        s.x  += s.vx * delta;
        s.y  += s.vy * delta;
        s.rotation += s.vr * delta;
        s.alpha *= 0.992;
      }
      for(const sp of dusts){
        sp.vy += sp.g * 0.05 * delta;
        sp.x  += sp.vx * delta;
        sp.y  += sp.vy * delta;
        sp.alpha *= 0.988;
      }
      if(life > 52){ ticker.stop(); ticker.destroy(); }
    });
    ticker.start();
  }
});
// === 光属性（沿用当前默认的星火/星形 + 掠光扫过）===
FXModules.register('光', {
  hover(cardEl, canvas){
    // 直接复用你文件里的默认 Hover（星火/星形粒子）
    defaultHoverSetup(cardEl, canvas);
  },
  explosion(cardEl, opts){
    // 直接复用你文件里的默认 Explosion（掠光扫过）
    defaultExplosion(cardEl, opts);
  }
});
// === 全部属性（彩虹）：多彩小圆点 + 彩虹扫光 ===
FXModules.register('全部', {
  /* ---------- HOVER：彩虹小圆点（入场小爆 + 滑过尾迹），离开后自然淡出 ---------- */
  hover(cardEl, canvas){
    if(!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    let running=false, rafId=null, time=0;
    let particles=[]; 
    const MAX_PARTICLES = 320; // 彩虹更绚，稍微给多点上限
    let glowLevel = 0, glowTarget = 0;

    function resize(){
      const r = cardEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      canvas.style.width = (w+16)+'px'; 
      canvas.style.height = (h+16)+'px';
      canvas.width = Math.floor((w+16)*dpr); 
      canvas.height = Math.floor((h+16)*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function rand(a,b){ return Math.random()*(b-a)+a; }
    try{ new ResizeObserver(resize).observe(cardEl); }catch(e){ window.addEventListener('resize', resize); }
    resize();

    // —— 粒子创建（h = 0~360 的色相）——
    function spawnOrb(x,y, hue){
      const spd = rand(0.75, 1.35);
      return {
        x, y,
        vx: Math.cos(rand(0, Math.PI*2))*spd,
        vy: Math.sin(rand(0, Math.PI*2))*spd,
        life: rand(60, 100),
        alpha: 1,
        size: rand(1.0, 2.2),
        hue,
        tw: rand(0, Math.PI*2)
      };
    }

    // 入场彩虹小爆（中心略上）
    function addBurstCenter(count=30, speed=2.5){
      const r = canvas.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 3;
      for(let i=0;i<count;i++){
        const hue = (i / count) * 360 + rand(-12, 12);
        const ang = Math.random()*Math.PI*2, v = speed * rand(1.0, 1.6);
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(ang)*v, vy: Math.sin(ang)*v,
          life: rand(60, 92),
          alpha: 1,
          size: rand(1.1, 2.4),
          hue, tw: rand(0, Math.PI*2)
        });
      }
    }

    // 尾迹：跟鼠标，色相沿时间缓慢循环，形成彩虹拖尾
    function addTrail(x,y,inten=3){
      const baseHue = (time*2) % 360; // 时间推进色相
      for(let k=0;k<inten;k++){
        const h = (baseHue + rand(-30,30) + k*12) % 360;
        particles.push(spawnOrb(x + rand(-1.5,1.5), y + rand(-1.5,1.5), h));
      }
      if(particles.length>MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    }

    // 绘制：彩色光晕小圆
    function drawOrb(p){
      const r = p.size*7.0;
      const c1 = `hsla(${(p.hue)%360}, 95%, 72%, ${Math.min(1,p.alpha*0.95)})`;
      const c2 = `hsla(${(p.hue+12)%360}, 95%, 55%, ${Math.min(1,p.alpha*0.85)})`;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = p.alpha;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0.00, c1);
      g.addColorStop(0.45, c2);
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle = g; ctx.fill();
      // 小高光
      ctx.globalAlpha = p.alpha * 0.9;
      ctx.beginPath();
      ctx.arc(p.x - r*0.22, p.y - r*0.22, Math.max(0.8, r*0.10), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.restore();
    }

    function step(){
      const needLoop = running || glowLevel>0.02 || particles.length>0;
      if(!needLoop){ rafId=null; return; }
      const w=canvas.clientWidth,h=canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      time += 1;
      glowLevel += (glowTarget - glowLevel)*0.12;

      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        // 轻微彩风扰动（非鼠标吸附）
        p.vx += Math.sin((time*0.10)+(p.tw||0))*0.02;
        p.vy += Math.cos((time*0.12)+(p.tw||0))*0.018;
        // 阻尼 + 移动
        p.vx *= 0.986; p.vy *= 0.986;
        p.x += p.vx; p.y += p.vy;

        p.life -= 1;
        const flick = 0.75 + 0.25*Math.abs(Math.sin(time*0.15 + p.tw));
        p.alpha = Math.max(0, (p.life/80) * flick);

        if(p.x<6||p.y<6||p.x>w-6||p.y>h-6){ p.alpha = 0; }
        if(p.alpha<=0){ particles.splice(i,1); continue; }
        drawOrb(p);
      }

      rafId = requestAnimationFrame(step);
    }
    function ensureLoop(){ if(!rafId){ rafId=requestAnimationFrame(step); } }

    function onEnter(){ running = true; glowTarget = 1; addBurstCenter(28, 2.6); ensureLoop(); }
    function onMove(ev){
      const r=canvas.getBoundingClientRect();
      addTrail(ev.clientX-r.left, ev.clientY-r.top, 3);
      running = true; glowTarget = 1; ensureLoop();
    }
    function onLeave(){ running = false; glowTarget = 0; ensureLoop(); }

    cardEl.addEventListener('mouseenter', onEnter);
    cardEl.addEventListener('mousemove', onMove);
    cardEl.addEventListener('mouseleave', onLeave);
  },

  /* ---------- EXPLOSION：彩虹斜向扫光（多色渐变） ---------- */
  explosion(cardEl, opts){
    opts = opts || {};
    const mode = opts.mode || 'hover';
    const appFX = (typeof getOrCreateFXApp === 'function') ? getOrCreateFXApp() : null;
    if(!appFX) return;

    // 生成彩虹横向渐变纹理
    function makeRainbowSweep(w=384, h=1024, core=0.95, soft=0.60){
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      const c = cvs.getContext('2d');
      const g = c.createLinearGradient(0, 0, w, 0);
      const stops = [
        [0.00, `rgba(255, 60, 60, ${soft})`],    // 红
        [0.16, `rgba(255, 150, 50, ${core})`],   // 橙
        [0.33, `rgba(255, 230, 60, ${soft})`],   // 黄
        [0.50, `rgba(60, 220, 120, ${core})`],   // 绿
        [0.66, `rgba(60, 190, 255, ${soft})`],   // 青
        [0.83, `rgba(100, 110, 255, ${core})`],  // 蓝
        [1.00, `rgba(220, 80, 255, ${soft})`]    // 紫
      ];
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      for(const [pos,col] of stops){ g.addColorStop(pos, col); }
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0,0,w,h);
      return PIXI.Texture.from(cvs);
    }
    const TEX = makeRainbowSweep(384,1024, (mode==='click'?1.0:0.95), (mode==='click'?0.72:0.60));

    const rect = cardEl.getBoundingClientRect();
    const container = new PIXI.Container();
    const centerX = rect.left + rect.width/2 + window.scrollX;
    const centerY = rect.top + rect.height/2 - rect.height*0.04 + window.scrollY; // 略上移
    appFX.stage.addChild(container);
    container.position.set(centerX, centerY);

    const sprite = new PIXI.Sprite(TEX);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.0;
    sprite.blendMode = PIXI.BLEND_MODES.ADD;

    const scaleY = rect.height / 800;
    sprite.scale.set(mode==='click' ? 2.2 : 1.9, scaleY * (mode==='click' ? 1.55 : 1.35));
    sprite.rotation = Math.PI/9;

    // 轻微 Bloom，增强彩色发光
    try{
      const Bloom = PIXI.filters && (PIXI.filters.AdvancedBloomFilter || PIXI.filters?.AdvancedBloomFilter);
      if(Bloom){
        container.filters = [ new Bloom({
          threshold:0.48,
          bloomScale:(mode==='click'?2.2:1.9),
          brightness:(mode==='click'?1.45:1.30),
          blur:(mode==='click'?7:6)
        }) ];
      }
    }catch(e){}

    container.addChild(sprite);
    const span = rect.width * (mode==='click' ? 1.8 : 1.55);
    sprite.x = -span;

    const tl = gsap.timeline({
      onComplete(){ appFX.stage.removeChild(container); container.destroy({children:true}); }
    });
    tl.to(sprite, { alpha: 1, duration: 0.10, ease: "power2.out" }, 0);
    tl.to(sprite, { x: span,  duration: (mode==='click'? 0.70 : 0.58), ease: "power3.inOut" }, 0);
    tl.to(sprite, { alpha: 0, duration: 0.26, ease: "power2.in" }, (mode==='click'? 0.50 : 0.42));
  }
});
})();