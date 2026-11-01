// Tafir — délais de paiement et alertes (clients qui paient en retard, échéances proches, fournisseurs à payer).
// Tout est calculé sur l'appareil à partir des factures et paiements déjà chargés : rien n'est envoyé ailleurs.
// Les seuils sont réglables (appareil). Les seuils légaux sont indicatifs : à confirmer avec votre comptable.
(function () {
  var DEF = { avant: 3, max: 60, lent: 15 };
  function cfg() {
    var c = {}; try { c = JSON.parse(localStorage.getItem('tafir_alertes_cfg') || '{}') || {}; } catch (e) {}
    return { avant: Number(c.avant) >= 0 ? Number(c.avant) : DEF.avant, max: Number(c.max) > 0 ? Number(c.max) : DEF.max, lent: Number(c.lent) >= 0 ? Number(c.lent) : DEF.lent };
  }
  function jour(s) { var d = new Date(s || ''); if (isNaN(d.getTime())) return null; d.setHours(0, 0, 0, 0); return d; }
  function ecart(a, b) { return Math.round((a - b) / 86400000); }
  function reste(f) { return f.statut === 'payee' ? 0 : Math.max(0, Number(f.ttc || 0) - Number(f.montant_recu || 0)); }
  function emises() { return (STATE.factures || []).filter(function (f) { return f.statut !== 'brouillon' && f.statut !== 'annulee'; }); }
  function moy(t) { return t.length ? t.reduce(function (s, x) { return s + x; }, 0) / t.length : null; }
  function arr(x) { return x == null ? null : Math.round(x * 10) / 10; }

  window.analyserPaiements = function () {
    var auj = jour(new Date()), C = cfg(), f = emises(), pays = {};
    (STATE.paiements || []).forEach(function (p) { (pays[String(p.facture_id)] = pays[String(p.facture_id)] || []).push(p); });
    var delais = [], retards = [], dansDelais = 0, avecEch = 0, accordes = [], parClient = {}, ouvertes = [];
    f.forEach(function (x) {
      var em = jour(x.date_emission), ec = jour(x.echeance), r = reste(x), nom = x.client || '—';
      if (em && ec) accordes.push(ecart(ec, em));
      if (r > 0.009) { ouvertes.push(x); return; }
      var lp = (pays[String(x.id)] || []).map(function (p) { return jour(p.date); }).filter(Boolean).sort(function (a, b) { return b - a; })[0];
      if (!lp || !em) return;
      var d = ecart(lp, em); delais.push(d);
      var c = parClient[nom] = parClient[nom] || { nom: nom, delais: [], retards: [], n: 0 }; c.delais.push(d); c.n++;
      if (ec) { var rt = ecart(lp, ec); retards.push(rt); c.retards.push(rt); avecEch++; if (rt <= 0) dansDelais++; }
    });
    var clients = Object.keys(parClient).map(function (k) { var c = parClient[k]; return { nom: c.nom, n: c.n, delai: moy(c.delais), retard: moy(c.retards) }; });
    var al = [];
    var retardees = ouvertes.filter(function (x) { var ec = jour(x.echeance); return ec && ec < auj; })
      .map(function (x) { return { f: x, j: ecart(auj, jour(x.echeance)), r: reste(x) }; }).sort(function (a, b) { return b.j - a.j; });
    var graves = retardees.filter(function (x) { return x.j > C.max; });
    if (graves.length) al.push({ niveau: 'rouge', titre: graves.length + ' facture' + (graves.length > 1 ? 's' : '') + ' impayée' + (graves.length > 1 ? 's' : '') + ' depuis plus de ' + C.max + ' jours',
      detail: graves.slice(0, 3).map(function (x) { return (x.f.client || '—') + ' (' + x.j + ' j)'; }).join(', ') + '. Au-delà de ' + C.max + ' jours, le délai de paiement maximum prévu entre entreprises est en principe dépassé (loi 69-21, à confirmer avec votre comptable). Envoyez une relance écrite.', cible: 'facture', id: graves[0].f.id });
    var autres = retardees.filter(function (x) { return x.j <= C.max; });
    if (autres.length) al.push({ niveau: 'rouge', titre: autres.length + ' facture' + (autres.length > 1 ? 's' : '') + ' en retard de paiement',
      detail: autres.slice(0, 3).map(function (x) { return (x.f.client || '—') + ' (' + x.j + ' j)'; }).join(', ') + ' — total ' + fmt(autres.reduce(function (s, x) { return s + x.r; }, 0)) + ' MAD.', cible: 'facture', id: autres[0].f.id });
    var proches = ouvertes.filter(function (x) { var ec = jour(x.echeance); return ec && ec >= auj && ecart(ec, auj) <= C.avant; });
    if (proches.length) al.push({ niveau: 'orange', titre: proches.length + ' échéance' + (proches.length > 1 ? 's' : '') + ' dans les ' + C.avant + ' prochains jours',
      detail: proches.slice(0, 3).map(function (x) { return (x.f ? '' : '') + (x.client || '—') + ' (' + fmt(reste(x)) + ')'; }).join(', ') + '. Un petit rappel au client aide à être payé à temps.', cible: 'facture', id: proches[0].id });
    var longues = f.filter(function (x) { var em = jour(x.date_emission), ec = jour(x.echeance); return em && ec && ecart(ec, em) > C.max; });
    if (longues.length) al.push({ niveau: 'orange', titre: longues.length + ' facture' + (longues.length > 1 ? 's' : '') + ' avec un délai de paiement supérieur à ' + C.max + ' jours',
      detail: 'Vous avez accordé plus de ' + C.max + ' jours à ' + longues.slice(0, 3).map(function (x) { return x.client || '—'; }).join(', ') + '. À vérifier avec votre comptable (délai maximum légal indicatif).', cible: 'facture', id: longues[0].id });
    clients.filter(function (c) { return c.n >= 2 && c.retard != null && c.retard > C.lent; }).sort(function (a, b) { return b.retard - a.retard; }).slice(0, 3).forEach(function (c) {
      al.push({ niveau: 'orange', titre: c.nom + ' paie en moyenne ' + Math.round(c.retard) + ' jours après l’échéance', detail: 'Sur ' + c.n + ' factures payées. Pensez à demander un acompte ou à raccourcir son délai.', cible: 'stats' });
    });
    var sansEch = f.filter(function (x) { return reste(x) > 0 && !jour(x.echeance); });
    if (sansEch.length) al.push({ niveau: 'info', titre: sansEch.length + ' facture' + (sansEch.length > 1 ? 's' : '') + ' sans date d’échéance', detail: 'Sans échéance, aucune alerte de retard n’est possible pour ' + sansEch.slice(0, 3).map(function (x) { return x.client || '—'; }).join(', ') + '.', cible: 'facture', id: sansEch[0].id });
    var dm = moy(delais), am = moy(accordes);
    if (dm != null && am != null && dm > am + 10) al.push({ niveau: 'info', titre: 'Vous êtes payé en moyenne ' + Math.round(dm) + ' jours après la facture', detail: 'Vos conditions sont de ' + Math.round(am) + ' jours en moyenne : les clients paient plus tard que prévu.', cible: 'stats' });
    // Fournisseurs à payer (achats)
    var achats = (typeof modeFacturation === 'function' && modeFacturation()) ? [] : (STATE.achats || []).filter(function (a) { return a.statut !== 'payee' && jour(a.echeance); });
    var achRet = achats.filter(function (a) { return jour(a.echeance) < auj; }), achProche = achats.filter(function (a) { var e = jour(a.echeance); return e >= auj && ecart(e, auj) <= C.avant; });
    if (achRet.length) al.push({ niveau: 'rouge', titre: achRet.length + ' facture' + (achRet.length > 1 ? 's' : '') + ' fournisseur à payer en retard', detail: achRet.slice(0, 3).map(function (a) { return a.fournisseur || '—'; }).join(', ') + ' — total ' + fmt(achRet.reduce(function (s, a) { return s + Number(a.ttc || 0); }, 0)) + ' MAD.', cible: 'achats' });
    if (achProche.length) al.push({ niveau: 'orange', titre: achProche.length + ' paiement' + (achProche.length > 1 ? 's' : '') + ' fournisseur à faire sous ' + C.avant + ' jours', detail: achProche.slice(0, 3).map(function (a) { return a.fournisseur || '—'; }).join(', ') + '.', cible: 'achats' });
    var ordre = { rouge: 0, orange: 1, info: 2 };
    al.sort(function (a, b) { return ordre[a.niveau] - ordre[b.niveau]; });
    return { alertes: al, delaiMoyen: arr(dm), retardMoyen: arr(moy(retards)), accordeMoyen: arr(am), pctDansDelais: avecEch ? Math.round(dansDelais / avecEch * 100) : null, nbPayees: delais.length, clients: clients, retardees: retardees, cfg: C };
  };

  window.alerteAller = function (niveauIdx) {
    var a = (window._alertesPaiement || [])[niveauIdx]; if (!a) return;
    if (a.cible === 'facture' && a.id != null && typeof ouvrirFactureStats === 'function') ouvrirFactureStats(a.id);
    else if (a.cible === 'achats') { loadAchats(); renderHubAchats(); goScreen('hub-achats', null); }
    else goScreen('stats', null);
  };

  window.htmlAlertesPaiement = function (A) {
    window._alertesPaiement = A.alertes;
    var ico = { rouge: '🔴', orange: '🟠', info: 'ℹ️' };
    var h = A.alertes.length ? A.alertes.map(function (a, i) {
      return '<div class="al-l al-' + a.niveau + '" onclick="alerteAller(' + i + ')"><span>' + ico[a.niveau] + '</span><div><b>' + escapeHTML(a.titre) + '</b><small>' + escapeHTML(a.detail) + '</small></div></div>';
    }).join('') : '<div class="su-vide">✅ Aucune alerte de paiement. Tout est à jour.</div>';
    var C = A.cfg;
    return '<div class="su-bloc su-alertes"><h3><span>🔔 Alertes de paiement</span><small><a href="#" onclick="document.getElementById(\'al-cfg\').classList.toggle(\'ouvert\');return false">⚙️ Régler</a></small></h3>' +
      '<div id="al-cfg" class="al-cfg"><label>Prévenir <input type="number" min="0" max="30" id="al-avant" value="' + C.avant + '"> jours avant l’échéance</label>' +
      '<label>Délai légal indicatif <input type="number" min="15" max="180" id="al-max" value="' + C.max + '"> jours</label>' +
      '<label>Client « lent » à partir de <input type="number" min="0" max="90" id="al-lent" value="' + C.lent + '"> jours de retard moyen</label>' +
      '<button type="button" onclick="enregistrerReglagesAlertes()">Enregistrer</button></div>' + h + '</div>';
  };
  window.enregistrerReglagesAlertes = function () {
    var v = function (id, d) { var n = Number((document.getElementById(id) || {}).value); return isFinite(n) && n >= 0 ? n : d; };
    try { localStorage.setItem('tafir_alertes_cfg', JSON.stringify({ avant: v('al-avant', 3), max: v('al-max', 60) || 60, lent: v('al-lent', 15) })); } catch (e) {}
    showToast('✅ Réglages enregistrés', 'success');
    try { renderStats(); renderDashboard(); } catch (e) {}
  };
  window.htmlDelaisPaiement = function (A) {
    function k(t, v, s, c) { return '<div class="su-kpi"><div class="su-kpi-t">' + t + '</div><div class="su-kpi-v" style="color:' + (c || 'inherit') + '">' + v + '</div><div class="su-kpi-s">' + s + '</div></div>'; }
    var pas = A.nbPayees ? '' : ' (pas encore de factures soldées)';
    return '<div class="su-kpis su-kpis4">' +
      k('Délai moyen d’encaissement', A.delaiMoyen != null ? Math.round(A.delaiMoyen) + ' j' : '—', 'de la facture au paiement' + pas, '#0F1F1A') +
      k('Délai accordé en moyenne', A.accordeMoyen != null ? Math.round(A.accordeMoyen) + ' j' : '—', 'de la facture à l’échéance', '#1B5E4B') +
      k('Retard moyen de paiement', A.retardMoyen != null ? (A.retardMoyen > 0 ? '+' : '') + Math.round(A.retardMoyen) + ' j' : '—', 'après l’échéance (− = en avance)', A.retardMoyen > 0 ? '#B23A2E' : '#2F7A4D') +
      k('Payées dans les délais', A.pctDansDelais != null ? A.pctDansDelais + ' %' : '—', 'des factures soldées', A.pctDansDelais != null && A.pctDansDelais < 60 ? '#B8860B' : '#2F7A4D') + '</div>';
  };

  // Barre d'alerte de l'accueil : résumé + accès aux détails.
  var _rd = window.renderDashboard;
  window.renderDashboard = function () {
    if (typeof _rd === 'function') _rd.apply(this, arguments);
    try {
      var A = analyserPaiements(), bar = document.getElementById('alerte-bar'); if (!bar) return;
      var graves = A.alertes.filter(function (a) { return a.niveau !== 'info'; });
      if (graves.length) {
        bar.classList.remove('hidden');
        var t = document.getElementById('alerte-text'); if (t) t.textContent = graves.length === 1 ? graves[0].titre : graves.length + ' alertes de paiement — ' + graves[0].titre;
        bar.onclick = function () { goScreen('stats', null); };
        var a = bar.querySelector('.alerte-action'); if (a) a.textContent = 'Voir →';
      } else bar.classList.add('hidden');
    } catch (e) { console.warn('alertes', e); }
  };
})();
