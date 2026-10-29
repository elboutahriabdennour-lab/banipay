// TAFIR — modele-facture.js : l'entreprise personnalise l'apparence de ses factures (couleur, police, en-tête, logo…).
// Les mentions obligatoires (numéro, dates, ICE/IF/RC, TVA, total en lettres) ne peuvent pas être masquées.
var _mf = { brouillon: null, minuteur: null };

var _MF_COULEURS = ['#1B5E4B', '#3E4C59', '#9E5C48', '#695C73', '#1F5F8B', '#7A2E3A', '#2F6F73', '#14241F'];


// ── Suggestions automatiques d'après les couleurs du logo ──
function _mfHex2Hsl(hex) {
  var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function _mfHsl2Hex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  function p(v) { var n = Math.round((v + m) * 255).toString(16); return n.length < 2 ? '0' + n : n; }
  return '#' + p(r) + p(g) + p(b);
}

// Lit les pixels du logo et renvoie {dominante, secondaire} (ou null si le logo est illisible).
function _mfCouleursLogo(src) {
  return new Promise(function (resolve) {
    if (!src) return resolve(null);
    var img = new Image();
    img.onload = function () {
      try {
        var W = 80, H = Math.max(1, Math.round(80 * (img.naturalHeight || 80) / (img.naturalWidth || 80)));
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
        var px = ctx.getImageData(0, 0, W, H).data, seaux = {}, sombres = {};
        for (var i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 200) continue;
          var r = px[i], g = px[i + 1], b = px[i + 2];
          var hex = '#' + [r, g, b].map(function (v) { var n = v.toString(16); return n.length < 2 ? '0' + n : n; }).join('');
          var hsl = _mfHex2Hsl(hex);
          if (hsl[2] > 0.93) continue;
          var cle = (r >> 4) + '-' + (g >> 4) + '-' + (b >> 4);
          var cible = (hsl[1] < 0.18 || hsl[2] < 0.08) ? sombres : seaux;
          var poids = 1 + hsl[1] * 2;
          var e = cible[cle] || (cible[cle] = { n: 0, r: 0, g: 0, b: 0 });
          e.n += poids; e.r += r * poids; e.g += g * poids; e.b += b * poids;
        }
        function liste(o) {
          return Object.keys(o).map(function (k) {
            var e = o[k];
            return { n: e.n, hex: _mfHsl2Hex.apply(null, _mfHex2Hsl('#' + [e.r / e.n, e.g / e.n, e.b / e.n].map(function (v) { var n = Math.round(v).toString(16); return n.length < 2 ? '0' + n : n; }).join(''))) };
          }).sort(function (a, b) { return b.n - a.n; });
        }
        var col = liste(seaux), gris = liste(sombres);
        var dom = col[0] || gris[0];
        if (!dom) return resolve(null);
        var sec = null, hd = _mfHex2Hsl(dom.hex)[0];
        for (var j = 1; j < col.length; j++) {
          var d = Math.abs(_mfHex2Hsl(col[j].hex)[0] - hd); d = Math.min(d, 360 - d);
          if (d > 35 && col[j].n > col[0].n * 0.08) { sec = col[j].hex; break; }
        }
        resolve({ dominante: dom.hex, secondaire: sec });
      } catch (e) { resolve(null); }
    };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

function _mfConstruireSuggestions(dom, sec) {
  var hsl = _mfHex2Hsl(dom), h = hsl[0], s = Math.min(hsl[1], 0.75);
  var moyen = _mfHsl2Hex(h, s, Math.min(0.42, Math.max(0.22, hsl[2])));
  var sombre = _mfHsl2Hex(h, Math.min(s, 0.5), 0.14);
  var teinte = _mfHsl2Hex(h, Math.min(s, 0.45), 0.96);
  var teinte2 = _mfHsl2Hex(h, Math.min(s, 0.4), 0.91);
  var accent2 = sec ? _mfHsl2Hex(_mfHex2Hsl(sec)[0], Math.min(_mfHex2Hsl(sec)[1], 0.75), Math.min(0.45, Math.max(0.25, _mfHex2Hsl(sec)[2]))) : moyen;
  return [
    { nom: 'Fidèle au logo', couleur: moyen, entete: 'couleur', c: { fondLignes: teinte }, vue: { page: '#fff', tete: moyen, tab: moyen, tot: sombre } },
    { nom: 'Sobre et clair', couleur: moyen, entete: 'clair', c: { fondTableau: moyen, fondTotal: moyen }, vue: { page: '#fff', tete: '#fff', tab: moyen, tot: moyen } },
    { nom: 'Élégant sombre', couleur: accent2, entete: 'sombre', c: { fondEntete: sombre, fondTableau: sombre, fondTotal: sombre }, vue: { page: '#fff', tete: sombre, tab: sombre, tot: sombre } },
    { nom: 'Doux et chaleureux', couleur: moyen, entete: 'clair', c: { fondPage: _mfHsl2Hex(h, Math.min(s, 0.5), 0.975), fondLignes: teinte2, fondTableau: moyen, fondTotal: sombre }, vue: { page: _mfHsl2Hex(h, Math.min(s, 0.5), 0.975), tete: teinte2, tab: moyen, tot: sombre } }
  ];
}

function _mfAppliquerSuggestion(i) {
  var sg = _mf.suggestions && _mf.suggestions[i]; if (!sg) return;
  _mf.brouillon.couleur = sg.couleur;
  _mf.brouillon.entete = sg.entete;
  _mf.brouillon.zebre = true;
  _mf.brouillon.c = Object.assign({}, sg.c);
  _mfDessinerControles();
  clearTimeout(_mf.minuteur);
  _mf.minuteur = setTimeout(_mfApercu, 120);
  showToast('Modèle « ' + sg.nom + ' » appliqué — pensez à enregistrer');
}

function _mfBlocSuggestions() {
  var p = STATE.profil || {}, base = _mf.logoCouleurs;
  var dom = base ? base.dominante : (_MF_COULEURS[0]);
  if (!_mf.suggestions) _mf.suggestions = _mfConstruireSuggestions(dom, base ? base.secondaire : null);
  var intro = base
    ? '<div class="mf-logo-coul"><i style="background:' + base.dominante + '"></i>' + (base.secondaire ? '<i style="background:' + base.secondaire + '"></i>' : '') + '<span>Couleurs trouvées dans votre logo</span></div>'
    : '<div class="mf-aide" style="margin:-4px 0 10px">' + (p.logo ? 'Les couleurs du logo n\'ont pas pu être lues. Voici des idées de départ.' : 'Ajoutez votre logo dans « Modifier le profil » pour des suggestions à ses couleurs. Voici des idées de départ.') + '</div>';
  return '<div class="mf-bloc"><div class="mf-titre">Modèles proposés</div>' + intro + '<div class="mf-sugs">' +
    _mf.suggestions.map(function (sg, i) {
      return '<button type="button" class="mf-sug" onclick="_mfAppliquerSuggestion(' + i + ')"><span class="mf-mini-doc" style="background:' + sg.vue.page + '"><i style="background:' + sg.vue.tete + '"></i><b style="background:' + sg.vue.tab + '"></b><b style="background:' + sg.vue.tab + ';opacity:.4"></b><u style="background:' + sg.vue.tot + '"></u></span><span>' + sg.nom + '</span></button>';
    }).join('') + '</div></div>';
}

function chargerModeleFacture() {
  var p = STATE.profil || {};
  _mf.brouillon = normaliserModele(p.modele_facture);
  _mf.suggestions = null; _mf.logoCouleurs = null;
  _mfDessinerControles();
  _mfApercu();
  _mfCouleursLogo(p.logo).then(function (cl) {
    _mf.logoCouleurs = cl; _mf.suggestions = null;
    if (el('screen-modele-facture') && el('screen-modele-facture').classList.contains('active')) _mfDessinerControles();
  });
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
  var html = _mfBlocSuggestions();
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
