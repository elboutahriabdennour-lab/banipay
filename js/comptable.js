function renderComptableDashboard() {
  const email = sb.user?.email || '';
  const nom = sb.user?.user_metadata?.nom || email.split('@')[0] || 'Comptable';
  const cabinet = sb.user?.user_metadata?.cabinet || '';

  const av = el('comptable-avatar');
  if (av) av.textContent = nom.split(' ').slice(0, 2).map(function(w){return w[0]||'';}).join('').toUpperCase() || 'C';
  setEl('cpt-nom-display', nom + (cabinet ? ' · ' + cabinet : ''));
  setEl('cpt-email-display', email);
  setEl('cpt-nb-entreprises', (CPT.entreprises||[]).length + ' entreprise(s)');
  chargerNotificationsComptable();

  CPT.entreprises.forEach(function(inv) {
    inv._remarques = inv._remarques || [];
  });

  switchCptNav('dashboard');
}
