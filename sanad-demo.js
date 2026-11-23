/* Sanad Syria: isolated client-side prototype. No network, identity, or payment features. */
(function () {
  'use strict';
  const STORAGE_KEY = 'sanad_preview_requests_v1';
  const MAX = 25;
  const MAX_STORAGE_CHARS = 16384; // Treat browser storage as untrusted, bounded demo input.
  const services = [
    ['الهوية والحساب', 'Identity & accounts'],
    ['الوكالات والتفويض', 'Authorizations'],
    ['المستندات', 'Documents'],
    ['المواعيد', 'Appointments']
  ];
  const states = ['draft', 'review', 'done'];
  const copy = {
    ar: {
      title: 'تجربة متابعة الطلبات — محاكاة محلية',
      disclaimer: 'للتجربة فقط: الطلبات وهمية، محفوظة في هذا المتصفح فقط، ولا تُرسل إلى سند أو أي جهة حكومية. لا تُدخل معلومات شخصية.',
      service: 'اختر نوع الخدمة الوهمية',
      create: 'إنشاء طلب تجريبي',
      filter: 'عرض حسب الحالة',
      filters: ['الكل', 'مسودة', 'قيد المراجعة (محاكاة)', 'مكتمل (محاكاة)'],
      statuses: ['مسودة تجريبية', 'قيد المراجعة الوهمية', 'مكتمل تجريبياً'],
      advance: 'محاكاة المرحلة التالية',
      remove: 'حذف الطلب',
      clear: 'مسح جميع الطلبات التجريبية',
      confirm: 'هل تريد حذف جميع الطلبات الوهمية المحفوظة على هذا الجهاز؟',
      empty: 'لا توجد طلبات تجريبية مطابقة.',
      made: 'تم إنشاء طلب وهمي على جهازك فقط، ولم يُرسل لأي جهة.',
      changed: 'تم تغيير حالة الطلب الوهمي داخل المتصفح فقط.',
      deleted: 'تم حذف الطلب الوهمي من هذا المتصفح.',
      cleared: 'تم مسح الطلبات الوهمية من هذا المتصفح.',
      maximum: 'وصلت إلى حد 25 طلباً تجريبياً. احذف طلباً لإضافة آخر.',
      storage: 'تعذّر حفظ البيانات على الجهاز؛ ستبقى التجربة ضمن الصفحة المفتوحة فقط.',
      conflict: 'تغيّر الطلب التجريبي أو حُذف في نافذة أخرى؛ تم تحديث القائمة. راجع الحالة قبل المحاولة مجدداً.',
      id: 'رمز تجريبي'
    },
    en: {
      title: 'Request tracker — local simulation',
      disclaimer: 'Demo only: these are fictional requests stored in this browser. Nothing goes to Sanad or any government agency. Do not enter personal information.',
      service: 'Choose a fictional service',
      create: 'Create demo request',
      filter: 'Filter by status',
      filters: ['All', 'Draft', 'Under review (simulation)', 'Completed (simulation)'],
      statuses: ['Demo draft', 'Simulated review', 'Simulated completion'],
      advance: 'Simulate next step',
      remove: 'Delete request',
      clear: 'Clear all demo requests',
      confirm: 'Delete all fictional requests stored on this device?',
      empty: 'No matching demo requests.',
      made: 'A fictional request was created on this device only; nothing was submitted.',
      changed: 'The fictional request status changed in your browser only.',
      deleted: 'The fictional request was deleted from this browser.',
      cleared: 'Fictional requests cleared from this browser.',
      maximum: 'Demo limit is 25 requests. Delete one to add another.',
      storage: 'Browser storage unavailable: the demo will last only while this page is open.',
      conflict: 'This demo request changed or was deleted in another tab. The list was refreshed; review it before retrying.',
      id: 'Demo reference'
    }
  };
  const $ = id => document.getElementById(id);
  const currentLang = () => document.documentElement.lang === 'en' ? 'en' : 'ar';
  const text = () => copy[currentLang()];
  const selectOptions = (element, entries) => {
    const value = element.value;
    element.replaceChildren();
    entries.forEach(([key, label]) => {
      const option = document.createElement('option');
      option.value = String(key);
      option.textContent = label;
      element.append(option);
    });
    if (entries.some(([key]) => String(key) === value)) element.value = value;
    else element.value = String(entries[0][0]);
  };
  function decode(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_STORAGE_CHARS) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const seen = new Set();
    const rows = parsed.filter(r => r && typeof r.id === 'string' && /^DEMO-[A-Z0-9]{6,16}$/.test(r.id) &&
      Number.isInteger(r.service) && r.service >= 0 && r.service < services.length &&
      states.includes(r.state) && !seen.has(r.id) && (seen.add(r.id), true))
      .slice(0, MAX).map(r => ({id: r.id, service: r.service, state: r.state}));
    return { rows, count: parsed.length };
  }
  function load() {
    try { return decode(localStorage.getItem(STORAGE_KEY) || '[]')?.rows || []; }
    catch { return []; }
  }
  let requests = load();
  let memoryOnly = false;
  function sameRequest(actual, expected) {
    return !!actual && !!expected && actual.id === expected.id &&
      actual.service === expected.service && actual.state === expected.state;
  }
  // Re-read storage before an action. An old button cannot overwrite newer
  // changes from another tab, or replace an invalid/corrupted register.
  function latestForAction(expected) {
    if (memoryOnly) {
      const current = requests.find(r => r.id === expected.id);
      return sameRequest(current, expected) ? {rows: requests, current} : null;
    }
    try {
      const snapshot = decode(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!snapshot || snapshot.count !== snapshot.rows.length) return null;
      const current = snapshot.rows.find(r => r.id === expected.id);
      return sameRequest(current, expected) ? {rows: snapshot.rows, current} : null;
    } catch { return null; }
  }
  function updateDemo(expected, action) {
    const latest = latestForAction(expected);
    if (!latest) {
      requests = load();
      renderDemo();
      showMessage('conflict');
      return;
    }
    requests = latest.rows;
    if (action === 'advance') {
      const index = states.indexOf(latest.current.state);
      if (index < 0 || index >= states.length - 1) return;
      latest.current.state = states[index + 1];
    } else {
      requests = requests.filter(r => r.id !== expected.id);
    }
    const saved = persist();
    renderDemo();
    if (saved) showMessage(action === 'advance' ? 'changed' : 'deleted');
  }
  // Distinct references matter: the status and delete actions target requests by ID.
  // A per-page sequence prevents collisions even when the clock/random source repeats.
  let demoSequence = 0;
  function nextDemoId() {
    const stamp = Date.now().toString(36).slice(-6).padStart(6, '0');
    for (let attempt = 0; attempt <= MAX; attempt++) {
      const suffix = (demoSequence++).toString(36).padStart(3, '0');
      const id = ('DEMO-' + stamp + suffix + Math.random().toString(36).slice(2, 8)).toUpperCase();
      if (!requests.some(request => request.id === id)) return id;
    }
    return null;
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
      memoryOnly = false;
      return true;
    } catch {
      memoryOnly = true;
      $('demoMessage').textContent = text().storage;
      return false;
    }
  }
  function button(label, onClick, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (className) b.className = className;
    b.addEventListener('click', onClick);
    return b;
  }
  function showMessage(key) {
    $('demoMessage').textContent = text()[key];
  }
  function renderDemo() {
    const t = text(), l = currentLang() === 'ar' ? 0 : 1;
    $('demoTitle').textContent = t.title;
    $('demoDisclaimer').textContent = t.disclaimer;
    $('demoServiceLabel').textContent = t.service;
    $('demoCreate').textContent = t.create;
    $('demoFilterLabel').textContent = t.filter;
    $('demoClear').textContent = t.clear;
    selectOptions($('demoService'), services.map((names,i) => [i,names[l]]));
    selectOptions($('demoFilter'), [['all',t.filters[0]],...states.map((s,i) => [s,t.filters[i+1]])]);
    const filter = $('demoFilter').value;
    const shown = requests.filter(r => filter === 'all' || r.state === filter);
    const root = $('demoList');
    root.replaceChildren();
    if (!shown.length) {
      const p = document.createElement('p');
      p.className = 'empty-demo';
      p.textContent = t.empty;
      root.append(p);
    }
    for (const request of shown) {
      const article = document.createElement('article');
      article.className = 'demo-request';
      const heading = document.createElement('strong');
      heading.textContent = services[request.service][l] + ' · ' + t.id + ': ' + request.id;
      const status = document.createElement('p');
      status.className = 'demo-status';
      status.textContent = t.statuses[states.indexOf(request.state)];
      article.append(heading,status);
      const actions = document.createElement('div');
      actions.className = 'demo-actions';
      const displayed = {...request};
      if (request.state !== 'done') actions.append(button(t.advance, () => updateDemo(displayed, 'advance')));
      actions.append(button(t.remove, () => updateDemo(displayed, 'remove'), 'demo-danger'));
      article.append(actions);
      root.append(article);
    }
  }
  $('demoForm').addEventListener('submit', event => {
    event.preventDefault();
    if (requests.length >= MAX) {showMessage('maximum');return;}
    const service = Number($('demoService').value);
    if (!Number.isInteger(service) || service < 0 || service >= services.length) return;
    const id = nextDemoId();
    if (!id) {showMessage('maximum');return;}
    requests.unshift({id, service, state:'draft'});
    const saved = persist();
    $('demoFilter').value = 'all';
    renderDemo();
    if (saved) showMessage('made');
  });
  $('demoClear').addEventListener('click', () => {
    if (!requests.length || !window.confirm(text().confirm)) return;
    requests = [];
    const saved = persist();
    renderDemo();
    if (saved) showMessage('cleared');
  });
  $('demoFilter').addEventListener('change', renderDemo);
  $('language').addEventListener('change', () => {
    renderDemo();
    $('demoMessage').textContent = '';
  });
  // The page also updates its language when another tab changes the shared preference.
  window.addEventListener('sanad:language-change', () => {
    renderDemo();
    $('demoMessage').textContent = '';
  });
  if(typeof window.addEventListener==='function')window.addEventListener('storage',event=>{
    if(event.storageArea!==localStorage||!(event.key===STORAGE_KEY||event.key===null))return;
    requests=load();
    renderDemo();
    $('demoMessage').textContent='';
  });
  renderDemo();
})();
