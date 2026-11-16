// Tafir — liaisons entre fonctions : ventes de caisse dans la TVA / les stats / les exports,
// et retours de marchandises d'un avoir vers le stock.
(function () {
  function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function cle(t) { t = Number(t); return (t === 0 || t === 10 || t === 20) ? String(t) : 'autre'; }
  function jourLocal(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // ── Ventes de caisse en mémoire ──
  window.chargerVentesCaisse = async function (uid) {
    try {
      var base = 'user_id=eq.' + uid + '&select=id,numero,lignes,total_ht,total_tva,total_ttc,mode_paiement,created_at';
      var r = null;
      try { r = await sb.get('ventes_caisse', base + ',client_nom,facture_ref&order=created_at.desc&limit=5000'); } catch (y) { r = null; }
      if (!Array.isArray(r)) r = await sb.get('ventes_caisse', base + '&order=created_at.desc&limit=5000'); // base pas encore mise à jour (SQL 063)
      STATE.ventesCaisse = Array.isArray(r) ? r : [];
    } catch (x) { STATE.ventesCaisse = []; }
  };

  // Regroupe les tickets par jour, avec le détail par taux de TVA (TTC saisi → HT et TVA).
  // Les tickets déjà transformés en facture (facture_ref) sont exclus : la facture les remplace, sinon double compte.
  window.caisseJours = function (du, au, source) {
    var jours = {};
    (source || STATE.ventesCaisse || []).forEach(function (v) {
      if (v.facture_ref) return;
      var j = jourLocal(v.created_at); if (!j) return;
      if (du && j < du) return; if (au && j > au) return;
      var o = jours[j] || (jours[j] = { date: j, n: 0, ttc: 0, ht: 0, tva: 0, especes: 0, autre: 0, parTaux: { '0': [0, 0], '10': [0, 0], '20': [0, 0], 'autre': [0, 0] } });
      o.n++;
      var lignes = Array.isArray(v.lignes) ? v.lignes : [];
      var ttcTicket = 0;
      lignes.forEach(function (l) {
        var t = Number(l.tva) || 0, ttc = r2((Number(l.pu_ttc) || 0) * (Number(l.qte) || 0)), ht = ttc / (1 + t / 100);
        var k = cle(t); o.parTaux[k][0] += ht; o.parTaux[k][1] += ttc - ht; ttcTicket += ttc;
      });
      var tt = Number(v.total_ttc) || r2(ttcTicket);
      o.ttc += tt;
      if (v.mode_paiement === 'especes') o.especes += tt; else o.autre += tt;
    });
    return Object.keys(jours).sort().map(function (j) {
      var o = jours[j];
      ['0', '10', '20', 'autre'].forEach(function (k) { o.parTaux[k][0] = r2(o.parTaux[k][0]); o.parTaux[k][1] = r2(o.parTaux[k][1]); });
      o.ttc = r2(o.ttc); o.especes = r2(o.especes); o.autre = r2(o.autre);
      o.ht = r2(['0', '10', '20', 'autre'].reduce(function (s, k) { return s + o.parTaux[k][0]; }, 0));
      o.tva = r2(o.ttc - o.ht);
      return o;
    });
  };

  // Forme « facture payée » (pour les statistiques) : une ligne par jour de caisse.
  window.caisseNormalisee = function () {
    return window.caisseJours().map(function (j) { return { date_emission: j.date, ttc: j.ttc, ht: j.ht, tva: j.tva, statut: 'payee', client: 'Ventes caisse', _caisse: true }; });
  };

  // ── Avoir : retour de marchandises vers le stock ──
  function lignesOrigine() {
    var id = (document.getElementById('av-facture-origine') || {}).value; if (!id) return [];
    var f = (STATE.factures || []).filter(function (x) { return String(x.id) === String(id); })[0]; if (!f) return [];
    var l = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
    return l.filter(function (x) {
      var p = (STATE.produits || []).filter(function (q) { return q.id === x.produit_id; })[0];
      return x.produit_id && p && p.stock != null;
    });
  }
  window.avoirRetoursRender = function () {
    var z = document.getElementById('av-retours'); if (!z) return;
    var motif = (document.getElementById('av-motif') || {}).value;
    if (motif === 'annulation' || motif === 'correction') { z.innerHTML = ''; return; }
    var l = []; try { l = lignesOrigine(); } catch (x) {}
    if (!l.length) { z.innerHTML = ''; return; }
    z.innerHTML = '<div class="form-section"><label class="f-lbl">Marchandises rendues (remises en stock)</label>'
      + l.map(function (x, i) {
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;font-size:12px">' + escapeHTML(x.desc || '') + ' <span style="color:#8E9C95">(vendu : ' + escapeHTML(x.qte) + ')</span></div>'
          + '<input type="number" min="0" max="' + escapeHTML(x.qte) + '" step="any" value="0" data-retour="' + i + '" class="f-inp" style="width:80px"></div>';
      }).join('')
      + '<div style="font-size:11px;color:#8E9C95">Laissez 0 si la marchandise n\'est pas revenue.</div></div>';
  };
  document.addEventListener('change', function (ev) {
    var id = ev.target && ev.target.id;
    if (id === 'av-facture-origine' || id === 'av-motif') window.avoirRetoursRender();
  });

  // Appelé juste après l'émission d'un avoir (devis.js). Remet en stock au coût moyen actuel (pas au prix de vente).
  window.appliquerRetoursAvoir = async function (avoir) {
    var z = document.getElementById('av-retours'); if (!z || typeof enregistrerEntreeStock !== 'function') return;
    var l = []; try { l = lignesOrigine(); } catch (x) {}
    var champs = z.querySelectorAll('[data-retour]'), nb = 0;
    for (var k = 0; k < champs.length; k++) {
      var ligne = l[+champs[k].getAttribute('data-retour')]; if (!ligne) continue;
      var q = Math.min(Number(champs[k].value) || 0, Number(ligne.qte) || 0);
      if (q <= 0) continue;
      var p = (STATE.produits || []).filter(function (x) { return x.id === ligne.produit_id; })[0];
      await enregistrerEntreeStock(ligne.produit_id, q, p ? Number(p.cout_moyen) || 0 : 0, 'Retour client — avoir ' + ((avoir && avoir.ref) || ''), (avoir && avoir.ref) || '');
      nb++;
    }
    if (nb) showToast('📦 Stock mis à jour (' + nb + ' article' + (nb > 1 ? 's' : '') + ' remis en stock)', 'success');
  };
})();
