/* ============================================================
   الباحث القرآني — إدارة الواجهة والبيانات
   ============================================================ */
'use strict';

// ---------- عناصر الواجهة ----------
const $ = id => document.getElementById(id);
const screens = {
  home: $('homeScreen'),
  ayah: $('ayahScreen'),
};

// ---------- الثيم ----------
const THEME_KEY = 'quran-search-theme';
const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
function systemTheme() { return mqDark.matches ? 'night' : 'day'; }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const icon = t === 'night' ? '☀️' : '🌙';
  const b1 = $('themeBtn1'); if (b1) b1.textContent = icon;
  const b2 = $('themeBtn2'); if (b2) b2.textContent = icon;
  $('metaTheme').setAttribute('content', t === 'night' ? '#0B1220' : '#F4F6FA');
}
// تلقائي مع نظام الجهاز — إلا إذا المستخدم اختار يدوياً سابقاً
let theme;
try {
  const saved = localStorage.getItem(THEME_KEY);
  theme = (saved === 'day' || saved === 'night') ? saved : systemTheme();
} catch(e) { theme = systemTheme(); }
applyTheme(theme);

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'night' ? 'day' : 'night';
  try { localStorage.setItem(THEME_KEY, cur); } catch(e){}
  applyTheme(cur);
}
const tb1 = $('themeBtn1'); if (tb1) tb1.addEventListener('click', toggleTheme);
const tb2 = $('themeBtn2'); if (tb2) tb2.addEventListener('click', toggleTheme);

// متابعة تغيير نظام الجهاز (ليل/نهار) — فقط ما لم يحدد المستخدم يدوياً
if (mqDark.addEventListener) {
  mqDark.addEventListener('change', (e) => {
    try { if (localStorage.getItem(THEME_KEY)) return; } catch(err) { return; }
    applyTheme(e.matches ? 'night' : 'day');
  });
}

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
let gharibMap = null;    // Map(s:a → قائمة كلمات غريبة)
let irabMaps = {};       // chunk → Map(s:a → نص الإعراب) — ملف لكل مجموعة سور
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
  return 'المصدر: 4 تفاسير (الميسر، السعدي، ابن كثير، المختصر) + غريب الكلمات + الإعراب — مركز تفسير للدراسات القرآنية (رخصة CC BY 4.0)';
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
  // ملف الإعراب — نختار الملف حسب رقم السورة (كل ملف يغطي 8 سور)
  const chunk = Math.ceil(s / 8);
  if (irabMaps[chunk]) return irabMaps[chunk];
  const fname = 'data/irab/irab-' + String(chunk).padStart(2, '0') + '.json';
  const data = await loadJSON(fname);
  const map = new Map();
  for (const item of data) map.set(item.s + ':' + item.a, item.i);
  irabMaps[chunk] = map;
  return map;
}

// ---------- البحث ----------
let debounceTimer = null;
let dataReady = false;   // هل الفهرس جاهز؟ (بدون شاشة تحميل — المستخدم يشوف الرئيسية فوراً)
// البحث الكامل (زر البحث / Enter) — يعرض النتائج في القائمة المنسدلة بدل صفحة منفصلة
function doSearch(query) {
  lastQuery = query;
  if (!dataReady) {
    const box = $('suggestBox');
    box.innerHTML = `
      <div class="search-empty">
        <div style="font-size:32px; margin-bottom:8px;">⏳</div>
        <div style="font-weight:700;">جاري تجهيز البيانات...</div>
        <div style="font-size:13px; color:var(--text-dim);">ثواني وينفتح البحث</div>
      </div>`;
    box.hidden = false;
    return;
  }
  const results = QuranSearch.search(query);
  showFullResults(results, query);
}

// عرض النتائج الكاملة داخل القائمة المنسدلة (بديل صفحة النتائج)
function showFullResults(results, query) {
  const box = $('suggestBox');
  if (!results.length) {
    box.innerHTML = `
      <div class="search-empty">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <div style="font-weight:700; margin-bottom:4px;">لا توجد نتائج لـ "${escapeHtml(query)}"</div>
        <div style="font-size:13px; color:var(--text-dim);">جرّب كلمة أخرى أو تأكد من الإملاء</div>
      </div>`;
  } else {
    box.innerHTML =
      `<div class="results-meta-inline">📄 ${results.length} نتيجة لـ "${escapeHtml(query)}"</div>` +
      results.map(r => {
        const name = QuranSearch.surahName(r.s);
        const preview = r._note ? r._note : (r.st ? r.st.slice(0, 70) + '…' : '');
        return `
          <div class="result-card" data-s="${r.s}" data-a="${r.a}">
            <div class="result-text">${highlightAyahWords(r.t, query)}</div>
            <div class="result-ref">
              <span class="snum">${r.s}</span>
              <span>${name} — الآية ${r.a}</span>
            </div>
            ${preview ? `<div class="result-preview">${escapeHtml(preview)}</div>` : ''}
          </div>`;
      }).join('');
  }
  box.hidden = false;
}

// ---------- عرض الآية كاملة في النتائج مع إبراز كلمة البحث ----------
function highlightAyahWords(text, query) {
  const nq = normalizeArabic(query);
  const terms = nq.split(/\s+/).filter(t => t.length > 1);
  const words = text.split(' ');
  const inner = words.map(w => {
    const nw = normalizeArabic(w);
    const isHit = terms.some(t => nw === t || nw.includes(t) || t.includes(nw));
    return isHit ? `<mark>${escapeHtml(w)}</mark>` : escapeHtml(w);
  }).join(' ');
  return `<span class="ayah-brace">{</span> ${inner} <span class="ayah-brace">}</span>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- نسخ للنص (مع بديل للأجهزة القديمة) ----------

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
  if (!dataReady) {
    box.innerHTML = `
      <div class="search-empty">
        <div style="font-size:26px; margin-bottom:6px;">⏳</div>
        <div style="font-weight:700; font-size:14px;">جاري تجهيز البيانات...</div>
      </div>`;
    box.hidden = false;
    return;
  }
  const sugg = QuranSearch.suggestions(query, 6);
  if (!sugg.length) { box.hidden = true; return; }
  const nq = normalizeArabic(query);
  box.innerHTML = sugg.map(s => {
    const name = QuranSearch.surahName(s.s);
    const text = s.st || s.t;
    // عرض مقطع حول الكلمة المطابقة — أوضح من بداية الآية
    const norm = normalizeArabic(text);
    const pos = norm.indexOf(nq);
    let shown = text;
    if (pos > 18) {
      // نقطع من قبل الكلمة المطابقة (مع رمز بداية)
      const cutAt = norm.slice(0, pos).split(' ').slice(0, -1).join(' ').length;
      shown = '…' + text.slice(cutAt, cutAt + 70);
    } else {
      shown = text.slice(0, 70);
    }
    const highlighted = escapeHtml(shown).replace(
      new RegExp('(' + nq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'g'),
      '<mark>$1</mark>'
    );
    return `
      <div class="suggest-item" data-s="${s.s}" data-a="${s.a}">
        <span class="s-icon">📖</span>
        <span class="s-text">${highlighted}</span>
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
  $('ayahText').innerHTML =
    '<span class="ayah-brace">{</span> ' +
    words.map(w => {
      const nw = normalizeArabic(w);
      const isHit = terms.some(t => nw === t || nw.includes(t) || t.includes(nw));
      return `<span class="ayah-word${isHit ? ' hit' : ''}" data-q="${escapeHtml(nw)}">${escapeHtml(w)}</span>`;
    }).join(' ') +
    ' <span class="ayah-brace">}</span>';

  // الضغط على أي كلمة → صندوق التفاعل (تفسيرها فوراً)
  document.querySelectorAll('#ayahText .ayah-word').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectWord(el);
    });
  });
}

// البحث عن كلمة في قائمة الغريب حسب موضعها في الآية (الأدق — الكلمة من الآية، المعنى كامل من البيانات)
function findGharibByIndex(wIdx) {
  if (!gharibState || !gharibState.list.length) return null;
  const g = gharibState.list.find(x => x[0] - 1 === wIdx);
  if (!g) return null;
  const ayahWords = ((QuranSearch.index[currentAyahIdx] || {}).t || '').split(' ');
  return { word: ayahWords[wIdx] || '', mean: g[1] };
}

// البحث عن كلمة في قائمة الغريب (تطبيع كامل)
function findGharibWord(word) {
  const nw = normalizeArabic(word);
  const ayahWords = ((QuranSearch.index[currentAyahIdx] || {}).t || '').split(' ');
  // مطابقة تامة: كلمة الآية في موضعها = الكلمة المطلوبة
  for (const [pos, m] of gharibState.list) {
    const w = ayahWords[pos - 1] || '';
    if (normalizeArabic(w) === nw) return { word: w, mean: m };
  }
  // محاولة جزئية (مثل "لا" ضمن "لا إله")
  for (const [pos, m] of gharibState.list) {
    const w = ayahWords[pos - 1] || '';
    const wn2 = normalizeArabic(w);
    if (wn2.includes(nw) || nw.includes(wn2)) return { word: w, mean: m };
  }
  return null;
}

function selectWord(el) {
  // إبراز الكلمة المختارة
  document.querySelectorAll('#ayahText .ayah-word').forEach(w => w.classList.remove('selected'));
  el.classList.add('selected');
  currentWord = el.dataset.q;
  // الفهرس بين كلمات الآية فقط (نتجاهل أقواس { } لأنها عناصر في نفس المستوى)
  selectedWordIdx = Array.from(el.parentNode.querySelectorAll('.ayah-word')).indexOf(el);

  // كل التبويبات الثلاثة تعرض تفسير الكلمة المحددة فقط — نبقى في القسم الحالي (لا نقفز للتفسير)
  renderWordMode();
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

// وضع الكلمة: الغريب والإعراب يعرضان الكلمة المحددة فقط
// (قسم التفسير يبقى على تفسير الآية كاملة — لا يختلط ببيانات غريب الكلمات)
function renderWordMode() {
  // 1) غريب الكلمات — الكلمة المحددة فقط
  const g = findGharibByIndex(selectedWordIdx) || findGharibWord(currentWord);
  const detail = $('gharibDetail');
  if (g) {
    const w = g.word || currentWord;
    detail.innerHTML = `
      <div class="gharib-full-item">
        <span class="gharib-word">${escapeHtml(w)}</span>
        <span class="gharib-mean">${escapeHtml(g.mean)}</span>
      </div>`;
  } else {
    detail.innerHTML = `<div class="empty-hint">«${escapeHtml(currentWord)}» ليست من الكلمات الغريبة في هذي الآية</div>`;
  }
  detail.hidden = false;

  // 2) الإعراب — إعراب الكلمة المحددة فقط
  const irabEl = $('irabText');
  const irabLine = findIrabWord(currentWord);
  irabEl.textContent = irabLine
    ? irabLine
    : `لا يوجد إعراب لـ«${currentWord}» في هذي الآية`;
  irabEl.classList.toggle('empty', !irabLine);

  inWordMode = true;
}

// الرجوع للوضع الكامل: التبويبات الثلاثة تعرض تفسير/غريب/إعراب الآية كاملة
// (نبقى في القسم الحالي — لا نقفز لقسم التفسير)
function restoreFullMode() {
  $('tafsirText').textContent = fullTafsirText;
  $('tafsirText').classList.toggle('empty', !fullTafsirText);
  renderGharibList();           // القائمة الكاملة للغريب
  $('irabText').textContent = fullIrabText;
  $('irabText').classList.toggle('empty', !fullIrabText);
  inWordMode = false;
  $('wordTafsirBtn').disabled = true;
  document.querySelectorAll('#ayahText .ayah-word').forEach(w => w.classList.remove('selected'));
}

// ---------- تبويب الغريب ----------
// عرض كل الكلمات الغريبة في الآية (قائمة مباشرة — بدون الآية كاملة وبدون أزرار إضافية)
function renderGharibList() {
  const detail = $('gharibDetail');
  if (!gharibState.list.length) {
    detail.innerHTML = '<div class="empty-hint">📜 لا توجد كلمات غريبة في هذي الآية</div>';
    detail.hidden = false;
    return;
  }
  // كلمات الآية — اسم الكلمة من موضعها (البيانات: [موضع, المعنى الكامل])
  const ayahWords = ((QuranSearch.index[currentAyahIdx] || {}).t || '').split(' ');
  detail.innerHTML = gharibState.list.map(([pos, m]) => {
    const word = ayahWords[pos - 1] || '';
    return `
      <div class="gharib-full-item">
        <span class="gharib-word">${escapeHtml(word)}</span>
        <span class="gharib-mean">${escapeHtml(m)}</span>
      </div>`;
  }).join('');
  detail.hidden = false;
}

let ayahSeq = 0;   // رقم تسلسلي — يمنع تسابق التنقل السريع بين الآيات
async function openAyah(s, a) {
  const seq = ++ayahSeq;
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
  $('tafsirText').classList.remove('empty');
  $('wordTafsirBtn').disabled = true;  // التبويب الافتراضي = تفسير الآية كاملة
  $('gharibDetail').hidden = true;
  $('irabText').textContent = '';
  $('irabText').classList.remove('empty');
  $('tafsirLoading').hidden = false;
  $('gharibLoading').hidden = false;
  switchTab('tafsir');

  // الآية تفاعلية + إبراز كلمة البحث
  renderAyahInteractive(ayah, lastQuery);

  // التفسير المحدد (الميسر افتراضياً)
  try {
    const tafsirMap = await ensureTafsir();
    if (seq !== ayahSeq) return;   // آية أحدث فتحت — نتجاهل
    $('tafsirLoading').hidden = true;
    const t = tafsirMap.get(s + ':' + a);
    if (t) {
      fullTafsirText = t;
      // التفسير يبقى كاملاً دائماً (وضع الكلمة لا يغيّره)
      $('tafsirText').textContent = t;
      $('tafsirText').classList.remove('empty');
    }
  } catch (e) { $('tafsirLoading').hidden = true; }

  // غريب الكلمات — قائمة مباشرة بكل الكلمات الغريبة
  try {
    await ensureGharib();
    if (seq !== ayahSeq) return;   // آية أحدث فتحت — نتجاهل
    $('gharibLoading').hidden = true;
    const g = gharibMap.get(s + ':' + a);
    gharibState = { list: g && g.length ? g : [], s, a };
    // إذا المستخدم اختار كلمة قبل ما تكمل البيانات → نعيد عرض وضع الكلمة بالبيانات الكاملة
    if (inWordMode && selectedWordIdx > -1) renderWordMode();
    else renderGharibList();
  } catch (e) { $('gharibLoading').hidden = true; }

  // الإعراب — عند الطلب (الأثقل)
  try {
    const irabMap = await ensureIrab(s);
    if (seq !== ayahSeq) return;   // آية أحدث فتحت — نتجاهل
    const i = irabMap.get(s + ':' + a);
    fullIrabText = i || '';
    // إذا المستخدم في وضع كلمة → نحدّث إعراب الكلمة المحددة
    if (inWordMode && selectedWordIdx > -1) renderWordMode();
    else {
      $('irabText').textContent = fullIrabText || 'لا يوجد إعراب لهذه الآية';
      $('irabText').classList.toggle('empty', !fullIrabText);
    }
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

// نسخ الآية كاملة (نص + تفسير) — بدون سطر المصدر
async function copyAyah() {
  const idx = currentAyahIdx;
  if (idx === -1) return;
  const ayah = QuranSearch.index[idx];
  const map = tafsirMaps[currentTafsirId];
  const t = (map && map.get(ayah.s + ':' + ayah.a)) || '';
  const txt =
    `{ ${ayah.t} }\n` +
    `سورة ${QuranSearch.surahName(ayah.s)} — الآية ${ayah.a}\n\n` +
    (t ? `${tafsirName(currentTafsirId)}:\n${t}` : '');
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
  const txt = `{ ${ayah.t} }\n${ref}\n\n${title}:\n${body}`;
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
    if (!inWordMode) {
      $('tafsirText').textContent = t;
      $('tafsirText').classList.toggle('empty', !t);
    }
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

// نتيجة/اقتراح ← بطاقة آية (يخفي القائمة أولاً)
document.addEventListener('click', (e) => {
  const card = e.target.closest('.result-card');
  if (card) {
    $('suggestBox').hidden = true;
    openAyah(+card.dataset.s, +card.dataset.a);
    return;
  }
  const item = e.target.closest('.suggest-item');
  if (item) {
    $('suggestBox').hidden = true;
    openAyah(+item.dataset.s, +item.dataset.a);
  }
});

// أزرار الرجوع
$('backBtn2').addEventListener('click', () => showScreen('home')); // من الآية → الرئيسية

// ربط حقل البحث الرئيسي
bindSearch('searchInput', 'searchBtn', 'clearBtn', 'suggestBox');

// ---------- الإقلاع ----------
async function init() {
  // كشف الفتح المباشر (file://) — البيانات لن تعمل
  if (location.protocol === 'file:') {
    const msg = $('homeMessage');
    msg.hidden = false;
    msg.innerHTML = `
      <div style="text-align:center; padding:24px 16px; color:var(--text-dim);">
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

  // المرحلة 1: الفهرس فقط (خفيف) — البحث يشتغل فوراً (الرئيسية ظاهرة من البداية بدون شاشة تحميل)
  const [okS, okI] = await Promise.all([
    QuranSearch.loadSurahs(),
    QuranSearch.loadIndex(),
  ]);

  if (!okI) {
    const msg = $('homeMessage');
    msg.hidden = false;
    msg.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-dim);">⚠️ تعذّر تحميل البيانات — تأكد من الاتصال أول مرة</div>';
    return;
  }

  // الفهرس جاهز — البحث يشتغل الآن
  dataReady = true;

  // التفسير والغريب يتحملون بالخلفية (ما يوقفون البحث)
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
