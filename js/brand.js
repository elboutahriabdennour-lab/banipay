// ZELTO — brand.js : le nom de la marque est défini ICI et nulle part ailleurs dans l'interface.
// Pour changer de nom : modifier NOM et (si besoin) ACCENT ci-dessous, puis déposer ce fichier.
var BRAND = { nom: 'Zelto', accent: 'to', slogan: 'Devis et factures pour les entreprises marocaines' };

function appliquerMarque() {
  // Les éléments marqués data-brand affichent le nom (avec la fin du nom en couleur d'accent).
  var n = BRAND.nom, cut = BRAND.accent && n.endsWith(BRAND.accent) ? n.length - BRAND.accent.length : n.length;
  document.querySelectorAll('[data-brand]').forEach(function (e) {
    e.innerHTML = '';
    e.appendChild(document.createTextNode(n.slice(0, cut)));
    if (cut < n.length) { var s = document.createElement('span'); s.textContent = n.slice(cut); e.appendChild(s); }
  });
  var nv=document.getElementById('bottom-nav'); if(nv) nv.setAttribute('data-brand-nom', n);
  if (document.title && BRAND.nom !== 'Zelto') document.title = document.title.replace(/Zelto/g, BRAND.nom);
}
document.addEventListener('DOMContentLoaded', appliquerMarque);
