// ============================================================
// BANIPAY — produits.js — Catalogue produits
// ============================================================

function renderProduits() {
  const cnt = el('produits-count');
  if(cnt) cnt.textContent = STATE.produits.length;
  const list = el('produits-list');
  if (!list) return;
  const q = (el('search-produit-inp')?.value||'').toLowerCase();
  const cat = el('filtre-categorie')?.value||'tous';
  let data = STATE.produits.filter(p =>
    (!q || p.nom.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q)) &&
    (cat==='tous' || p.categorie===cat)
  );
  if (!data.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun article</div></div>`;
    return;
  }
  const catIcons = {service:'⚙️',produit:'📦','main-oeuvre':'👷',transport:'🚛',materiaux:'🧱',autre:'📋'};
  list.innerHTML = data.map(p => `
    <div class="card">
      <div class="card-ico" style="background:#EFF6FF">${catIcons[p.categorie]||'📦'}</div>
      <div class="card-body">
        <div class="card-name">${p.nom}</div>
        <div class="card-ref">${p.unite||'u'} · ${p.description||''}</div>
      </div>
      <div class="card-end">
        <div class="card-amt">${fmt(p.prix_ht)} MAD HT</div>
        ${p.stock !== null && p.stock !== undefined ? `<div style="font-size:10px;color:${p.stock<=0?'#EF4444':'#059669'}">${p.stock} en stock</div>` : ''}
        <div style="display:flex;gap:4px;margin-top:2px">
          <button onclick="modifierProduit(${p.id})" style="font-size:11px;background:#EFF6FF;color:#2563EB;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">✏️</button>
          <button onclick="supprimerProduit(${p.id})" style="font-size:11px;background:#FEF2F2;color:#EF4444;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}

function initNouveauProduit() {
  ['p-nom','p-desc','p-ref','p-prix','p-prix-ttc','p-cout','p-stock'].forEach(id=>{const e=el(id);if(e)e.value='';});
  el('p-unite')&&(el('p-unite').value='u');
  el('p-categorie')&&(el('p-categorie').value='service');
  el('p-tva')&&(el('p-tva').value='20');
}

function calcPrixTTC() {
  const ht = parseFloat(el('p-prix')?.value)||0;
  const tva = parseFloat(el('p-tva')?.value)||20;
  if(el('p-prix-ttc')) el('p-prix-ttc').value = (ht*(1+tva/100)).toFixed(2);
  if(el('p-marge')&&el('p-cout')) {
    const cout = parseFloat(el('p-cout')?.value)||0;
    if (cout > 0) {
      const margeVal = ht > 0 ? Math.round((ht - cout) / ht * 100) : 0;
      el('p-marge').textContent = 'Marge: ' + margeVal + '%';
    }
  }
}

async function sauvegarderProduit() {
  const nom = el('p-nom')?.value.trim();
  if(!nom){showToast("Entrez le nom de l'article",'error');return;}
  showToast('⏳...');
  try {
    const r = await sb.post('produits',{
      user_id:sb.user.id, nom,
      description:el('p-desc')?.value.trim(),
      reference:el('p-ref')?.value.trim(),
      prix_ht:parseFloat(el('p-prix')?.value)||0,
      tva_rate:parseFloat(el('p-tva')?.value)||20,
      cout_achat:parseFloat(el('p-cout')?.value)||null,
      stock:el('p-stock')?.value!==''?parseInt(el('p-stock')?.value):null,
      unite:el('p-unite')?.value,
      categorie:el('p-categorie')?.value,
    });
    if (r && r.length > 0) { STATE.produits.push(r[0]); } else { throw new Error("Erreur serveur"); }
    STATE.produits.sort((a,b)=>a.nom.localeCompare(b.nom));
    showToast('✅ Article ajouté !','success');
    setTimeout(()=>goScreen('produits'),600);
  } catch(e){showToast('❌ '+e.message,'error');}
}

async function supprimerProduit(id) {
  if(!confirm('Supprimer cet article ?')) return;
  await sb.del('produits',`id=eq.${id}&user_id=eq.${sb.user.id}`);
  STATE.produits = STATE.produits.filter(p=>p.id!==id);
  renderProduits();
  showToast('Supprimé');
}

// ============================================================
// PROFIL
// ============================================================

function ouvrirModifProduit(id) {
  const p = STATE.produits.find(x => x.id === id);
  if (!p) return;
  STATE.currentProduit = p;
  el('mp-nom') && (el('mp-nom').value = p.nom || '');
  el('mp-ref') && (el('mp-ref').value = p.reference || '');
  el('mp-desc') && (el('mp-desc').value = p.description || '');
  el('mp-prix') && (el('mp-prix').value = p.prix_ht || '');
  el('mp-tva') && (el('mp-tva').value = p.tva_rate || 20);
  el('mp-cout') && (el('mp-cout').value = p.cout_achat || '');
  el('mp-stock') && (el('mp-stock').value = p.stock !== null ? p.stock : '');
  el('mp-unite') && (el('mp-unite').value = p.unite || 'u');
  el('mp-categorie') && (el('mp-categorie').value = p.categorie || 'service');
  calcPrixTTCModif();
  goScreen('modifier-produit');
}

function calcPrixTTCModif() {
  const ht = parseFloat(el('mp-prix')?.value) || 0;
  const tva = parseFloat(el('mp-tva')?.value) || 20;
  if (el('mp-prix-ttc')) el('mp-prix-ttc').value = (ht * (1 + tva/100)).toFixed(2);
  const cout = parseFloat(el('mp-cout')?.value) || 0;
  const margeEl = el('mp-marge');
  if (margeEl && ht > 0 && cout > 0) {
    margeEl.textContent = 'Marge: ' + Math.round((ht-cout)/ht*100) + '%';
  }
}

async function sauvegarderModifProduit() {
  const p = STATE.currentProduit;
  if (!p) return;
  const nom = el('mp-nom')?.value.trim();
  if (!nom) { showToast('Le nom est obligatoire', 'error'); return; }
  const data = {
    nom,
    reference: el('mp-ref')?.value.trim(),
    description: el('mp-desc')?.value.trim(),
    prix_ht: parseFloat(el('mp-prix')?.value) || 0,
    tva_rate: parseFloat(el('mp-tva')?.value) || 20,
    cout_achat: parseFloat(el('mp-cout')?.value) || null,
    stock: el('mp-stock')?.value !== '' ? parseInt(el('mp-stock')?.value) : null,
    unite: el('mp-unite')?.value,
    categorie: el('mp-categorie')?.value,
  };
  showToast('⏳ Mise à jour...');
  try {
    await sb.patch('produits', `id=eq.${p.id}&user_id=eq.${sb.user.id}`, data);
    Object.assign(p, data);
    renderProduits();
    showToast('✅ Article mis à jour !', 'success');
    goScreen('produits');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function modifierProduit(id) { ouvrirModifProduit(id); }

function archiverProduit(id) {
  const p = STATE.produits.find(x => x.id === id);
  if (!p || !confirm('Archiver cet article ?')) return;
  sb.patch('produits', `id=eq.${id}&user_id=eq.${sb.user.id}`, { archive: true })
    .then(() => {
      STATE.produits = STATE.produits.filter(x => x.id !== id);
      renderProduits();
      showToast('Article archivé');
    });
}

// ============================================================
// ACOMPTES & PAIEMENTS COMPLETS
// ============================================================

