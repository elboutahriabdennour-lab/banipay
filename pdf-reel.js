// ZELTO — pdf-reel.js
// Produit de VRAIS fichiers .pdf (avant : un fichier .html à ouvrir puis imprimer).
// À charger APRÈS js/pdf.js : remplace le visualiseur ouvrirPDFViewer(html, ref)
// et ajoute telechargerPDFDepuisHTML() / partagerPDFDepuisHTML().
// Le PDF est généré dans le navigateur (aucun envoi de données à un serveur).

(function () {
  var URL_HTML2CANVAS = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  var URL_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  var _promesseLibs = null;

  function _chargerScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Chargement impossible : ' + url)); };
      document.head.appendChild(s);
    });
  }
  function _chargerLibsPDF() {
    if (window.html2canvas && window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (_promesseLibs) return _promesseLibs;
    _promesseLibs = Promise.all([
      window.html2canvas ? Promise.resolve() : _chargerScript(URL_HTML2CANVAS),
      (window.jspdf && window.jspdf.jsPDF) ? Promise.resolve() : _chargerScript(URL_JSPDF)
    ]).catch(function (e) { _promesseLibs = null; throw e; });
    return _promesseLibs;
  }

  // Cherche, près de la fin de la page, une ligne de pixels "vide" (fond uni)
  // pour couper entre deux lignes de texte plutôt qu'au milieu d'un mot.
  function _trouverCoupe(ctx, largeur, yIdeal, yMin) {
    for (var y = yIdeal; y > yMin; y -= 2) {
      var data = ctx.getImageData(0, y, largeur, 1).data;
      var r0 = data[0], g0 = data[1], b0 = data[2], uni = true;
      for (var x = 4; x < data.length; x += 16) {
        if (Math.abs(data[x] - r0) > 6 || Math.abs(data[x + 1] - g0) > 6 || Math.abs(data[x + 2] - b0) > 6) { uni = false; break; }
      }
      if (uni) return y;
    }
    return yIdeal;
  }

  // HTML complet (string) -> Blob PDF (A4, plusieurs pages si nécessaire)
  window.htmlVersPDFBlob = async function (html) {
    await _chargerLibsPDF();
    var iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:#fff';
    document.body.appendChild(iframe);
    try {
      await new Promise(function (resolve) { iframe.onload = resolve; iframe.srcdoc = html; });
      var doc = iframe.contentDocument;
      doc.querySelectorAll('button, .no-print, script').forEach(function (n) { n.remove(); });
      var imgs = Array.prototype.slice.call(doc.images || []);
      await Promise.all(imgs.map(function (img) {
        return img.complete ? Promise.resolve() : new Promise(function (r) { img.onload = img.onerror = r; });
      }));
      if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch (e) {} }
      var racine = doc.documentElement;
      var hauteur = Math.max(racine.scrollHeight, doc.body.scrollHeight, 1123);
      iframe.style.height = hauteur + 'px';
      var canvas = await window.html2canvas(racine, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        width: 794, height: hauteur, windowWidth: 794, windowHeight: hauteur, logging: false
      });
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      var largeurMm = 210, hauteurPageMm = 297;
      var hauteurPagePx = Math.floor(canvas.width * hauteurPageMm / largeurMm);
      var ctx = canvas.getContext('2d');
      var y = 0, page = 0;
      while (y < canvas.height - 2) {
        var fin = Math.min(y + hauteurPagePx, canvas.height);
        if (fin < canvas.height) fin = _trouverCoupe(ctx, canvas.width, fin, y + Math.floor(hauteurPagePx * 0.75));
        var hTranche = fin - y;
        var tranche = document.createElement('canvas');
        tranche.width = canvas.width; tranche.height = hTranche;
        var tctx = tranche.getContext('2d');
        tctx.fillStyle = '#ffffff'; tctx.fillRect(0, 0, tranche.width, tranche.height);
        tctx.drawImage(canvas, 0, y, canvas.width, hTranche, 0, 0, canvas.width, hTranche);
        if (page > 0) pdf.addPage();
        pdf.addImage(tranche.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, largeurMm, hTranche * largeurMm / canvas.width);
        y = fin; page++;
        if (page > 30) break; // garde-fou
      }
      return pdf.output('blob');
    } finally {
      iframe.remove();
    }
  };

  function _nomFichierPDF(ref) {
    return String(ref || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim() + '.pdf';
  }
  function _toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }

  window.telechargerPDFDepuisHTML = async function (html, ref) {
    _toast('⏳ Création du PDF...');
    try {
      var blob = await window.htmlVersPDFBlob(html);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = _nomFichierPDF(ref);
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      _toast('✅ PDF téléchargé', 'success');
      return true;
    } catch (e) {
      console.warn('telechargerPDFDepuisHTML:', e);
      _toast('❌ PDF impossible (' + (e && e.message ? e.message : 'erreur') + ') — vérifiez la connexion', 'error');
      return false;
    }
  };

  window.partagerPDFDepuisHTML = async function (html, ref, titre, texte) {
    _toast('⏳ Création du PDF...');
    try {
      var blob = await window.htmlVersPDFBlob(html);
      var fichier = new File([blob], _nomFichierPDF(ref), { type: 'application/pdf' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [fichier] })) {
        try {
          await navigator.share({ title: titre || String(ref || ''), text: texte || '', files: [fichier] });
          _toast('✅ Partagé !', 'success');
          return true;
        } catch (e) { if (e && e.name === 'AbortError') return false; }
      }
      // Pas de partage de fichier possible (ordinateur) : on télécharge le PDF
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = _nomFichierPDF(ref);
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      _toast('✅ PDF téléchargé', 'success');
      return true;
    } catch (e) {
      console.warn('partagerPDFDepuisHTML:', e);
      _toast('❌ PDF impossible (' + (e && e.message ? e.message : 'erreur') + ')', 'error');
      return false;
    }
  };

  // Visualiseur plein écran : même contrat que l'ancien (id #pdf-fullscreen,
  // iframe en dessous d'une barre) car d'autres modules y ajoutent leurs barres.
  window.ouvrirPDFViewer = function (htmlContent, ref) {
    var ancien = document.getElementById('pdf-fullscreen');
    if (ancien) ancien.remove();
    var blobHtml = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    var urlHtml = URL.createObjectURL(blobHtml);
    var ov = document.createElement('div');
    ov.id = 'pdf-fullscreen';
    ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#F1EEE8;display:flex;flex-direction:column';
    var barre = document.createElement('div');
    barre.style.cssText = 'background:linear-gradient(135deg,#241F1B,#1F6F72);padding:10px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0';
    var btnStyle = 'background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit';
    barre.innerHTML =
      '<button type="button" class="pdfv-retour" style="' + btnStyle + '" aria-label="Retour">← Retour</button>' +
      '<div style="flex:1;font-size:13px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="pdfv-titre"></div>' +
      '<button type="button" class="pdfv-dl" style="' + btnStyle + ';background:#C9971F" aria-label="Télécharger le PDF">⬇️ PDF</button>' +
      '<button type="button" class="pdfv-share" style="' + btnStyle + '" aria-label="Partager">📤</button>';
    barre.querySelector('.pdfv-titre').textContent = ref || 'Document';
    var cadre = document.createElement('iframe');
    cadre.title = String(ref || 'Document');
    cadre.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
    cadre.src = urlHtml;
    ov.appendChild(barre); ov.appendChild(cadre);
    document.body.appendChild(ov);
    barre.querySelector('.pdfv-retour').onclick = function () {
      try { URL.revokeObjectURL(urlHtml); } catch (e) {}
      ov.remove();
      document.getElementById('pdf-cpt-controls')?.remove();
    };
    barre.querySelector('.pdfv-dl').onclick = function () { window.telechargerPDFDepuisHTML(htmlContent, ref); };
    barre.querySelector('.pdfv-share').onclick = function () { window.partagerPDFDepuisHTML(htmlContent, ref, String(ref || ''), ''); };
  };
})();
