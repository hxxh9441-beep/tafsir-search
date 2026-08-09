/* ============================================================
   الباحث القرآني — محرك البحث
   بحث فوري في فهرس الآيات (6236 آية) + تطبيع عربي كامل
   ============================================================ */

// ---------- التطبيع العربي ----------
function normalizeArabic(text) {
  return text
    // إزالة التشكيل
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // توحيد الألف (أ إ آ → ا)
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    // توحيد الهمزة (ؤ ئ → ء)
    .replace(/[\u0624\u0626]/g, '\u0621')
    // الياء المقصورة → ياء
    .replace(/\u0649/g, '\u064A')
    // إزالة علامات الوقف
    .replace(/[\u06D6-\u06ED]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

// ---------- الآيات والسور المشهورة ----------
const FAMOUS = {
  'اية الكرسي': { s: 2, a: 255, note: 'آية الكرسي — البقرة 255' },
  'اية النور': { s: 24, a: 35, note: 'آية النور — النور 35' },
  'اية المداينة': { s: 2, a: 282, note: 'آية المداينة (الدين) — البقرة 282' },
  'اية الدين': { s: 2, a: 282, note: 'آية الدين — البقرة 282' },
  'اية التطهير': { s: 33, a: 33, note: 'آية التطهير — الأحزاب 33' },
  'اية المباهلة': { s: 3, a: 61, note: 'آية المباهلة — آل عمران 61' },
  'اية الولاية': { s: 5, a: 55, note: 'آية الولاية — المائدة 55' },
  'اية التبليغ': { s: 5, a: 67, note: 'آية التبليغ — المائدة 67' },
  'اية الاحكام': { s: 5, a: 3, note: 'آية الأحكام — المائدة 3' },
  'اية اخراج': { s: 5, a: 3, note: 'آية الإخراج — المائدة 3' },
  'اية الغار': { s: 9, a: 40, note: 'آية الغار — التوبة 40' },
  'اية السيف': { s: 9, a: 5, note: 'آية السيف — التوبة 5' },
  'اية الرجم': { s: 24, a: 2, note: 'آية الرجم (الجلد) — النور 2' },
  'اية الوضوء': { s: 5, a: 6, note: 'آية الوضوء — المائدة 6' },
  'اية الصيام': { s: 2, a: 183, note: 'آية الصيام — البقرة 183' },
  'اية الزكاة': { s: 9, a: 60, note: 'آية مصارف الزكاة — التوبة 60' },
  'اية الربا': { s: 2, a: 275, note: 'آية الربا — البقرة 275' },
  'اية الحجاب': { s: 33, a: 53, note: 'آية الحجاب — الأحزاب 53' },
  'اية الجهاد': { s: 22, a: 78, note: 'آية الجهاد — الحج 78' },
  'اية الدعوة': { s: 16, a: 125, note: 'آية الدعوة — النحل 125' },
  'اية النجوى': { s: 58, a: 12, note: 'آية النجوى — المجادلة 12' },
  'اية السجدة': { s: 41, a: 37, note: 'آية السجدة — فصلت 37' },
};

// ---------- حالة الفهرس ----------
const QuranSearch = {
  index: [],        // [{i, s, a, t, st}]
  surahs: {},       // {1: {name, count, type, sujud}}
  loaded: false,
  surahsLoaded: false,

  // تحميل معلومات السور
  async loadSurahs() {
    try {
      const res = await fetch('data/surahs.json');
      const list = await res.json();
      for (const s of list) this.surahs[s.s] = s;
      this.surahsLoaded = true;
      return true;
    } catch (e) { console.error('surahs load fail', e); return false; }
  },

  // تحميل فهرس الآيات
  async loadIndex() {
    try {
      const res = await fetch('data/index.json');
      const data = await res.json();
      this.index = data.index;
      this.loaded = true;
      return true;
    } catch (e) { console.error('index load fail', e); return false; }
  },

  // اسم السورة
  surahName(s) { return this.surahs[s] ? this.surahs[s].name : 'سورة ' + s; },

  // رقم الآية (مع السورة المكررة للفاتحة في القرآن)
  ayahId(s, a) { return `${this.surahName(s)} : ${a}`; },

  // ---------- البحث ----------
  // يقسم الاستعلام لكلمات ويبحث في النص المطبع، يرتب حسب الأهمية
  search(query, max = 30) {
    if (!this.loaded) return [];
    const nq = normalizeArabic(query);
    if (!nq) return [];

    // 1) الآية المشهورة؟ (آية الكرسي، آية النور...)
    if (FAMOUS[nq]) {
      const f = FAMOUS[nq];
      const ayah = this.index.find(x => x.s === f.s && x.a === f.a);
      if (ayah) return [{ ...ayah, _score: 99999, _matchedAll: true, _note: f.note }];
    }

    // 2) سورة؟ (سورة البقرة → أول آية)
    const surahMatch = nq.match(/^(?:سوره|سورة)\s+(.+)$/) || nq.match(/^سوره\s+(.+)$/);
    if (surahMatch) {
      const sname = surahMatch[1];
      const surah = Object.values(this.surahs).find(s => normalizeArabic(s.name) === sname);
      if (surah) {
        const ayah = this.index.find(x => x.s === surah.s && x.a === 1);
        if (ayah) return [{ ...ayah, _score: 99998, _matchedAll: true, _note: `سورة ${surah.name} — ${surah.count} آية` }];
      }
    }

    const terms = nq.split(/\s+/).filter(t => t.length > 1);

    const results = [];
    const nqNoPrefix = nq;

    for (const ayah of this.index) {
      const st = ayah.st || '';
      if (!st) continue;

      // كل الكلمات موجودة في الآية؟
      let matchedAll = true;
      let matchedCount = 0;
      for (const t of terms) {
        if (st.includes(t)) matchedCount++;
        else matchedAll = false;
      }
      if (matchedCount === 0) continue;

      // التسجيل (الترتيب)
      let score = matchedCount * 100;
      if (matchedAll) score += 500;
      if (st.startsWith(nqNoPrefix)) score += 300;       // تبدأ بالنص الكامل
      if (st.includes(nqNoPrefix)) score += 150;          // تحتوي النص كاملاً
      if (st.startsWith(terms[0])) score += 80;           // تبدأ بأول كلمة
      // آيات أقصر تتفوق عند التساوي
      score += Math.max(0, 60 - st.length / 5);

      results.push({ ayah, score, matchedAll, matchedCount });
    }

    results.sort((a, b) => {
      // الآيات التي تطابق كل الكلمات أولاً
      if (a.matchedAll !== b.matchedAll) return a.matchedAll ? -1 : 1;
      // ثم حسب ترتيب المصحف (سورة ثم آية)
      return a.ayah.i - b.ayah.i;
    });
    const top = results.slice(0, max);
    return top.map(r => ({ ...r.ayah, _score: r.score, _matchedAll: r.matchedAll }));
  },

  // ---------- الاقتراحات (إكمال تلقائي) ----------
  suggestions(query, max = 6) {
    if (!this.loaded) return [];
    const nq = normalizeArabic(query);
    if (nq.length < 2) return [];

    const seen = new Set();
    const out = [];
    for (const ayah of this.index) {
      const st = ayah.st || '';
      if (!st) continue;
      // الآيات التي تبدأ بالكلمة أو تحتويها كاملة
      if (st.startsWith(nq) || st.includes(nq)) {
        const key = st.slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(ayah);
        if (out.length >= max) break;
      }
    }
    return out;
  },

  // ---------- البحث بالجذر (اختياري لاحقاً) ----------
  // البحث عن كلمة وأشكالها (يستغني عنه حالياً — FTS يغطي الأساسي)
};
