// ŞAHİ SİHA giriş sayfası arka planı: sabit yarım ton (halftone) nokta alanı (yalnız boyut değişince yeniden çizilir).
// Giriş/şifre çözme kodundan bağımsızdır; burada bir hata olursa yalnız süsler eksik kalır.
(() => {
  const dots = document.getElementById('dots');
  if (!dots) return;

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

})();
