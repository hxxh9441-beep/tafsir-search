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
  let data;
  if (url.endsWith('.gz')) {
    // فك ضغط gzip (ملفات التفاسير الإضافية)
    const buf = await res.arrayBuffer();
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    data = JSON.parse(text);
  } else {
    data = await res.json();
  }
  dataCache[url] = data;
  return data;
}

// بيانات التفسير/الغريب/الإعراب — خريطة (s,a)→نص
let tafsirMaps = {};     // id → Map(s:a → نص)
let currentTafsirId = 'muyassar';   // التفسير المحدد حالياً
const TAFSIR_LIST = [
  { id: 'muyassar',  name: 'التفسير الميسر',    file: 'data/tafsir.json',             label: 'التفسير الميسر' },
  { id: 'saadi',     name: 'تفسير السعدي',      file: 'data/tafsir-saadi.json.gz',     label: 'تفسير السعدي' },
  { id: 'ibnkathir', name: 'تفسير ابن كثير',    file: 'data/tafsir-ibnkathir.json.gz', label: 'تفسير ابن كثير' },
  { id: 'mukhtasar', name: 'التفسير المختصر',   file: 'data/tafsir-mukhtasar.json.gz', label: 'التفسير المختصر' }
];
function tafsirName(id) {
  const def = TAFSIR_LIST.find(x => x.id === id);
  return def ? def.name : 'التفسير';
}
function sourceFor(id) {
  return `المصدر: ${tafsirName(id)} + غريب الكلمات + الإعراب — مركز تفسير للدراسات القرآنية (رخصة CC BY 4.0)`;
}
async function ensureTafsir(id = currentTafsirId) {
  if (tafsirMaps[id]) return tafsirMaps[id];
  const def = TAFSIR_LIST.find(x => x.id === id);
  const data = await loadJSON(def.file);
  const map = new Map();
  for (const item of data) map.set(item.s + ':' + item.a, item.t);
  tafsirMaps[id] = map;
  return map;
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
  lastQuery = query;
  const results = QuranSearch.search(query);
  renderResults(results, query);
  if (showScreenAfter) {
    showScreen('results');
    const meta = $('resultsMeta');
    meta.hidden = false;
    if (results.length) {
      meta.textContent = `📄 عدد النتائج: ${results.length} — لـ "${query}"`;
    } else {
      meta.textContent = `🔍 لا توجد نتائج لـ "${query}"`;
    }
  }
}

// ---------- عرض الآية كاملة في النتائج مع إبراز كلمة البحث ----------
function highlightAyahWords(text, query) {
  const nq = normalizeArabic(query);
  const terms = nq.split(/\s+/).filter(t => t.length > 1);
  const words = text.split(' ');
  return words.map(w => {
    const nw = normalizeArabic(w);
    const isHit = terms.some(t => nw === t || nw.includes(t) || t.includes(nw));
    return isHit ? `<mark>${escapeHtml(w)}</mark>` : escapeHtml(w);
  }).join(' ');
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
        <div class="result-text">${highlightAyahWords(r.t, query)}</div>
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

// ---------- نسخ للنص (مع بديل للأجهزة القديمة) ----------
const DATA_SOURCE = 'المصدر: غريب الكلمات + الإعراب — مركز تفسير للدراسات القرآنية (رخصة CC BY 4.0)';

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 2200);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('✅ تم النسخ');
  } catch (e) {
    showToast('❌ تعذّر النسخ');
  }
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
let currentAyahIdx = -1;   // موقع الآية الحالية في الفهرس (للتنقل)
let lastQuery = '';        // آخر بحث — لإبراز كلمة البحث داخل الآية
let currentWord = '';      // الكلمة المختارة حالياً
let selectedWordIdx = -1;  // موضع الكلمة المختارة في الآية
let fullTafsirText = '';   // نص تفسير الآية كاملة (للرجوع من وضع الكلمة)
let fullIrabText = '';     // نص إعراب الآية كاملة (للرجوع من وضع الكلمة)
let inWordMode = false;    // هل نعرض تفسير كلمة بدل تفسير الآية كاملة؟
let gharibState = { list: [], s: 0, a: 0 };

// عرض الآية ككلمات تفاعلية (كل كلمة قابلة للضغط) مع إبراز كلمة البحث
function renderAyahInteractive(ayah, query) {
  const terms = normalizeArabic(query || '').split(/\s+/).filter(t => t.length > 1);
  const words = ayah.t.split(' ');
  $('ayahText').innerHTML = words.map(w => {
    const nw = normalizeArabic(w);
    const isHit = terms.some(t => nw === t || nw.includes(t) || t.includes(nw));
    return `<span class="ayah-word${isHit ? ' hit' : ''}" data-q="${escapeHtml(nw)}">${escapeHtml(w)}</span>`;
  }).join(' ');

  // الضغط على أي كلمة → صندوق التفاعل (تفسيرها فوراً)
  document.querySelectorAll('#ayahText .ayah-word').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectWord(el);
    });
  });
}

// البحث عن كلمة في قائمة الغريب حسب موضعها في الآية (الأدق — مثل تبويب الغريب)
function findGharibByIndex(wIdx) {
  if (!gharibState || !gharibState.list.length) return null;
  const g = gharibState.list.find(x => x[0] - 1 === wIdx);
  if (!g) return null;
  const idx2 = g[1].indexOf(':');
  return {
    word: idx2 > -1 ? g[1].slice(0, idx2).trim() : '',
    mean: idx2 > -1 ? g[1].slice(idx2 + 1).trim() : g[1]
  };
}

// البحث عن كلمة في قائمة الغريب (تطبيع كامل)
function findGharibWord(word) {
  const nw = normalizeArabic(word);
  for (const [wn, m] of gharibState.list) {
    const idx2 = m.indexOf(':');
    const w = (idx2 > -1 ? m.slice(0, idx2).trim() : m);
    if (normalizeArabic(w) === nw) return { word: w, mean: idx2 > -1 ? m.slice(idx2 + 1).trim() : m };
  }
  // محاولة جزئية (مثل "لا" ضمن "لا إله")
  for (const [wn, m] of gharibState.list) {
    const idx2 = m.indexOf(':');
    const w = (idx2 > -1 ? m.slice(0, idx2).trim() : m);
    const wn2 = normalizeArabic(w);
    if (wn2.includes(nw) || nw.includes(wn2)) return { word: w, mean: idx2 > -1 ? m.slice(idx2 + 1).trim() : m };
  }
  return null;
}

function selectWord(el) {
  // إبراز الكلمة المختارة
  document.querySelectorAll('#ayahText .ayah-word').forEach(w => w.classList.remove('selected'));
  el.classList.add('selected');
  currentWord = el.dataset.q;
  selectedWordIdx = Array.prototype.indexOf.call(el.parentNode.children, el);

  // كل التبويبات الثلاثة تعرض تفسير الكلمة المحددة فقط
  renderWordMode();
  // ننتقل لتبويب التفسير — التغيير يظهر في مربع النص الأساسي للتفسير (ما فيه صندوق ثاني)
  switchTab('tafsir');
  // الزر مفعّل — نعرض تفسير كلمة الحين
  $('wordTafsirBtn').disabled = false;
  $('tafsirText').scrollIntoView({ block: 'nearest' });
}

// استخراج إعراب كلمة واحدة من نص الإعراب الكامل (كل سطر: كلمة: إعرابها)
function findIrabWord(word) {
  if (!fullIrabText) return '';
  const nw = normalizeArabic(word);
  const lines = fullIrabText.split('\n');
  // مطابقة تامة أولاً
  for (const line of lines) {
    const ci = line.indexOf(':');
    if (ci === -1) continue;
    if (normalizeArabic(line.slice(0, ci).trim()) === nw) return line.trim();
  }
  // مطابقة جزئية (مثل "لا" ضمن "لا إله")
  for (const line of lines) {
    const ci = line.indexOf(':');
    if (ci === -1) continue;
    const lw = normalizeArabic(line.slice(0, ci).trim());
    if (lw.includes(nw) || nw.includes(lw)) return line.trim();
  }
  return '';
}

// وضع الكلمة: التبويبات الثلاثة (تفسير/غريب/إعراب) تعرض تفسير الكلمة المحددة فقط
function renderWordMode() {
  // 1) التفسير الميسر — تفسير الكلمة
  const g = findGharibByIndex(selectedWordIdx) || findGharibWord(currentWord);
  const tafsirEl = $('tafsirText');
  if (g) {
    tafsirEl.innerHTML = g.word
      ? `<b>${escapeHtml(g.word)}</b> — ${escapeHtml(g.mean)}`
      : `<b>${escapeHtml(currentWord)}</b> — ${escapeHtml(g.mean)}`;
  } else {
    tafsirEl.innerHTML = `«${escapeHtml(currentWord)}» مو من الكلمات الغريبة في هذي الآية`;
  }

  // 2) غريب الكلمات — الكلمة المحددة فقط
  const detail = $('gharibDetail');
  if (g) {
    const w = g.word || currentWord;
    detail.innerHTML = `
      <div class="gharib-full-item">
        <span class="gharib-word">${escapeHtml(w)}</span>
        <span class="gharib-mean">${escapeHtml(g.mean)}</span>
        <button class="gharib-copy" title="نسخ الكلمة مع المعنى والمصدر" data-word="${escapeHtml(w)}" data-mean="${escapeHtml(g.mean)}">📋</button>
      </div>`;
    detail.querySelector('.gharib-copy').addEventListener('click', () => {
      const txt =
        `{ ${(QuranSearch.index[currentAyahIdx] || {}).t || ''} }\n` +
        `الكلمة: ${w}\n` +
        `المعنى: ${g.mean}\n` +
        `سورة ${QuranSearch.surahName(gharibState.s)} — الآية ${gharibState.a}\n\n` +
        DATA_SOURCE;
      copyText(txt);
    });
  } else {
    detail.innerHTML = `<div style="padding:18px; text-align:center; color:var(--text-dim); font-size:13.5px;">«${escapeHtml(currentWord)}» مو من الكلمات الغريبة في هذي الآية</div>`;
  }
  detail.hidden = false;

  // 3) الإعراب — إعراب الكلمة المحددة فقط
  const irabEl = $('irabText');
  const irabLine = findIrabWord(currentWord);
  irabEl.textContent = irabLine
    ? irabLine
    : `لا يوجد إعراب لـ«${currentWord}» في هذي الآية`;

  inWordMode = true;
}

// الرجوع للوضع الكامل: التبويبات الثلاثة تعرض تفسير/غريب/إعراب الآية كاملة
function restoreFullMode() {
  $('tafsirText').textContent = fullTafsirText;
  renderGharibList();           // القائمة الكاملة للغريب
  $('irabText').textContent = fullIrabText;
  inWordMode = false;
  $('wordTafsirBtn').disabled = true;
  document.querySelectorAll('#ayahText .ayah-word').forEach(w => w.classList.remove('selected'));
  switchTab('tafsir');
}

// ---------- تبويب الغريب ----------
// عرض كل الكلمات الغريبة في الآية (قائمة مباشرة — بدون الآية كاملة وبدون أزرار إضافية)
function renderGharibList() {
  const detail = $('gharibDetail');
  if (!gharibState.list.length) {
    detail.innerHTML = '<div style="padding:18px; text-align:center; color:var(--text-dim); font-size:13.5px;">📜 لا توجد كلمات غريبة في هذي الآية</div>';
    detail.hidden = false;
    return;
  }
  // كلمات الآية — لاستخراج اسم الكلمة من موضعها (بعض البيانات ما فيها اسم الكلمة)
  const ayahWords = ((QuranSearch.index[currentAyahIdx] || {}).t || '').split(' ');
  detail.innerHTML = gharibState.list.map(([pos, m]) => {
    const idx2 = m.indexOf(':');
    let word = idx2 > -1 ? m.slice(0, idx2).trim() : '';
    let mean = idx2 > -1 ? m.slice(idx2 + 1).trim() : m;
    // إذا ما فيه اسم للكلمة → نجيبها من موضعها في الآية
    if (!word && ayahWords[pos - 1]) word = ayahWords[pos - 1];
    return `
      <div class="gharib-full-item">
        <span class="gharib-word">${escapeHtml(word)}</span>
        <span class="gharib-mean">${escapeHtml(mean)}</span>
        <button class="gharib-copy" title="نسخ الكلمة مع المعنى والمصدر" data-word="${escapeHtml(word)}" data-mean="${escapeHtml(mean)}">📋</button>
      </div>`;
  }).join('');
  detail.hidden = false;

  // نسخ أي كلمة من القائمة
  detail.querySelectorAll('.gharib-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const txt =
        `{ ${(QuranSearch.index[currentAyahIdx] || {}).t || ''} }\n` +
        `الكلمة: ${btn.dataset.word}\n` +
        `المعنى: ${btn.dataset.mean}\n` +
        `سورة ${QuranSearch.surahName(gharibState.s)} — الآية ${gharibState.a}\n\n` +
        DATA_SOURCE;
      copyText(txt);
    });
  });
}

async function openAyah(s, a) {
  showScreen('ayah');
  const idx = QuranSearch.index.findIndex(x => x.s === s && x.a === a);
  if (idx === -1) return;
  currentAyahIdx = idx;
  const ayah = QuranSearch.index[idx];

  $('ayahTitle').textContent = `${QuranSearch.surahName(s)} — الآية ${a}`;
  $('ayahRef').textContent = `سورة ${QuranSearch.surahName(s)} — الآية ${a}`;
  $('ayahSource').textContent = sourceFor(currentTafsirId);

  // تفعيل/تعطيل أزرار التنقل
  $('prevAyahBtn').disabled = (idx === 0);
  $('nextAyahBtn').disabled = (idx === QuranSearch.index.length - 1);

  // تصفير المحتوى — الوضع الافتراضي: تفسير الآية كاملة
  fullTafsirText = '';
  fullIrabText = '';
  inWordMode = false;
  selectedWordIdx = -1;
  $('tafsirText').textContent = '';
  $('wordTafsirBtn').disabled = true;  // التبويب الافتراضي = تفسير الآية كاملة
  $('gharibDetail').hidden = true;
  $('irabText').textContent = '';
  $('tafsirLoading').hidden = false;
  $('gharibLoading').hidden = false;
  switchTab('tafsir');

  // الآية تفاعلية + إبراز كلمة البحث
  renderAyahInteractive(ayah, lastQuery);

  // التفسير المحدد (الميسر افتراضياً)
  try {
    const tafsirMap = await ensureTafsir();
    $('tafsirLoading').hidden = true;
    const t = tafsirMap.get(s + ':' + a);
    if (t) {
      fullTafsirText = t;
      // لا نكتب فوق تفسير الكلمة إذا المستخدم يختار كلمة الحين
      if (!inWordMode) $('tafsirText').textContent = t;
    }
  } catch (e) { $('tafsirLoading').hidden = true; }

  // غريب الكلمات — قائمة مباشرة بكل الكلمات الغريبة
  try {
    await ensureGharib();
    $('gharibLoading').hidden = true;
    const g = gharibMap.get(s + ':' + a);
    gharibState = { list: g && g.length ? g : [], s, a };
    // إذا المستخدم اختار كلمة قبل ما تكمل البيانات → نعيد عرض وضع الكلمة بالبيانات الكاملة
    if (inWordMode && selectedWordIdx > -1) renderWordMode();
    else renderGharibList();
  } catch (e) { $('gharibLoading').hidden = true; }

  // الإعراب — عند الطلب (الأثقل)
  try {
    await ensureIrab(s);
    const i = irabMap.get(s + ':' + a);
    fullIrabText = i || '';
    // إذا المستخدم في وضع كلمة → نحدّث إعراب الكلمة المحددة
    if (inWordMode && selectedWordIdx > -1) renderWordMode();
    else $('irabText').textContent = fullIrabText;
  } catch (e) {}
}

// زر الرجوع لتفسير الآية كاملة
$('wordTafsirBtn').addEventListener('click', restoreFullMode);

// التنقل: الآية السابقة / التالية
function goAyah(offset) {
  const idx = currentAyahIdx + offset;
  if (idx < 0 || idx >= QuranSearch.index.length) return;
  const next = QuranSearch.index[idx];
  openAyah(next.s, next.a);
}

// نسخ الآية كاملة (نص + تفسير + مصدر)
async function copyAyah() {
  const idx = currentAyahIdx;
  if (idx === -1) return;
  const ayah = QuranSearch.index[idx];
  const map = tafsirMaps[currentTafsirId];
  const t = (map && map.get(ayah.s + ':' + ayah.a)) || '';
  const txt =
    `{ ${ayah.t} }\n` +
    `سورة ${QuranSearch.surahName(ayah.s)} — الآية ${ayah.a}\n\n` +
    (t ? `${tafsirName(currentTafsirId)}:\n${t}\n\n` : '') +
    sourceFor(currentTafsirId);
  copyText(txt);
}

$('prevAyahBtn').addEventListener('click', () => goAyah(-1));
$('nextAyahBtn').addEventListener('click', () => goAyah(1));
$('copyAyahBtn').addEventListener('click', copyAyah);

// نسخ محتوى الصناديق الثلاثة (ميزة موحّدة في كل الأقسام)
function copyBoxText(kind) {
  const idx = currentAyahIdx;
  if (idx === -1) return;
  const ayah = QuranSearch.index[idx];
  const ref = `سورة ${QuranSearch.surahName(ayah.s)} — الآية ${ayah.a}`;
  let title = '';
  let body = '';
  if (kind === 'tafsir') {
    title = tafsirName(currentTafsirId);
    body = $('tafsirText').textContent;
  } else if (kind === 'gharib') {
    title = 'غريب الكلمات';
    const items = Array.from(document.querySelectorAll('#gharibDetail .gharib-full-item'));
    body = items.map(it => {
      const w = it.querySelector('.gharib-word')?.textContent || '';
      const m = it.querySelector('.gharib-mean')?.textContent || '';
      return w ? `${w}: ${m}` : m;
    }).join('\n');
  } else if (kind === 'irab') {
    title = 'الإعراب';
    body = $('irabText').textContent;
  }
  const txt = `{ ${ayah.t} }\n${ref}\n\n${title}:\n${body}\n\n${sourceFor(currentTafsirId)}`;
  copyText(txt);
}
$('copyTafsirBtn').addEventListener('click', () => copyBoxText('tafsir'));
$('copyGharibBtn').addEventListener('click', () => copyBoxText('gharib'));
$('copyIrabBtn').addEventListener('click', () => copyBoxText('irab'));

// ---------- اختيار التفسير (الميسر / السعدي / ابن كثير / المختصر) ----------
// استرجاع التفسير المحفوظ
try {
  const saved = localStorage.getItem('tafsirId');
  if (saved && TAFSIR_LIST.some(x => x.id === saved)) currentTafsirId = saved;
} catch (err) {}
$('tafsirSelect').value = currentTafsirId;

$('tafsirSelect').addEventListener('change', async (e) => {
  currentTafsirId = e.target.value;
  try { localStorage.setItem('tafsirId', currentTafsirId); } catch (err) {}
  $('ayahSource').textContent = sourceFor(currentTafsirId);
  const idx = currentAyahIdx;
  if (idx === -1) return;
  const ayah = QuranSearch.index[idx];
  $('tafsirLoading').hidden = false;
  try {
    const map = await ensureTafsir();
    $('tafsirLoading').hidden = true;
    const t = map.get(ayah.s + ':' + ayah.a) || '';
    fullTafsirText = t;
    // لا نكتب فوق تفسير الكلمة إذا المستخدم يختار كلمة الحين
    if (!inWordMode) $('tafsirText').textContent = t;
  } catch (err) { $('tafsirLoading').hidden = true; }
});

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

  // المرحلة 1: الفهرس فقط (خفيف) — البحث يشتغل فوراً
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

  // نفتح التطبيق بأسرع وقت — التفسير والغريب يتحملون بالخلفية (ما يوقفون البحث)
  setProgress(100, 'الانتهاء...');
  setTimeout(() => {
    hideLoading();
    list.innerHTML = '';
  }, 200);

  ensureTafsir().catch(() => {});
  ensureGharib().catch(() => {});

  setupInstall();

  // سيرفر الخدمة — مع تحديث تلقائي قسري
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // إذا كان فيه نسخة جديدة تنتظر → فعّلها فوراً
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});

    // عند تغيّر المتحكم (نسخة جديدة فعّلت) → أعد التحميل لسحب الجديد
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
}

init();
