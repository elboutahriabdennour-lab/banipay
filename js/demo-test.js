// Tafir — entreprise de TEST : données de démonstration, uniquement sur l'appareil où le mode test est activé.
// Tout ce qui est créé porte la mention « [TEST] ». À utiliser avec un COMPTE DE TEST (e-mail dédié), pas avec le compte réel.
var _TEST = ' [TEST]';
function _testActif() { try { return !!localStorage.getItem('tafir_mode_test'); } catch (e) { return false; } }
function _tj(n) { var d = new Date(); d.setDate(d.getDate() + n); var m = d.getMonth() + 1, j = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j; }
function _tl(desc, qte, pu, tva, unite) { return { desc: desc, qte: qte, pu: pu, tva: tva, unite: unite || 'u', produit_id: null }; }

async function creerDonneesTest() {
  if (!_testActif()) { showToast('Le mode test n’est pas activé sur cet appareil.', 'error'); return; }
  if (!sb.user) { showToast('Connectez-vous d’abord.', 'error'); return; }
  var uid = STATE.entrepriseId || sb.user.id;
  var dejaProfil = STATE.profil && STATE.profil.ice;
  if (!confirm('Créer l’entreprise de test avec des clients, produits, factures, devis et achats fictifs ?' + (dejaProfil ? '\n\n⚠️ Votre profil d’entreprise actuel sera remplacé par « Atelier Test SARL ». Utilisez de préférence un COMPTE DE TEST.' : '') + '\n\nLes factures émises ne pourront pas être supprimées ensuite (règle légale).')) return;
  var ok = 0, ko = [];
  var essai = async function (nom, f) { try { await f(); ok++; } catch (e) { ko.push(nom + ' : ' + (e.message || 'erreur')); } };
  showToast('⏳ Création de l’entreprise de test…');

  await essai('profil', async function () {
    var data = { id: uid, raison: 'Atelier Test SARL' + _TEST, adresse: '12 rue des Essais', ville: 'Casablanca', tel: '0522000000',
      email: (sb.user.email || 'test@exemple.ma'), rc: '123456', identifiant_fiscal: '12345678', ice: '001234567000089' };
    await sb.upsert('profils_entreprise', data);
    STATE.profil = Object.assign({}, STATE.profil || {}, data);
  });

  var clients = [
    ['Karim Trading', '009876543000021', 'Casablanca'], ['Société Sanae Import', '001122334000045', 'Rabat'],
    ['Atlas Distribution', '002233445000067', 'Marrakech'], ['Zine Fournitures', '003344556000089', 'Tanger'],
    ['Boulangerie Al Amal', '', 'Fès'], ['Cabinet Médical Idrissi', '004455667000012', 'Meknès']];
  for (var i = 0; i < clients.length; i++) {
    await essai('client ' + clients[i][0], (function (c, k) { return async function () {
      await sb.post('clients', { user_id: uid, nom: c[0] + _TEST, ice: c[1] || null, adresse: c[2], tel: '06000000' + (10 + k), email: 'client' + k + '@exemple.ma', notes: 'Donnée de test' });
    }; })(clients[i], i));
  }
  var fournisseurs = [['Matériaux du Nord', '005566778000034'], ['Papeterie Centrale', '006677889000056'], ['Transports Rapides', '007788990000078']];
  for (i = 0; i < fournisseurs.length; i++) {
    await essai('fournisseur ' + fournisseurs[i][0], (function (f) { return async function () {
      await sb.post('fournisseurs', { user_id: uid, nom: f[0] + _TEST, ice: f[1], ville: 'Casablanca', tel: '0522111111', email: 'contact@exemple.ma', notes: 'Donnée de test' });
    }; })(fournisseurs[i]));
  }
  var produits = [['Ciment CPJ 45 (sac 50 kg)', 80, 20, 60, 200, 'sac'], ['Sable lavé (tonne)', 100, 20, 70, 50, 't'], ['Peinture murale 20 L', 450, 20, 300, 12, 'u'],
    ['Main d’œuvre (heure)', 120, 20, null, null, 'h'], ['Livre technique', 90, 10, 60, 30, 'u'], ['Transport local', 200, 0, null, null, 'u']];
  for (i = 0; i < produits.length; i++) {
    await essai('produit ' + produits[i][0], (function (p) { return async function () {
      await sb.post('produits', { user_id: uid, nom: p[0] + _TEST, prix_ht: p[1], tva_rate: p[2], cout_achat: p[3], stock: p[4], seuil_alerte: p[4] ? 5 : null, unite: p[5], categorie: 'autre', description: 'Donnée de test' });
    }; })(produits[i]));
  }

  // Factures : payée, partiellement payée, en retard, envoyée, brouillon — avec TVA 20 %, 10 % et 0 %.
  var factures = [
    { c: 'Karim Trading', j: -40, e: -10, st: 'payee', recu: 'tout', l: [_tl('Ciment CPJ 45', 10, 80, 20, 'sac'), _tl('Sable lavé', 2, 100, 20, 't')] },
    { c: 'Société Sanae Import', j: -35, e: -5, st: 'attente', recu: 500, l: [_tl('Peinture murale 20 L', 4, 450, 20), _tl('Main d’œuvre', 8, 120, 20, 'h')] },
    { c: 'Atlas Distribution', j: -60, e: -30, st: 'retard', recu: 0, l: [_tl('Livre technique', 20, 90, 10), _tl('Transport local', 1, 200, 0)] },
    { c: 'Zine Fournitures', j: -12, e: 18, st: 'envoyee', recu: 0, l: [_tl('Ciment CPJ 45', 50, 80, 20, 'sac')] },
    { c: 'Boulangerie Al Amal', j: -8, e: 22, st: 'payee', recu: 'tout', l: [_tl('Main d’œuvre', 5, 120, 20, 'h')] },
    { c: 'Cabinet Médical Idrissi', j: -3, e: 27, st: 'envoyee', recu: 0, l: [_tl('Peinture murale 20 L', 2, 450, 20), _tl('Transport local', 1, 200, 0)] },
    { c: 'Karim Trading', j: -1, e: 29, st: 'brouillon', recu: 0, l: [_tl('Sable lavé', 5, 100, 20, 't')] }];
  var idsFactures = [];
  for (i = 0; i < factures.length; i++) {
    await essai('facture ' + (i + 1), (function (f, k) { return async function () {
      var t = calculerTotauxLignes(f.l);
      var r = await sb.post('factures', { user_id: uid, cree_par: sb.user.id, ref: 'TEST-F' + (100 + k), client: f.c + _TEST, chantier: '', date_emission: _tj(f.j), echeance: _tj(f.e),
        paiement: 'virement', note: 'Donnée de test', statut: f.st, ht: t.ht, tva: t.tva, ttc: t.ttc, lignes: f.l, devise: 'MAD',
        montant_recu: f.recu === 'tout' ? t.ttc : f.recu });
      idsFactures[k] = r && r[0];
    }; })(factures[i], i));
  }
  var devis = [['Karim Trading', [_tl('Peinture murale 20 L', 6, 450, 20)]], ['Atlas Distribution', [_tl('Ciment CPJ 45', 100, 80, 20, 'sac'), _tl('Transport local', 1, 200, 0)]]];
  for (i = 0; i < devis.length; i++) {
    await essai('devis ' + (i + 1), (function (d, k) { return async function () {
      var t = calculerTotauxLignes(d[1]);
      await sb.post('devis', { user_id: uid, cree_par: sb.user.id, ref: 'TEST-D' + (100 + k), client: d[0] + _TEST, date_emission: _tj(-5 - k), validite: 30, note: 'Donnée de test',
        statut: 'envoye', ht: t.ht, tva: t.tva, ttc: t.ttc, lignes: d[1], devise: 'MAD' });
    }; })(devis[i], i));
  }
  var achats = [
    ['Matériaux du Nord', 'MN-2026-0412', -20, 'payee', [_tl('Ciment en gros', 100, 60, 20)]],
    ['Papeterie Centrale', 'PC-8891', -9, 'attente', [_tl('Fournitures de bureau', 1, 850, 20)]],
    ['Transports Rapides', 'TR-0077', -4, 'attente', [_tl('Livraison chantier', 2, 300, 10)]]];
  for (i = 0; i < achats.length; i++) {
    await essai('achat ' + (i + 1), (function (a) { return async function () {
      var ht = a[4].reduce(function (s, l) { return s + l.qte * l.pu; }, 0), taux = a[4][0].tva, tva = Math.round(ht * taux) / 100;
      await sb.post('factures_achat', { user_id: uid, cree_par: sb.user.id, fournisseur: a[0] + _TEST, ref_fournisseur: a[1], date_achat: _tj(a[2]), echeance: _tj(a[2] + 30),
        ht: ht, tva: tva, tva_taux: taux, ttc: ht + tva, categorie: 'fournitures', statut: a[3], note: 'Donnée de test', lignes: a[4], created_at: new Date().toISOString() });
    }; })(achats[i]));
  }
  // Un avoir lié à la première facture.
  await essai('avoir', async function () {
    var f0 = idsFactures[0]; if (!f0) throw new Error('facture 1 absente');
    var ht = 100, tva = 20;
    await sb.post('avoirs', { user_id: uid, ref: 'TEST-AV100', client: 'Karim Trading' + _TEST, ht: ht, tva: tva, ttc: ht + tva, date_emission: _tj(-20),
      motif: 'remboursement', facture_origine_id: f0.id, facture_origine_ref: f0.ref || '' });
  });

  try { if (typeof loadAll === 'function') await loadAll(); } catch (e) {}
  try { goScreen('dashboard', null); } catch (e) {}
  showToast(ko.length ? '⚠️ Entreprise de test créée avec ' + ko.length + ' erreur(s) — voir la console' : '✅ Entreprise de test créée : ' + ok + ' éléments', ko.length ? 'error' : 'success');
  if (ko.length) console.warn('Données de test — erreurs :\n' + ko.join('\n'));
  return { ok: ok, erreurs: ko };
}

async function supprimerDonneesTest() {
  if (!_testActif()) return;
  if (!confirm('Supprimer toutes les données marquées [TEST] ?\n\nLes factures émises ne peuvent pas être supprimées (règle légale) : elles resteront. Pour un nettoyage complet, abandonnez simplement le compte de test.')) return;
  var uid = STATE.entrepriseId || sb.user.id, motif = encodeURIComponent('*[TEST]*'), total = 0, bloques = 0;
  var cibles = [['clients', 'nom'], ['produits', 'nom'], ['fournisseurs', 'nom'], ['devis', 'client'], ['avoirs', 'client'], ['factures_achat', 'fournisseur'], ['factures', 'client']];
  for (var i = 0; i < cibles.length; i++) {
    try {
      var r = await sb.del(cibles[i][0], 'user_id=eq.' + uid + '&' + cibles[i][1] + '=ilike.' + motif);
      total += Array.isArray(r) ? r.length : 0;
    } catch (e) { bloques++; console.warn('Suppression test ' + cibles[i][0] + ' :', e.message); }
  }
  try { if (typeof loadAll === 'function') await loadAll(); } catch (e) {}
  showToast('🧹 ' + total + ' élément(s) de test supprimé(s)' + (bloques ? ' — certains ont été refusés (factures émises)' : ''), 'success');
  try { goScreen('dashboard', null); } catch (e) {}
}
