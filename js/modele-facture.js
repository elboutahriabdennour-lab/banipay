// TAFIR — modele-facture.js : l'entreprise personnalise l'apparence de ses factures (couleur, police, en-tête, logo…).
// Les mentions obligatoires (numéro, dates, ICE/IF/RC, TVA, total en lettres) ne peuvent pas être masquées.
var _mf = { brouillon: null, minuteur: null };

var _MF_COULEURS = ['#1B5E4B', '#3E4C59', '#9E5C48', '#695C73', '#1F5F8B', '#7A2E3A', '#2F6F73', '#14241F'];

function chargerModeleFacture() {
  var p = STATE.profil || {};
  _mf.brouillon = normaliserModele(p.modele_facture);
  _mfDessinerControles();
  _mfApercu();
}

function _mfMaj(cle, valeur) {
  _mf.brouillon[cle] = valeur;
  _mfDessinerControles();
  clearTimeout(_mf.minuteur);
  _mf.minuteur = setTimeout(_mfApercu, 120);
}

function _mfPuces(cle, options) {
  var m = _mf.brouillon;
  return '<div class="mf-puces">' + options.map(function (o) {
    return '<button type="button" class="mf-puce' + (m[cle] === o[0] ? ' on' : '') + '" onclick="_mfMaj(\'' + cle + '\',\'' + o[0] + '\')">' + o[1] + '</button>';
  }).join('') + '</div>';
}

function _mfInterrupteur(cle, libelle) {
  var on = !!_mf.brouillon[cle];
  return '<label class="mf-ligne" onclick="event.preventDefault();_mfMaj(\'' + cle + '\',' + (!on) + ')"><span>' + libelle + '</span>' +
    '<span class="mf-inter' + (on ? ' on' : '') + '"><i></i></span></label>';
}

function _mfDessinerControles() {
  var zone = el('mf-controles'); if (!zone) return;
  var m = _mf.brouillon, p = STATE.profil || {};
  var coul = m.couleur || p.couleur_accent || '#1B5E4B';
  var html = '';
  html += '<div class="mf-bloc"><div class="mf-titre">Couleur</div><div class="mf-pastilles">' +
    _MF_COULEURS.map(function (c) { return '<button type="button" class="mf-pastille' + (coul.toLowerCase() === c.toLowerCase() ? ' on' : '') + '" style="background:' + c + '" aria-label="' + c + '" onclick="_mfMaj(\'couleur\',\'' + c + '\')"></button>'; }).join('') +
    '<label class="mf-pastille mf-libre" title="Autre couleur"><input type="color" value="' + coul + '" onchange="_mfMaj(\'couleur\',this.value)"><span>+</span></label></div></div>';
  html += '<div class="mf-bloc"><div class="mf-titre">Police</div><select class="f-inp" onchange="_mfMaj(\'police\',this.value)">' +
    Object.keys(POLICES_MODELE).map(function (k) { return '<option value="' + k + '"' + (m.police === k ? ' selected' : '') + '>' + POLICES_MODELE[k].nom + '</option>'; }).join('') + '</select></div>';
  html += '<div class="mf-bloc"><div class="mf-titre">En-tête</div>' + _mfPuces('entete', [['sombre', 'Sombre'], ['couleur', 'Couleur'], ['clair', 'Clair']]) + '</div>';
  html += '<div class="mf-bloc"><div class="mf-titre">Logo</div>' + _mfPuces('logoPos', [['gauche', 'À gauche'], ['droite', 'À droite']]) +
    '<div style="height:8px"></div>' + _mfPuces('logoTaille', [['petit', 'Petit'], ['moyen', 'Moyen'], ['grand', 'Grand']]) +
    (p.logo ? '' : '<div class="mf-aide">Vous n\'avez pas encore de logo : ajoutez-le dans « Modifier le profil ».</div>') + '</div>';
  html += '<div class="mf-bloc"><div class="mf-titre">Tableau et zones</div>' +
    _mfInterrupteur('zebre', 'Lignes du tableau en alternance') +
    _mfInterrupteur('montrerRib', 'Afficher les coordonnées bancaires') +
    _mfInterrupteur('montrerSignature', 'Afficher la zone cachet et signature') +
    _mfInterrupteur('montrerMarque', 'Afficher « Tafir » en bas de page') + '</div>';
  html += '<div class="mf-bloc"><div class="mf-titre">Texte d\'introduction</div>' +
    '<textarea class="f-inp" rows="2" maxlength="300" placeholder="Ex. : Merci pour votre confiance." oninput="_mfTexte(\'intro\',this.value)">' + escapeHTML(m.intro) + '</textarea></div>';
  html += '<div class="mf-bloc"><div class="mf-titre">Message en bas de page</div>' +
    '<input class="f-inp" maxlength="200" placeholder="Ex. : Paiement par virement sous 30 jours." value="' + escapeHTML(m.pied).replace(/"/g, '&quot;') + '" oninput="_mfTexte(\'pied\',this.value)"></div>';
  html += '<div class="mf-bloc"><div class="mf-titre">Toutes les couleurs</div><div class="mf-aide" style="margin:-4px 0 8px">Changez chaque couleur une par une. « Auto » reprend la couleur d\'origine.</div>' +
    COULEURS_MODELE.map(function (d) {
      var v = m.c[d[0]] || '', affiche = v || d[2];
      return '<div class="mf-ligne mf-coul"><span>' + d[1] + '</span><span class="mf-coul-ctl">' +
        '<label class="mf-pastille mf-mini" style="background:' + affiche + '"><input type="color" value="' + affiche + '" onchange="_mfCouleur(\'' + d[0] + '\',this.value)"></label>' +
        '<button type="button" class="mf-auto' + (v ? '' : ' on') + '" onclick="_mfCouleur(\'' + d[0] + '\',\'\')">Auto</button></span></div>';
    }).join('') + '</div>';
  html += '<div class="mf-aide" style="margin:6px 0 14px">Les mentions obligatoires restent toujours affichées : numéro, dates, ICE, IF, RC, TVA et total en lettres.</div>';
  html += '<button class="mf-reset" onclick="reinitialiserModeleFacture()">Revenir au modèle d\'origine</button>' +
    '<div class="mf-barre"><button class="btn-primary" style="width:100%" onclick="enregistrerModeleFacture()">Enregistrer ce modèle</button></div>';
  zone.innerHTML = html;
}

function _mfCouleur(cle, valeur) {
  if (!_mf.brouillon.c) _mf.brouillon.c = {};
  if (valeur) _mf.brouillon.c[cle] = valeur; else delete _mf.brouillon.c[cle];
  _mfDessinerControles();
  clearTimeout(_mf.minuteur);
  _mf.minuteur = setTimeout(_mfApercu, 120);
}

function _mfTexte(cle, valeur) {
  _mf.brouillon[cle] = valeur;
  clearTimeout(_mf.minuteur);
  _mf.minuteur = setTimeout(_mfApercu, 250);
}

function _mfApercu() {
  var cadre = el('mf-apercu'); if (!cadre) return;
  var p = Object.assign({}, STATE.profil || {}, { modele_facture: _mf.brouillon });
  var exemple = {
    type: 'FACTURE', ref: 'FAC-2026-0001', color: p.couleur_accent || '#1B5E4B', emetteur: p,
    destinataire: { nom: 'Société Atlas SARL', ice: '001234567000089', adresse: '12 rue des Orangers, Casablanca', tel: '' },
    date: '2026-10-29', echeance: '2026-11-28', paiement: 'Virement',
    lignes: [{ desc: 'Prestation de conseil', qte: 2, unite: 'jour', pu: 3000, tva: 20 }, { desc: 'Déplacement', qte: 1, unite: '', pu: 500, tva: 20 }],
    ht: 6500, tva: 1300, ttc: 7800, devise: 'MAD', montant_recu: 0, statut: 'attente'
  };
  try { cadre.srcdoc = construireHTMLDoc(exemple); } catch (e) { console.error('apercu modele', e); }
  var boite = cadre.parentNode, largeur = boite.clientWidth || 340, echelle = largeur / 794;
  cadre.style.transform = 'scale(' + echelle + ')';
  boite.style.height = Math.round(1123 * echelle) + 'px';
}

async function enregistrerModeleFacture() {
  var modele = normaliserModele(_mf.brouillon);
  try {
    await sb.patch('profils_entreprise', 'id=eq.' + (STATE.entrepriseId || sb.user.id), { modele_facture: modele });
    STATE.profil = Object.assign(STATE.profil || {}, { modele_facture: modele });
    showToast('Modèle enregistré');
  } catch (e) {
    console.error('modele facture', e);
    showToast('Enregistrement impossible. Mise à jour de la base nécessaire (étape 016).', 'error');
  }
}

function reinitialiserModeleFacture() {
  _mf.brouillon = normaliserModele({});
  _mfDessinerControles();
  _mfApercu();
}

window.addEventListener('resize', function () { if (el('mf-apercu') && el('screen-modele-facture') && el('screen-modele-facture').classList.contains('active')) _mfApercu(); });
