/* ============================================================
   الباحث القرآني — إدارة الواجهة والبيانات
   ============================================================ */
'use strict';

// ---------- عناصر الواجهة ----------
const $ = id => document.getElementById(id);
const screens = {
  home: $('homeScreen'),
  results: $('resultsScreen'),
  ayah: $('ayahScreen'),
};

// ---------- الثيم ----------
const THEME_KEY = 'quran-search-theme';
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('themeBtn').textContent = t === 'night' ? '☀️' : '🌙';
  $('themeBtn2').textContent = t === 'night' ? '☀️' : '🌙';
  $('metaTheme').setAttribute('content', t === 'night' ? '#0B1220' : '#F4F6FA');
  try { localStorage.setItem(THEME_KEY, t); } catch(e){}
}
let theme = 'day';
try { theme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'); } catch(e){}
applyTheme(theme);
$('themeBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'night' ? 'day' : 'night'));
$('themeBtn2').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'night' ? 'day' : 'night'));

// ---------- التنقل بين الشاشات ----------
function showScreen(name) {
  for (const k of Object.keys(screens)) screens[k].hidden = (k !== name);
  window.scrollTo(0, 0);
}

// ---------- كاش البيانات الكبيرة ----------
const dataCache = {};
async function loadJSON(url) {
  if (dataCache[url]) return dataCache[url];
  const res = await fetch(url);
  if (!res.ok) throw new Error('فشل تحميل ' + url);
  const data = await res.json();
  dataCache[url] = data;
  return data;
}

// بيانات التفسير/الغريب/الإعراب — خريطة (s,a)→نص
let tafsirMap = null;
let gharibMap = null;
let irabMap = null;

async function ensureTafsir() {
  if (tafsirMap) return;
  const data = await loadJSON('data/tafsir.json');
  tafsirMap = new Map();
  for (const item of data) tafsirMap.set(item.s + ':' + item.a, item.t);
}

async function ensureGharib() {
  if (gharibMap) return;
  const data = await loadJSON('data/gharib.json');
  gharibMap = new Map();
  for (const item of data) gharibMap.set(item.s + ':' + item.a, item.g);
}

async function ensureIrab(s) {
  if (irabMap) return;
  // ملف الإعراب — نختار الملف حسب رقم السورة
  const chunk = Math.ceil(s / 8);
  const fname = 'data/irab/irab-' + String(chunk).padStart(2, '0') + '.json';
  const data = await loadJSON(fname);
  irabMap = new Map();
  for (const item of data) irabMap.set(item.s + ':' + item.a, item.i);
}

// ---------- البحث ----------
let debounceTimer = null;
function doSearch(query, showScreenAfter = true) {
  const results = QuranSearch.search(query);
  renderResults(results, query);
  if (showScreenAfter) {
    showScreen('results');
    if (results.length) $('resultsMeta').textContent = `✅ ${results.length} نتيجة لـ "${query}"`;
  }
}

function renderResults(results, query) {
  const list = $('resultsList');
  if (!results.length) {
    list.innerHTML = `
      <div style="text-align:center; padding:40px 0; color:var(--text-dim);">
        <div style="font-size:40px; margin-bottom:12px;">🔍</div>
        <div style="font-weight:700; font-size:16px; margin-bottom:6px;">لا توجد نتائج</div>
        <div style="font-size:13px;">جرّب كلمة أخرى أو تأكد من الإملاء</div>
      </div>`;
    return;
  }
  list.innerHTML = results.map(r => {
    const name = QuranSearch.surahName(r.s);
    const preview = r._note ? r._note : (r.st ? r.st.slice(0, 80) + '…' : '');
    return `
      <div class="result-card" data-s="${r.s}" data-a="${r.a}">
        <div class="result-text">${escapeHtml(r.t)}</div>
        <div class="result-ref">
          <span class="snum">${r.s}</span>
          <span>${name} — الآية ${r.a}</span>
        </div>
        <div class="result-preview">${escapeHtml(preview)}</div>
      </div>`;
  }).join('');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- اقتراحات ----------
function showSuggestions(query, boxId) {
  const box = $(boxId);
  if (!query || query.trim().length < 2) { box.hidden = true; return; }
  const sugg = QuranSearch.suggestions(query, 6);
  if (!sugg.length) { box.hidden = true; return; }
  box.innerHTML = sugg.map(s => {
    const name = QuranSearch.surahName(s.s);
    const text = s.st || s.t;
    return `
      <div class="suggest-item" data-s="${s.s}" data-a="${s.a}">
        <span class="s-icon">📖</span>
        <span class="s-text">${escapeHtml(text.slice(0, 50))}</span>
        <span class="s-ref">${name}:${s.a}</span>
      </div>`;
  }).join('');
  box.hidden = false;
}

// ---------- بطاقة الآية ----------
async function openAyah(s, a) {
  showScreen('ayah');
  const ayah = QuranSearch.index.find(x => x.s === s && x.a === a);
  if (!ayah) return;

  $('ayahTitle').textContent = `${QuranSearch.surahName(s)} — الآية ${a}`;
  $('ayahText').textContent = ayah.t;
  $('ayahRef').textContent = `سورة ${QuranSearch.surahName(s)} — الآية ${a}`;

  // تصفير المحتوى
  $('tafsirText').textContent = '';
  $('gharibList').innerHTML = '';
  $('irabText').textContent = '';
  $('tafsirLoading').hidden = false;
  $('gharibLoading').hidden = false;
  switchTab('tafsir');

  // التفسير الميسر
  try {
    await ensureTafsir();
    $('tafsirLoading').hidden = true;
    const t = tafsirMap.get(s + ':' + a);
    if (t) $('tafsirText').textContent = t;
  } catch (e) { $('tafsirLoading').hidden = true; }

  // غريب الكلمات
  try {
    await ensureGharib();
    $('gharibLoading').hidden = true;
    const g = gharibMap.get(s + ':' + a);
    if (g && g.length) {
      $('gharibList').innerHTML = g.map(([wn, m]) => `
        <div class="gharib-item">
          <span class="gharib-word">${escapeHtml(m.split(' ')[0])}</span>
          <span class="gharib-mean">${escapeHtml(m)}</span>
        </div>`).join('');
    }
  } catch (e) { $('gharibLoading').hidden = true; }

  // الإعراب — عند الطلب (الأثقل)
  try {
    await ensureIrab(s);
    const i = irabMap.get(s + ':' + a);
    if (i) $('irabText').textContent = i;
  } catch (e) {}
}

// تبديل التبويبات
function switchTab(name) {
  document.querySelectorAll('#ayahTabs .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + name);
  });
}
document.getElementById('ayahTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

// ---------- شريط التثبيت (PWA) ----------
let deferredPrompt = null;
function isInstalled() {
  const display = window.matchMedia && (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: minimal-ui)').matches
  );
  return !!(display || window.navigator.standalone === true);
}
function setupInstall() {
  if (isInstalled()) return;
  const banner = $('installBanner');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.hidden = true;
    }
  });
  // iOS — إرشادات
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    $('installMsg').textContent = '📲 ثبّت الباحث القرآني: مشاركة ← إضافة للشاشة الرئيسية';
    setTimeout(() => { banner.hidden = false; }, 3000);
  }
}

// ---------- الأحداث ----------
function bindSearch(inputId, btnId, clearId, suggestId) {
  const input = $(inputId);
  const btn = $(btnId);
  const clear = $(clearId);
  const suggest = $(suggestId);

  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => showSuggestions(input.value, suggestId), 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $(suggestId).hidden = true;
      doSearch(input.value);
    }
  });
  btn.addEventListener('click', () => {
    $(suggestId).hidden = true;
    doSearch(input.value);
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    $(suggestId).hidden = true;
    input.focus();
  });
}

// أحداث مشتركة
function bindSuggestionClicks(suggestId) {
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    const s = +item.dataset.s, a = +item.dataset.a;
    $(suggestId).hidden = true;
    openAyah(s, a);
  });
}

// نتيجة ← بطاقة آية
document.addEventListener('click', (e) => {
  const card = e.target.closest('.result-card');
  if (card) openAyah(+card.dataset.s, +card.dataset.a);
});

// اقتراحات سريعة (chips)
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q;
    $('searchInput').value = q;
    $('searchInput2').value = q;
    doSearch(q);
  });
});

// أزرار الرجوع
$('backBtn').addEventListener('click', () => showScreen('home'));   // من النتائج → الرئيسية
$('backBtn2').addEventListener('click', () => showScreen('results')); // من الآية → النتائج

// ربط حقلي البحث
bindSearch('searchInput', 'searchBtn', 'clearBtn', 'suggestBox');
bindSearch('searchInput2', 'searchBtn2', 'clearBtn2', 'suggestBox2');
bindSuggestionClicks('suggestBox');
bindSuggestionClicks('suggestBox2');

// ---------- شريط التحميل ----------
function setProgress(pct, text) {
  $('progressFill').style.width = pct + '%';
  $('loadingText').textContent = text;
}
function hideLoading() {
  $('loadingScreen').classList.add('hidden');
}

// ---------- الإقلاع ----------
async function init() {
  // كشف الفتح المباشر (file://) — البيانات لن تعمل
  if (location.protocol === 'file:') {
    hideLoading();
    const list = $('resultsList');
    list.innerHTML = `
      <div style="text-align:center; padding:40px 16px; color:var(--text-dim);">
        <div style="font-size:44px; margin-bottom:14px;">⚠️</div>
        <div style="font-weight:800; font-size:17px; margin-bottom:8px; color:var(--text-main);">البيانات ما تشتغل من الفتح المباشر</div>
        <div style="font-size:13.5px; line-height:2;">المتصفح يمنع قراءة ملفات JSON من ملف مفتوح مباشرة (قاعدة أمان).<br><br>
        <b style="color:var(--accent);">الحل ١:</b> ارفع الموقع على GitHub Pages — يشتغل فوراً ✅<br>
        <b style="color:var(--accent);">الحل ٢:</b> للتجربة المحلية — شغّل خادم من المجلد:<br>
        <code style="direction:ltr; display:inline-block; background:var(--hover); padding:6px 12px; border-radius:8px; margin-top:4px; font-size:12px;">cd الباحث-القرآني && python3 -m http.server 8000</code><br>
        ثم افتح <code style="direction:ltr; font-size:12px;">http://localhost:8000</code></div>
      </div>`;
    return;
  }

  // سكلتون تحميل
  const list = $('resultsList');
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

  setProgress(10, 'تهيئة التطبيق...');
  const [okS, okI] = await Promise.all([
    QuranSearch.loadSurahs(),
    QuranSearch.loadIndex(),
  ]);

  if (!okI) {
    hideLoading();
    list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-dim);">⚠️ تعذّر تحميل البيانات — تأكد من الاتصال أول مرة</div>';
    return;
  }

  setProgress(60, 'تحميل التفسير الميسر...');
  await ensureTafsir().catch(() => {});

  setProgress(85, 'تحميل غريب الكلمات...');
  await ensureGharib().catch(() => {});

  setProgress(100, 'الانتهاء...');
  setTimeout(() => {
    hideLoading();
    list.innerHTML = '';
  }, 300);

  setupInstall();

  // سيرفر الخدمة
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
