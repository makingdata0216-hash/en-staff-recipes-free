const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const data = require('../data/recipes.json');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const faults = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => faults.push('JS error: ' + e.message));
  page.on('response', r => {
    if (r.url().startsWith('http://127.0.0.1:8765/') && r.status() >= 400 && !r.url().endsWith('/favicon.ico')) {
      faults.push('HTTP ' + r.status() + ': ' + r.url());
    }
  });
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
  await page.locator('#cards .card').first().waitFor();
  assert.equal(await page.locator('#cards .card').count(), data.recipes.length, 'all recipe cards');
  assert.match(await page.locator('#result-count').innerText(), /64品/);
  console.log('PASS: desktop list and all 64 recipes');
  
  const sample = data.recipes.find(x => x.image || x.thumbnail);
  assert.ok(sample, 'image recipe exists');
  const search = page.locator('#search-input');
  await search.fill(sample.name);
  assert.ok(await page.locator('#cards .card').count() >= 1, 'search results');
  assert.ok((await page.locator('#cards').innerText()).includes(sample.name), 'search shows matching item');
  await page.locator('#cards .card a.card-main').first().click();
  await page.locator('.detail-head h1').waitFor();
  assert.equal((await page.locator('.detail-head h1').innerText()).trim(), sample.name);
  const image = page.locator('.recipe-cover img').first();
  await image.waitFor({ timeout: 15000 });
  await image.evaluate(async img => {
    if (!img.complete) await new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, {once:true});
      img.addEventListener('error', reject, {once:true});
    });
  });
  assert.ok(await image.evaluate(img => img.naturalWidth > 0), 'recipe image successfully decoded');
  console.log('PASS: search, recipe detail, image loaded');

  await page.goto('http://127.0.0.1:8765/#/', {waitUntil:'networkidle'});
  await page.locator('#cards .card').first().waitFor();
  const favId = await page.locator('#cards .card button[data-action="favorite"]').first().getAttribute('data-id');
  await page.locator('#cards .card button[data-action="favorite"]').first().click();
  await page.goto('http://127.0.0.1:8765/#/favorites', {waitUntil:'networkidle'});
  await page.locator('#cards .card').first().waitFor();
  assert.ok((await page.locator('#cards .card button[data-action="favorite"]').first().getAttribute('data-id')) === favId);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#cards .card').first().waitFor();
  assert.equal(await page.locator('#cards .card').count(), 1);
  console.log('PASS: favorites persist after reload');

  assert.equal(data.manuals.filter(m => m.id === 'first').length, 1, 'replace existing first manual in place');
  assert.equal(data.manuals.find(m => m.id === 'first')?.steps.length, 10, 'new first-contact manual contains all ten sections');
  assert.equal(data.manuals.filter(m => m.id === 'dark-leaf-shisha').length, 1, 'dark-leaf manual added exactly once');
  assert.equal(data.manuals.find(m => m.id === 'dark-leaf-shisha')?.steps.length, 5, 'dark-leaf procedure steps');
  console.log('PASS: first contact replaced and dark leaf procedure added exactly once');
  await page.goto('http://127.0.0.1:8765/#/manuals', {waitUntil:'networkidle'});
  await page.locator('.manual-card').first().waitFor();
  assert.equal(await page.locator('.manual-card').count(), data.manuals.length);
  await page.locator('.manual-card').first().click();
  await page.locator('.script-step').first().waitFor();
  assert.ok(await page.locator('.script-step').count() > 0);
  console.log('PASS: all ' + data.manuals.length + ' manuals and detail pages');

  await page.goto('http://127.0.0.1:8765/#/manage', {waitUntil:'networkidle'});
  assert.match(await page.locator('#app').innerText(), /Excel/);
  console.log('PASS: Excel / data-management screen');

  for (const width of [375,320]) {
    await page.setViewportSize({width, height:812});
    await page.goto('http://127.0.0.1:8765/#/', {waitUntil:'networkidle'});
    await page.locator('#cards .card').first().waitFor();
    const bounds = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bottomNav: !!document.querySelector('.bottom-nav')
    }));
    assert.ok(bounds.scrollWidth <= bounds.clientWidth + 2,
      `horizontal overflow at ${width}px: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.bottomNav, 'mobile bottom navigation exists');
    console.log('PASS: mobile width ' + width + 'px, no horizontal overflow');
  }
  // Final acceptance: every recipe and manual route, plus every referenced image.
  const fs = require('node:fs');
  const path = require('node:path');
  const picturePaths = [...new Set([
    ...data.recipes.flatMap(item => [item.image, item.thumbnail].filter(Boolean)),
    ...data.manuals.flatMap(item => [item.image].filter(Boolean))
  ])];
  for (const picturePath of picturePaths) {
    assert.ok(picturePath.startsWith('assets/') && !picturePath.includes('..') && ['.webp', '.png', '.jpeg', '.jpg'].some(ext => picturePath.endsWith(ext)), 'safe local asset path: ' + picturePath);
    const filepath = path.join(__dirname, '..', picturePath);
    assert.ok(fs.existsSync(filepath), 'missing recipe asset: ' + picturePath);
    if (picturePath.endsWith('.webp')) {
      const buf = fs.readFileSync(filepath);
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF', 'WebP RIFF signature');
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP', 'WebP signature');
    }
  }
  console.log('PASS: all ' + picturePaths.length + ' referenced assets exist and WebP headers valid');

  await page.setViewportSize({width:375,height:812});
  for (const recipe of data.recipes) {
    await page.evaluate(id => { location.hash = '#/recipe/' + encodeURIComponent(id); }, recipe.id);
    await page.waitForFunction(expected => document.querySelector('.detail-head h1')?.textContent?.trim() === expected, recipe.name, {timeout:10000});
    const photo = page.locator('.recipe-cover img');
    if (recipe.image || recipe.thumbnail) {
      await photo.evaluate(async img => {
        if (!img.complete) await new Promise((resolve, reject) => {
          img.addEventListener('load', resolve, {once: true});
          img.addEventListener('error', () => reject(new Error('Image loading failed: ' + img.src)), {once: true});
        });
        if (img.naturalWidth === 0) throw new Error('Image decoded width is zero: ' + img.src);
      });
    }
  }
  console.log('PASS: all 64 recipe detail routes and cover images on mobile');

  for (const manual of data.manuals) {
    await page.evaluate(id => { location.hash = '#/manual/' + encodeURIComponent(id); }, manual.id);
    await page.waitForFunction(expected => document.querySelector('.detail-head h1')?.textContent?.trim() === expected, manual.name, {timeout:10000});
    assert.equal(await page.locator('.script-step').count(), manual.steps.length, 'manual steps unchanged: ' + manual.id);
  }
  for (const manual of data.manuals.filter(m => m.image)) {
    await page.evaluate(id => { location.hash = '#/manual/' + encodeURIComponent(id); }, manual.id);
    const photo = page.locator('.manual-visual img');
    await photo.waitFor();
    await photo.evaluate(async img => {
      if (!img.complete) await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, {once:true});
        img.addEventListener('error', () => reject(new Error('Failed to load manual image: ' + img.src)), {once:true});
      });
      if (!img.naturalWidth) throw new Error('Failed to decode manual image: ' + img.src);
    });
  }
  console.log('PASS: all manual images render correctly');
  console.log('PASS: all ' + data.manuals.length + ' individual manuals on mobile');

  await page.locator('.bottom-nav a[href="#/"]').click();
  await page.locator('#cards .card').first().waitFor();
  await page.locator('.bottom-nav a[href="#/manuals"]').click();
  await page.locator('.manual-card').first().waitFor();
  console.log('PASS: mobile bottom navigation');
  
  assert.deepEqual(faults, [], 'browser JavaScript and HTTP errors');
  await browser.close();
  console.log('PASS: all browser checks completed');
})().catch(error => { console.error('FAIL:', error.stack || error); process.exit(1); });
