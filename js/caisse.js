// Tafir — Caisse rapide : vente au comptoir avec scan, encaissement, ticket, baisse du stock.
// Un ticket de caisse n'est pas une facture : il le dit sur le ticket.
(function () {
  var panier = [];        // { id, nom, pu_ttc, tva, qte, unite }
  var paiement = 'especes';

  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function uid() { return STATE.entrepriseId || (sb.user && sb.user.id); }
  function estProprietaire() { return !STATE.entrepriseId || STATE.entrepriseId === sb.user.id; }
  function ttcDe(p) { var t = Number(p.tva_rate); if ([0, 7, 10, 14, 20].indexOf(t) < 0) t = 20; return { ttc: r2(Number(p.prix_ht || 0) * (1 + t / 100)), tva: t }; }

  function totaux() {
    var ht = 0, ttc = 0;
    panier.forEach(function (l) {
      var lt = r2(l.pu_ttc * l.qte); ttc += lt; ht += lt / (1 + l.tva / 100);
    });
    ttc = r2(ttc); ht = r2(ht);
    return { ht: ht, tva: r2(ttc - ht), ttc: ttc };
  }

  function ajouter(p) {
    if (!p) return;
    var l = panier.filter(function (x) { return x.id === p.id; })[0];
    if (l) l.qte = r2(l.qte + 1);
    else { var t = ttcDe(p); panier.push({ id: p.id, nom: p.nom, pu_ttc: t.ttc, tva: t.tva, qte: 1, unite: p.unite || 'u' }); }
    if (p.stock != null && Number(p.stock) <= 0) showToast('⚠️ ' + p.nom + ' : stock à 0');
    dessiner();
  }

  function dessiner() {
    var zone = el('caisse-panier'); if (!zone) return;
    if (!panier.length) zone.innerHTML = '<div style="text-align:center;color:#8E9C95;font-size:13px;padding:22px 0">Scannez ou touchez un article pour commencer.</div>';
    else zone.innerHTML = panier.map(function (l, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #EAE4DA">'
        + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(l.nom) + '</div>'
        + '<div style="font-size:11px;color:#8E9C95">' + fmt(l.pu_ttc) + ' MAD TTC</div></div>'
        + '<button type="button" data-cq="-1" data-i="' + i + '" style="width:34px;height:34px;border-radius:8px;border:1px solid #DDE3DA;background:#fff;font-size:18px;cursor:pointer">−</button>'
        + '<div style="min-width:30px;text-align:center;font-weight:700">' + e(l.qte) + '</div>'
        + '<button type="button" data-cq="1" data-i="' + i + '" style="width:34px;height:34px;border-radius:8px;border:1px solid #DDE3DA;background:#fff;font-size:18px;cursor:pointer">+</button>'
        + '<div style="min-width:70px;text-align:right;font-weight:700;font-size:13px">' + fmt(r2(l.pu_ttc * l.qte)) + '</div></div>';
    }).join('');
    zone.querySelectorAll('[data-cq]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-i'), d = +b.getAttribute('data-cq');
        panier[i].qte = r2(panier[i].qte + d);
        if (panier[i].qte <= 0) panier.splice(i, 1);
        dessiner();
      };
    });
    var t = totaux();
    setEl('caisse-total', fmt(t.ttc) + ' MAD');
    var b = el('caisse-encaisser'); if (b) b.disabled = !panier.length;
  }

  function grille() {
    var z = el('caisse-grille'); if (!z) return;
    var q = (el('caisse-recherche') ? el('caisse-recherche').value : '').toLowerCase().trim();
    var l = (STATE.produits || []).filter(function (p) {
      return !q || p.nom.toLowerCase().indexOf(q) >= 0 || String(p.reference || '').toLowerCase().indexOf(q) >= 0 || String(p.code_barre || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 30);
    z.innerHTML = l.length ? l.map(function (p) {
      return '<button type="button" data-pid="' + e(p.id) + '" style="text-align:left;padding:10px;border:1px solid #DDE3DA;border-radius:10px;background:#fff;cursor:pointer;font-family:inherit">'
        + '<div style="font-size:12px;font-weight:700;color:#14241F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(p.nom) + '</div>'
        + '<div style="font-size:11px;color:#1B5E4B;font-weight:600">' + fmt(ttcDe(p).ttc) + ' MAD</div></button>';
    }).join('') : '<div style="grid-column:1/-1;text-align:center;color:#8E9C95;font-size:12px;padding:14px">Aucun article. Ajoutez-en dans « Produits ».</div>';
    z.querySelectorAll('[data-pid]').forEach(function (b) {
      b.onclick = function () { ajouter((STATE.produits || []).filter(function (p) { return String(p.id) === b.getAttribute('data-pid'); })[0]); };
    });
  }

  function recherche(ev) {
    var champ = el('caisse-recherche'); if (!champ) return;
    if (ev && ev.key === 'Enter') {            // lecteur USB : code + Entrée
      ev.preventDefault();
      var p = window.CB ? CB.trouver(champ.value) : null;
      if (p) { ajouter(p); champ.value = ''; grille(); }
      else showToast('Aucun article avec « ' + champ.value + ' »', 'error');
      return;
    }
    grille();
  }

  function scanner() {
    if (!window.CB) return;
    CB.scanner('Scanner un article', function (code) {
      var p = CB.trouver(code);
      if (p) { ajouter(p); showToast('✅ ' + p.nom); } else showToast('Aucun article avec le code ' + code, 'error');
      setTimeout(function () { if (el('screen-caisse') && el('screen-caisse').classList.contains('active')) { var c = el('caisse-recherche'); if (c) c.focus(); } }, 50);
    });
  }

  function vider() { if (panier.length && !confirm('Vider la vente en cours ?')) return; panier = []; dessiner(); }

  // ── Encaissement ──
  function ouvrirEncaissement() {
    if (!panier.length) return;
    paiement = 'especes';
    var t = totaux();
    var ov = document.createElement('div'); ov.id = 'caisse-enc';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,31,26,.7);display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = '<div style="background:#fff;width:100%;max-width:440px;border-radius:18px 18px 0 0;padding:18px">'
      + '<div style="font-size:12px;color:#8E9C95">À encaisser</div><div style="font-size:30px;font-weight:800;color:#14241F;margin-bottom:12px">' + fmt(t.ttc) + ' MAD</div>'
      + '<div style="display:flex;gap:8px;margin-bottom:12px">'
      + ['especes:Espèces', 'carte:Carte', 'autre:Autre'].map(function (x) { var a = x.split(':'); return '<button type="button" data-mode="' + a[0] + '" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid #DDE3DA;background:#fff;font-weight:700;cursor:pointer;font-family:inherit">' + a[1] + '</button>'; }).join('') + '</div>'
      + '<div id="caisse-bloc-especes"><label style="font-size:12px;font-weight:600">Montant reçu (MAD)</label>'
      + '<input id="caisse-recu" type="number" step="0.01" inputmode="decimal" style="width:100%;padding:12px;border:1.5px solid #DDE3DA;border-radius:10px;font-size:18px;margin:4px 0 6px;box-sizing:border-box;font-family:inherit">'
      + '<div style="font-size:14px;font-weight:700;color:#1B5E4B;margin-bottom:10px">À rendre : <span id="caisse-rendu">0,00</span> MAD</div></div>'
      + '<button type="button" id="caisse-valider" style="width:100%;padding:14px;border:none;border-radius:12px;background:#1B5E4B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">✓ Valider la vente</button>'
      + '<button type="button" id="caisse-annuler" style="width:100%;padding:12px;border:none;background:none;color:#8E9C95;font-size:13px;cursor:pointer;font-family:inherit">Annuler</button></div>';
    document.body.appendChild(ov);
    function maj() {
      ov.querySelectorAll('[data-mode]').forEach(function (b) { var on = b.getAttribute('data-mode') === paiement; b.style.borderColor = on ? '#1B5E4B' : '#DDE3DA'; b.style.background = on ? '#E7F2EC' : '#fff'; });
      ov.querySelector('#caisse-bloc-especes').style.display = paiement === 'especes' ? 'block' : 'none';
      var recu = parseFloat(ov.querySelector('#caisse-recu').value) || 0;
      ov.querySelector('#caisse-rendu').textContent = fmt(Math.max(0, r2(recu - t.ttc)));
    }
    ov.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function () { paiement = b.getAttribute('data-mode'); maj(); }; });
    ov.querySelector('#caisse-recu').oninput = maj;
    ov.querySelector('#caisse-annuler').onclick = function () { ov.remove(); };
    ov.querySelector('#caisse-valider').onclick = function () { valider(ov, t); };
    maj(); setTimeout(function () { try { ov.querySelector('#caisse-recu').focus(); } catch (x) {} }, 80);
  }

  async function numeroSuivant(essai) {
    var d = new Date(), j = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var debut = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    var r = await sb.get('ventes_caisse', 'created_at=gte.' + encodeURIComponent(debut) + '&select=numero&order=numero.desc&limit=1');
    var n = 0; if (r && r[0]) { var m = String(r[0].numero).match(/-(\d+)$/); if (m) n = parseInt(m[1], 10); }
    return 'T-' + j + '-' + ('00' + (n + 1 + (essai || 0))).slice(-3);
  }

  async function valider(ov, t) {
    var btn = ov.querySelector('#caisse-valider'); if (btn.disabled) return; btn.disabled = true; btn.textContent = '⏳ Enregistrement…';
    var recu = null, rendu = null;
    if (paiement === 'especes') {
      recu = parseFloat(ov.querySelector('#caisse-recu').value); if (isNaN(recu)) recu = t.ttc;
      if (recu < t.ttc) { showToast('Le montant reçu est inférieur au total', 'error'); btn.disabled = false; btn.textContent = '✓ Valider la vente'; return; }
      rendu = r2(recu - t.ttc);
    }
    var lignes = panier.map(function (l) { return { produit_id: l.id, nom: l.nom, qte: l.qte, pu_ttc: l.pu_ttc, tva: l.tva, unite: l.unite }; });
    var vente = null;
    try {
      for (var essai = 0; essai < 4 && !vente; essai++) {
        var numero = await numeroSuivant(essai);
        try {
          var r = await sb.post('ventes_caisse', { user_id: sb.user.id, numero: numero, lignes: lignes, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, mode_paiement: paiement, montant_recu: recu, rendu: rendu });
          vente = (r && r[0]) || { numero: numero, created_at: new Date().toISOString() };
        } catch (x) { if (!/duplicate|unique|23505/i.test(String(x && x.message || x)) || essai === 3) throw x; }
      }
    } catch (x) {
      showToast('Vente non enregistrée. Vérifiez votre connexion et réessayez.', 'error');
      btn.disabled = false; btn.textContent = '✓ Valider la vente'; return;
    }
    // La vente est enregistrée : on baisse le stock des articles suivis.
    for (var i = 0; i < lignes.length; i++) {
      var p = (STATE.produits || []).filter(function (x) { return x.id === lignes[i].produit_id; })[0];
      if (p && p.stock != null && typeof enregistrerSortieStock === 'function') { try { await enregistrerSortieStock(p.id, lignes[i].qte, 'Vente caisse', vente.numero); } catch (y) {} }
    }
    ov.remove();
    var snapshot = { vente: vente, lignes: lignes, t: t, mode: paiement, recu: recu, rendu: rendu };
    (STATE.ventesCaisse = STATE.ventesCaisse || []).unshift({ id: vente.id, numero: vente.numero, lignes: lignes, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, mode_paiement: paiement, created_at: vente.created_at || new Date().toISOString() });
    panier = []; dessiner(); grille(); chargerJour();
    afficherTicket(snapshot);
  }

  function htmlTicket(s) {
    var pf = STATE.profil || {}, d = new Date(s.vente.created_at || Date.now());
    var libMode = { especes: 'Espèces', carte: 'Carte', autre: 'Autre' }[s.mode] || s.mode;
    var h = '<div style="font-family:monospace;font-size:12px;width:280px;margin:0 auto;color:#000">'
      + '<div style="text-align:center;font-weight:700;font-size:14px">' + e(pf.raison || pf.nom_entreprise || '') + '</div>'
      + '<div style="text-align:center">' + e([pf.adresse, pf.ville].filter(Boolean).join(', ')) + '</div>'
      + (pf.tel ? '<div style="text-align:center">Tél : ' + e(pf.tel) + '</div>' : '')
      + (pf.ice ? '<div style="text-align:center">ICE : ' + e(pf.ice) + '</div>' : '')
      + '<div style="border-top:1px dashed #000;margin:6px 0"></div>'
      + '<div>Ticket ' + e(s.vente.numero) + '</div><div>' + e(d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) + '</div>'
      + '<div style="border-top:1px dashed #000;margin:6px 0"></div>';
    s.lignes.forEach(function (l) {
      h += '<div>' + e(l.nom) + '</div><div style="display:flex;justify-content:space-between"><span>' + e(l.qte) + ' x ' + fmt(l.pu_ttc) + '</span><span>' + fmt(r2(l.pu_ttc * l.qte)) + '</span></div>';
    });
    h += '<div style="border-top:1px dashed #000;margin:6px 0"></div>'
      + '<div style="display:flex;justify-content:space-between"><span>Total HT</span><span>' + fmt(s.t.ht) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between"><span>TVA</span><span>' + fmt(s.t.tva) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px"><span>TOTAL TTC</span><span>' + fmt(s.t.ttc) + ' MAD</span></div>'
      + '<div>Paiement : ' + e(libMode) + '</div>'
      + (s.mode === 'especes' ? '<div>Reçu : ' + fmt(s.recu) + ' — Rendu : ' + fmt(s.rendu) + '</div>' : '')
      + '<div style="border-top:1px dashed #000;margin:6px 0"></div>'
      + '<div style="text-align:center;font-size:10px">Merci de votre visite.<br>Ticket de caisse : ne tient pas lieu de facture.</div></div>';
    return h;
  }

  function afficherTicket(s) {
    var ov = document.createElement('div'); ov.id = 'caisse-ticket';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,31,26,.8);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto';
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;padding:16px;max-width:360px;width:100%"><div style="text-align:center;font-weight:800;color:#1B5E4B;margin-bottom:8px">✅ Vente enregistrée</div>'
      + '<div id="caisse-ticket-contenu" style="background:#FAFAF7;border:1px solid #EAE4DA;border-radius:8px;padding:10px;overflow:auto">' + htmlTicket(s) + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" id="caisse-imprimer" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #1B5E4B;background:#fff;color:#1B5E4B;font-weight:700;cursor:pointer;font-family:inherit">🖨️ Imprimer</button>'
      + '<button type="button" id="caisse-nouvelle" style="flex:1;padding:12px;border-radius:10px;border:none;background:#1B5E4B;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">Nouvelle vente</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#caisse-nouvelle').onclick = function () { ov.remove(); var c = el('caisse-recherche'); if (c) c.focus(); };
    ov.querySelector('#caisse-imprimer').onclick = function () {
      var w = window.open('', '_blank', 'width=360,height=600'); if (!w) { showToast('Autorisez les fenêtres pour imprimer', 'error'); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>@page{margin:4mm}body{margin:0}</style></head><body>' + htmlTicket(s) + '</body></html>');
      w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
    };
  }

  async function chargerJour() {
    var z = el('caisse-jour'); if (!z) return;
    try {
      var d = new Date(), debut = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      var r = await sb.get('ventes_caisse', 'created_at=gte.' + encodeURIComponent(debut) + '&select=total_ttc,mode_paiement');
      if (!Array.isArray(r)) throw new Error('x');
      var tot = r.reduce(function (s, x) { return s + Number(x.total_ttc || 0); }, 0);
      var esp = r.filter(function (x) { return x.mode_paiement === 'especes'; }).reduce(function (s, x) { return s + Number(x.total_ttc || 0); }, 0);
      z.textContent = 'Aujourd\'hui : ' + r.length + ' vente' + (r.length > 1 ? 's' : '') + ' · ' + fmt(tot) + ' MAD (dont espèces ' + fmt(esp) + ')';
    } catch (x) { z.textContent = 'Les ventes du jour ne sont pas disponibles pour le moment.'; }
  }

  window.initCaisse = function () {
    var ecran = el('screen-caisse'); if (!ecran) return;
    if (!estProprietaire()) { el('caisse-contenu').innerHTML = '<div style="padding:24px;text-align:center;color:#5B6B64">La caisse est réservée au propriétaire du compte pour le moment.</div>'; return; }
    grille(); dessiner(); chargerJour();
    setTimeout(function () { var c = el('caisse-recherche'); if (c) c.focus(); }, 150);
  };
  window.CAISSE = { recherche: recherche, scanner: scanner, vider: vider, encaisser: ouvrirEncaissement };
})();
