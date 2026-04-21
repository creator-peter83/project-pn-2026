// Pantone Color Finder - split JSON version
// Required files in the same GitHub Pages folder:
// colors_graphic.json, colors_fhi.json, colors_plastic.json, colors_munsell.json, products.json

const COLOR_FILES = [
  "colors_graphic.json",
  "colors_fhi.json",
  "colors_plastic.json",
  "colors_munsell.json"
];

let colorRows = [];
let productMap = new Map();
let lastResults = [];

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function compactColorRow(row) {
  // New compact format:
  // [Color_Code_Display, Color_Code_Normalized, Color_Number, Suffix, Product_ID]
  if (Array.isArray(row)) {
    return {
      display: String(row[0] ?? "").trim(),
      norm: String(row[1] ?? "").trim(),
      number: String(row[2] ?? "").trim(),
      suffix: String(row[3] ?? "").trim(),
      productId: String(row[4] ?? "").trim()
    };
  }

  // Backward compatibility for old object-format colors.json
  return {
    display: String(row.Color_Code_Display ?? row.display ?? row.code ?? "").trim(),
    norm: String(row.Color_Code_Normalized ?? row.norm ?? "").trim(),
    number: String(row.Color_Number ?? row.number ?? "").trim(),
    suffix: String(row.Suffix ?? row.suffix ?? "").trim(),
    productId: String(row.Product_ID ?? row.productId ?? row.product_id ?? "").trim()
  };
}

function productIdOf(product) {
  return String(product.Product_ID ?? product.productId ?? product.product_id ?? "").trim();
}

function productNameOf(product) {
  return String(product.Product_Name ?? product.name ?? "").trim();
}

function productCategoryOf(product) {
  return String(product.Category ?? product.category ?? "").trim();
}

function productUrlOf(product) {
  return String(product.Product_URL ?? product.url ?? "").trim();
}

function productStatusOf(product) {
  return String(product.Status ?? product.status ?? "").trim();
}

function isProductActive(product) {
  const status = productStatusOf(product).toLowerCase();
  return !status || ["active", "y", "yes", "사용", "판매", "판매중"].includes(status);
}

function sortOrderOf(product) {
  const value = Number(product.Sort_Order ?? product.sortOrder ?? product.sort_order ?? 999999);
  return Number.isFinite(value) ? value : 999999;
}

function getEl(...selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function ensureResultsContainer() {
  let colorBox = getEl("#results", "#colorResults", "#searchResults", ".results", ".color-results");
  if (!colorBox) {
    colorBox = document.createElement("div");
    colorBox.id = "results";
    document.body.appendChild(colorBox);
  }

  let productBox = getEl("#productResults", "#productList", "#products", ".product-results", ".product-list");
  if (!productBox || productBox === colorBox) {
    productBox = document.createElement("div");
    productBox.id = "productResults";
    colorBox.insertAdjacentElement("afterend", productBox);
  }

  return { colorBox, productBox };
}

function setStatus(message) {
  const { colorBox } = ensureResultsContainer();
  colorBox.innerHTML = `<p class="finder-status">${message}</p>`;
}

async function loadData() {
  setStatus("데이터를 불러오는 중입니다...");

  const colorResponses = await Promise.all(
    COLOR_FILES.map(file =>
      fetch(file, { cache: "no-store" }).then(response => {
        if (!response.ok) throw new Error(`${file} 로드 실패`);
        return response.json();
      })
    )
  );

  colorRows = colorResponses.flat().map(compactColorRow).filter(row => row.display && row.productId);

  const productResponse = await fetch("products.json", { cache: "no-store" });
  if (!productResponse.ok) throw new Error("products.json 로드 실패");
  const products = await productResponse.json();

  productMap = new Map();
  products.forEach(product => {
    const id = productIdOf(product);
    if (id) productMap.set(id, product);
  });

  setStatus("검색어를 입력해 주세요.");
}

function searchColors(query) {
  const q = normalizeText(query);
  if (!q) return [];

  const matched = [];
  for (const row of colorRows) {
    const displayNorm = normalizeText(row.display);
    const rowNorm = normalizeText(row.norm || row.display);
    const numberNorm = normalizeText(row.number);

    if (displayNorm.includes(q) || rowNorm.includes(q) || numberNorm.includes(q)) {
      const exactScore =
        rowNorm === q || displayNorm === q ? 0 :
        numberNorm === q ? 1 :
        displayNorm.startsWith(q) || rowNorm.startsWith(q) ? 2 :
        numberNorm.startsWith(q) ? 3 :
        4;

      matched.push({ row, exactScore });
    }
  }

  const grouped = new Map();
  matched.forEach(({ row, exactScore }) => {
    const key = row.display;
    if (!grouped.has(key)) {
      grouped.set(key, {
        display: row.display,
        number: row.number,
        suffix: row.suffix,
        productIds: new Set(),
        score: exactScore
      });
    }
    const item = grouped.get(key);
    item.productIds.add(row.productId);
    item.score = Math.min(item.score, exactScore);
  });

  return Array.from(grouped.values())
    .sort((a, b) => a.score - b.score || a.display.localeCompare(b.display, "ko"))
    .slice(0, 300);
}

function renderColorResults(results, query) {
  const { colorBox, productBox } = ensureResultsContainer();
  productBox.innerHTML = "";

  if (!query.trim()) {
    colorBox.innerHTML = `<p class="finder-status">검색어를 입력해 주세요.</p>`;
    return;
  }

  if (!results.length) {
    colorBox.innerHTML = `<p class="finder-status">검색 결과가 없습니다.</p>`;
    return;
  }

  const html = [
    `<div class="finder-summary">검색 결과 ${results.length}개</div>`,
    `<div class="color-result-list">`
  ];

  results.forEach(item => {
    html.push(`
      <button type="button" class="color-result-item" data-code="${escapeHtml(item.display)}">
        <strong>${escapeHtml(item.display)}</strong>
        <span>수록 제품 ${item.productIds.size}건</span>
      </button>
    `);
  });

  html.push(`</div>`);
  colorBox.innerHTML = html.join("");

  colorBox.querySelectorAll("[data-code]").forEach(button => {
    button.addEventListener("click", () => showProductsForColor(button.dataset.code));
  });
}

function showProductsForColor(colorCode) {
  const { productBox } = ensureResultsContainer();

  const rows = colorRows.filter(row => row.display === colorCode);
  const products = rows
    .map(row => productMap.get(row.productId))
    .filter(Boolean)
    .filter(isProductActive);

  const unique = new Map();
  products.forEach(product => {
    unique.set(productIdOf(product), product);
  });

  const sortedProducts = Array.from(unique.values())
    .sort((a, b) => sortOrderOf(a) - sortOrderOf(b) || productNameOf(a).localeCompare(productNameOf(b), "ko"));

  if (!sortedProducts.length) {
    productBox.innerHTML = `
      <section class="product-section">
        <h2>${escapeHtml(colorCode)}</h2>
        <p class="finder-status">해당 컬러번호는 온라인 상품으로 확인이 어렵습니다. 고객센터로 연락해주세요.</p>
      </section>
    `;
    return;
  }

  const html = [
    `<section class="product-section">`,
    `<h2>${escapeHtml(colorCode)}</h2>`,
    `<p class="finder-summary">수록 제품 ${sortedProducts.length}건</p>`,
    `<div class="product-result-list">`
  ];

  sortedProducts.forEach(product => {
    const url = productUrlOf(product);
    html.push(`
      <article class="product-card">
        <h3>${escapeHtml(productNameOf(product))}</h3>
        <p>${escapeHtml(productCategoryOf(product))}</p>
        ${url ? `<a class="product-link" href="${escapeAttribute(url)}" target="_blank" rel="noopener">제품 보기</a>` : ""}
      </article>
    `);
  });

  html.push(`</div></section>`);
  productBox.innerHTML = html.join("");
  productBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindSearch() {
  const input = getEl("#searchInput", "#search-input", "#keyword", "input[type='search']", "input[type='text']");
  const button = getEl("#searchButton", "#searchBtn", "#btnSearch", "button[type='submit']", "button");

  if (!input) {
    setStatus("검색 입력창을 찾을 수 없습니다. index.html의 input id를 확인해 주세요.");
    return;
  }

  const run = () => {
    const query = input.value || "";
    lastResults = searchColors(query);
    renderColorResults(lastResults, query);
  };

  if (button) button.addEventListener("click", run);

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") run();
  });

  input.addEventListener("input", () => {
    if (!input.value.trim()) renderColorResults([], "");
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadData();
    bindSearch();
  } catch (error) {
    console.error(error);
    setStatus(`데이터를 불러오지 못했습니다: ${escapeHtml(error.message)}`);
  }
});
