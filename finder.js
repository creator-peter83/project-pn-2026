const COLORS_URL = './colors.json';
const PRODUCTS_URL = './products.json';

let colorRows = [];
let products = [];
let lastSearchRows = [];
let lastKeyword = '';

function normalizeInput(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (m) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m];
  });
}

async function loadJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`데이터를 불러오지 못했습니다: ${url}`);
  }
  return await res.json();
}

async function initFinder() {
  const resultBox = document.getElementById('finderResult');
  try {
    [colorRows, products] = await Promise.all([
      loadJson(COLORS_URL),
      loadJson(PRODUCTS_URL)
    ]);

    bindEvents();

    resultBox.innerHTML = `
      <div class="finder-empty">
        <p>컬러번호를 검색해 주세요.</p>
      </div>
    `;
  } catch (err) {
    console.error(err);
    resultBox.innerHTML = `
      <div class="finder-error">
        <p>데이터를 불러오지 못했습니다.</p>
        <p style="font-size:12px; color:#999;">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function bindEvents() {
  const searchBtn = document.getElementById('colorSearchBtn');
  const input = document.getElementById('colorSearchInput');

  if (searchBtn) {
    searchBtn.addEventListener('click', searchColors);
  }

  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        searchColors();
      }
    });
  }

  document.addEventListener('click', function (e) {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const value = chip.getAttribute('data-chip') || '';
      const inputEl = document.getElementById('colorSearchInput');
      if (inputEl) inputEl.value = value;
      searchColors();
      return;
    }

    const resultItem = e.target.closest('.finder-result-item');
    if (resultItem) {
      const colorCode = resultItem.getAttribute('data-color');
      showProducts(colorCode);
      return;
    }

    const backBtn = e.target.closest('#finderBackBtn');
    if (backBtn) {
      renderColorList(lastSearchRows, lastKeyword);
    }
  });
}

function searchColors() {
  const input = document.getElementById('colorSearchInput');
  const keyword = String(input?.value || '').trim();
  const normalized = normalizeInput(keyword);

  if (!keyword) {
    document.getElementById('finderResult').innerHTML = `
      <div class="finder-empty">
        <p>검색어를 입력해 주세요.</p>
      </div>
    `;
    return;
  }

  let matchedRows = [];

  if (/^\d+$/.test(keyword)) {
    matchedRows = colorRows.filter(row =>
      String(row.Color_Number || '').includes(keyword)
    );
  } else {
    matchedRows = colorRows.filter(row =>
      normalizeInput(row.Color_Code_Normalized) === normalized ||
      normalizeInput(row.Color_Code_Display) === normalized
    );
  }

  lastSearchRows = matchedRows;
  lastKeyword = keyword;

  renderColorList(matchedRows, keyword);
}

function renderColorList(rows, keyword) {
  const resultBox = document.getElementById('finderResult');

  if (!rows || !rows.length) {
    resultBox.innerHTML = `
      <div class="finder-empty">
        <p><strong>${escapeHtml(keyword)}</strong>에 대한 검색 결과가 없습니다.</p>
      </div>
    `;
    return;
  }

  const uniqueMap = new Map();

  rows.forEach(row => {
    const key = row.Color_Code_Display;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        Color_Code_Display: row.Color_Code_Display,
        Category: row.Category,
        Product_Line: row.Product_Line,
        Color_Number: row.Color_Number,
        Suffix: row.Suffix
      });
    }
  });

  const uniqueColors = Array.from(uniqueMap.values()).sort((a, b) => {
    const aNum = String(a.Color_Number || '');
    const bNum = String(b.Color_Number || '');
    const numCompare = aNum.localeCompare(bNum, undefined, { numeric: true });
    if (numCompare !== 0) return numCompare;
    return String(a.Suffix || '').localeCompare(String(b.Suffix || ''));
  });

  const html = uniqueColors.map(item => `
    <div class="finder-result-item" data-color="${escapeHtml(item.Color_Code_Display)}" style="cursor:pointer; border:1px solid #e5e5e5; border-radius:10px; padding:14px; margin-bottom:10px; background:#fff;">
      <div style="font-size:18px; font-weight:700; color:#111;">${escapeHtml(item.Color_Code_Display)}</div>
      <div style="margin-top:4px; font-size:13px; color:#666;">${escapeHtml(item.Category)} / ${escapeHtml(item.Product_Line)}</div>
    </div>
  `).join('');

  resultBox.innerHTML = `
    <div style="margin-bottom:14px; font-size:14px; color:#555;">
      <strong>${escapeHtml(keyword)}</strong> 검색 결과 ${uniqueColors.length}건
    </div>
    ${html}
  `;
}

function showProducts(colorCode) {
  const resultBox = document.getElementById('finderResult');

  const matchedRows = colorRows.filter(row => row.Color_Code_Display === colorCode);

  const matchedProducts = matchedRows
    .map(row => products.find(p => p.Product_ID === row.Product_ID && String(p.Status || '').toUpperCase() === 'Y'))
    .filter(Boolean);

  const uniqueProductsMap = new Map();
  matchedProducts.forEach(product => {
    if (!uniqueProductsMap.has(product.Product_ID)) {
      uniqueProductsMap.set(product.Product_ID, product);
    }
  });

  const uniqueProducts = Array.from(uniqueProductsMap.values()).sort((a, b) => {
    return Number(a.Sort_Order || 999) - Number(b.Sort_Order || 999);
  });

  if (!uniqueProducts.length) {
    resultBox.innerHTML = `
      <button id="finderBackBtn" type="button" style="margin-bottom:12px; padding:8px 12px; border:1px solid #ddd; background:#fff; border-radius:8px; cursor:pointer;">← 검색 결과로 돌아가기</button>
      <div class="finder-empty">
        <p><strong>${escapeHtml(colorCode)}</strong>에 연결된 제품이 없습니다.</p>
      </div>
    `;
    return;
  }

  const html = uniqueProducts.map(product => `
    <div class="finder-product-card" style="border:1px solid #e5e5e5; border-radius:12px; padding:16px; margin-bottom:12px; background:#fff;">
      <div style="font-size:16px; font-weight:700; color:#111; line-height:1.5;">${escapeHtml(product.Product_Name)}</div>
      <div style="margin-top:6px; font-size:13px; color:#666;">${escapeHtml(product.Category)} / ${escapeHtml(product.Product_Line)}</div>
      <div style="margin-top:12px;">
        <a href="${escapeHtml(product.Product_URL)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:10px 14px; border-radius:8px; background:#111; color:#fff; text-decoration:none; font-size:14px;">제품 보기</a>
      </div>
    </div>
  `).join('');

  resultBox.innerHTML = `
    <button id="finderBackBtn" type="button" style="margin-bottom:12px; padding:8px 12px; border:1px solid #ddd; background:#fff; border-radius:8px; cursor:pointer;">← 검색 결과로 돌아가기</button>
    <div style="margin-bottom:14px;">
      <div style="font-size:22px; font-weight:800; color:#111;">${escapeHtml(colorCode)}</div>
      <div style="margin-top:4px; font-size:14px; color:#666;">수록 제품 ${uniqueProducts.length}건</div>
    </div>
    ${html}
  `;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFinder);
} else {
  initFinder();
}