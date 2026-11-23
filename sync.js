/* ECA Puzzle – modul kirim hasil (dipasang otomatis oleh make_site.py di setiap halaman puzzle).
 * Mengaitkan diri ke fungsi record() dan summary() milik pemain puzzle, tanpa mengubah pemainnya.
 * Hasil dikirim ke Google Sheet ECA lewat API (Apps Script). Bila sinyal putus, hasil disimpan dulu
 * di HP (antrean) dan dikirim ulang otomatis. Hanya untuk murid yang sudah masuk. */
(function () {
  var API = window.ECA_API, RT = window.ECA_RT || {};
  if (!API || typeof record !== 'function' || typeof DATA === 'undefined') return;
  var KODE = String(DATA.meeting || '').toLowerCase();
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var token = ls.get('eca.token', null), profil = ls.get('eca.profil', null), ratingAwal = profil ? profil.rating : 0;

  /* ---------- gerbang: puzzle hanya untuk murid yang sudah masuk (atau pelatih) ---------- */
  var pelatih = ls.get('eca.pelatih', null), gb = null;
  function gerbang() {
    if (gb || (token && profil) || pelatih) return;
    gb = document.createElement('div');
    gb.setAttribute('role', 'dialog'); gb.setAttribute('aria-modal', 'true');
    gb.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(90,15,26,.92);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Atkinson,system-ui,sans-serif';
    gb.innerHTML = '<div style="background:#fff;border-radius:26px;border:3px solid #5A0F1A;max-width:420px;width:100%;padding:26px 22px;text-align:center;color:#3F322F">' +
      '<div style="font:800 1.6rem/1.2 Gabarito,system-ui,sans-serif;color:#5A0F1A">Masuk dulu, ya!</div>' +
      '<p style="margin:10px 0 18px;font-size:1.05rem;line-height:1.5">Supaya hasil dan ratingmu tercatat, puzzle hanya bisa dikerjakan setelah masuk. Siapkan kode masuk dan PIN-mu.</p>' +
      '<a id="ecaMasuk" href="index.html#masuk" style="display:block;background:#5A0F1A;color:#fff;text-decoration:none;font:800 1.05rem Atkinson,system-ui,sans-serif;padding:14px;border-radius:16px;box-shadow:0 4px 0 #3A0A12">Masuk</a>' +
      '<p style="margin:14px 0 0;font-size:.88rem;color:#7A6B66">Belum punya kode masuk? Tanyakan ke pelatihmu.</p></div>';
    document.body.appendChild(gb);
    document.getElementById('ecaMasuk').addEventListener('click', function () { ls.set('eca.balik', location.pathname.split('/').pop() || 'index.html'); });
    document.documentElement.style.overflow = 'hidden';
  }
  function bukaGerbang() { if (gb) { gb.remove(); gb = null; document.documentElement.style.overflow = ''; } }
  if (!(token && profil) && !pelatih) gerbang();
  if (pelatih) fetch(API, { method: 'POST', body: JSON.stringify({ aksi: 'cekPelatih', token: pelatih.token }) }).then(function (r) { return r.json(); }).then(function (j) {
    if (j && !j.ok) { ls.del('eca.pelatih'); pelatih = null; if (!(token && profil)) { pita(); gerbang(); } }
  }, function () {});

  /* ---------- akses puzzle: tugas aktif selalu terbuka, lalu pengecualian pelatih, lalu aturan kelas ---------- */
  var KELAS = ['Starter', 'Beginner', 'Intermediate', 'Advanced', 'Elite'], KAT = null, segar = false, blok = null, tungguT = null;
  function terkunci() {
    if (pelatih || !token || !profil || !profil.akses || !KAT) return false;
    var a = profil.akses;
    if (a.tugas.some(function (t) { return t.kode === KODE; })) return false;
    var ov = a.pengecualian[KODE]; if (ov) return ov !== 'Buka';
    var e = KAT.filter(function (x) { return x.kode === KODE; })[0]; if (!e) return false;
    if (e.level !== '' && e.level != null) return Number(e.level) > a.kelasMaks;
    return KELAS.indexOf(e.kelas) > KELAS.indexOf(profil.kelas);
  }
  function tutupBlok() { if (blok) { blok.remove(); blok = null; document.documentElement.style.overflow = ''; } }
  function bukaBlok(judul, isi, tombol) {
    tutupBlok();
    blok = document.createElement('div'); blok.setAttribute('role', 'dialog'); blok.setAttribute('aria-modal', 'true');
    blok.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(90,15,26,.94);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Atkinson,system-ui,sans-serif';
    blok.innerHTML = '<div style="background:#fff;border-radius:26px;border:3px solid #5A0F1A;max-width:420px;width:100%;padding:26px 22px;text-align:center;color:#3F322F">' +
      '<div style="font:800 1.5rem/1.2 Gabarito,system-ui,sans-serif;color:#5A0F1A">' + judul + '</div><p style="margin:10px 0 18px;font-size:1.05rem;line-height:1.5">' + isi + '</p>' +
      (tombol ? '<a href="index.html" style="display:block;background:#5A0F1A;color:#fff;text-decoration:none;font:800 1.05rem Atkinson,system-ui,sans-serif;padding:14px;border-radius:16px;box-shadow:0 4px 0 #3A0A12">\u2190 Kembali ke beranda</a>' : '') + '</div>';
    document.body.appendChild(blok); document.documentElement.style.overflow = 'hidden';
  }
  /* Profil di HP bisa lama (tugas atau akses baru belum terbaca): kalau tampak terkunci, tunggu profil terbaru dulu. */
  function cekAkses() {
    if (!KAT || !token || !profil || pelatih) return;
    if (!terkunci()) { clearTimeout(tungguT); tutupBlok(); return; }
    if (!segar) { bukaBlok('Memeriksa akses\u2026', 'Sebentar, ya.', false); clearTimeout(tungguT); tungguT = setTimeout(function () { segar = true; cekAkses(); }, 4000); return; }
    bukaBlok('Puzzle ini belum dibuka', 'Tanya pelatihmu supaya puzzle ini dibuka untukmu.', true);
  }
  fetch('katalog_publik.json').then(function (r) { return r.json(); }).then(function (j) { KAT = j.set || []; cekAkses(); }, function () {});

  /* ---------- pita status di atas halaman ---------- */
  var bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'font:700 13px/1.3 Atkinson,system-ui,sans-serif;padding:7px 12px;text-align:center;background:#F1ECE5;color:#5A0F1A;border-bottom:2px solid #E2D6CB;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap';
  function bahasaEn() { try { return typeof LANG !== 'undefined' && LANG === 'en'; } catch (e) { return false; } }
  var LINK_BERANDA = '<a href="index.html" id="ecaBeranda" style="flex:none;display:inline-block;background:#5A0F1A;color:#fff;text-decoration:none;font:800 13px Atkinson,system-ui,sans-serif;padding:5px 12px;border-radius:999px">\u2190 Beranda</a>';
  function pita() {
    var isi;
    if (token && profil) isi = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1FA062;margin-right:6px"></span>' +
      esc(profil.nama) + ' \u00b7 Rating ' + profil.rating + ' \u00b7 hasilmu tercatat otomatis';
    else if (pelatih) isi = 'Mode pelatih: hasil tidak dicatat ke akun murid.';
    else isi = 'Kamu belum masuk, jadi hasilmu tidak tercatat. <a href="index.html#masuk" style="color:#5A0F1A">Masuk dulu</a>';
    bar.innerHTML = LINK_BERANDA + '<span>' + isi + '</span>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  pita(); document.body.insertBefore(bar, document.body.firstChild);
  /* tautan Beranda juga di layar pembuka (menutupi pita di atas) */
  var intro = document.getElementById('intro');
  if (intro) { var ib = document.createElement('a'); ib.href = 'index.html'; ib.textContent = '\u2190 Beranda'; ib.id = 'ecaBerandaIntro';
    ib.style.cssText = 'position:fixed;top:12px;left:12px;z-index:61;background:#5A0F1A;color:#fff;text-decoration:none;font:800 14px Atkinson,system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 3px 0 #3A0A12';
    intro.appendChild(ib); new MutationObserver(function () { ib.style.display = intro.hidden || getComputedStyle(intro).display === 'none' ? 'none' : ''; }).observe(intro, { attributes: true }); }

  /* ---------- antrean kirim ---------- */
  var sibuk = false;
  function kirim(o) { var q = ls.get('eca.antre', []); q.push(o); ls.set('eca.antre', q); kuras(); }
  function kuras() {
    if (sibuk) return; var q = ls.get('eca.antre', []); if (!q.length) return;
    sibuk = true;
    fetch(API, { method: 'POST', body: JSON.stringify(q[0]) }).then(function (r) { return r.json(); }).then(function (j) {
      var q2 = ls.get('eca.antre', []); q2.shift(); ls.set('eca.antre', q2); sibuk = false;
      if (j && j.keluar) { ls.del('eca.token'); ls.del('eca.profil'); token = profil = null; pita(); ls.set('eca.antre', []); gerbang(); return; }
      if (j && j.ok) terima(q[0], j);
      kuras();
    }, function () { sibuk = false; setTimeout(kuras, 8000); });
  }
  window.addEventListener('online', kuras);

  function terima(o, j) {
    if (o.aksi === 'soal' && profil) { profil.rating = j.rating; ls.set('eca.profil', profil); pita(); }
    if (o.aksi === 'set' && j.profil) { profil = j.profil; ls.set('eca.profil', profil); pita(); kartuHasil(o.ringkas.ratingAwal, profil.rating, j.naikLevel); perbaruiKembali(); }
    if (o.aksi === 'profil' && j.profil) { profil = j.profil; ratingAwal = profil.rating; ls.set('eca.profil', profil); segar = true; pita(); cekAkses(); perbaruiKembali(); }
  }

  /* ---------- kait ke pemain puzzle ---------- */
  var asli = record;
  record = function (me) {
    var pertama = !R[idx];
    var hasil = asli.apply(this, arguments);
    try {
      if (pertama && R[idx] && token) {
        var p = me.p, rec = R[idx], a = (p.tree && p.tree.a) || [], salah1 = me.misses.filter(function (m) { return m.step === 1; })[0];
        var san1 = me.log && me.log[0] ? String(me.log[0].s).split(' ').pop() : '';
        var uci1 = salah1 ? salah1.u : ((a.filter(function (x) { return x.san === san1; })[0] || {}).u || '');
        kirim({ aksi: 'soal', token: token, kodePuzzle: KODE, soal: {
          id: p.id, no: idx + 1, rating: RT[p.id] || 0, res: rec.res, hints: rec.hints, miss: me.misses.length,
          langkah: salah1 ? salah1.san : san1, uci: uci1, benar: a[0] ? a[0].san : '', benarUci: a[0] ? a[0].u : '',
          detik: rec.tt, fen: p.fen } });
      }
    } catch (e) {}
    return hasil;
  };
  var asliSum = summary, terkirim = false;
  summary = function () {
    var hasil = asliSum.apply(this, arguments);
    try { tombolKembali(); } catch (e) {}
    try {
      if (token && !terkirim) {
        terkirim = true;
        var rs = R.filter(Boolean), c = { M: 0, D: 0, K: 0, L: 0 }, bintang = 0, detik = 0;
        rs.forEach(function (r) { c[r.res] = (c[r.res] || 0) + 1; bintang += r.stars || 0; detik += r.tt || 0; });
        kirim({ aksi: 'set', token: token, kodePuzzle: KODE, ringkas: { M: c.M, D: c.D, K: c.K, L: c.L, jumlah: P.length,
          bintang: bintang, detik: detik, ratingAwal: ratingAwal, judul: DATA.topic } });
      }
    } catch (e) {}
    return hasil;
  };

  /* ---------- tombol kembali ke beranda di layar hasil ---------- */
  function tugasBerikut() {
    var T = profil && profil.akses ? profil.akses.tugas : [];
    return T.filter(function (t) { return !t.selesai && t.kode !== KODE; })[0] || null;
  }
  function tombolKembali() {
    var sum = document.getElementById('sum'); if (!sum || document.getElementById('ecaKembali')) return;
    var h = sum.querySelector('h2'); if (!h) return;
    var a = document.createElement('a'); a.id = 'ecaKembali';
    a.style.cssText = 'display:block;max-width:420px;margin:12px auto;background:#5A0F1A;color:#fff;text-decoration:none;text-align:center;font:800 1.1rem Atkinson,system-ui,sans-serif;padding:15px;border-radius:18px;box-shadow:0 5px 0 #3A0A12';
    h.insertAdjacentElement('afterend', a); perbaruiKembali();
  }
  /* Kalau masih ada PR lain: "Lanjut ke tugas berikutnya". Kalau tidak: "Kembali ke beranda". */
  function perbaruiKembali() {
    var a = document.getElementById('ecaKembali'); if (!a) return;
    var n = tugasBerikut(), en = bahasaEn();
    if (n) { a.href = n.kode + '.html'; a.textContent = en ? 'Next assignment \u2192' : 'Lanjut ke tugas berikutnya \u2192'; }
    else { a.href = 'index.html'; a.textContent = en ? '\u2190 Back to home' : '\u2190 Kembali ke beranda'; }
  }

  /* ---------- kartu rating di layar hasil ---------- */
  function kartuHasil(r0, r1, naik) {
    var sum = document.getElementById('sum'); if (!sum || !r0) return;
    var d = r1 - r0, k = document.createElement('div');
    k.style.cssText = 'margin:14px auto;max-width:420px;background:#fff;border:2.5px solid #EFE2D3;border-radius:20px;padding:14px;text-align:center;box-shadow:0 5px 0 #EFE2D3;color:#3F322F;font-family:Atkinson,system-ui,sans-serif';
    k.innerHTML = '<div style="font-size:14px;color:#7A6B66">Rating puzzle kamu</div>' +
      '<div style="font:800 32px/1.2 Gabarito,system-ui,sans-serif;color:#5A0F1A">' + r0 + ' → <span id="ecaR">' + r0 + '</span></div>' +
      '<div style="display:inline-block;margin-top:6px;padding:4px 12px;border-radius:999px;font-weight:700;background:' + (d >= 0 ? '#E3F8EC;color:#0F6E3E' : '#FDECEC;color:#9B1C1C') + '">' + (d >= 0 ? '+' : '') + d + '</div>' +
      (profil ? '<div style="margin-top:6px;font-size:14px">Gelar: <b>' + esc(profil.gelar) + '</b>' + (profil.gelarBerikut ? ' · ' + profil.kurang + ' poin lagi menuju ' + esc(profil.gelarBerikut) : '') + '</div>' : '') +
      (naik ? '<div style="margin-top:8px;font-weight:700;color:#1FA062">Hebat! Level ' + naik + ' sekarang terbuka.</div>' : '');
    sum.insertBefore(k, sum.firstChild);
    var el = document.getElementById('ecaR'), t0 = null;
    function anim(t) { if (!t0) t0 = t; var f = Math.min(1, (t - t0) / 900); el.textContent = Math.round(r0 + d * (1 - Math.pow(1 - f, 3))); if (f < 1) requestAnimationFrame(anim); }
    requestAnimationFrame(anim);
  }

  if (token) kirim({ aksi: 'profil', token: token });
  else kuras();
})();
