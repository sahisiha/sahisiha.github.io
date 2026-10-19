// ŞAHİ SİHA giriş sayfası: sürükleyerek döndürülen 3B uçak (three.js r170, vendor/).
// Giriş formu hazır olduktan sonra dinamik import ile yüklenir; hata olursa yalnız arka plan resmi kalır.
import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.module.js';

const DEF_YAW = -2.25, DEF_PITCH = 0.36;          // varsayılan poz: burun izleyiciye ve sola, hafif üstten
const PITCH_MIN = -0.55, PITCH_MAX = 1.0;
const IDLE_SPIN = 0.22;                            // rad/s, boşta yavaş dönüş
const IDLE_AFTER = 2600;                           // ms
const DRAG_THRESHOLD = 6;                          // px; altı tıklama/kaydırma sayılır


// ---- itici (pusher) motor + pervane: SunnySky X4120 (Ø41 × 45 mm can) + EOLO 15×8 iki pal (Ø381 mm, hatve 203 mm).
// Konum GLB çerçevesinde: CAD motor yüzü model x=-0.611 m, itki ekseni model z≈-0.042 m; GLB = (x+0.048, z-0.0266, -y).
const ENG = {x0: -0.563, y: -0.0687, can: 0.045, rCan: 0.0205, R: 0.1905, pitch: 0.2032};
function buildEngine() {
  const g = new THREE.Group();
  const dark = new THREE.MeshPhysicalMaterial({name: 'motor_can', color: 0x16181c, metalness: 0.7, roughness: 0.35, clearcoat: 0.4});
  const silver = new THREE.MeshPhysicalMaterial({name: 'motor_ring', color: 0xc9ced6, metalness: 1, roughness: 0.25});
  const carbon = new THREE.MeshPhysicalMaterial({name: 'prop', color: 0x121417, metalness: 0.2, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.3, side: THREE.DoubleSide});
  const along = geo => geo.rotateZ(Math.PI / 2);                 // silindir eksenini Y'den X'e çevir
  const xc = ENG.x0 - ENG.can / 2;
  const can = new THREE.Mesh(along(new THREE.CylinderGeometry(ENG.rCan, ENG.rCan, ENG.can, 40, 1)), dark);
  can.position.set(xc, ENG.y, 0); g.add(can);
  for (const [dx, w] of [[-ENG.can / 2 + 0.004, 0.005], [ENG.can / 2 - 0.009, 0.004]]) {   // gümüş halkalar
    const ring = new THREE.Mesh(along(new THREE.CylinderGeometry(ENG.rCan + 0.0008, ENG.rCan + 0.0008, w, 40, 1)), silver);
    ring.position.set(xc + dx, ENG.y, 0); g.add(ring);
  }
  const shaft = new THREE.Mesh(along(new THREE.CylinderGeometry(0.004, 0.004, 0.024, 12)), silver);
  shaft.position.set(ENG.x0 - ENG.can - 0.010, ENG.y, 0); g.add(shaft);

  const prop = new THREE.Group();
  prop.position.set(ENG.x0 - ENG.can - 0.016, ENG.y, 0);
  const hub = new THREE.Mesh(along(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 24)), carbon);
  prop.add(hub);
  const spinner = new THREE.Mesh(new THREE.LatheGeometry(
    Array.from({length: 13}, (_, i) => { const t = i / 12; return new THREE.Vector2(0.0145 * Math.sqrt(Math.max(0, 1 - t * t)), -t * 0.032); }), 28), silver);
  spinner.rotation.z = -Math.PI / 2; spinner.position.x = -0.007;     // ucu arkaya (-X)
  prop.add(spinner);
  const blade = bladeGeometry();
  for (const a of [0, Math.PI]) { const b = new THREE.Mesh(blade, carbon); b.rotation.x = a; prop.add(b); }
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.03, ENG.R, 72, 1).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({color: 0x0a0d12, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide}));
  prop.add(disc);
  g.add(prop);
  return {group: g, prop, disc};
}
// burulmuş, sivrilen pal: istasyonlarda ince profil kesiti, hatve açısı β = atan(P / 2πr)
function bladeGeometry() {
  const NS = 22, NP = 14, r0 = 0.013, R = ENG.R;
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const u = i / NS, r = r0 + (R - r0) * u, x = r / R;
    let c = 0.034 * (0.42 + 0.58 * Math.exp(-(((x - 0.36) / 0.34) ** 2)));
    if (x > 0.86) c *= Math.sqrt(Math.max(0.04, (1 - x) / 0.14));   // yuvarlak uç
    if (x < 0.16) c *= 0.55 + 0.45 * (x / 0.16);                    // göbeğe doğru daralan kök
    const th = c * (x < 0.16 ? 0.30 : 0.13 - 0.07 * x);
    const beta = Math.atan(ENG.pitch / (2 * Math.PI * r));
    const cb = Math.cos(beta), sb = Math.sin(beta);
    for (let j = 0; j < NP; j++) {
      const a = (j / NP) * Math.PI * 2;
      const sc = 0.5 * Math.cos(a);                                  // kiriş boyunca (-0.5 firar, +0.5 hücum)
      const camber = 0.04 * c * (1 - 4 * sc * sc);
      const st = 0.5 * th * Math.sin(a) * (0.6 + 0.4 * (sc + 0.5)) + camber;  // kalınlık + hafif kamburluk
      const lc = sc * c, ln = st;
      // kiriş yönü: cosβ·Z (dönme yönü) + sinβ·(-X) (itici: hava arkaya)
      pos.push(-lc * sb + ln * cb, r, lc * cb + ln * sb);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) {
    const a = i * NP + j, b = i * NP + (j + 1) % NP, c2 = a + NP, d = b + NP;
    idx.push(a, c2, b, b, c2, d);
  }
  const tip = pos.length / 3; pos.push(...pos.slice(NS * NP * 3, NS * NP * 3 + 3).map((v, k) => k === 1 ? R + 0.002 : v));
  for (let j = 0; j < NP; j++) idx.push(NS * NP + j, tip, NS * NP + (j + 1) % NP);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
const PROP_SPEED = 9;                               // rad/s: görünür, orta hızlı dönüş (gerçek devir değil)

export function mount(host) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.className = 'h3d';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  // ışıklar: yumuşak ana ışık + soğuk mavi kontur (rim) + gökyüzü/zemin dolgusu
  scene.add(new THREE.HemisphereLight(0xdbeaff, 0x0b2a66, 0.4));
  const key = new THREE.DirectionalLight(0xfff6ea, 3.1); key.position.set(-2.2, 3.2, 3.0); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd0ff, 2.6); rim.position.set(2.5, 1.2, -3.2); scene.add(rim);
  const under = new THREE.DirectionalLight(0x5f8de0, 0.5); under.position.set(0, -3, 1); scene.add(under);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  const pitchG = new THREE.Group(), yawG = new THREE.Group(), floatG = new THREE.Group();
  floatG.add(pitchG); pitchG.add(yawG); scene.add(floatG);

  // altında yumuşak gölge (radyal degrade), hafif mavi ışıma
  const sh = document.createElement('canvas'); sh.width = sh.height = 128;
  const g = sh.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(2,10,40,0.55)'); grd.addColorStop(0.55, 'rgba(2,10,40,0.18)'); grd.addColorStop(1, 'rgba(2,10,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(sh);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.15),
    new THREE.MeshBasicMaterial({map: shadowTex, transparent: true, depthWrite: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.42;
  scene.add(shadow);

  let radius = 1, engine = null;
  let yaw = DEF_YAW, pitch = DEF_PITCH, vYaw = 0, vPitch = 0;
  let lastInput = -1e9, resetAnim = null, loaded = false, running = false, visible = true, raf = 0, t0 = performance.now(), last = t0;

  host.appendChild(canvas);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // uçak yatayda geniş, dikeyde ince: genişliğe ~%70, yüksekliğe ~%60 sığdır
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const fitH = radius * 0.8 / tv;
    const fitW = radius * 0.95 / (tv * camera.aspect);
    const d = Math.max(fitH, fitW) * 1.15;
    camera.position.set(0, d * 0.06, d);
    camera.lookAt(0, -radius * 0.02, 0);
    camera.updateProjectionMatrix();
    renderOnce();
  }

  function apply(now) {
    pitchG.rotation.x = pitch;
    yawG.rotation.y = yaw;
    floatG.position.y = reduce.matches ? 0 : Math.sin((now - t0) / 1400) * 0.018;
    if (engine) { engine.disc.visible = !reduce.matches; if (!reduce.matches) engine.prop.rotation.x = ((now - t0) / 1000 * PROP_SPEED) % (2 * Math.PI); }
    shadow.scale.setScalar(1 - floatG.position.y * 2);
  }
  function renderOnce() { if (loaded) { apply(performance.now()); renderer.render(scene, camera); } }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const idle = now - lastInput > IDLE_AFTER && !dragging;
    if (resetAnim) {
      const k = Math.min(1, (now - resetAnim.t) / 700), e = 1 - Math.pow(1 - k, 3);
      yaw = resetAnim.y + (resetAnim.ty - resetAnim.y) * e;
      pitch = resetAnim.p + (DEF_PITCH - resetAnim.p) * e;
      if (k >= 1) resetAnim = null;
    } else if (!dragging) {
      if (reduce.matches) { vYaw = vPitch = 0; }
      else {
        const damp = Math.exp(-dt * 3.2);
        vYaw *= damp; vPitch *= damp;
        if (idle) {                                      // boşta: yavaşça dön, eğimi varsayılana getir
          vYaw += (IDLE_SPIN - vYaw) * Math.min(1, dt * 0.8);
          pitch += (DEF_PITCH - pitch) * Math.min(1, dt * 0.9);
        }
        yaw += vYaw * dt; pitch += vPitch * dt;
        if (pitch < PITCH_MIN || pitch > PITCH_MAX) { pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch)); vPitch = 0; }
      }
    }
    apply(now);
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }
  function needsLoop() { return loaded && visible && !document.hidden && (!reduce.matches || dragging || !!resetAnim); }
  function update() {
    const want = needsLoop();
    if (want && !running) { running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; renderOnce(); }
  }

  // ---- sürükleme (fare + dokunma). Dokunmada dikey kaydırma sayfaya kalır (CSS touch-action: pan-y).
  let dragging = false, pid = null, sx = 0, sy = 0, px = 0, py = 0, pt = 0, armed = false;
  const scale = () => 4.2 / Math.max(260, Math.min(host.clientWidth, host.clientHeight * 1.4));
  canvas.addEventListener('pointerdown', e => {
    if (!loaded || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pid = e.pointerId; armed = true; sx = px = e.clientX; sy = py = e.clientY; pt = performance.now();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pid || !armed) return;
    const now = performance.now();
    if (!dragging) {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) { armed = false; return; }  // dikey: sayfa kaysın
      dragging = true; resetAnim = null; vYaw = vPitch = 0;
      try { canvas.setPointerCapture(pid); } catch (err) {}
      host.classList.add('dragging', 'used');
      px = e.clientX; py = e.clientY; pt = now;
      update();
    }
    const k = scale(), dx = e.clientX - px, dy = e.clientY - py, dts = Math.max(0.008, (now - pt) / 1000);
    yaw += dx * k;
    if (e.pointerType === 'mouse') pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * k));
    vYaw = 0.6 * vYaw + 0.4 * (dx * k / dts);
    vPitch = e.pointerType === 'mouse' ? 0.6 * vPitch + 0.4 * (dy * k / dts) : 0;
    px = e.clientX; py = e.clientY; pt = now; lastInput = now;
    if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  });
  function end(e) {
    if (e.pointerId !== pid) return;
    if (dragging && performance.now() - pt > 90) vYaw = vPitch = 0;   // bırakmadan önce durduysa savrulma yok
    vYaw = Math.max(-9, Math.min(9, vYaw)); vPitch = Math.max(-5, Math.min(5, vPitch));
    dragging = false; armed = false; pid = null; lastInput = performance.now();
    host.classList.remove('dragging');
    update();
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('dblclick', () => {
    // en yakın tam turdaki varsayılan yöne dön
    const ty = DEF_YAW + Math.round((yaw - DEF_YAW) / (2 * Math.PI)) * 2 * Math.PI;
    resetAnim = {t: performance.now(), y: yaw, p: pitch, ty}; vYaw = vPitch = 0; lastInput = performance.now();
    update();
  });

  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; update(); });
  io.observe(host);
  const onVis = () => update();
  document.addEventListener('visibilitychange', onVis);
  reduce.addEventListener && reduce.addEventListener('change', onVis);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dispose(); });

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.load(new URL('assets/sahi-siha.glb', document.baseURI).href, gltf => {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
    root.position.sub(c);
    radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    shadow.position.y = -(box.max.y - box.min.y) / 2 - radius * 0.32;
    shadow.scale.set(radius * 1.05, radius * 1.05, 1);
    // gri (gunmetal) gövde, hafif metalik + vernik; seyir fenerleri renkleri ve koyu parçalar korunur
    const LOOK = {
      body:      {color: 0x9aa4af, metalness: 0.45, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.22},
      ailerons:  {color: 0x23272d, metalness: 0.3, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4},
      motor:     {color: 0x1b1e23, metalness: 0.6, roughness: 0.35},
      tip_left:  {color: 0xd0261c, metalness: 0.1, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2},
      tip_right: {color: 0x1f9b3c, metalness: 0.1, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2},
      nose_dome: {color: 0x5aa6cf, metalness: 0.2, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8},
    };
    root.traverse(o => {
      if (o.isMesh && o.material) {
        const old = o.material, look = LOOK[old.name];
        if (look) {
          const {color, ...rest} = look;
          o.material = new THREE.MeshPhysicalMaterial({name: old.name, color: new THREE.Color(color), side: THREE.DoubleSide, ...rest});
          old.dispose();
        } else old.side = THREE.DoubleSide;
      }
    });
    engine = buildEngine();
    root.add(engine.group);                  // gövde çerçevesinde (merkezleme sonrası da aynı ofset)
    yawG.add(root);
    loaded = true;
    resize();
    renderOnce();
    host.classList.add('ready');
    update();
  }, undefined, () => dispose());

  function dispose() {
    running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    envTex.dispose(); shadowTex.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) {}
    canvas.remove();
    host.classList.remove('ready', 'dragging');
  }
  return {dispose};
}

// index.html bu modülü giriş formu görünür olduktan sonra <script type="module"> ile ekler.
const host = document.getElementById('hero3d'), login = document.getElementById('login');
if (host && login && !login.hidden && !window.SahiHero) {
  try { window.SahiHero = mount(host); } catch (e) { window.SahiHero = null; }
}
