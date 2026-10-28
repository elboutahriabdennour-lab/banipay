// ZELTO — icones.js : remplace les émojis affichés par des icônes professionnelles (sans toucher au reste du code).
(function(){
  var MAP={"✅": "circle-check", "❌": "circle-x", "⏳": "hourglass", "⚠️": "triangle-alert", "⚠": "triangle-alert", "📦": "package", "📋": "clipboard-list", "🔍": "search", "📝": "file-pen", "🏦": "landmark", "💰": "banknote", "📄": "file-text", "🧾": "receipt", "📤": "upload", "👥": "users", "🔒": "lock", "🏢": "building-2", "📥": "download", "🗑️": "trash-2", "➕": "plus", "💬": "message-circle", "🛒": "shopping-cart", "🔗": "link", "📅": "calendar", "🤝": "handshake", "📊": "chart-column", "✉️": "mail", "🔤": "languages", "↩️": "undo-2", "💾": "save", "📞": "phone", "🔔": "bell", "📷": "camera", "✏️": "pencil", "📍": "map-pin", "📎": "paperclip", "⏰": "alarm-clock", "👤": "user", "👁️": "eye", "💼": "briefcase", "🔁": "repeat", "🎫": "ticket", "📡": "radio", "🛠️": "wrench", "📲": "smartphone", "⚙️": "settings", "✍️": "pen-line", "💳": "credit-card", "🏭": "factory", "🧮": "calculator", "☑️": "square-check", "☑": "square-check", "☐": "square", "🎙️": "mic", "🚛": "truck", "🧱": "layers", "🔄": "refresh-cw", "🚫": "ban", "⛔": "ban", "👆": "hand", "📁": "folder", "🔢": "hash", "📱": "smartphone", "🎨": "palette", "🔧": "wrench", "🌐": "globe", "📈": "trending-up", "📧": "mail", "⚖️": "scale", "📌": "pin", "🎯": "target", "👷": "hard-hat", "🧬": "dna", "🌙": "moon", "➖": "minus", "🏷️": "tag", "📸": "camera", "🧑": "user", "⏱️": "clock", "📨": "mail-open", "🖥️": "monitor", "💻": "laptop", "🏗️": "building", "🏆": "trophy", "🏠": "house", "🗃️": "archive", "🛡️": "shield", "📢": "megaphone", "⏹️": "square", "🔬": "microscope", "🗂️": "folder-open", "🌍": "globe", "📘": "book-open", "🕐": "clock", "💡": "lightbulb", "🖨️": "printer", "🔐": "key-round", "🏛️": "landmark", "🚨": "siren", "⚡": "zap", "☀️": "sun", "🗄️": "database", "📑": "file-stack", "❔": "circle-help", "👉": "arrow-right", "➡️": "arrow-right", "📂": "folder-open", "💵": "banknote", "🔮": "sparkles", "🏥": "stethoscope", "←": "arrow-left", "→": "arrow-right", "↑": "arrow-up", "↓": "arrow-down", "↔": "arrow-left-right", "✓": "check", "✔": "check", "✕": "x", "✖": "x", "➤": "send", "⏸": "pause", "⬆️": "arrow-up", "🕒": "clock", "🔑": "key-round", "👑": "crown", "▶️": "play"}, DOTS={"🔴": "#B23A2E", "🟢": "#4F7A2E", "🟠": "#D9822B", "⚪": "#B8B0A4"}, DROP=["🪡", "🙋", "🙏", "🎉", "👋", "👍", "✨", "🙈"];
  var keys=Object.keys(MAP).concat(Object.keys(DOTS)).concat(DROP).sort(function(a,b){return b.length-a.length});
  var re=new RegExp('('+keys.map(function(k){return k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('|')+')\\uFE0F?','g');
  var reDropSp=new RegExp('^[ \\u00A0]');
  var SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1,OPTION:1,NOSCRIPT:1,TITLE:1,SVG:1};
  var SPECIAL={'circle-check':'ic-ok','circle-x':'ic-ko','triangle-alert':'ic-warn'};
  function ico(ch){
    if(DOTS[ch]){var d=document.createElement('i');d.className='ic-dot';d.style.background=DOTS[ch];return d}
    var n=MAP[ch];var i=document.createElement('i');i.className='ic ic-'+n+(SPECIAL[n]?' '+SPECIAL[n]:'');i.setAttribute('aria-hidden','true');return i;
  }
  function conv(t){
    var s=t.nodeValue;if(!s||s.search(re)<0)return;
    var p=t.parentNode;if(!p||SKIP[(p.nodeName||'').toUpperCase()])return;
    var frag=document.createDocumentFragment(),last=0,m;re.lastIndex=0;
    while((m=re.exec(s))){
      var ch=m[1];frag.appendChild(document.createTextNode(s.slice(last,m.index)));
      if(MAP[ch]||DOTS[ch])frag.appendChild(ico(ch));
      last=m.index+m[0].length;
    }
    var rest=s.slice(last);frag.appendChild(document.createTextNode(rest));
    p.replaceChild(frag,t);
  }
  function walk(n){
    if(n.nodeType===3){conv(n);return}
    if(n.nodeType!==1||SKIP[n.nodeName.toUpperCase()]||n.classList&&n.classList.contains('ic'))return;
    for(var c=n.firstChild,nx;c;c=nx){nx=c.nextSibling;walk(c)}
  }
  function cleanOptions(root){
    (root.querySelectorAll?root.querySelectorAll('option,title'):[]).forEach(function(o){
      var s=o.textContent;if(s.search(re)>=0){o.textContent=s.replace(re,'').replace(/^\s+/,'')}
    });
  }
  function cleanAttrs(root){
    (root.querySelectorAll?root.querySelectorAll('[placeholder],[title]'):[]).forEach(function(e){
      ['placeholder','title'].forEach(function(a){var v=e.getAttribute(a);if(v&&v.search(re)>=0)e.setAttribute(a,v.replace(re,'').replace(/^\s+/,''))});
    });
  }
  var q=[],sched=false;
  function flush(){sched=false;var b=q;q=[];obs&&obs.disconnect();
    b.forEach(function(n){if(n.isConnected){walk(n);cleanOptions(n);cleanAttrs(n)}});
    obs&&obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});}
  var obs=null;
  function init(){
    walk(document.body);cleanOptions(document);cleanAttrs(document);
    if(!window.MutationObserver)return;
    obs=new MutationObserver(function(ms){
      ms.forEach(function(m){
        if(m.type==='characterData'){q.push(m.target.parentNode||document.body)}
        else m.addedNodes.forEach(function(n){q.push(n.nodeType===3?(n.parentNode||document.body):n)});
      });
      if(!sched){sched=true;Promise.resolve().then(flush)}
    });
    obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }
  window.iconifier=function(el){walk(el||document.body)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
