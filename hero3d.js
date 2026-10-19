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

  let radius = 1;
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
