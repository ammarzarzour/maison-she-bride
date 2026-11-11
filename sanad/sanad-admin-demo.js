/* Sanad Syria: browser-only demo dashboard. Not real administrative access. */
(function () {
  'use strict';
  const REQUESTS_KEY = 'sanad_preview_requests_v1';
  const LANG_KEY = 'sanad_lang';
  const STATES = ['draft','review','done'];
  const SERVICES = [
    ['الهوية والحساب','Identity & accounts'],
    ['الوكالات والتفويض','Authorizations'],
    ['المستندات','Documents'],
    ['المواعيد','Appointments']
  ];
  const ui = {
    ar: {
      brand:'سند سوريا', subtitle:'لوحة متابعة تجريبية — ليست إدارة رسمية',back:'العودة للخدمات',lang:'اللغة',
      notice:'لوحة عرض تجريبية مفتوحة للجميع وليست لوحة إدارة آمنة أو جهة حكومية. تعرض الطلبات الوهمية المخزّنة في هذا المتصفح فقط. لا تدخل أي بيانات شخصية.',
      overview:'ملخص الطلبات الوهمية',total:'الإجمالي',draft:'مسودات تجريبية',review:'مراجعة وهمية',done:'مكتملة تجريبياً',
      requests:'قائمة الطلبات الوهمية',search:'بحث بالرمز أو الخدمة',filter:'تصفية الحالة',
      filters:['جميع الحالات','مسودة','قيد المراجعة','مكتمل'],refresh:'تحديث',
      reference:'الرمز التجريبي',service:'الخدمة',status:'الحالة',actions:'محاكاة الإجراءات',
      statuses:['مسودة','قيد المراجعة (محاكاة)','مكتمل (محاكاة)'],
      advance:'المرحلة التالية',remove:'حذف',removeConfirm:'حذف هذا الطلب الوهمي من هذا المتصفح؟',
      empty:'لا توجد طلبات وهمية مطابقة.',count:n=>'عدد النتائج: '+n,
      advanced:'تم تحديث المرحلة محلياً فقط؛ لم يُرسل الطلب إلى أي جهة.',
      removed:'حُذف الطلب الوهمي من هذا المتصفح.',storage:'تعذر حفظ التغيير على هذا المتصفح.',
      footer:'سند سوريا — نموذج أولي مستقل، بدون مصادقة أو معاملات حقيقية'
    },
    en: {
      brand:'Sanad Syria',subtitle:'Demo dashboard — not an official admin console',back:'Back to services',lang:'Language',
      notice:'Public fictional dashboard, not secure administration or a government service. It only shows demo requests stored in this browser. Do not enter personal information.',
      overview:'Fictional request summary',total:'Total',draft:'Demo drafts',review:'Simulated review',done:'Simulated complete',
      requests:'Fictional request list',search:'Search reference or service',filter:'Filter by status',
      filters:['All statuses','Draft','Under review','Complete'],refresh:'Refresh',
      reference:'Demo reference',service:'Service',status:'Status',actions:'Simulated actions',
      statuses:['Draft','Under review (simulation)','Complete (simulation)'],
      advance:'Next stage',remove:'Delete',removeConfirm:'Delete this fictional request from this browser?',
      empty:'No matching fictional requests.',count:n=>'Results: '+n,
      advanced:'Stage changed locally only; nothing was submitted anywhere.',
      removed:'The fictional request was removed from this browser.',storage:'Could not save this browser change.',
      footer:'Sanad Syria — independent prototype without authentication or real transactions'
    }
  };
  const $ = id => document.getElementById(id);
  let langPreference = 'auto';
  try { langPreference = localStorage.getItem(LANG_KEY)||'auto'; } catch {}
  if (!['auto','ar','en'].includes(langPreference)) langPreference='auto';
  function lang(){return langPreference==='auto' ? (navigator.language.toLowerCase().startsWith('ar')?'ar':'en') : langPreference;}
  function copy(){return ui[lang()];}
  function read(){
    try {
      const parsed = JSON.parse(localStorage.getItem(REQUESTS_KEY)||'[]');
      if(!Array.isArray(parsed))return [];
      const seen=new Set();
      return parsed.filter(r=>r&&typeof r.id==='string'&&/^DEMO-[A-Z0-9]{6,16}$/.test(r.id)&&
        Number.isInteger(r.service)&&r.service>=0&&r.service<SERVICES.length&&STATES.includes(r.state)&&!seen.has(r.id)&&(seen.add(r.id),true))
        .slice(0,25).map(r=>({id:r.id,service:r.service,state:r.state}));
    } catch {return [];}
  }
  let messageKey=null;
  function showMessage(key){messageKey=key;$('message').textContent=copy()[key];}
  function write(rows){
    try{localStorage.setItem(REQUESTS_KEY,JSON.stringify(rows));return true;}
    catch{showMessage('storage');return false;}
  }
  function option(value,label){
    const o=document.createElement('option');o.value=value;o.textContent=label;return o;
  }
  function cell(row,value){
    const td=document.createElement('td');td.textContent=value;row.append(td);return td;
  }
  function button(label,fn,style){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.className=style;b.addEventListener('click',fn);return b;
  }
  function update(id,action){
    const rows=read(),index=rows.findIndex(r=>r.id===id);
    if(index<0)return;
    const t=copy();
    if(action==='remove'){
      if(!window.confirm(t.removeConfirm))return;
      rows.splice(index,1);
    }else{
      const stage=STATES.indexOf(rows[index].state);
      if(stage<0||stage>=STATES.length-1)return;
      rows[index].state=STATES[stage+1];
    }
    if(write(rows)){showMessage(action==='remove'?'removed':'advanced');render();}
  }
  function render(){
    const t=copy(),l=lang()==='ar'?0:1;
    if(messageKey)$('message').textContent=t[messageKey];
    document.documentElement.lang=lang();
    document.documentElement.dir=l===0?'rtl':'ltr';
    $('language').value=langPreference;
    const strings={brand:t.brand,subtitle:t.subtitle,backLink:t.back,langLabel:t.lang,
      notice:t.notice,overviewTitle:t.overview,totalLabel:t.total,draftLabel:t.draft,
      reviewLabel:t.review,doneLabel:t.done,requestsTitle:t.requests,searchLabel:t.search,
      filterLabel:t.filter,refresh:t.refresh,refHeader:t.reference,serviceHeader:t.service,
      statusHeader:t.status,actionHeader:t.actions,footer:t.footer};
    for(const [id,value] of Object.entries(strings))$(id).textContent=value;
    $('searchRequests').placeholder=t.search;
    const filter=$('statusFilter'),old=filter.value;
    filter.replaceChildren(option('all',t.filters[0]),...STATES.map((s,i)=>option(s,t.filters[i+1])));
    filter.value=['all',...STATES].includes(old)?old:'all';
    const all=read(),count=state=>all.filter(r=>r.state===state).length;
    $('totalCount').textContent=all.length;
    $('draftCount').textContent=count('draft');
    $('reviewCount').textContent=count('review');
    $('doneCount').textContent=count('done');
    const query=$('searchRequests').value.trim().toLocaleLowerCase();
    const filtered=all.filter(r=>(filter.value==='all'||r.state===filter.value)&&
      (!query||(r.id+' '+SERVICES[r.service][0]+' '+SERVICES[r.service][1]).toLocaleLowerCase().includes(query)));
    $('resultCount').textContent=t.count(filtered.length);
    const tbody=$('requestRows');
    tbody.replaceChildren();
    if(!filtered.length){
      const tr=document.createElement('tr'),td=cell(tr,t.empty);td.colSpan=4;tbody.append(tr);
      return;
    }
    for(const r of filtered){
      const row=document.createElement('tr');
      cell(row,r.id);
      cell(row,SERVICES[r.service][l]);
      const statusCell=cell(row,'');const chip=document.createElement('span');chip.className='state';chip.textContent=t.statuses[STATES.indexOf(r.state)];statusCell.append(chip);
      const actions=cell(row,'');const wrap=document.createElement('div');wrap.className='actions';
      if(r.state!=='done')wrap.append(button(t.advance,()=>update(r.id,'advance'),'advance'));
      wrap.append(button(t.remove,()=>update(r.id,'remove'),'remove'));
      actions.append(wrap);tbody.append(row);
    }
  }
  $('language').addEventListener('change',event=>{
    langPreference=event.target.value;
    if(!['auto','ar','en'].includes(langPreference))langPreference='auto';
    try{localStorage.setItem(LANG_KEY,langPreference);}catch{}
    render();
  });
  $('searchRequests').addEventListener('input',render);
  $('statusFilter').addEventListener('change',render);
  $('refresh').addEventListener('click',render);
  window.addEventListener('storage',event=>{if(event.storageArea&&event.storageArea!==localStorage)return;if(event.key===null||event.key===REQUESTS_KEY||event.key===LANG_KEY){
    if(event.key===null||event.key===LANG_KEY){try{langPreference=localStorage.getItem(LANG_KEY)||'auto';if(!['auto','ar','en'].includes(langPreference))langPreference='auto';}catch{langPreference='auto';}}
    render();
  }});
  window.addEventListener('focus',render);
  render();
})();
