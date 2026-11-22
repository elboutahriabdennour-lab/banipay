// Tafir — codes-barres des articles : scan par la caméra ou par un lecteur USB / Bluetooth.
// Un lecteur de code-barres se comporte comme un clavier : il tape le code puis « Entrée ».
// La caméra utilise le détecteur du navigateur, ou à défaut une bibliothèque locale (js/vendor/zxing-library.min.js).
(function () {
  var FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
  var _zxingPromesse = null;

  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function norm(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F\s]+/g, '').slice(0, 64); }

  function chargerZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (_zxingPromesse) return _zxingPromesse;
    _zxingPromesse = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'js/vendor/zxing-library.min.js?v=1';
      s.onload = function () { window.ZXing ? ok(window.ZXing) : ko(new Error('zxing')); };
      s.onerror = function () { _zxingPromesse = null; ko(new Error('zxing')); };
      document.head.appendChild(s);
    });
    return _zxingPromesse;
  }

  // Clé de comparaison : pour un code 100 % numérique, les zéros de tête sont ignorés (UPC-A 12 chiffres = EAN-13 commençant par 0).
  function cle(c) { c = norm(c); return /^\d+$/.test(c) ? c.replace(/^0+/, '') : c.toLowerCase(); }

  // Cherche un article par code-barres (puis par référence exacte).
  function trouver(code) {
    code = norm(code); if (!code) return null;
    var l = STATE.produits || [];
    return l.filter(function (p) { return p.code_barre && cle(p.code_barre) === cle(code); })[0]
        || l.filter(function (p) { return p.reference && norm(p.reference).toLowerCase() === code.toLowerCase(); })[0]
        || null;
  }


  // Caméra : mise au point et exposition automatiques en continu, toucher pour refaire la mise au point,
  // boutons lampe et zoom quand le téléphone les permet. Sans effet (et sans erreur) si non pris en charge.
  function ameliorerCamera(stream, video, ov) {
    var track = stream && stream.getVideoTracks && stream.getVideoTracks()[0]; if (!track) return;
    var caps = {}; try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (x) {}
    function appliquer(adv) { try { return track.applyConstraints({ advanced: [adv] }).catch(function () {}); } catch (x) {} }
    function has(arr, v) { return arr && arr.indexOf && arr.indexOf(v) >= 0; }
    if (has(caps.focusMode, 'continuous')) appliquer({ focusMode: 'continuous' });
    if (has(caps.exposureMode, 'continuous')) appliquer({ exposureMode: 'continuous' });
    if (has(caps.whiteBalanceMode, 'continuous')) appliquer({ whiteBalanceMode: 'continuous' });
    // Toucher l'image : refait la mise au point à cet endroit
    var cadre = video.parentNode;
    cadre.addEventListener('click', function (ev) {
      var r = cadre.getBoundingClientRect(), pt = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
      if (has(caps.focusMode, 'single-shot') || has(caps.focusMode, 'continuous')) {
        appliquer({ focusMode: has(caps.focusMode, 'single-shot') ? 'single-shot' : 'continuous', pointsOfInterest: [pt] });
        setTimeout(function () { if (has(caps.focusMode, 'continuous')) appliquer({ focusMode: 'continuous' }); }, 1500);
      }
    });
    // Barre de boutons : lampe + zoom
    var barre = document.createElement('div');
    barre.style.cssText = 'position:absolute;right:8px;bottom:8px;display:flex;gap:6px';
    function bouton(txt, titre, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = titre;
      b.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:999px;min-width:40px;height:40px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit';
      b.onclick = function (ev) { ev.stopPropagation(); fn(b); }; barre.appendChild(b); return b;
    }
    if (caps.torch) { var on = false; bouton('🔦', 'Lampe', function (b) { on = !on; appliquer({ torch: on }); b.style.background = on ? 'rgba(226,190,60,.9)' : 'rgba(0,0,0,.55)'; }); }
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      var z = caps.zoom.min, pas = (caps.zoom.max - caps.zoom.min) / 4;
      bouton('🔍+', 'Zoom +', function () { z = Math.min(caps.zoom.max, z + pas); appliquer({ zoom: z }); });
      bouton('🔍−', 'Zoom −', function () { z = Math.max(caps.zoom.min, z - pas); appliquer({ zoom: z }); });
    }
    if (barre.children.length) cadre.appendChild(barre);
    // Petit rappel d'usage
    var et = ov.querySelector('#cb-etat'); if (et && et.textContent.indexOf('Placez') === 0) et.textContent = 'Placez le code-barres devant la caméra. Touchez l’image pour faire la mise au point.';
  }

  // Ouvre l'écran de scan. surCode(code) est appelé une fois ; on ferme ensuite.
  function scanner(titre, surCode) {
    var ancien = document.getElementById('cb-scan'); if (ancien) ancien.remove();
    var ov = document.createElement('div');
    ov.id = 'cb-scan';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,31,26,.96);display:flex;flex-direction:column;align-items:center;box-sizing:border-box;width:100%;max-width:100vw;padding:calc(16px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));overflow-x:hidden;overflow-y:auto;font-family:inherit';
    ov.innerHTML =
      '<div style="width:100%;max-width:440px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="flex:1;color:#fff;font-size:15px;font-weight:700">' + e(titre || 'Scanner un code-barres') + '</div>'
      + '<button type="button" id="cb-fermer" style="background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Fermer</button></div>'
      + '<div style="position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:4/3">'
      + '<video id="cb-video" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>'
      + '<div style="position:absolute;left:12%;right:12%;top:50%;height:2px;background:#E24B3B;box-shadow:0 0 8px #E24B3B"></div></div>'
      + '<div id="cb-etat" style="color:#C9D6CF;font-size:12px;margin:8px 0;min-height:16px">Placez le code-barres devant la caméra.</div>'
      + '<div style="background:#fff;border-radius:12px;padding:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#14241F">Ou tapez le code / utilisez votre lecteur</div>'
      + '<div style="display:flex;gap:8px"><input id="cb-manuel" inputmode="text" autocomplete="off" autocapitalize="off" placeholder="Code-barres" style="flex:1;min-width:0;padding:11px;border:1.5px solid #DDE3DA;border-radius:10px;font-size:15px;font-family:inherit">'
      + '<button type="button" id="cb-valider" style="padding:11px 16px;border:none;border-radius:10px;background:#1B5E4B;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">OK</button></div></div>'
      + '</div>';
    document.body.appendChild(ov);

    var flux = null, arret = false, lecteur = null, boucle = null, fini = false;
    function nettoyer() {
      arret = true; if (boucle) clearTimeout(boucle);
      try { if (lecteur && lecteur.reset) lecteur.reset(); } catch (x) {}
      try { if (flux) flux.getTracks().forEach(function (t) { t.stop(); }); } catch (x) {}
      ov.remove();
    }
    var derniere = null, nbLectures = 0;
    function trouve(code, format, manuel) {
      code = norm(code); if (!code || fini) return;
      // Caméra : le même code doit être lu 2 fois de suite (évite les lectures fausses). Saisie / lecteur USB : tout de suite.
      if (!manuel) {
        if (code === derniere) nbLectures++; else { derniere = code; nbLectures = 1; }
        if (nbLectures < 2) { etat('Lecture… ' + code + ' (confirmation)'); return; }
      }
      fini = true; nettoyer();
      try { surCode(code, format || (manuel ? 'saisie' : '')); } catch (x) { console.warn('scan:', x); }
    }
    ov.querySelector('#cb-fermer').onclick = nettoyer;
    var champ = ov.querySelector('#cb-manuel');
    ov.querySelector('#cb-valider').onclick = function () { trouve(champ.value, 'saisie', true); };
    champ.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); trouve(champ.value, 'saisie', true); } };
    setTimeout(function () { try { champ.focus(); } catch (x) {} }, 100);

    function etat(t) { var n = ov.querySelector('#cb-etat'); if (n) n.textContent = t; }
    var video = ov.querySelector('#cb-video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { etat('Caméra indisponible ici : utilisez le champ ci-dessous ou un lecteur.'); return; }

    if ('BarcodeDetector' in window) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (s) {
        if (arret) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        flux = s; video.srcObject = s; video.play().catch(function () {}); ameliorerCamera(s, video, ov);
        var det;
        try { det = new BarcodeDetector({ formats: FORMATS }); } catch (x) { det = new BarcodeDetector(); }
        (function tour() {
          if (arret) return;
          det.detect(video).then(function (r) { if (r && r.length && r[0].rawValue) { trouve(r[0].rawValue, r[0].format); if (!fini) boucle = setTimeout(tour, 150); } else boucle = setTimeout(tour, 180); })
            .catch(function () { boucle = setTimeout(tour, 400); });
        })();
      }).catch(function () { etat('Caméra refusée : utilisez le champ ci-dessous ou un lecteur.'); });
    } else {
      chargerZXing().then(function (Z) {
        if (arret) return;
        var hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE]);
        lecteur = new Z.BrowserMultiFormatReader(hints, 300);
        var essais = 0; (function att() { if (arret) return; var st = video.srcObject; if (st && st.getVideoTracks && st.getVideoTracks().length) { flux = flux || st; ameliorerCamera(st, video, ov); } else if (essais++ < 20) setTimeout(att, 300); })();
        lecteur.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }, video, function (res) {
          if (res && res.getText) { var f = ''; try { f = Z.BarcodeFormat[res.getBarcodeFormat()] || ''; } catch (x) {} trouve(res.getText(), f); }
        }).catch(function () { etat('Caméra refusée : utilisez le champ ci-dessous ou un lecteur.'); });
      }).catch(function () { etat('Scan caméra indisponible : utilisez le champ ci-dessous ou un lecteur.'); });
    }
  }

  // Remplit un champ de formulaire avec un code scanné.
  function scannerDansChamp(idChamp) {
    scanner('Scanner le code-barres de l\'article', function (code, format) {
      var c = document.getElementById(idChamp); if (c) { c.value = code; c.dispatchEvent(new Event('input', { bubbles: true })); }
      var p = trouver(code);
      var courant = window.STATE && STATE.currentProduit;
      if (p && !(courant && courant.id === p.id)) showToast('⚠️ Ce code est déjà utilisé par : ' + p.nom, 'error');
      else showToast('✅ Code lu : ' + code + (format && format !== 'saisie' ? ' (' + String(format).toUpperCase().replace('_', '-') + ')' : ''), 'success');
    });
  }

  // Code interne Tafir (EAN-13 de la plage 200-299, réservée à l'usage interne) avec clé de contrôle.
  function genererInterne(idChamp) {
    var base = '2' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1e5)).padStart(5, '0');
    base = base.slice(0, 12).padEnd(12, '0');
    var s = 0; for (var i = 0; i < 12; i++) s += Number(base[i]) * (i % 2 ? 3 : 1);
    var code = base + ((10 - (s % 10)) % 10);
    var c = document.getElementById(idChamp); if (c) c.value = code;
    return code;
  }

  // Produits : scan → ajuster le stock de l'article trouvé.
  function scannerPourStock() {
    scanner('Scanner pour le stock (entrée / sortie)', function (code) {
      var p = trouver(code);
      if (!p) { if (confirm('Aucun article avec le code ' + code + '. Créer cet article maintenant ?')) { window._cbCodeAttente = code; goScreen('nouveau-produit', null); } return; }
      if (typeof ouvrirAjustementStock === 'function') ouvrirAjustementStock(p.id);
    });
  }

  // Facture / achat : scan → ajoute l'article (ou +1 s'il est déjà dans la facture).
  function scannerPourLigne() {
    scanner('Scanner un article', function (code) {
      var p = trouver(code);
      if (!p) { showToast('Aucun article avec le code ' + code, 'error'); return; }
      var achat = !!window._catalogueModePourAchat;
      if (!achat && Array.isArray(STATE.lignesF)) {
        var l = STATE.lignesF.filter(function (x) { return x.produit_id === p.id; })[0];
        if (l) { l.qte = (Number(l.qte) || 0) + 1; if (typeof closeAllModals === 'function') closeAllModals(); if (typeof renderLignesF === 'function') renderLignesF(); showToast('✅ ' + p.nom + ' : quantité ' + l.qte); return; }
      }
      if (!achat && p.stock != null && Number(p.stock) <= 0) showToast('⚠️ ' + p.nom + ' : stock à 0');
      if (typeof ajouterDepuisCatalogue === 'function') ajouterDepuisCatalogue(p.id);
    });
  }

  // ── Étiquette imprimable : affiche le vrai code-barres de l'article, à scanner ou à imprimer ──
  var _jsbPromesse = null;
  function chargerJsBarcode() {
    if (window.JsBarcode) return Promise.resolve(window.JsBarcode);
    if (_jsbPromesse) return _jsbPromesse;
    _jsbPromesse = new Promise(function (ok, ko) {
      var sc = document.createElement('script'); sc.src = 'js/vendor/jsbarcode.min.js?v=1';
      sc.onload = function () { window.JsBarcode ? ok(window.JsBarcode) : ko(new Error('jsb')); };
      sc.onerror = function () { _jsbPromesse = null; ko(new Error('jsb')); };
      document.head.appendChild(sc);
    });
    return _jsbPromesse;
  }
  function formatPour(code) {
    if (/^\d{13}$/.test(code)) return 'EAN13';
    if (/^\d{8}$/.test(code)) return 'EAN8';
    return 'CODE128';
  }
  function etiquette(code, nom, prix) {
    code = norm(code);
    if (!code) { showToast('Saisissez ou créez d\'abord un code-barres', 'error'); return; }
    chargerJsBarcode().then(function (JB) {
      var ancien = document.getElementById('cb-etiquette'); if (ancien) ancien.remove();
      var ov = document.createElement('div'); ov.id = 'cb-etiquette';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,31,26,.85);display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;max-width:100vw;padding:calc(14px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px));overflow-x:hidden;overflow-y:auto';
      ov.innerHTML = '<div style="background:#fff;border-radius:16px;padding:16px;max-width:360px;width:100%;text-align:center">'
        + '<div style="font-weight:800;color:#1B5E4B;margin-bottom:8px">🏷️ Étiquette</div>'
        + '<div id="cb-etq" style="background:#fff;border:1px solid #EAE4DA;border-radius:8px;padding:10px">'
        + '<div style="font-size:13px;font-weight:700;margin-bottom:2px">' + e(nom || '') + '</div>'
        + (prix ? '<div style="font-size:13px;margin-bottom:4px">' + e(prix) + '</div>' : '')
        + '<svg id="cb-svg" style="max-width:100%"></svg></div>'
        + '<div style="font-size:11px;color:#8E9C95;margin:8px 0">Scannez ce code avec la caméra de Tafir pour tester, ou imprimez-le.</div>'
        + '<div style="display:flex;gap:8px"><button type="button" id="cb-etq-imp" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #1B5E4B;background:#fff;color:#1B5E4B;font-weight:700;cursor:pointer;font-family:inherit">🖨️ Imprimer</button>'
        + '<button type="button" id="cb-etq-fermer" style="flex:1;padding:12px;border-radius:10px;border:none;background:#1B5E4B;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">Fermer</button></div></div>';
      document.body.appendChild(ov);
      try { JB('#cb-svg', code, { format: formatPour(code), width: 2, height: 70, displayValue: true, fontSize: 14, margin: 6 }); }
      catch (x) { try { JB('#cb-svg', code, { format: 'CODE128', width: 2, height: 70, displayValue: true, fontSize: 14, margin: 6 }); } catch (y) { showToast('Code illisible pour une étiquette', 'error'); ov.remove(); return; } }
      ov.querySelector('#cb-etq-fermer').onclick = function () { ov.remove(); };
      ov.querySelector('#cb-etq-imp').onclick = function () {
        var w = window.open('', '_blank', 'width=380,height=420'); if (!w) { showToast('Autorisez les fenêtres pour imprimer', 'error'); return; }
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Étiquette</title><style>@page{margin:4mm}body{margin:0;font-family:sans-serif;text-align:center}</style></head><body>' + ov.querySelector('#cb-etq').innerHTML + '</body></html>');
        w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
      };
    }).catch(function () { showToast('Étiquette indisponible', 'error'); });
  }
  function etiquetteDepuisChamp(idCode, idNom, idPrix) {
    var c = document.getElementById(idCode), n = document.getElementById(idNom), p = document.getElementById(idPrix);
    etiquette(c && c.value, n && n.value, p && p.value ? p.value + ' MAD TTC' : '');
  }

  window.CB = { etiquette: etiquette, etiquetteDepuisChamp: etiquetteDepuisChamp, norm: norm, trouver: trouver, scanner: scanner, scannerDansChamp: scannerDansChamp, genererInterne: genererInterne, scannerPourStock: scannerPourStock, scannerPourLigne: scannerPourLigne };
})();
