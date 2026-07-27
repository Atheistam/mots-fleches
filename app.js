/* Mots Fléchés du Jour — moteur de jeu */
(function () {
  const params = new URLSearchParams(location.search);
  const gid = params.get('g');
  const LS = (k) => `mf:${gid}:${k}`;

  const $ = (id) => document.getElementById(id);
  const zoneGrille = $('grille');
  const barreDef = $('def-texte');
  const barreFleche = $('def-fleche');
  const saisie = $('saisie-cachee');

  let data = null;
  let lettres = new Map();     // "r,c" -> cellule JSON
  let defs = new Map();        // "r,c" -> cellule def
  let motsParId = new Map();
  let motsParCase = new Map(); // "r,c" -> [ids de mots couvrant la case]
  let saisies = new Map();     // "r,c" -> lettre saisie
  let sel = null;              // { motId, index }
  let dirPref = 'right';
  let chrono = { t: 0, demarre: false, timer: null };

  fetch(`grilles/${gid}.json`)
    .then(r => { if (!r.ok) throw new Error('introuvable'); return r.json(); })
    .then(g => { data = g; init(); })
    .catch(() => {
      zoneGrille.innerHTML = '<p class="erreur" style="padding:2rem">Grille introuvable. <a href="index.html">Retour</a></p>';
    });

  function init() {
    document.title = `${data.id} — Mots Fléchés du Jour`;
    $('difficulte').textContent = data.difficulty === 'moyenne' ? 'Moyenne' : 'Difficile';
    $('difficulte').classList.add(data.difficulty);

    for (const c of data.cells) {
      const k = `${c.r},${c.c}`;
      if (c.type === 'letter') lettres.set(k, c);
      else if (c.type === 'def') defs.set(k, c);
    }
    for (const w of data.words) {
      motsParId.set(w.id, w);
      for (let i = 0; i < w.answer.length; i++) {
        const r = w.r + (w.dir === 'down' ? i : 0);
        const c = w.c + (w.dir === 'right' ? i : 0);
        const k = `${r},${c}`;
        if (!motsParCase.has(k)) motsParCase.set(k, []);
        motsParCase.get(k).push(w.id);
      }
    }
    // taille des cases selon la largeur dispo
    const taille = 60;
    document.documentElement.style.setProperty('--taille-case', taille + 'px');
    zoneGrille.style.gridTemplateColumns = `repeat(${data.cols}, var(--taille-case))`;

    rendu();
    chargeProgression();
    attacheClavier();
    masterInit();
  }

  function rendu() {
    zoneGrille.innerHTML = '';
    for (let r = 0; r < data.rows; r++) {
      for (let c = 0; c < data.cols; c++) {
        const k = `${r},${c}`;
        const div = document.createElement('div');
        div.dataset.k = k;
        const L = lettres.get(k);
        const D = defs.get(k);
        if (L) {
          div.className = 'case lettre';
          if (L.num) {
            const n = document.createElement('span');
            n.className = 'num';
            n.textContent = L.num;
            div.appendChild(n);
          }
          const span = document.createElement('span');
          span.className = 'val';
          span.textContent = saisies.get(k) || '';
          div.appendChild(span);
          div.addEventListener('click', () => clicCase(k));
        } else if (D) {
          div.className = 'case def';
          for (const d of D.defs) {
            const w = motsParId.get(d.word);
            if (!w) continue;
            const item = document.createElement('div');
            item.className = 'def-item';
            item.innerHTML = `<span class="fleche">${d.arrow}</span><span class="texte">${w.def}</span>`;
            div.appendChild(item);
          }
          div.addEventListener('click', () => clicDef(k));
        } else {
          div.className = 'case vide';
        }
        zoneGrille.appendChild(div);
      }
    }
    majSurlignage();
  }

  function divCase(k) {
    return zoneGrille.querySelector(`[data-k="${k}"]`);
  }

  function motsDe(k) { return motsParCase.get(k) || []; }

  function clicCase(k) {
    const ids = motsDe(k);
    if (!ids.length) return;
    const L = lettres.get(k);
    let motId, index;
    const courant = sel && ids.includes(sel.motId) ? sel.motId : null;
    if (courant && ids.length > 1) {
      motId = ids[(ids.indexOf(courant) + 1) % ids.length];
    } else if (courant) {
      motId = courant;
    } else {
      const pref = ids.find(id => motsParId.get(id).dir === dirPref);
      motId = pref || ids[0];
    }
    const w = motsParId.get(motId);
    index = indexDansMot(w, L.r, L.c);
    sel = { motId, index };
    dirPref = w.dir;
    majSurlignage();
    focusSaisie();
  }

  function clicDef(k) {
    const D = defs.get(k);
    if (D && D.defs.length) {
      const w = motsParId.get(D.defs[0].word);
      sel = { motId: w.id, index: 0 };
      dirPref = w.dir;
      majSurlignage();
      focusSaisie();
    }
  }

  function indexDansMot(w, r, c) {
    return w.dir === 'right' ? c - w.c : r - w.r;
  }

  function caseDuMot(w, i) {
    return `${w.r + (w.dir === 'down' ? i : 0)},${w.c + (w.dir === 'right' ? i : 0)}`;
  }

  function majSurlignage() {
    zoneGrille.querySelectorAll('.case.lettre').forEach(d => {
      d.classList.remove('active', 'dans-mot');
    });
    zoneGrille.querySelectorAll('.case.def').forEach(d => d.classList.remove('surbrillance'));
    if (!sel) { barreDef.textContent = 'Cliquez sur une case pour commencer.'; barreFleche.textContent = ''; return; }
    const w = motsParId.get(sel.motId);
    for (let i = 0; i < w.answer.length; i++) {
      const d = divCase(caseDuMot(w, i));
      if (d) d.classList.add(i === sel.index ? 'active' : 'dans-mot');
    }
    const defCell = divCase(`${w.defCell[0]},${w.defCell[1]}`);
    if (defCell) defCell.classList.add('surbrillance');
    barreFleche.textContent = w.arrow;
    barreDef.textContent = `${w.def} (${w.answer.length} lettres)`;
  }

  function focusSaisie() {
    saisie.value = '';
    saisie.focus({ preventScroll: true });
  }

  function attacheClavier() {
    saisie.addEventListener('input', (e) => {
      const v = saisie.value.toUpperCase().replace(/[^A-Z]/g, '');
      saisie.value = '';
      if (v) tapeLettre(v[v.length - 1]);
    });
    document.addEventListener('keydown', (e) => {
      if (!sel) return;
      if (e.key === 'Backspace') { e.preventDefault(); efface(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); deplace(0, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); deplace(0, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); deplace(1, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); deplace(-1, 0); }
      else if (e.key === ' ') { e.preventDefault(); clicCase(caseDuMot(motsParId.get(sel.motId), sel.index)); }
      else if (/^[a-zA-Z]$/.test(e.key)) {
        if (e.target !== saisie) tapeLettre(e.key.toUpperCase());
      }
    });
    zoneGrille.addEventListener('click', focusSaisie);
  }

  function tapeLettre(ch) {
    if (!sel) return;
    demarreChrono();
    const w = motsParId.get(sel.motId);
    const k = caseDuMot(w, sel.index);
    saisies.set(k, ch);
    const div = divCase(k);
    div.querySelector('.val').textContent = ch;
    div.classList.remove('erreur');
    if (sel.index < w.answer.length - 1) {
      sel.index++;
      majSurlignage();
    } else {
      motSuivant(1);
    }
    sauvegarde();
    verifAuto();
  }

  function efface() {
    const w = motsParId.get(sel.motId);
    let k = caseDuMot(w, sel.index);
    if (saisies.get(k)) {
      saisies.delete(k);
      divCase(k).querySelector('.val').textContent = '';
      divCase(k).classList.remove('erreur');
    } else if (sel.index > 0) {
      sel.index--;
      k = caseDuMot(w, sel.index);
      saisies.delete(k);
      divCase(k).querySelector('.val').textContent = '';
      divCase(k).classList.remove('erreur');
    }
    majSurlignage();
    sauvegarde();
  }

  function deplace(dr, dc) {
    const w = motsParId.get(sel.motId);
    const k = caseDuMot(w, sel.index);
    const [r, c] = k.split(',').map(Number);
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < data.rows && nc >= 0 && nc < data.cols) {
      const nk = `${nr},${nc}`;
      if (lettres.has(nk)) { clicCase(nk); return; }
      nr += dr; nc += dc;
    }
  }

  function motSuivant(pas) {
    const ids = data.words.map(w => w.id);
    const i = ids.indexOf(sel.motId);
    sel = { motId: ids[(i + pas + ids.length) % ids.length], index: 0 };
    majSurlignage();
  }

  /* ---------- chronomètre ---------- */
  function demarreChrono() {
    if (chrono.demarre) return;
    chrono.demarre = true;
    chrono.timer = setInterval(() => {
      chrono.t++;
      afficheChrono();
      if (chrono.t % 15 === 0) sauvegarde();
    }, 1000);
  }
  function afficheChrono() {
    const m = String(Math.floor(chrono.t / 60)).padStart(2, '0');
    const s = String(chrono.t % 60).padStart(2, '0');
    $('chrono').textContent = `${m}:${s}`;
  }

  /* ---------- vérification ---------- */
  function estComplete() {
    for (const k of lettres.keys()) if (!saisies.get(k)) return false;
    return true;
  }

  function verifAuto() {
    if (!estComplete()) return;
    verifie(true);
  }

  function verifie(auto) {
    const erreurs = [];
    for (const [k, L] of lettres.entries()) {
      const v = saisies.get(k);
      if (v && v !== L.sol) erreurs.push(k);
    }
    if (erreurs.length === 0) {
      victoire();
    } else {
      for (const k of erreurs) divCase(k).classList.add('erreur');
      zoneGrille.classList.remove('secoue');
      void zoneGrille.offsetWidth;
      zoneGrille.classList.add('secoue');
      barreFleche.textContent = '✗';
      barreDef.textContent = `${erreurs.length} case${erreurs.length > 1 ? 's' : ''} en erreur — elles sont indiquées en rouge.`;
    }
  }

  function victoire() {
    clearInterval(chrono.timer);
    localStorage.setItem(LS('win'), '1');
    sauvegarde();
    $('overlay-detail').textContent =
      `Grille terminée en ${$('chrono').textContent} — ${data.words.length} mots.`;
    $('overlay').classList.remove('cache');
    lanceConfettis();
  }

  function lanceConfettis() {
    const cv = $('confettis');
    const ctx = cv.getContext('2d');
    const couleurs = ['#d9b64f', '#8a6d2f', '#4a682e', '#8a4222', '#2a2620'];
    const parts = Array.from({ length: 90 }, () => ({
      x: Math.random() * cv.width,
      y: -10 - Math.random() * 60,
      vy: 1.2 + Math.random() * 2.4,
      vx: -1 + Math.random() * 2,
      taille: 4 + Math.random() * 5,
      couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
      rot: Math.random() * Math.PI,
    }));
    let frames = 0;
    (function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += .08;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.couleur;
        ctx.fillRect(-p.taille / 2, -p.taille / 2, p.taille, p.taille * .6);
        ctx.restore();
      }
      if (++frames < 260) requestAnimationFrame(tick);
    })();
  }

  /* ---------- boutons ---------- */
  $('btn-verifier').addEventListener('click', () => verifie(false));
  $('btn-effacer').addEventListener('click', () => {
    if (!sel) return;
    const w = motsParId.get(sel.motId);
    for (let i = 0; i < w.answer.length; i++) {
      const k = caseDuMot(w, i);
      saisies.delete(k);
      const d = divCase(k);
      d.querySelector('.val').textContent = '';
      d.classList.remove('erreur');
    }
    sauvegarde();
  });
  $('btn-recommencer').addEventListener('click', () => {
    if (!confirm('Effacer toutes les lettres saisies ?')) return;
    saisies.clear();
    chrono.t = 0;
    afficheChrono();
    rendu();
    masterInit();
    sauvegarde();
  });
  $('btn-revoir').addEventListener('click', () => $('overlay').classList.add('cache'));

  /* ---------- sauvegarde ---------- */
  function sauvegarde() {
    try {
      localStorage.setItem(LS('etat'), JSON.stringify({
        s: Object.fromEntries(saisies),
        t: chrono.t,
      }));
    } catch (e) { /* quota */ }
  }
  function chargeProgression() {
    try {
      const brut = localStorage.getItem(LS('etat'));
      if (!brut) return;
      const etat = JSON.parse(brut);
      saisies = new Map(Object.entries(etat.s || {}));
      chrono.t = etat.t || 0;
      afficheChrono();
      for (const [k, v] of saisies) {
        const d = divCase(k);
        if (d) d.querySelector('.val').textContent = v;
      }
      if (etat.m) console.log('master load'); // inert
      masterUpdate();
    } catch (e) { /* ignore */ }
  }

  /* ---------- mot maître ---------- */
  let masterData = null; // {cells: [[r,c],...], word: '...'}
  function masterInit() {
    masterData = data.master || null;
    const section = $('master-section');
    const cont = $('master-lettres');
    if (!masterData) { section.classList.add('cache'); return; }
    section.classList.remove('cache');
    cont.innerHTML = '';
    masterData.word.split('').forEach((ch, i) => {
      const slot = document.createElement('span');
      slot.className = 'm-slot';
      slot.dataset.idx = i;
      slot.textContent = '?';
      cont.appendChild(slot);
    });
    $('master-indice').textContent = `${masterData.word.length} lettres`;
    masterUpdate();
  }
  function masterUpdate() {
    if (!masterData) return;
    const slots = $('master-lettres').children;
    let complete = true;
    masterData.cells.forEach(([r, c], i) => {
      const v = saisies.get(`${r},${c}`) || '';
      slots[i].textContent = v || '?';
      slots[i].className = 'm-slot' + (v ? ' m-rempli' : '');
      if (!v) complete = false;
    });
    if (complete) {
      const mot = masterData.cells.map(([r, c]) => saisies.get(`${r},${c}`) || '').join('');
      if (mot === masterData.word) {
        $('master-lettres').className = 'master-lettres m-trouve';
        $('master-indice').textContent = `✓ ${masterData.word}`;
      }
    }
  }

  // surcharge tapeLettre existante pour appeler masterUpdate
  const _tapeLettre = tapeLettre;
  tapeLettre = function(ch) {
    _tapeLettre(ch);
    masterUpdate();
  };
})();
