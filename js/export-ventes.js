// Tafir — export comptable des ventes (Excel) : journal des ventes, TVA par taux, avoirs.
// Pensé pour le comptable : une période, des totaux qui tombent juste, des colonnes prêtes à saisir.
function _evDate(d) { var m = d.getMonth() + 1, j = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j; }
function _evPeriode(code, du, au) {
  var n = new Date(), a = n.getFullYear(), m = n.getMonth(), t = Math.floor(m / 3);
  var deb, fin, nom;
  if (code === 'mois') { deb = new Date(a, m, 1); fin = new Date(a, m + 1, 0); nom = 'ce mois'; }
  else if (code === 'mois-1') { deb = new Date(a, m - 1, 1); fin = new Date(a, m, 0); nom = 'mois précédent'; }
  else if (code === 'trim') { deb = new Date(a, t * 3, 1); fin = new Date(a, t * 3 + 3, 0); nom = 'trimestre en cours'; }
  else if (code === 'trim-1') { deb = new Date(a, (t - 1) * 3, 1); fin = new Date(a, t * 3, 0); nom = 'trimestre précédent'; }
  else if (code === 'annee') { deb = new Date(a, 0, 1); fin = new Date(a, 11, 31); nom = 'année ' + a; }
  else return { du: du, au: au, nom: 'personnalisée' };
  return { du: _evDate(deb), au: _evDate(fin), nom: nom };
}
function _evFR(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
function _evR(x) { return Math.round((Number(x) || 0) * 100) / 100; }
function _evCleTaux(t) { return (t === 0 || t === 10 || t === 20) ? String(t) : 'autre'; }

// Découpe une facture par taux de TVA (à partir des lignes ; à défaut, à partir du rapport TVA / HT).
function _evDetailTaux(f) {
  var res = { '0': [0, 0], '10': [0, 0], '20': [0, 0], 'autre': [0, 0] };
  var lignes = lignesEnTableau(f.lignes);
  if (lignes.length) {
    calculerTotauxLignes(lignes).parTaux.forEach(function (p) { var k = _evCleTaux(p.taux); res[k][0] += p.base; res[k][1] += p.tva; });
  } else {
    var ht = Number(f.ht) || 0, tva = Number(f.tva) || 0;
    var taux = ht > 0 ? Math.round(tva / ht * 100) : 0;
    var k2 = _evCleTaux(taux); res[k2][0] += ht; res[k2][1] += tva;
  }
  Object.keys(res).forEach(function (k) { res[k][0] = _evR(res[k][0]); res[k][1] = _evR(res[k][1]); });
  return res;
}

function ouvrirExportVentes() {
  var ancien = document.getElementById('export-ventes-overlay'); if (ancien) ancien.remove();
  var ov = document.createElement('div');
  ov.id = 'export-ventes-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:22px;max-width:420px;width:100%;box-sizing:border-box">' +
      '<div style="font-size:17px;font-weight:800;color:#14241F;margin-bottom:4px">📊 Export comptable des ventes</div>' +
      '<div style="font-size:12px;color:#5B6B64;margin-bottom:14px;line-height:1.5">Un fichier Excel pour votre comptable : journal des ventes, TVA par taux et avoirs. Les brouillons sont exclus.</div>' +
      '<label class="f-lbl" for="ev-periode">Période</label>' +
      '<select id="ev-periode" class="f-inp" onchange="document.getElementById(\'ev-perso\').style.display=this.value===\'perso\'?\'flex\':\'none\'">' +
        '<option value="mois-1">Mois précédent</option><option value="mois">Ce mois</option>' +
        '<option value="trim-1">Trimestre précédent</option><option value="trim">Trimestre en cours</option>' +
        '<option value="annee">Année en cours</option><option value="perso">Dates personnalisées…</option></select>' +
      '<div id="ev-perso" style="display:none;gap:8px;margin-top:8px"><input type="date" id="ev-du" class="f-inp" style="flex:1"><input type="date" id="ev-au" class="f-inp" style="flex:1"></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button onclick="document.getElementById(\'export-ventes-overlay\').remove()" style="flex:1;padding:12px;background:#EAE4DA;color:#5B6B64;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Annuler</button>' +
        '<button onclick="exporterVentesComptable()" style="flex:2;padding:12px;background:#1B5E4B;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Télécharger l’Excel</button>' +
      '</div></div>';
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

async function exporterVentesComptable() {
  var code = (document.getElementById('ev-periode') || {}).value || 'mois-1';
  var per = _evPeriode(code, (document.getElementById('ev-du') || {}).value, (document.getElementById('ev-au') || {}).value);
  if (!per.du || !per.au || per.du > per.au) { showToast('Choisissez une période valide', 'error'); return; }
  var profil = STATE.profil || {};
  var clients = STATE.clients || [];
  var iceDe = function (nom) { var c = clients.find(function (x) { return x.nom === nom; }); return c ? (c.ice || '') : ''; };

  var factures = (STATE.factures || []).filter(function (f) { return f.statut !== 'brouillon' && f.date_emission && f.date_emission >= per.du && f.date_emission <= per.au; })
    .sort(function (a, b) { return (a.date_emission + a.ref) < (b.date_emission + b.ref) ? -1 : 1; });
  var avoirs = (STATE.avoirs || []).filter(function (a) { return a.date_emission && a.date_emission >= per.du && a.date_emission <= per.au; })
    .sort(function (a, b) { return a.date_emission < b.date_emission ? -1 : 1; });
  if (!factures.length && !avoirs.length) { showToast('Aucune facture ni avoir sur cette période', 'error'); return; }

  var horsMad = 0;
  var tot = { '0': [0, 0], '10': [0, 0], '20': [0, 0], 'autre': [0, 0] };
  var totAv = { '0': [0, 0], '10': [0, 0], '20': [0, 0], 'autre': [0, 0] };
  var sHT = 0, sTVA = 0, sTTC = 0, sRecu = 0, sReste = 0, ecartDetail = 0;

  var enteteJ = ['N° facture', 'Date', 'Échéance', 'Client', 'ICE client', 'Statut', 'HT 20 %', 'TVA 20 %', 'HT 10 %', 'TVA 10 %', 'HT 0 %', 'HT autre taux', 'TVA autre taux', 'Total HT', 'Total TVA', 'Total TTC', 'Encaissé', 'Reste à encaisser', 'Devise'];
  var journal = [enteteJ];
  factures.forEach(function (f) {
    var det = _evDetailTaux(f);
    var ht = _evR(f.ht), tva = _evR(f.tva), ttc = _evR(f.ttc), recu = _evR(f.montant_recu);
    var annulee = f.statut === 'annulee';
    var reste = annulee ? 0 : Math.max(0, _evR(ttc - recu));
    var estMad = !f.devise || f.devise === 'MAD';
    if (!estMad) horsMad++;
    else {
      ['0', '10', '20', 'autre'].forEach(function (k) { tot[k][0] += det[k][0]; tot[k][1] += det[k][1]; });
      sHT += ht; sTVA += tva; sTTC += ttc; sRecu += recu; sReste += reste;
      ecartDetail += (det['0'][0] + det['10'][0] + det['20'][0] + det['autre'][0] + det['10'][1] + det['20'][1] + det['autre'][1]) - (ht + tva);
    }
    var libStatut = { payee: 'Payée', attente: 'En attente', envoyee: 'Envoyée', retard: 'En retard', annulee: 'Annulée' }[f.statut] || f.statut;
    journal.push([f.ref || '', _evFR(f.date_emission), _evFR(f.echeance), f.client || '', iceDe(f.client), libStatut,
      det['20'][0], det['20'][1], det['10'][0], det['10'][1], det['0'][0], det['autre'][0], det['autre'][1], ht, tva, ttc, recu, reste, f.devise || 'MAD']);
  });
  journal.push(['TOTAL (MAD)', '', '', '', '', '', _evR(tot['20'][0]), _evR(tot['20'][1]), _evR(tot['10'][0]), _evR(tot['10'][1]), _evR(tot['0'][0]), _evR(tot['autre'][0]), _evR(tot['autre'][1]), _evR(sHT), _evR(sTVA), _evR(sTTC), _evR(sRecu), _evR(sReste), '']);

  var enteteA = ['N° avoir', 'Date', 'Client', 'Facture d’origine', 'Motif', 'HT', 'TVA', 'TTC'];
  var lignesAv = [enteteA], avHT = 0, avTVA = 0, avTTC = 0;
  avoirs.forEach(function (a) {
    var ht = _evR(a.ht), tva = _evR(a.tva), ttc = _evR(a.ttc);
    var taux = ht > 0 ? Math.round(tva / ht * 100) : 0, k = _evCleTaux(taux);
    totAv[k][0] += ht; totAv[k][1] += tva; avHT += ht; avTVA += tva; avTTC += ttc;
    lignesAv.push([a.ref || '', _evFR(a.date_emission), a.client || '', a.facture_origine_ref || '', ({annulation:'Annulation totale',remboursement:'Remboursement partiel',correction:'Correction d’erreur'})[a.motif] || a.motif || '', -ht, -tva, -ttc]);
  });
  lignesAv.push(['TOTAL AVOIRS', '', '', '', '', -_evR(avHT), -_evR(avTVA), -_evR(avTTC)]);

  var recap = [
    [profil.raison || 'Entreprise'],
    ['ICE : ' + (profil.ice || '—') + '   IF : ' + (profil.if_fiscal || profil.identifiant_fiscal || '—')],
    ['Période : du ' + _evFR(per.du) + ' au ' + _evFR(per.au) + ' (' + per.nom + ')'],
    ['Export Tafir du ' + _evFR(_evDate(new Date())) + ' — montants en MAD'],
    [],
    ['TVA collectée par taux', 'Base HT factures', 'TVA factures', 'Base HT avoirs', 'TVA avoirs', 'Base HT nette', 'TVA nette à déclarer']
  ];
  var netHT = 0, netTVA = 0;
  [['20 %', '20'], ['10 %', '10'], ['0 % (exonéré)', '0'], ['Autre taux', 'autre']].forEach(function (p) {
    var k = p[1], bHT = _evR(tot[k][0]), bTVA = _evR(tot[k][1]), aHT = _evR(totAv[k][0]), aTVA = _evR(totAv[k][1]);
    if (!bHT && !bTVA && !aHT && !aTVA) return;
    netHT += bHT - aHT; netTVA += bTVA - aTVA;
    recap.push([p[0], bHT, bTVA, -aHT, -aTVA, _evR(bHT - aHT), _evR(bTVA - aTVA)]);
  });
  recap.push(['TOTAL', _evR(sHT), _evR(sTVA), -_evR(avHT), -_evR(avTVA), _evR(netHT), _evR(netTVA)]);
  recap.push([]);
  recap.push(['Factures émises (hors brouillons)', factures.length]);
  recap.push(['Avoirs émis', avoirs.length]);
  recap.push(['Total TTC facturé', _evR(sTTC)]);
  recap.push(['Total encaissé', _evR(sRecu)]);
  recap.push(['Reste à encaisser', _evR(sReste)]);
  if (horsMad) { recap.push([]); recap.push(['⚠ ' + horsMad + ' facture(s) en devise étrangère : listées dans le journal mais exclues des totaux ci-dessus.']); }
  if (Math.abs(ecartDetail) > 0.05) { recap.push([]); recap.push(['⚠ Écart d’arrondi entre le détail par taux et les totaux des factures : ' + _evR(ecartDetail).toFixed(2) + ' MAD. Vérifiez les factures concernées.']); }
  recap.push([]);
  recap.push(['Document établi par Tafir à partir des factures saisies. À contrôler par votre comptable avant toute déclaration.']);

  var nomEnt = String(profil.raison || 'entreprise').replace(/[^\w\-]+/g, '_').slice(0, 30);
  var nomFichier = 'ventes_' + nomEnt + '_' + per.du + '_' + per.au + '.xlsx';
  try {
    await _chargerSheetJS();
    var wb = XLSX.utils.book_new();
    var fmtNum = function (ws, colDebut) {
      var rng = XLSX.utils.decode_range(ws['!ref']);
      for (var R = 1; R <= rng.e.r; R++) for (var C = colDebut; C <= rng.e.c; C++) {
        var c = ws[XLSX.utils.encode_cell({ r: R, c: C })]; if (c && typeof c.v === 'number') c.z = '#,##0.00';
      }
    };
    var w1 = XLSX.utils.aoa_to_sheet(recap); w1['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
    var r1 = XLSX.utils.decode_range(w1['!ref']); for (var R = 5; R <= r1.e.r; R++) for (var C = 1; C <= r1.e.c; C++) { var c1 = w1[XLSX.utils.encode_cell({ r: R, c: C })]; if (c1 && typeof c1.v === 'number') c1.z = '#,##0.00'; }
    XLSX.utils.book_append_sheet(wb, w1, 'Récapitulatif');
    var w2 = XLSX.utils.aoa_to_sheet(journal);
    w2['!cols'] = [{ wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 8 }];
    w2['!freeze'] = { xSplit: 0, ySplit: 1 }; fmtNum(w2, 6);
    XLSX.utils.book_append_sheet(wb, w2, 'Journal des ventes');
    if (avoirs.length) {
      var w3 = XLSX.utils.aoa_to_sheet(lignesAv); w3['!cols'] = [{ wch: 16 }, { wch: 11 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 13 }, { wch: 12 }, { wch: 13 }]; fmtNum(w3, 5);
      XLSX.utils.book_append_sheet(wb, w3, 'Avoirs');
    }
    XLSX.writeFile(wb, nomFichier);
    var ov = document.getElementById('export-ventes-overlay'); if (ov) ov.remove();
    showToast('✅ Export téléchargé : ' + factures.length + ' facture(s), ' + avoirs.length + ' avoir(s)', 'success');
  } catch (e) {
    // Repli : CSV du journal si la bibliothèque Excel ne se charge pas.
    var csv = journal.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = nomFichier.replace('.xlsx', '.csv'); document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('Excel indisponible : journal téléchargé en CSV', 'error');
  }
}
