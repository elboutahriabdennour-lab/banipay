// Tafir — statistiques : vue d'ensemble utile (à relancer, échéances, meilleurs clients, TVA, CA par mois).
// Remplace l'affichage de l'onglet « Vue d'ensemble » ; les autres onglets restent inchangés.
(function () {
  function _lignes(f) { try { return typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []); } catch (e) { return []; } }
  function _m(n) { return fmt(n); }
  function _e(s) { return typeof escapeHTML === 'function' ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, ''); }
  function _jour(s) { var d = new Date(s || ''); if (isNaN(d.getTime())) return null; d.setHours(0, 0, 0, 0); return d; }
  function _emises(l) { return l.filter(function (f) { return f.statut !== 'brouillon' && f.statut !== 'annulee'; }); }
  function _reste(f) { return f.statut === 'payee' ? 0 : Math.max(0, Number(f.ttc || 0) - Number(f.montant_recu || 0)); }

  function carte(titre, valeur, sous, couleur, id) {
    return '<div class="su-kpi"' + (id ? ' id="' + id + '"' : '') + '><div class="su-kpi-t">' + titre + '</div><div class="su-kpi-v" style="color:' + (couleur || 'inherit') + '">' + valeur + '</div><div class="su-kpi-s">' + (sous || '&nbsp;') + '</div></div>';
  }

  window._renderOngletEnsemble = function () {
    var panneau = document.getElementById('stats-panneau-ensemble');
    if (!panneau) return;
    Array.prototype.forEach.call(panneau.children, function (c) { if (c.id !== 'su-ens') c.style.display = 'none'; });
    var zone = document.getElementById('su-ens');
    if (!zone) { zone = document.createElement('div'); zone.id = 'su-ens'; panneau.appendChild(zone); }

    var toutes = appliquerFiltresCroisesStats(filtrerParPeriode(STATE.factures || [], STATE.statsPeriode, 'date_emission'));
    var f = _emises(toutes), auj = new Date(); auj.setHours(0, 0, 0, 0);
    var avoirs = filtrerParPeriode(STATE.avoirs || [], STATE.statsPeriode, 'date_emission');
    var totAvoirs = avoirs.reduce(function (s, a) { return s + Number(a.ttc || 0); }, 0);

    var ca = f.reduce(function (s, x) { return s + Number(x.ttc || 0); }, 0);
    var caHT = f.reduce(function (s, x) { return s + Number(x.ht || 0); }, 0);
    var tva = f.reduce(function (s, x) { return s + Number(x.tva || 0); }, 0);
    var encaisse = f.reduce(function (s, x) { return s + (x.statut === 'payee' ? Number(x.ttc || 0) : Math.min(Number(x.montant_recu || 0), Number(x.ttc || 0))); }, 0);
    var aEncaisser = f.reduce(function (s, x) { return s + _reste(x); }, 0);
    var enRetard = f.filter(function (x) {
      if (_reste(x) <= 0) return false;
      var e = _jour(x.echeance);
      return x.statut === 'retard' || (e && e < auj);
    });
    var montantRetard = enRetard.reduce(function (s, x) { return s + _reste(x); }, 0);
    var taux = ca > 0 ? Math.round(encaisse / ca * 100) : 0;
    var moyenne = f.length ? ca / f.length : 0;

    var kpis =
      carte('Chiffre d’affaires TTC', _m(ca), f.length + ' facture' + (f.length > 1 ? 's' : '') + (totAvoirs ? ' · avoirs − ' + _m(totAvoirs) : ''), '#0F1F1A') +
      carte('Encaissé', _m(encaisse), taux + ' % du CA', '#2F7A4D') +
      carte('Reste à encaisser', _m(aEncaisser), 'factures non soldées', '#B8860B') +
      carte('En retard', _m(montantRetard), enRetard.length + ' facture' + (enRetard.length > 1 ? 's' : ''), montantRetard > 0 ? '#B23A2E' : '#2F7A4D') +
      carte('TVA collectée', _m(tva), 'sur ' + _m(caHT) + ' HT', '#1B5E4B') +
      carte('Facture moyenne', _m(moyenne), 'TTC', '#0F1F1A');

    // À relancer : factures en retard, les plus anciennes d'abord.
    var relancer = enRetard.slice().sort(function (a, b) { return (_jour(a.echeance) || 0) - (_jour(b.echeance) || 0); }).slice(0, 6);
    var hRelance = relancer.length ? relancer.map(function (x) {
      var e = _jour(x.echeance), j = e ? Math.round((auj - e) / 86400000) : null;
      return '<div class="su-ligne" onclick="ouvrirFactureStats(\'' + String(x.id).replace(/'/g, '') + '\')"><div><b>' + _e(x.client) + '</b><span>' + _e(x.ref || '') + (j != null ? ' · ' + j + ' j de retard' : '') + '</span></div><strong style="color:#B23A2E">' + _m(_reste(x)) + '</strong></div>';
    }).join('') : '<div class="su-vide">✅ Aucune facture en retard.</div>';

    // Échéances des 30 prochains jours.
    var bientot = f.filter(function (x) { var e = _jour(x.echeance); return _reste(x) > 0 && e && e >= auj && (e - auj) / 86400000 <= 30; })
      .sort(function (a, b) { return _jour(a.echeance) - _jour(b.echeance); }).slice(0, 6);
    var totBientot = bientot.reduce(function (s, x) { return s + _reste(x); }, 0);
    var hBientot = bientot.length ? bientot.map(function (x) {
      var j = Math.round((_jour(x.echeance) - auj) / 86400000);
      return '<div class="su-ligne" onclick="ouvrirFactureStats(\'' + String(x.id).replace(/'/g, '') + '\')"><div><b>' + _e(x.client) + '</b><span>' + _e(x.ref || '') + ' · dans ' + j + ' j</span></div><strong>' + _m(_reste(x)) + '</strong></div>';
    }).join('') : '<div class="su-vide">Rien à encaisser dans les 30 prochains jours.</div>';

    // Meilleurs clients + part du premier.
    var parClient = {};
    f.forEach(function (x) { var n = x.client || '—'; parClient[n] = (parClient[n] || 0) + Number(x.ttc || 0); });
    var top = Object.keys(parClient).map(function (n) { return [n, parClient[n]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    var maxC = top.length ? top[0][1] : 1;
    var hTop = top.length ? top.map(function (p) {
      return '<div class="su-barre"><div class="su-barre-t"><span>' + _e(p[0]) + '</span><b>' + _m(p[1]) + ' <i>' + (ca ? Math.round(p[1] / ca * 100) : 0) + ' %</i></b></div><div class="su-piste"><div style="width:' + Math.round(p[1] / maxC * 100) + '%"></div></div></div>';
    }).join('') : '<div class="su-vide">Aucune facture sur la période.</div>';
    var alerteDep = top.length && ca > 0 && top[0][1] / ca > 0.5 ? '<div class="su-info">⚠️ ' + _e(top[0][0]) + ' représente ' + Math.round(top[0][1] / ca * 100) + ' % de votre chiffre d’affaires : dépendance à surveiller.</div>' : '';

    // TVA par taux.
    var parTaux = {};
    f.forEach(function (x) {
      var ls = _lignes(x), baseHT = ls.reduce(function (s, l) { return s + Number(l.qte || 0) * Number(l.pu || 0); }, 0);
      if (!ls.length || baseHT <= 0) { var t = x.ht > 0 ? Math.round(x.tva / x.ht * 100) : 0; parTaux[t] = parTaux[t] || [0, 0]; parTaux[t][0] += Number(x.ht || 0); parTaux[t][1] += Number(x.tva || 0); return; }
      var remise = baseHT > 0 && Number(x.ht || 0) > 0 ? Number(x.ht) / baseHT : 1;
      ls.forEach(function (l) { var t = Number(l.tva != null ? l.tva : 20), b = Number(l.qte || 0) * Number(l.pu || 0) * remise; parTaux[t] = parTaux[t] || [0, 0]; parTaux[t][0] += b; parTaux[t][1] += b * t / 100; });
    });
    var hTva = Object.keys(parTaux).sort(function (a, b) { return b - a; }).map(function (t) {
      return '<div class="su-ligne"><div><b>TVA ' + t + ' %</b><span>base HT ' + _m(parTaux[t][0]) + '</span></div><strong>' + _m(parTaux[t][1]) + '</strong></div>';
    }).join('') || '<div class="su-vide">Aucune TVA sur la période.</div>';

    // CA par mois (12 derniers mois) : facturé et encaissé.
    var mois = [], base = new Date(); base.setDate(1);
    for (var i = 11; i >= 0; i--) { var d = new Date(base.getFullYear(), base.getMonth() - i, 1); mois.push({ cle: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), lib: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), fac: 0, enc: 0 }); }
    var idx = {}; mois.forEach(function (m, k) { idx[m.cle] = k; });
    _emises(appliquerFiltresCroisesStats(STATE.factures || [])).forEach(function (x) {
      var d = _jour(x.date_emission); if (!d) return;
      var c = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); if (!(c in idx)) return;
      mois[idx[c]].fac += Number(x.ttc || 0);
      mois[idx[c]].enc += x.statut === 'payee' ? Number(x.ttc || 0) : Math.min(Number(x.montant_recu || 0), Number(x.ttc || 0));
    });
    var maxM = Math.max.apply(null, mois.map(function (m) { return m.fac; }).concat([1]));
    var hMois = '<div class="su-mois">' + mois.map(function (m) {
      return '<div class="su-mcol" title="' + m.lib + ' — facturé ' + _m(m.fac) + ' · encaissé ' + _m(m.enc) + '"><div class="su-mbar"><div class="su-mfac" style="height:' + Math.round(m.fac / maxM * 100) + '%"></div><div class="su-menc" style="height:' + Math.round(m.enc / maxM * 100) + '%"></div></div><div class="su-mlib">' + m.lib + '</div></div>';
    }).join('') + '</div><div class="su-legende"><span><i style="background:#1B5E4B"></i>Facturé</span><span><i style="background:#9CBB7A"></i>Encaissé</span></div>';

    // Statuts.
    var cnt = { payee: 0, attente: 0, retard: 0 };
    f.forEach(function (x) { if (x.statut === 'payee') cnt.payee++; else if (enRetard.indexOf(x) >= 0) cnt.retard++; else cnt.attente++; });
    var hStat = '<div class="su-stat"><div style="background:#EEF3E4;color:#4F6B33"><b>' + cnt.payee + '</b>Payées</div><div style="background:#F7EFDC;color:#8A6508"><b>' + cnt.attente + '</b>En attente</div><div style="background:#F5E4E1;color:#B23A2E"><b>' + cnt.retard + '</b>En retard</div></div>';

    var vide = !f.length ? '<div class="su-info">Aucune facture sur cette période. Changez la période ci-dessus, ou créez votre première facture.</div>' : '';
    zone.innerHTML = vide + '<div class="su-kpis">' + kpis + '</div>' + alerteDep +
      '<div class="su-cols">' +
        '<div class="su-bloc su-large"><h3>CA par mois <small>12 derniers mois</small></h3>' + hMois + '</div>' +
        '<div class="su-bloc"><h3>Répartition des factures</h3>' + hStat + '<h3 style="margin-top:18px">TVA collectée par taux</h3>' + hTva + '</div>' +
        '<div class="su-bloc"><h3>À relancer <small>' + enRetard.length + ' en retard · ' + _m(montantRetard) + ' MAD</small></h3>' + hRelance + '</div>' +
        '<div class="su-bloc"><h3>À encaisser sous 30 jours <small>' + _m(totBientot) + ' MAD</small></h3>' + hBientot + '</div>' +
        '<div class="su-bloc su-large"><h3>Meilleurs clients</h3>' + hTop + '</div>' +
      '</div>';
  };

  window.ouvrirFactureStats = function (id) {
    var f = (STATE.factures || []).find(function (x) { return String(x.id) === String(id); });
    if (f && typeof openDetail === 'function') openDetail(f.id); else goScreen('mes-factures', null);
  };
})();
