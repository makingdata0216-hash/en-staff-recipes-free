
/*
  en STAFF RECIPE BOOK — クレジット消費のない静的サイト
  外部API、生成AI、トラッキング、従量課金サービスへのリクエストなし。
  共有メニューは保存したHTMLファイルを更新して各端末に再配布する。
  CSVの読み込み／お気に入りはローカル端末上だけで実行する。
*/
(async () => {
  'use strict';
  await window.EN_DATA_READY;
  const baseData = window.EN_DATA;
  if (!baseData || !Array.isArray(baseData.recipes)) {
    document.querySelector('#app').textContent = 'レシピデータを読み込めませんでした。data/recipes.json を確認してください。';
    return;
  }

  const draftKey = 'en-staff-local-recipes-v20';
  const favoriteKey = 'en-staff-local-favorites-v1';
  const editsKey = 'en-staff-inline-edits-v23';
  const changesKey = 'en-staff-inline-changes-v23';
  const headings = {
    home: ['RECIPE LIBRARY', 'メニューを探す', '商品名やカテゴリから、作り方をすぐ確認できます。'],
    favorites: ['MY FAVORITES', 'お気に入り', 'よく使うメニューへすぐにアクセス。'],
    manuals: ['STAFF HANDBOOK', '接客マニュアル', '電話予約から料金案内まで、接客時に使えるフレーズ。'],
    manage: ['DATA MANAGEMENT', 'Excel・データ管理', 'レシピの書き出し・端末内確認用の読み込み。'],
  };
  const badges = { '確認済み': 'ok', '要確認': 'warn', '参考': 'ref' };
  const csvHeaders = ['id', '商品名', 'カテゴリ', '種類', '状態', '説明', '材料', '手順', '注意事項', '出典', '画像パス', '検索キーワード'];
  const app = document.querySelector('#app');
  const crumb = document.querySelector('#crumbPage');
  const toast = document.querySelector('#toast');
  const state = {
    filter: 'すべて',
    cocktailBase: 'すべて',
    query: '',
    pendingOnly: false,
    drafts: readLocal(draftKey, null),
    favorites: readLocal(favoriteKey, []),
    edits: readLocal(editsKey, {}),
    editLog: readLocal(changesKey, []),
  };
  if (!Array.isArray(state.favorites)) state.favorites = [];
  if (!state.edits || typeof state.edits !== 'object' || Array.isArray(state.edits)) state.edits = {};
  if (!Array.isArray(state.editLog)) state.editLog = [];
  if (!Array.isArray(state.drafts)) state.drafts = null;
  const oldCrepeIds = {
    'tea-crepe': 'crepe-royal-milk-tea',
    'crepe-base': 'crepe-matcha-brulee',
    'crepe-cheesecake': 'crepe-hojicha-sweet-potato'
  };
  const savedFavorites = state.favorites;
  state.favorites = [...new Set(savedFavorites.map(id => oldCrepeIds[id] || id).filter(id => id !== 'melon-soda'))];
  if (state.favorites.join('|') !== savedFavorites.join('|')) {
    localStorage.setItem(favoriteKey, JSON.stringify(state.favorites));
  }

  function readLocal(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
  }
  function norm(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[\s・\-_ー]/g, '')
      .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }
  function recipes() { return (state.drafts || baseData.recipes).map(item => state.edits[item.id] ? {...item,...state.edits[item.id]} : item); }
  function route() {
    const parts = (location.hash || '#/').slice(2).split('/');
    const page = parts[0];
    if (page === 'recipe' && parts[1]) return { page, id: decodeURIComponent(parts[1]) };
    if (page === 'manual' && parts[1]) return { page, id: decodeURIComponent(parts[1]) };
    return { page: ['favorites', 'manuals', 'manage'].includes(page) ? page : 'home' };
  }
  function photoPath(path) {
    // Offline single-file photos use safe base64 PNG/JPEG/WebP, external network photos are not allowed.
    if (typeof path !== 'string') return '';
    if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(path)) return path;
    if (/^assets\/[a-z0-9_\-.\/]+\.(png|jpe?g|webp|gif)$/i.test(path) && !path.includes('..')) return path;
    if (/^assets\/food-guides\/[a-z0-9-]+\.svg$/i.test(path)) return path;
    return '';
  }
  function theme(item) {
    if (item.group === 'カクテル') return ['art-cocktail', '🍸'];
    if (item.category === 'スイーツ') return ['art-sweet', '🍨'];
    if (item.category === 'フード') return ['art-food', '🍟'];
    return ['art-drink', '🥤'];
  }
  function badge(item) {
    const status = badges[item.status] ? item.status : '要確認';
    return `<span class="badge ${badges[status]}">${status === '確認済み' ? '✓' : '!'} ${esc(status === '確認済み' ? '資料あり' : status === '参考' ? '一般的な参考' : status)}</span>`;
  }
  function heading(page) {
    const [eng, title, sub] = headings[page];
    return `<div class="page-head"><div class="eyebrow">${eng}</div><h1>${title}<span class="period">.</span></h1><p>${sub}</p></div>`;
  }
  function setNav(current) {
    const page = current === 'recipe' ? 'home' : current === 'manual' ? 'manuals' : current;
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === page);
      if (el.dataset.tab === page) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    crumb.textContent = (headings[page] || headings.home)[0];
  }
  function flash(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { toast.hidden = true; }, 4800);
  }
  function hero() {
    return `<section class="hero"><div class="hero-text"><div class="hero-tag">WELCOME TO EN STAFF BOOK</div><h2>いつもの一品を、<br>もっとスムーズに。</h2><p>作り方も、材料・分量も。<br>必要な情報をひとつに。</p><button class="solid-btn" data-action="focus-search">レシピを探す　⌕</button></div><div class="hero-art" aria-hidden="true">en<span>.</span></div></section>`;
  }
  function stats() {
    const count = recipes();
    return `<div class="stats"><div class="stat"><label>REGISTERED</label><strong>${count.length}<small>品</small></strong><p>登録メニュー</p></div><div class="stat"><label>FAVORITES</label><strong>${state.favorites.length}<small>品</small></strong><p>お気に入り</p></div><div class="stat"><label>NEEDS REVIEW</label><strong>${count.filter(x => x.status !== '確認済み').length}<small>品</small></strong><p>要確認・参考</p></div></div>`;
  }
  const cocktailBases = ['すべて','ジン','ウォッカ','マリブ','緑茶','バナナ','ワイン','ピーチ','カシス','カンパリ','ヨーグルト','ブルーキュラソー','ラム','ミルク','ウイスキー'];
  function filterPills() {
    return `<div class="chips" role="group" aria-label="メニューの種類">${['すべて', 'ドリンク', 'カクテル', 'スイーツ', 'フード'].map(x => `<button type="button" data-action="filter" data-filter="${x}" class="chip ${state.filter === x ? 'active' : ''}" aria-pressed="${state.filter === x}">${x}</button>`).join('')}</div>`;
  }
  function cocktailPills() {
    if (state.filter !== 'カクテル') return '';
    return `<div class="base-filter"><div class="base-label">🍸 ベースから探す</div><div class="base-chips" role="group" aria-label="カクテルのベース">${cocktailBases.map(x=>`<button type="button" class="base-chip ${state.cocktailBase===x?'active':''}" data-action="cocktail-base" data-base="${x}" aria-pressed="${state.cocktailBase===x}">${x==='すべて'?'すべてのベース':x}</button>`).join('')}</div></div>`;
  }
  function listPage(page) {
    const fav = page === 'favorites';
    app.innerHTML = heading(page) + `
      <section aria-labelledby="items-title">
        <div class="section-title"><h2 id="items-title">${fav ? '保存したメニュー' : 'メニュー一覧'} <small id="result-count"></small></h2></div>
        <label class="search" id="menu-search"><span aria-hidden="true">⌕</span><input type="search" id="search-input" value="${esc(state.query)}" placeholder="メニュー名で検索" autocomplete="off" aria-label="商品名検索"><button type="button" aria-label="検索をクリア" data-action="clear-search">×</button></label>
        <div class="filter-area">${filterPills()}</div>
        <div id="cocktail-filters">${cocktailPills()}</div>
        <div id="cards" class="grid" aria-live="polite"></div>
      </section>`;
    updateCards(fav);
  }
  function relevant(item, fav) {
    if (fav && !state.favorites.includes(item.id)) return false;
    if (state.filter === 'カクテル' && item.group !== 'カクテル') return false;
    if (!['すべて', 'カクテル'].includes(state.filter) && item.category !== state.filter) return false;
    if (state.filter === 'カクテル' && state.cocktailBase !== 'すべて' && item.cocktailBase !== state.cocktailBase) return false;
    if (!state.query.trim()) return true;
    return norm([item.name, item.group, item.cocktailBase||'', item.summary, ...(item.aliases || [])].join(' ')).includes(norm(state.query));
  }
  function card(item) {
    const [className, emoji] = theme(item);
    const img = photoPath(item.thumbnail || item.image);
    const selected = state.favorites.includes(item.id);
    return `<article class="card">
      <a class="card-main" href="#/recipe/${encodeURIComponent(item.id)}" aria-label="${esc(item.name)}の作り方">
        <div class="card-img ${className}">${img ? `<img loading="lazy" decoding="async" src="${esc(img)}" alt="${esc(item.name)}の画像">` : `<span class="card-emoji" aria-hidden="true">${emoji}</span>`}</div>
        <div class="card-body"><h3>${esc(item.name)}</h3></div>
      </a>
      <button class="fav-toggle ${selected ? 'active' : ''}" data-action="favorite" data-id="${esc(item.id)}" aria-label="${esc(item.name)}をお気に入り${selected ? 'から削除' : 'に追加'}" aria-pressed="${selected}">${selected ? '♥' : '♡'}</button>
    </article>`;
  }
  function updateCards(fav) {
    const listed = recipes().filter(item => relevant(item, fav));
    const el = document.querySelector('#cards');
    if (!el) return;
    el.innerHTML = listed.length ? listed.map(card).join('') : `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">⌕</div><h3>${fav && !state.favorites.length ? 'お気に入りはまだありません' : '一致するメニューがありません'}</h3><p>検索語やカテゴリを変更してください。</p><button data-action="reset-filters">絞り込みをクリア</button></div>`;
    const count = document.querySelector('#result-count');
    if (count) count.textContent = `${listed.length}品`;
  }
  function steps(items) {
    return `<ol class="steps">${items.map((step, i) => `<li><span class="step-index">${String(i + 1).padStart(2, '0')}</span><p>${esc(step)}</p></li>`).join('')}</ol>`;
  }
  function detailRecipe(id) {
    const item = recipes().find(x => x.id === id);
    if (!item) { app.innerHTML = heading('home') + '<div class="empty">レシピが見つかりません。<p><a href="#/">一覧へ戻る</a></p></div>'; return; }
    const [className, emoji] = theme(item);
    const recipeImg = photoPath(item.image);
    const topPreview = photoPath(item.thumbnail);
    const hasRecipe = (item.steps || []).length > 0;
    const selected = state.favorites.includes(item.id);
    const origin = listOrigin === 'favorites' ? '#/favorites' : '#/';
    const verifiedNote = item.status === '確認済み'
      ? `<div class="status-callout is-record"><strong>資料あり</strong><p>提供されたメモ・画像から整理した内容です。店舗責任者の承認とは異なります。</p></div>`
      : item.status === '参考'
      ? `<div class="status-callout is-reference"><strong>一般的な参考レシピ</strong><p>enの正式配合ではありません。提供前に店舗の指定を確認してください。</p></div>`
      : `<div class="status-callout is-pending"><strong>店舗で要確認</strong><p>${hasRecipe?'分量・作り方の一部に未確定事項があります。':'作り方の提供待ちです。'} 店舗の正式な手順を優先してください。</p></div>`;
    const imageSrc=topPreview||recipeImg;
    const subName=item.cocktailBase ? `カクテル / ${item.cocktailBase}` : item.group;
    app.innerHTML = `
      <a class="back" href="${origin}">←　${listOrigin === 'favorites' ? 'お気に入り' : 'メニュー一覧'}に戻る</a>
      <div class="detail-head"><div><div class="eyebrow">RECIPE / ${esc(subName)}</div><h1>${esc(item.name)}</h1><div class="detail-flags">${badge(item)}</div></div><button class="detail-fav ${selected ? 'active' : ''}" data-action="favorite" data-id="${esc(item.id)}" aria-label="お気に入りを${selected?'解除':'追加'}" aria-pressed="${selected}"><span>${selected ? '♥' : '♡'}</span>　${selected ? '保存済み' : 'お気に入り'}</button></div>
      ${verifiedNote}
      ${state.edits[item.id] ? '<div class="local-edited-note">✎ この端末だけの編集内容が表示されています。スタッフ全員にはまだ反映されていません。</div>' : ''}
      ${item.time ? `<p class="local-time">⏱ 時間：${esc(item.time)}</p>` : ''}
      <div class="recipe-quick-grid">
        <figure class="recipe-cover ${className}">${imageSrc ? `<img src="${esc(imageSrc)}" alt="${esc(item.name)}の完成イメージ">`:`<div class="big-art">${emoji}</div>`}<figcaption>完成イメージ${item.status==='参考'?'（参考）':''}</figcaption></figure>
        ${item.ingredients && item.ingredients.length ? `<section class="panel quick-ingredients"><div class="panel-title"><small>01</small><h2>材料・分量</h2></div><ul class="ingredients">${item.ingredients.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></section>`:''}
      </div>
      ${item.id==='yoajung'?`<div class="yoajung-note"><strong>フルーツの細かな分量は店内基準に従う</strong><p>新しい店舗資料には、キウイなどの個別分量が明記されていません。量が必要な場合は店舗で確認してください。</p></div>`:''}
      ${hasRecipe?`<section class="panel primary-directions"><div class="panel-title"><small>02</small><h2>作り方</h2><em>DIRECTIONS</em></div>${steps(item.steps || [])}</section>`:`<section class="panel empty-recipe"><h2>作り方は未登録です</h2><p>今は商品名と完成イメージだけ登録しています。店舗の正式な手順が届くまで、調理方法や加熱時間は推測して記載しません。</p></section>`}
      ${recipeImg ? `<section class="panel recipe-poster-section"><div class="panel-title"><small>03</small><h2>レシピ画像</h2></div><button type="button" class="recipe-poster-preview" data-action="zoom-image" data-id="${esc(item.id)}" aria-label="${esc(item.name)}のレシピ画像を拡大する"><img loading="lazy" src="${esc(recipeImg)}" alt="${esc(item.name)}のレシピ画像"><span class="image-zoom-label">⤢ タップして拡大</span></button></section>`:''}
      ${!item.hideNotes && (item.notes || []).length ? `<section class="panel detail-notes"><div class="panel-title"><small>04</small><h2>注意事項</h2></div><ul class="notes">${item.notes.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></section>`:''}
      <section class="source detail-source"><strong>出典・確認状況</strong><p>${esc(item.source)}</p></section>`;
  }
  function manualsPage() {
    app.innerHTML = heading('manuals') + `<div class="warn-callout"><span aria-hidden="true">ℹ</span><div><strong>スタッフ用の接客ガイド</strong>店舗の料金・運用は最新の店内ルールを優先してください。</div></div><div class="manual-list">${baseData.manuals.map((x, i) => `<a href="#/manual/${encodeURIComponent(x.id)}" class="manual-card"><span class="count">0${i + 1} / GUIDE</span><span class="manual-icon">${x.id === 'phone' ? '☎' : x.id === 'new-hire' ? '◇' : '▤'}</span><h2>${esc(x.name)}</h2><p>${esc(x.subtitle)}</p><span class="go">マニュアルを見る　›</span></a>`).join('')}</div>`;
  }
  function detailManual(id) {
    const item = baseData.manuals.find(x => x.id === id);
    if (!item) { app.innerHTML = heading('manuals') + '<a href="#/manuals">一覧へ戻る</a>'; return; }
    const manualPhoto = photoPath(item.image);
    app.innerHTML = `<a class="back" href="#/manuals">←　マニュアル一覧へ戻る</a><div class="detail-head"><div><div class="eyebrow">STAFF MANUAL</div><h1>${esc(item.name)}</h1><p>${esc(item.subtitle)}</p></div></div>${manualPhoto ? `<div class="manual-visual"><img src="${esc(manualPhoto)}" alt="${esc(item.name)}の掲示用マニュアル画像"><button class="zoom-button" data-action="zoom-image" data-id="${esc(item.id)}" data-manual="true">⤢ マニュアル画像を拡大</button></div>` : ''}<div class="detail-columns"><section class="panel"><div class="panel-title"><small>01</small><h2>対応の流れ</h2><em>TALK SCRIPT</em></div>${item.steps.map((step, i) => `<div class="script-step"><span class="step-index">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(step[0])}</strong><p>${esc(step[1])}</p><button data-action="copy" data-index="${i}" data-id="${esc(item.id)}">⧉ この文章をコピー</button></div></div>`).join('')}</section><div class="right-col"><section class="panel"><div class="panel-title"><small>02</small><h2>確認ポイント</h2></div><ul class="notes">${item.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></section></div></div>`;
  }
  function toCsv() {
    const rows = [csvHeaders, ...recipes().map(x => [x.id,x.name,x.category,x.group,x.status,x.summary,(x.ingredients || []).join(' | '),(x.steps || []).join(' | '),(x.notes || []).join(' | '),x.source,(x.image && !x.image.startsWith('data:') ? x.image : ''),(x.aliases || []).join(' | ')])];
    return '\uFEFF' + rows.map(row => row.map(col => '"' + String(col ?? '').replace(/"/g,'""') + '"').join(',')).join('\r\n');
  }
  function download(name, body, mime) {
    const url = URL.createObjectURL(new Blob([body], {type:mime}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function parseCsv(input) {
    const source = input.replace(/^\uFEFF/, '');
    let rows = [], row = [], field = '', quoted = false;
    for (let i=0; i<source.length; i++) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i+1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) { row.push(field); field = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && source[i+1] === '\n') i++;
        row.push(field); if (row.some(x=>x.trim())) rows.push(row);
        row=[]; field='';
      } else field+=char;
    }
    if (quoted) throw Error('CSVの引用符が閉じられていません。');
    row.push(field); if (row.some(x=>x.trim())) rows.push(row);
    return rows;
  }
  function importedRecipes(text) {
    const rows = parseCsv(text);
    if (!rows.length || csvHeaders.some((v, i) => v !== rows[0][i])) throw Error('CSV列名が一致しません。まずこの画面からCSVをダウンロードしてください。');
    const result = [], ids = new Set();
    for (let i=1; i<rows.length; i++) {
      const [id,name,category,group,status,summary,ingredients,steps,notes,source,image,aliases] = rows[i];
      if (!id?.trim() || !name?.trim()) throw Error(`${i+1}行目: id・商品名は必須です。`);
      if (ids.has(id)) throw Error(`${i+1}行目: idが重複しています。`);
      if (!['ドリンク','スイーツ','フード'].includes(category)) throw Error(`${i+1}行目: カテゴリの値が不正です。`);
      if (!['確認済み','要確認','参考'].includes(status)) throw Error(`${i+1}行目: 状態の値が不正です。`);
      if (image && !photoPath(image)) throw Error(`${i+1}行目: 画像パスは assets/ に保存した画像のみ指定できます。`);
      ids.add(id);
      const splitter = s => (s || '').split(' | ').filter(Boolean);
      result.push({id,name,category,group,status,summary,ingredients:splitter(ingredients),steps:splitter(steps),notes:splitter(notes),source,image:image || (baseData.recipes.find(x=>x.id===id)?.image || ''),thumbnail:baseData.recipes.find(x=>x.id===id)?.thumbnail || '',aliases:splitter(aliases)});
    }
    if (!result.length) throw Error('CSVに商品データがありません。');
    return result;
  }
  function managePage() {
    const draftState = state.drafts ? `${state.drafts.length}品（端末内の下書き）` : 'なし';
    app.innerHTML = heading('manage') + `<div class="management-notice"><strong>重要：編集したCSVは、この端末だけに反映されます。</strong><p>スタッフ全員に反映するには、配布先のHTMLファイルを新しい版に入れ替える必要があります。現在の端末内の下書きは自動共有されません。閲覧・検索・お気に入りでAI APIを呼び出すことはありません。</p></div>
      <div class="management-grid">
        <div class="panel management-card"><span class="icon">⇩</span><h2>① Excel用CSVを保存</h2><p>日本語対応のCSVファイルを保存します。Excelで商品名・材料・手順を変更できます。</p><button class="solid-btn" data-action="csv-export">↓ CSVをダウンロード</button></div>
        <div class="panel management-card"><span class="icon">⇧</span><h2>② 編集後のCSVを読み込む</h2><p>この端末で内容をプレビューできます。配布済みHTMLの内容は変更されません。</p><input type="file" id="csv-file" accept=".csv,text/csv" hidden><button class="soft-btn" data-action="csv-import">↑ CSVを選択</button></div>
        <div class="panel management-card"><span class="icon">▤</span><h2>③ 更新用データを保存</h2><p>編集後のレシピをデータファイルに保存します。ファイルをこのチャットに添付すれば、次の配布用HTML更新に利用できます。保存するだけでは他のスタッフのファイルは更新されません。</p><button class="soft-btn" data-action="data-export">↓ data.jsをダウンロード</button></div>
        <div class="panel management-card"><span class="icon">♧</span><h2>画像の登録</h2><p>レシピ画像やトップ画像は、このチャットに商品名と画像を送ってください。こちらでHTMLへ埋め込みます。</p><span class="badge warn">画像反映は次回HTML更新時</span></div>
      </div>
      <div class="action-row"><div><strong>端末内の下書き：${draftState}</strong><p>下書きをリセットして、公開データの表示に戻せます。</p></div><button class="danger-btn" data-action="reset-draft">下書きを削除</button></div>
      <div class="management-help"><h3>編集の流れ</h3><ol><li>「CSVをダウンロード」→Excelで開く。</li><li>材料・手順など複数の項目は「 | 」で区切り、列名とidは変更しない。</li><li>Excelの「CSV UTF-8」形式で保存して、この画面に読み込む。</li><li>確認後「data.jsをダウンロード」して、このチャットへ添付し、次のHTML更新を依頼する。</li></ol><p style="font-size:11px;margin:10px 0 0;color:#718a75">※ お気に入りとCSV下書きはブラウザ内保存で、端末間同期しません。現在のHTMLは未公開です。配布すると画像やレシピをファイル内から閲覧できるため、機密情報は載せないでください。</p></div>`;
  }
  // Maintain the exact previous list position and filters when opening a recipe.
  let renderedPage = null;
  let listOrigin = 'home';
  const listScroll = { home: 0, favorites: 0 };
  try { history.scrollRestoration = 'manual'; } catch (_ignored) {}
  window.addEventListener('scroll', () => {
    if (renderedPage === 'home' || renderedPage === 'favorites') {
      listScroll[renderedPage] = window.scrollY;
    }
  }, { passive: true });
  // Capture before hash navigation so mobile browsers cannot replace the saved Y with 0.
  app.addEventListener('click', event => {
    const anchor = event.target.closest('a.card-main');
    if (!anchor || (renderedPage !== 'home' && renderedPage !== 'favorites')) return;
    listOrigin = renderedPage;
    listScroll[renderedPage] = window.scrollY;
  }, true);
  function refresh({ preserveScroll = false } = {}) {
    const path = route();
    const previousPage = renderedPage;
    const previousY = window.scrollY;
    setNav(path.page);
    switch(path.page) {
      case 'favorites': listPage('favorites'); break;
      case 'recipe': detailRecipe(path.id); break;
      case 'manuals': manualsPage(); break;
      case 'manual': detailManual(path.id); break;
      case 'manage': managePage(); break;
      default: listPage('home');
    }
    renderedPage = path.page;
    if (preserveScroll) {
      requestAnimationFrame(() => window.scrollTo({ top: previousY, behavior: 'instant' }));
    } else if (previousPage === 'recipe' && (path.page === 'home' || path.page === 'favorites')) {
      const rememberedY = listScroll[path.page] || 0;
      requestAnimationFrame(() => window.scrollTo({ top: rememberedY, behavior: 'instant' }));
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  app.addEventListener('input', event => {
    if (event.target.id === 'search-input') {
      state.query = event.target.value;
      updateCards(route().page === 'favorites');
    }
  });
  app.addEventListener('change', async event => {
    if (event.target.id !== 'csv-file') return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = importedRecipes(await file.text());
      state.drafts = rows;
      localStorage.setItem(draftKey, JSON.stringify(rows));
      flash(`${rows.length}品をこの端末に読み込みました。共有サイトへはまだ反映されていません。`);
      managePage();
    } catch(err) { flash(err.message || 'CSVの読込に失敗しました。'); }
  });
  app.addEventListener('click', async event => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'zoom-image') {
      const item = btn.dataset.manual === 'true' ? baseData.manuals.find(x => x.id === btn.dataset.id) : recipes().find(x => x.id === btn.dataset.id);
      const photo = item && photoPath(item.image);
      if (item && photo) {
        const panel = document.querySelector('#imageLightbox');
        document.querySelector('#imageZoom').src = photo;
        document.querySelector('#imageZoomName').textContent = item.name;
        panel.hidden = false;
        document.body.style.overflow = 'hidden';
      }
      return;
    }
    if (action === 'focus-search') { document.querySelector('#search-input')?.focus(); document.querySelector('#search-input')?.scrollIntoView({behavior:'smooth',block:'center'}); }
    if (action === 'favorite') {
      const id = btn.dataset.id;
      state.favorites = state.favorites.includes(id) ? state.favorites.filter(x=>x!==id) : [...state.favorites,id];
      localStorage.setItem(favoriteKey, JSON.stringify(state.favorites));
      refresh({ preserveScroll: true });
      flash(state.favorites.includes(id) ? 'お気に入りに追加しました。' : 'お気に入りから外しました。');
    }
    if (action === 'filter') {
      state.filter = btn.dataset.filter;
      if (state.filter !== 'カクテル') state.cocktailBase = 'すべて';
      document.querySelectorAll('.chip').forEach(el => { el.classList.toggle('active', el.dataset.filter === state.filter); el.setAttribute('aria-pressed', String(el.dataset.filter === state.filter)); });
      const sub = document.querySelector('#cocktail-filters');
      if (sub) sub.innerHTML = cocktailPills();
      updateCards(route().page === 'favorites');
    }
    if (action === 'cocktail-base') {
      state.cocktailBase = btn.dataset.base;
      document.querySelectorAll('.base-chip').forEach(el=>{el.classList.toggle('active',el.dataset.base===state.cocktailBase);el.setAttribute('aria-pressed',String(el.dataset.base===state.cocktailBase));});
      updateCards(route().page === 'favorites');
    }
    if (action === 'pending') {
      state.pendingOnly = !state.pendingOnly;
      btn.classList.toggle('active', state.pendingOnly);
      btn.setAttribute('aria-pressed', String(state.pendingOnly));
      updateCards(route().page === 'favorites');
    }
    if (action === 'clear-search' || action === 'reset-filters') {
      state.query = '';
      if (action === 'reset-filters') { state.filter = 'すべて'; state.cocktailBase = 'すべて'; state.pendingOnly = false; }
      listPage(route().page === 'favorites' ? 'favorites' : 'home');
      document.querySelector('#search-input')?.focus();
    }
    if (action === 'copy') {
      const manual = baseData.manuals.find(x=>x.id === btn.dataset.id);
      const text = manual?.steps[Number(btn.dataset.index)]?.[1];
      if (!text) return;
      try { await navigator.clipboard.writeText(text); flash('文章をコピーしました。'); }
      catch { flash('コピーできませんでした。文章を選択してコピーしてください。'); }
    }
    if (action === 'csv-export') { download('en_staff_recipes.csv',toCsv(),'text/csv;charset=utf-8'); flash('CSVを保存しました。'); }
    if (action === 'csv-import') document.querySelector('#csv-file')?.click();
    if (action === 'data-export') {
      const output = {...baseData,recipes:recipes()};
      download('data.js','/* en STAFF RECIPE BOOK - 共有メニューデータ */\nwindow.EN_DATA = '+JSON.stringify(output,null,2)+';\n','text/javascript;charset=utf-8');
      flash('更新用data.jsを保存しました。このファイルをチャットに添付するとHTML更新に使えます。');
    }
    if (action === 'reset-draft') {
      if (!state.drafts) { flash('下書きはありません。'); return; }
      if (!confirm('この端末に読み込んだレシピの下書きを削除しますか？')) return;
      state.drafts = null;
      localStorage.removeItem(draftKey);
      managePage();
      flash('配布版のメニュー表示に戻しました。');
    }
  });
  document.querySelector('#openSidebar').addEventListener('click', () => {
    document.querySelector('#sidebar').classList.add('open');
    document.querySelector('#sidebarShade').hidden = false;
  });
  const closeSide = () => {
    document.querySelector('#sidebar').classList.remove('open');
    document.querySelector('#sidebarShade').hidden = true;
  };
  document.querySelector('#sidebarShade').addEventListener('click', closeSide);
  document.querySelectorAll('.sidebar-nav a').forEach(el => el.addEventListener('click', closeSide));
  window.addEventListener('hashchange', refresh);

  function closeImage() {
    const panel = document.querySelector('#imageLightbox');
    panel.hidden = true;
    document.querySelector('#imageZoom').removeAttribute('src');
    document.body.style.overflow = '';
  }
  document.querySelector('#imageClose').addEventListener('click', closeImage);
  document.querySelector('#imageLightbox').addEventListener('click', e => {
    if (e.target.id === 'imageLightbox') closeImage();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.querySelector('#imageLightbox').hidden) closeImage();
  });

  // ---- v2.3: small local-only edit overlay; never store embedded photos in localStorage. ----
  const editableKeys = ['name','category','group','time','summary','ingredients','steps','notes'];
  const editLabels = {name:'商品名',category:'カテゴリ',group:'種類',time:'時間',summary:'商品説明',ingredients:'材料・分量',steps:'作り方',notes:'注意事項'};
  const editorDialog = document.querySelector('#editDialog');
  const historyDialog = document.querySelector('#historyDialog');
  const guideDialog = document.querySelector('#guideDialog');
  const form = document.querySelector('#staffEditForm');
  const editTarget = document.querySelector('#editTarget');
  let currentTarget = '';
  function displayedItem(id) { return recipes().find(item=>item.id===id); }
  function rawItem(id) { return (state.drafts || baseData.recipes).find(item=>item.id===id); }
  function cmp(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
  function lines(text) { return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
  function copyPlainFields(item) {const out={};for(const k of editableKeys) out[k]=Array.isArray(item[k])?[...item[k]]:(item[k]??'');return out;}
  function updateEditCount() {
    const n = Object.keys(state.edits).length;
    const badge = document.querySelector('#editCount');
    badge.textContent = String(n);badge.hidden = n===0;
  }
  function openDialog(dialog) {
    if (editorDialog.open) editorDialog.close();
    if (historyDialog.open) historyDialog.close();
    if (guideDialog.open) guideDialog.close();
    dialog.showModal();
  }
  function loadForm(id) {
    const item = displayedItem(id); if (!item) return;
    currentTarget=id;
    form.elements.name.value=item.name || '';
    form.elements.time.value=item.time || '';
    form.elements.category.value=item.category || 'ドリンク';
    form.elements.group.value=item.group || '';
    form.elements.summary.value=item.summary || '';
    form.elements.ingredients.value=(item.ingredients||[]).join('\n');
    form.elements.steps.value=(item.steps||[]).join('\n');
    form.elements.notes.value=(item.notes||[]).join('\n');
    editTarget.value=id;
  }
  function showEditFields(show) {
    document.querySelector('#editFields').hidden = !show;
    document.querySelector('#editEmptyState').hidden = show;
    document.querySelector('#editDialogTitle').textContent = show ? 'レシピを編集' : '編集する商品を選ぶ';
    form.querySelector('button[type="submit"]').disabled = !show;
  }
  function openEditor() {
    const all = recipes();
    const path = route();
    // Only a currently open recipe may be preselected. Never reuse a previous edit on the list.
    const target = path.page === 'recipe' && all.some(x=>x.id===path.id) ? path.id : '';
    editTarget.innerHTML = '<option value="">商品を選択してください</option>'
      + all.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    currentTarget = '';
    form.reset();
    editTarget.value = '';
    showEditFields(false);
    if (target) { loadForm(target); showEditFields(true); }
    openDialog(editorDialog);
  }
  editTarget.addEventListener('change',e=>{
    if (e.target.value && displayedItem(e.target.value)) {
      loadForm(e.target.value);
      showEditFields(true);
    } else {
      currentTarget='';
      showEditFields(false);
    }
  });
  function persistLocal(nextEdits,nextLog) {
    try {
      localStorage.setItem(editsKey,JSON.stringify(nextEdits));
      localStorage.setItem(changesKey,JSON.stringify(nextLog));
      return true;
    } catch(err) {
      // Save still works in memory; exporting immediately avoids data loss when browser storage is disabled.
      flash('端末への保存が制限されています。「出力・共有」ですぐにバックアップしてください。');
      return false;
    }
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const id = editTarget.value;
    if (!id || id !== currentTarget) { flash('編集する商品を選んでください。'); return; }
    const old=displayedItem(id);const baseline=rawItem(id);
    if (!old || !baseline) return;
    const values={
      name:form.elements.name.value.trim(),
      category:form.elements.category.value,
      group:form.elements.group.value.trim(),
      time:form.elements.time.value.trim(),
      summary:form.elements.summary.value.trim(),
      ingredients:lines(form.elements.ingredients.value),
      steps:lines(form.elements.steps.value),
      notes:lines(form.elements.notes.value)
    };
    if (!values.name) {flash('商品名を入力してください。');return;}
    if (!['フード','ドリンク','スイーツ'].includes(values.category)) {flash('カテゴリを確認してください。');return;}
    if (values.ingredients.length>100 || values.steps.length>120 || values.notes.length>80) {flash('手順や材料の行数が多すぎます。');return;}
    const changes=editableKeys.filter(k=>!cmp(old[k]??(Array.isArray(values[k])?[]:''),values[k]));
    if (!changes.length){editorDialog.close();flash('変更はありません。');return;}
    const patch={};
    for(const k of editableKeys){const baseVal=baseline[k]??(Array.isArray(values[k])?[]:'');if(!cmp(baseVal,values[k]))patch[k]=values[k];}
    const nextEdits={...state.edits};
    if(Object.keys(patch).length)nextEdits[id]=patch;else delete nextEdits[id];
    const diff=changes.map(k=>({field:k,before:old[k]??null,after:values[k]}));
    const nextLog=[...state.editLog,{id,name:values.name,at:new Date().toISOString(),diff,beforePatch:state.edits[id]||null,afterPatch:Object.keys(patch).length?patch:null}].slice(-80);
    const ok=persistLocal(nextEdits,nextLog);
    state.edits=nextEdits;state.editLog=nextLog;updateEditCount();
    editorDialog.close();refresh({preserveScroll:true});
    flash(ok ? `${values.name}をこの端末に保存しました。変更はまだ共有されていません。` : 'この画面では変更しましたが保存に失敗。今すぐ出力してください。');
  });
  const safeDate=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`};
  function exportPayload() {
    return {format:'en-staff-local-edits',formatVersion:1,baseVersion:baseData.version,
      exportedAt:new Date().toISOString(),
      changes:Object.entries(state.edits).map(([id,fields])=>({id,fields})),
      history:state.editLog.map(h=>({id:h.id,name:h.name,at:h.at,diff:h.diff}))};
  }
  async function exportAndShare(){
    const payload=exportPayload();
    if(!payload.changes.length){flash('まだ編集内容がありません。商品を開いて「編集」から保存してください。');return;}
    const filename=`en_edits_${safeDate()}.json`;
    const json=JSON.stringify(payload,null,2);
    const file=new File([json],filename,{type:'application/json'});
    // Android share sheet with a file saves taps when the browser supports it.
    if(navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
      try {
        await navigator.share({files:[file],title:'enレシピ編集データ',text:'この編集をenレシピサイト最新版に反映して'});
        flash('共有先を選択しました。ChatGPTにJSONが添付されているか確認してください。');
        return;
      } catch(e){ if(e.name==='AbortError')return; }
    }
    download(filename,json,'application/json;charset=utf-8');
    document.querySelector('#guideMessage').textContent=`「${filename}」を保存しました。次の3手順でChatGPTへ送れます。`;
    openDialog(guideDialog);
  }
  const previewChange=(v)=>{
    if(Array.isArray(v)) return v.join(' / ').slice(0,100);
    return String(v??'（なし）').slice(0,100);
  };
  function openHistory() {
    const area=document.querySelector('#historyItems');
    if (!state.editLog.length) area.innerHTML='<div class="history-empty">まだ編集履歴はありません。<br>「編集」から商品名や分量などを変更できます。</div>';
    else area.innerHTML=[...state.editLog].reverse().map((h,i)=>{
      const when=new Date(h.at).toLocaleString('ja-JP');
      const pieces=(h.diff||[]).map(x=>`<li><b>${esc(editLabels[x.field]||x.field)}</b>：${esc(previewChange(x.before))} → ${esc(previewChange(x.after))}</li>`).join('');
      return `<article class="history-item"><header><strong>${esc(h.name||h.id)}</strong><time>${esc(when)}</time></header><ul>${pieces}</ul></article>`;
    }).join('');
    openDialog(historyDialog);
  }
  // Strictly patch-only JSON import: no images, scripts or unknown recipe IDs.
  document.querySelector('#importEditFile').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(file.size>1_500_000){flash('JSONが大きすぎます。編集データだけのファイルを選んでください。');return;}
    try{
      const input=JSON.parse(await file.text());
      if(input.format!=='en-staff-local-edits'||input.formatVersion!==1||!Array.isArray(input.changes))throw Error('編集データの形式が違います。');
      const patches={};
      for(const c of input.changes){
        if(!c||typeof c.id!=='string'||!rawItem(c.id)||!c.fields||typeof c.fields!=='object'||Array.isArray(c.fields))throw Error('商品IDまたはデータ形式が不正です。');
        const fields={};
        for(const [k,v] of Object.entries(c.fields)){
          if(!editableKeys.includes(k))throw Error('未対応の編集項目があります。');
          if(['ingredients','steps','notes'].includes(k)){
            if(!Array.isArray(v)||v.length>120||v.some(x=>typeof x!=='string'||x.length>2000))throw Error('手順の形式が不正です。');
          } else if(typeof v!=='string'||v.length>1600)throw Error('文字列の形式が不正です。');
          fields[k]=v;
        }
        patches[c.id]=fields;
      }
      const count=Object.keys(patches).length;
      if(!confirm(`${count}品の編集内容を読み込みます。今の端末で編集した内容は上書きされます。よろしいですか？`))return;
      const log=Array.isArray(input.history)?input.history.slice(-80).filter(h=>h&&typeof h.id==='string'&&typeof h.name==='string'&&Array.isArray(h.diff)).map(h=>({id:h.id,name:h.name.slice(0,100),at:h.at||'',diff:h.diff.filter(x=>editableKeys.includes(x.field)).map(x=>({field:x.field,before:x.before,after:x.after}))})) : [];
      const ok=persistLocal(patches,log);
      state.edits=patches;state.editLog=log;
      updateEditCount();if(historyDialog.open)historyDialog.close();refresh({preserveScroll:true});
      flash(ok?`${count}品の編集を読み込みました。端末内だけの変更です。`:'画面に反映しましたが端末への保存には失敗。今すぐ出力してください。');
    }catch(err){flash(err.message||'JSONの読み込みに失敗しました。');}
  });
  document.querySelector('#localEdit').addEventListener('click',openEditor);
  document.querySelector('#localShare').addEventListener('click',exportAndShare);
  document.querySelector('#localHistory').addEventListener('click',openHistory);
  document.querySelector('#closeEdit').addEventListener('click',()=>editorDialog.close());
  document.querySelector('#cancelEdit').addEventListener('click',()=>editorDialog.close());
  document.querySelector('#closeHistory').addEventListener('click',()=>historyDialog.close());
  document.querySelector('#historyShare').addEventListener('click',exportAndShare);
  document.querySelector('#importJson').addEventListener('click',()=>document.querySelector('#importEditFile').click());
  document.querySelector('#closeGuide').addEventListener('click',()=>guideDialog.close());
  document.querySelector('#closeGuideBottom').addEventListener('click',()=>guideDialog.close());
  updateEditCount();

  refresh();
})();

  