// ŞAHİ SİHA giriş sayfası arka plan efektleri: yarım ton (halftone) nokta alanı + fareyle hafif paralaks ve kart eğimi.
// Giriş/şifre çözme kodundan bağımsızdır; burada bir hata olursa yalnız süsler eksik kalır.
(() => {
  const login = document.getElementById('login');
  const dots = document.getElementById('dots');
  if (!login || !dots) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');

  // ---- yarım ton noktalar: kenarlarda/köşelerde yoğun, ortada (uçağın arkası) boş
  function draw() {
    const w = dots.clientWidth, h = dots.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dots.width = Math.round(w * dpr); dots.height = Math.round(h * dpr);
    const g = dots.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const step = w < 600 ? 7 : 9, rmax = step * 0.48;
    const cx = w * 0.42, cy = h * 0.48;
    g.fillStyle = 'rgba(22,24,80,0.55)';
    for (let y = step / 2, row = 0; y < h; y += step * 0.866, row++) {
      for (let x = (row % 2) * step / 2; x < w + step; x += step) {
        const nx = (x - cx) / (w * 0.62), ny = (y - cy) / (h * 0.62);
        const d = Math.sqrt(nx * nx + ny * ny);                 // 0 merkez, ~1 köşe
        const diag = 0.5 + 0.5 * Math.sin((x / w) * 2.2 + (y / h) * 1.4 - 0.4);  // köşegen dalga: sol üst + sağ alt yoğun
        let f = (d - 0.5) / 0.6; f = f <= 0 ? 0 : Math.min(1, f) ** 1.25 * (0.55 + 0.45 * diag);
        const r = rmax * f;
        if (r < 0.35) continue;
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
    }
  }
  let rt = 0;
  new ResizeObserver(() => { cancelAnimationFrame(rt); rt = requestAnimationFrame(draw); }).observe(dots);

  // ---- kart eğimi + paralaks yalnız fare ile ve hareket azaltılmamışsa
  const tilt = () => login.classList.toggle('tilt', fine.matches && !reduce.matches);
  tilt();
  fine.addEventListener && fine.addEventListener('change', tilt);
  reduce.addEventListener && reduce.addEventListener('change', tilt);

  // ---- paralaks: --px/--py (-1..1) yumuşak takip; yalnız fare, hareket azaltılmamışsa
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  function tick() {
    x += (tx - x) * 0.08; y += (ty - y) * 0.08;
    login.style.setProperty('--px', x.toFixed(4));
    login.style.setProperty('--py', y.toFixed(4));
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
  }
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reduce.matches || !fine.matches || login.hidden) return;
    tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1;
    if (!raf) raf = requestAnimationFrame(tick);
  }, {passive: true});
  document.addEventListener('mouseleave', () => { tx = ty = 0; if (!raf) raf = requestAnimationFrame(tick); });

  // ---- kart: yazarken / şifre alanında değer varken dümdüz (net yazı, eğim yok)
  const pw = document.getElementById('pw'), card = document.querySelector('#login .deck');
  if (pw && card) {
    const sync = () => card.classList.toggle('flat', pw.value.length > 0);
    pw.addEventListener('keydown', () => card.classList.add('flat'));
    pw.addEventListener('input', sync);
    pw.addEventListener('blur', sync);
  }
})();
