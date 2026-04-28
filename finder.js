// Pantone Color Finder - split JSON version
// UI class names are matched to the original style.css:
// .finder-result-item, .finder-product-card, .finder-empty, .finder-error

const COLOR_FILES = [
  "colors_graphic.json",
  "colors_fhi.json",
  "colors_plastic.json",
  "colors_munsell.json"
];

let colorRows = [];
let productMap = new Map();

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function compactColorRow(row) {
  // Compact format:
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

  // Backward compatibility for object-format JSON
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

function productImageOf(product) {
  return String(product.Image_URL ?? product.imageUrl ?? product.image_url ?? "").trim();
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

function getResultBox() {
  let box = getEl("#finderResult", "#result", "#results", "#colorResults", "#searchResults");
  if (!box) {
    box = document.createElement("div");
    box.id = "finderResult";
    const searchBox = getEl(".finder-search-box");
    if (searchBox) {
      searchBox.insertAdjacentElement("afterend", box);
    } else {
      document.body.appendChild(box);
    }
  }
  return box;
}

function setStatus(message, type = "empty") {
  const box = getResultBox();
  const cls = type === "error" ? "finder-error" : "finder-empty";
  box.innerHTML = `<div class="${cls}">${message}</div>`;
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

  colorRows = colorResponses
    .flat()
    .map(compactColorRow)
    .filter(row => row.display && row.productId);

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

function parseFhiQuery(rawQuery) {
  const raw = String(rawQuery ?? "").trim().toUpperCase();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "");
  const m1 = compact.match(/^(\d{2})-(\d{4})(TCX|TPG|TPM|TN|TSX)?$/i);
  if (m1) {
    return {
      number: normalizeText(`${m1[1]}-${m1[2]}`),
      suffix: normalizeText(m1[3] || "")
    };
  }

  const m2 = compact.match(/^(\d{2})(\d{4})(TCX|TPG|TPM|TN|TSX)?$/i);
  if (m2) {
    return {
      number: normalizeText(`${m2[1]}-${m2[2]}`),
      suffix: normalizeText(m2[3] || "")
    };
  }

  return null;
}

function searchColors(query) {
  const rawQuery = String(query || "").trim();
  const q = normalizeText(rawQuery);
  if (!q) return [];

const cmykQ = /^p?\d{1,2}-\d{1,2}[cu]?$/i.test(rawQuery)
  ? normalizeText(rawQuery.toUpperCase().startsWith("P")
      ? rawQuery
      : "P" + rawQuery)
  : "";

  const isNumberOnlyQuery = /^\d+$/.test(rawQuery);
  const fhiQuery = parseFhiQuery(rawQuery);

  const matched = [];

  for (const row of colorRows) {
    const displayNorm = normalizeText(row.display);
    const rowNorm = normalizeText(row.norm || row.display);
    const numberNorm = normalizeText(row.number);
    const suffixNorm = normalizeText(row.suffix);

    let isMatch = false;

    if (cmykQ) {
      isMatch =
        displayNorm === cmykQ ||
        rowNorm === cmykQ ||
        numberNorm === cmykQ ||
        displayNorm === cmykQ + "c" ||
        displayNorm === cmykQ + "u" ||
        rowNorm === cmykQ + "c" ||
        rowNorm === cmykQ + "u";
    } else if (fhiQuery) {
      const numberMatch = numberNorm === fhiQuery.number;
      const suffixMatch = !fhiQuery.suffix || suffixNorm === fhiQuery.suffix;

      isMatch =
        (numberMatch && suffixMatch) ||
        displayNorm === q ||
        rowNorm === q;
    } else if (isNumberOnlyQuery) {
      isMatch =
        numberNorm === q ||
        displayNorm === q ||
        rowNorm === q ||
        displayNorm === q + "c" ||
        displayNorm === q + "u" ||
        displayNorm === q + "cp" ||
        displayNorm === q + "up" ||
        rowNorm === q + "c" ||
        rowNorm === q + "u" ||
        rowNorm === q + "cp" ||
        rowNorm === q + "up";
    } else {
      isMatch =
        displayNorm.includes(q) ||
        rowNorm.includes(q) ||
        numberNorm.includes(q);
    }

    if (isMatch) {
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
  const box = getResultBox();

  if (!query.trim()) {
    setStatus("검색어를 입력해 주세요.");
    return;
  }

  if (!results.length) {
    setStatus("검색 결과가 없습니다.");
    return;
  }

  const html = [
    `<div class="finder-empty">검색 결과 ${results.length}개</div>`
  ];

  results.forEach(item => {
    html.push(`
      <div class="finder-result-item" role="button" tabindex="0" data-code="${escapeAttribute(item.display)}">
        <strong>${escapeHtml(item.display)}</strong>
        <div>수록 제품 ${item.productIds.size}건</div>
      </div>
    `);
  });

  box.innerHTML = html.join("");

  box.querySelectorAll("[data-code]").forEach(item => {
    const open = () => showProductsForColor(item.dataset.code);
    item.addEventListener("click", open);
    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

function shouldShowPlasticInquiry(colorCode) {
  const code = String(colorCode || "").trim().toUpperCase();

  if (code.endsWith(" TCX")) return true;
  if (code.endsWith(" C")) return true;

  return false;
}

function showProductsForColor(colorCode) {
  const box = getResultBox();

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
    box.innerHTML = `
      <button type="button" id="finderBackBtn">← 검색 결과로 돌아가기</button>
      <div class="finder-empty">
        <strong>${escapeHtml(colorCode)}</strong><br>
        해당 컬러번호는 온라인 상품으로 확인이 어렵습니다. 고객센터로 연락해주세요.
      </div>
    `;
    bindBackButton();
    return;
  }

  const html = [
    `<button type="button" id="finderBackBtn">← 검색 결과로 돌아가기</button>`,
    `<div class="finder-empty"><strong>${escapeHtml(colorCode)}</strong><br>수록 제품 ${sortedProducts.length}건</div>`
  ];

  sortedProducts.forEach(product => {
    const url = productUrlOf(product);
    const imageUrl = productImageOf(product);

    html.push(`
      <div class="finder-product-card">
        <div class="finder-product-main">
          <div class="finder-product-info">
            <strong>${escapeHtml(productNameOf(product))}</strong>
            <div>${escapeHtml(productCategoryOf(product))}</div>
            ${url ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener">제품 보기</a>` : ""}
          </div>
          <div class="finder-product-thumb-wrap">
            ${imageUrl
              ? `<img class="finder-product-thumb" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(productNameOf(product))}">`
              : `<div class="finder-product-thumb-placeholder"></div>`}
          </div>
        </div>
      </div>
    `);
  });

  if (shouldShowPlasticInquiry(colorCode)) {
    html.push(`
      <div class="finder-product-card">
        <strong>팬톤 플라스틱 스탠다드 칩 낱장은 고객센터(1688-4577)문의 바랍니다.</strong>
      </div>
    `);
  }

  box.innerHTML = html.join("");
  bindBackButton();
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindBackButton() {
  const button = getEl("#finderBackBtn");
  const input = getSearchInput();

  if (button && input) {
    button.addEventListener("click", () => {
      const results = searchColors(input.value || "");
      renderColorResults(results, input.value || "");
    });
  }
}

function getSearchInput() {
  return getEl("#colorSearchInput", "#searchInput", "#search-input", "#keyword", "input[type='search']", "input[type='text']");
}

function getSearchButton() {
  return getEl("#colorSearchBtn", "#searchButton", "#searchBtn", "#btnSearch", "button[type='submit']", "button");
}

function bindSearch() {
  const input = getSearchInput();
  const button = getSearchButton();

  if (!input) {
    setStatus("검색 입력창을 찾을 수 없습니다. index.html의 input id를 확인해 주세요.", "error");
    return;
  }

  const run = () => {
    const query = input.value || "";
    const results = searchColors(query);
    renderColorResults(results, query);
  };

  if (button) button.addEventListener("click", run);

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") run();
  });

  input.addEventListener("input", () => {
    if (!input.value.trim()) setStatus("검색어를 입력해 주세요.");
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
    setStatus(`데이터를 불러오지 못했습니다: ${escapeHtml(error.message)}`, "error");
  }
});
