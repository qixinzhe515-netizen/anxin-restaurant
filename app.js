const state = {
  dishes: [],
  selectedIds: new Set(),
  generated: null,
  menuDiscoveryId: 0,
  restaurants: [],
  selectedRestaurantId: "",
  menuLinks: [],
};

const sampleMenu = `Burrata with heirloom tomatoes and basil oil
Grilled king prawns with garlic butter and lemon
Wood-fired margherita pizza
Spicy nduja pizza with mozzarella and chilli honey
Slow cooked lamb shoulder with rosemary potatoes
Pan roasted barramundi with fennel salad
Rocket parmesan salad
Tiramisu
Kids pasta with tomato sauce`;

const demoRestaurants = [
  {
    id: "bistro",
    name: "Harbour Local Bistro",
    area: "Sydney CBD",
    rating: "4.6",
    note: "适合第一次尝试本地西餐，菜单不复杂，有鱼、虾、披萨和甜点。",
    tags: ["适合老人", "可点安全菜", "英文压力低"],
    menu: sampleMenu,
  },
  {
    id: "cafe",
    name: "Northside Garden Cafe",
    area: "Chatswood",
    rating: "4.5",
    note: "适合早午餐和咖啡，点餐卡很有用，现场不用解释太多。",
    tags: ["早午餐", "适合父母", "儿童友好"],
    menu: `Flat white
Long black
Avocado toast with poached eggs
Smoked salmon bagel
Chicken schnitzel sandwich
Mushroom omelette
Banana bread
Kids pancakes`,
  },
  {
    id: "italian",
    name: "Little Laneway Italian",
    area: "Hurstville",
    rating: "4.4",
    note: "适合家庭聚餐，披萨和意面选择多，容易提前选好。",
    tags: ["家庭聚餐", "披萨意面", "不容易踩雷"],
    menu: `Garlic bread
Caesar salad
Margherita pizza
Pepperoni pizza
Seafood linguine
Creamy mushroom fettuccine
Chicken parmigiana
Panna cotta`,
  },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

function setStep(step) {
  $$("[data-step]").forEach((panel) => panel.classList.toggle("active", panel.dataset.step === String(step)));
  $$("[data-step-dot]").forEach((dot) => dot.classList.toggle("active", Number(dot.dataset.stepDot) <= step));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formPayload() {
  return {
    restaurantName: $("#restaurantName").value.trim(),
    partySize: $("#partySize").value.trim(),
    bookingTime: $("#bookingTime").value.trim(),
    menuText: $("#menuText").value.trim(),
    specialNotes: $("#specialNotes").value.trim(),
  };
}

function renderRestaurants(restaurants = demoRestaurants, notice = "") {
  state.restaurants = restaurants;
  const noticeEl = $("#sourceNotice");
  noticeEl.textContent = notice;
  noticeEl.classList.toggle("hidden", !notice);

  $("#restaurantList").innerHTML = restaurants
    .map((restaurant) => `
      <button class="restaurant-card ${restaurant.id === state.selectedRestaurantId ? "selected" : ""}" type="button" data-restaurant-id="${restaurant.id}">
        <div class="restaurant-top">
          <strong>${restaurant.name}</strong>
          <span class="rating">${restaurant.rating ? `★ ${restaurant.rating}` : "餐厅"}</span>
        </div>
        <p>${restaurant.address || restaurant.area || "附近"} · ${restaurant.note}</p>
        <div class="tag-row">
          ${(restaurant.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("")}
          <span class="tag">${restaurant.hasMenu || restaurant.menuText || restaurant.menu ? "有菜单" : "暂无线上菜单"}</span>
        </div>
      </button>
    `)
    .join("");

  $$(".restaurant-card").forEach((card) => {
    card.addEventListener("click", () => {
      const restaurant = restaurants.find((item) => item.id === card.dataset.restaurantId);
      selectRestaurant(restaurant);
    });
  });
}

function renderMenuLinks(menuLinks = []) {
  const list = $("#menuLinkList");
  state.menuLinks = menuLinks;
  if (!menuLinks.length) {
    list.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  const foodImages = menuLinks.filter((link) => link.type === "image" && !isDrinkMenu(link));
  const pdfs = menuLinks.filter((link) => link.type === "pdf");
  const drinks = menuLinks.filter((link) => isDrinkMenu(link));
  list.classList.remove("hidden");
  list.innerHTML = `
    <div class="menu-hub">
      <div>
        <strong>已找到 ${menuLinks.length} 份官网菜单</strong>
        <span>${foodImages.length ? `可自动整理 ${foodImages.length} 份食物图片菜单` : "PDF 菜单先集中打开查看"}${pdfs.length ? `，另有 ${pdfs.length} 份 PDF` : ""}${drinks.length ? "，酒水菜单不进入点菜列表" : ""}</span>
      </div>
      ${foodImages.length ? `<button type="button" data-auto-food-menus>自动整理食物菜单</button>` : ""}
    </div>
    ${menuLinks
    .map((link, index) => {
      const drinkMenu = isDrinkMenu(link);
      const label = link.type === "image"
        ? drinkMenu ? "酒水/饮品菜单，先不进入点菜列表" : "食物图片菜单，可整理进点菜列表"
        : link.type === "page" ? "官网菜单页，可打开确认"
        : "PDF 菜单，集中打开查看";
      return `
      <div class="menu-link-card">
        <div>
          <strong>${link.title || `菜单 ${index + 1}`}</strong>
          <span>${label}</span>
        </div>
        ${link.type === "image" && !drinkMenu ? `<button type="button" data-menu-image="${index}">整理</button>` : ""}
        <a href="${link.url}" target="_blank" rel="noreferrer">打开</a>
      </div>
    `;
    })
    .join("")}
  `;

  $$("[data-menu-image]").forEach((button) => {
    button.addEventListener("click", async () => {
      const link = menuLinks[Number(button.dataset.menuImage)];
      button.disabled = true;
      button.textContent = "识别中...";
      try {
        const data = await postJson("/api/menu-file-data-url", { url: link.url });
        if (!data.dataUrl) throw new Error("No image data");
        await analyzeImageDataUrl(data.dataUrl, link.title || "菜单图片");
      } catch {
        toast("图片菜单识别失败，可以打开后截图再试");
      } finally {
        button.disabled = false;
        button.textContent = "识别";
      }
    });
  });

  $("[data-auto-food-menus]")?.addEventListener("click", async (event) => {
    await autoAnalyzeFoodMenus(foodImages, event.currentTarget);
  });
}

function isDrinkMenu(link) {
  const text = `${link.title || ""} ${link.url || ""}`.toLowerCase();
  return /\b(wine|drink|drinks|cocktail|beer|beverage|bar)\b/.test(text);
}

async function autoAnalyzeFoodMenus(menuLinks, button) {
  if (!menuLinks.length) return false;
  const oldText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "整理中...";
  }
  const allDishes = [];
  const menuNames = [];
  try {
    for (const link of menuLinks) {
      const dataUrl = await postJson("/api/menu-file-data-url", { url: link.url });
      if (!dataUrl.dataUrl) continue;
      const data = await analyzeImageDataUrl(dataUrl.dataUrl, link.title || "菜单图片", { returnData: true });
      if (data?.dishes?.length) {
        menuNames.push(link.title || "菜单图片");
        allDishes.push(...data.dishes);
      }
    }
    if (!allDishes.length) {
      toast("没有整理出清晰食物菜单");
      return false;
    }
    const merged = dedupeDishes(allDishes).map((dish, index) => ({ ...dish, id: String(index + 1) }));
    $("#menuText").value = merged.map((dish) => dish.name_en).join("\n");
    renderDishes({
      summary: `已自动整理 ${menuNames.join("、")}。这里只显示识别可信的菜品，乱码和不确定项目已隐藏；PDF 主菜单仍可返回打开查看。`,
      dishes: merged,
    });
    setStep(2);
    toast("食物菜单已整理好");
    return true;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}

function dedupeDishes(dishes) {
  const seen = new Set();
  return dishes.filter((dish) => {
    const key = (dish.name_en || dish.name_zh || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function handleMenuData(data, successToast = "菜单已准备好") {
  renderMenuLinks(data.menuLinks || []);
  if (!data.dishes?.length) {
    renderRestaurants(state.restaurants.length ? state.restaurants : demoRestaurants, data.summary || "没有提取到清晰菜单，可以截图后用拍菜单识别。");
    const foodImages = (data.menuLinks || []).filter((link) => link.type === "image" && !isDrinkMenu(link));
    if (foodImages.length) {
      const didAutoAnalyze = await autoAnalyzeFoodMenus(foodImages);
      if (didAutoAnalyze) return true;
    }
    toast("找到了菜单线索");
    return false;
  }
  $("#menuText").value = data.menuText || data.dishes.map((dish) => dish.name_en).join("\n");
  renderDishes(data);
  setStep(2);
  toast(successToast);
  return true;
}

async function discoverRestaurantMenu(restaurant, discoveryId) {
  renderRestaurants(state.restaurants.length ? state.restaurants : demoRestaurants, `正在为「${restaurant.name}」自动查找官网菜单...`);
  try {
    const data = await postJson("/api/discover-menu", {
      restaurantName: restaurant.name,
      areaName: restaurant.area || restaurant.address || $("#areaName").value.trim(),
      websiteUri: restaurant.websiteUri || "",
      specialNotes: $("#specialNotes").value.trim(),
    });
    if (discoveryId !== state.menuDiscoveryId) return;
    if (data.websiteUrl) {
      $("#menuUrl").value = data.websiteUrl;
    }
    const handled = await handleMenuData(data, "已自动找到并整理菜单");
    if (!handled) {
      renderRestaurants(
        state.restaurants.length ? state.restaurants : demoRestaurants,
        data.summary || `已经查找过「${restaurant.name}」的官网菜单，但没有提取到可直接解释的菜品。`
      );
    }
  } catch {
    if (discoveryId !== state.menuDiscoveryId) return;
    renderRestaurants(state.restaurants.length ? state.restaurants : demoRestaurants, `暂时没有自动找到「${restaurant.name}」的官网菜单，可以换一家或到店拍菜单。`);
    toast("自动找菜单失败");
  }
}

function selectRestaurant(restaurant) {
  if (!restaurant) return;
  const discoveryId = state.menuDiscoveryId + 1;
  state.menuDiscoveryId = discoveryId;
  state.selectedRestaurantId = restaurant.id;
  $("#restaurantName").value = restaurant.name;
  $("#areaName").value = restaurant.area;
  $("#menuUrl").value = restaurant.websiteUri || "";
  const menu = restaurant.menuText || restaurant.menu || "";
  $("#menuText").value = menu;
  renderMenuLinks([]);
  $$(".restaurant-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.restaurantId === restaurant.id);
  });
  if (menu) {
    toast("已选择餐厅，菜单已准备好");
    const data = fallbackLocalMenuData(menu);
    renderDishes(data);
    setStep(2);
  } else {
    toast("已选择餐厅，正在自动找菜单");
    discoverRestaurantMenu(restaurant, discoveryId);
  }
}

function fallbackLocalMenuData(menuText) {
  const dishes = menuText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: String(index + 1),
      name_en: name,
      name_zh: name,
      description_zh: "这是系统准备的菜单项。点“看懂菜单”可以生成更完整的中文解释。",
      tags: ["待解释"],
    }));
  return {
    summary: "菜单已准备好。为了省时间，系统先展示菜名；点击“看懂菜单”会生成更完整中文解释。",
    dishes,
  };
}

const teaGardensRestaurants = [
  {
    id: "known-tea-gardens-hotel",
    name: "Tea Gardens Hotel",
    area: "Tea Gardens",
    address: "Cnr Maxwell Street & Marine Drive, Tea Gardens",
    rating: "",
    note: "澳洲酒吧餐，有官网，适合体验本地餐。",
    tags: ["澳洲酒吧餐", "可查官网菜单"],
    websiteUri: "https://teagardenshotel.com/",
    hasMenu: true,
  },
  {
    id: "known-mumms-seafood",
    name: "Mumm's Seafood",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "",
    note: "海鲜餐厅，官网可找到菜单；当前版本内置了可信甜点菜单。",
    tags: ["Seafood", "有官网菜单"],
    websiteUri: "https://mummsonthemyall.com.au",
    hasMenu: true,
  },
  {
    id: "known-hook-n-cook",
    name: "Hook'n Cook",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "",
    note: "炸鱼薯条和快餐类型，点餐压力相对低。",
    tags: ["Fish And Chips", "快餐"],
    hasMenu: false,
  },
  {
    id: "known-mangrove-cafe",
    name: "Mangrove Cafe",
    area: "Tea Gardens",
    address: "83 Marine Drive, Tea Gardens",
    rating: "",
    note: "咖啡和轻食，适合先从简单菜单开始。",
    tags: ["咖啡/轻食"],
    hasMenu: false,
  },
];

function localKnownMenuCache(payload = {}) {
  const key = `${payload.restaurantName || ""} ${payload.areaName || ""} ${payload.websiteUri || ""} ${payload.url || ""}`.toLowerCase();
  if (!key.includes("mumm") && !key.includes("mummsonthemyall")) return null;
  const menuText = "Turkish delight panna cotta\nPersian fairy floss and pistachio";
  return {
    ...fallbackLocalMenuData(menuText),
    menuText,
    websiteUrl: "https://mummsonthemyall.com.au",
    summary: "已使用内置可信菜单缓存。这里只显示确认度高的菜品；PDF/图片菜单保留为原始菜单，避免把 OCR 乱码当成菜。",
    menuLinks: [
      { title: "官网菜单页", url: "https://mummsonthemyall.com.au", type: "page" },
      { title: "DESSERT", url: "https://mummsonthemyall.com.au/uploads/1/1/5/2/115221607/dessert_april_2026_copy.png", type: "image" },
      { title: "LUNCH AND DINNER", url: "https://mummsonthemyall.com.au/uploads/1/1/5/2/115221607/mumms_lunch_and_dinner_may_2026_copy.pdf", type: "pdf" },
      { title: "BREAKFAST", url: "https://mummsonthemyall.com.au/uploads/1/1/5/2/115221607/1.png", type: "image" },
    ],
  };
}

function localNearbyRestaurants(payload = {}) {
  const area = (payload.areaName || "").trim();
  if (/tea gardens?/i.test(area)) {
    return {
      source: "static_known",
      message: "当前是公网静态内测版：先使用内置 Tea Gardens 真实餐厅库。",
      restaurants: teaGardensRestaurants,
    };
  }
  return {
    source: "static_demo",
    message: "当前是公网静态内测版：先显示示例餐厅。接入 Render/Google Places 后会换成真实附近餐厅。",
    restaurants: demoRestaurants,
  };
}

function localAnalyzeMenu(payload = {}) {
  return fallbackLocalMenuData(payload.menuText || "");
}

function localGenerateCard(payload = {}) {
  const restaurant = payload.restaurantName || "your restaurant";
  const party = payload.partySize || "2";
  const time = payload.bookingTime || "tonight";
  const dishes = payload.dishes || [];
  const restrictions = [...(payload.restrictions || []), payload.specialNotes || ""].filter(Boolean);
  const dishLines = dishes.map((dish) => `- ${dish.name_en || dish.name_zh}`).join("\n");
  const requestText = restrictions.join(", ") || "None";
  return {
    bookingMessage: `Hi ${restaurant}, I would like to book a table for ${party} people at ${time}. Could you please confirm if a table is available? Thank you.`,
    orderCard: `We would like to order:\n${dishLines}\n\nSpecial requests: ${requestText}\n\nIf anything is unavailable, please point to the menu or write it down for us.`,
    fallbackCard: "Sorry, my English is limited.\nCould you please speak slowly, point to the menu, or write it down?\nThank you for your help.",
  };
}

function localApi(url, payload = {}) {
  if (url === "/api/nearby-restaurants") return localNearbyRestaurants(payload);
  if (url === "/api/discover-menu" || url === "/api/extract-menu-url") {
    return localKnownMenuCache(payload) || {
      summary: "公网静态内测版暂时没有自动提取到这家官网菜单。可以拍菜单照片，或先用 Mumm's Seafood 测试官网菜单流程。",
      menuText: "",
      dishes: [],
      menuLinks: [],
    };
  }
  if (url === "/api/analyze-menu") return localAnalyzeMenu(payload);
  if (url === "/api/analyze-menu-photo") {
    return { summary: "公网静态内测版会先尝试本机 OCR。正式后端部署后会接 AI 视觉识别。", dishes: [] };
  }
  if (url === "/api/menu-file-data-url") return { error: "static_mode" };
  if (url === "/api/generate-card") return localGenerateCard(payload);
  throw new Error("No local API fallback");
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  } catch (error) {
    return localApi(url, payload);
  }
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function recognizeMenuTextInBrowser(file) {
  if (!window.Tesseract?.recognize) {
    throw new Error("OCR is not available");
  }
  const result = await window.Tesseract.recognize(file, "eng");
  return (result?.data?.text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function cleanOcrMenuText(text, label = "") {
  const isDrink = /\b(wine|drink|drinks|cocktail|beer|beverage|bar)\b/i.test(label);
  if (isDrink) return "";
  const foodWords = /\b(panna cotta|tiramisu|cake|tart|pudding|crumble|gelato|ice cream|sorbet|dessert|pistachio|chocolate|vanilla|caramel|berry|berries|lemon|apple|pear|fig|honey|oyster|prawn|fish|chips|calamari|salmon|barramundi|seafood|crab|mussel|steak|beef|lamb|chicken|pork|duck|burger|sandwich|schnitzel|parmigiana|pizza|pasta|linguine|fettuccine|risotto|gnocchi|salad|soup|bread|toast|egg|omelette|pancake|waffle|bagel|avocado|mushroom|cheese)\b/i;
  return text
    .split("\n")
    .map((line) => line
      .replace(/[“”]/g, '"')
      .replace(/\b(GFO|GF|DF|VG|V)\b/gi, "")
      .replace(/\s*\|\s*\$?\d+(\.\d{1,2})?.*$/g, "")
      .replace(/\s+\$?\d+(\.\d{1,2})?\s*$/g, "")
      .replace(/\s+[a-z]{1,2}\s*\d+\s*$/gi, "")
      .replace(/\s+(so|eo|no|a)\s*$/gi, "")
      .replace(/^[~=\-–—\s]+/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter((line) => {
      const letters = (line.match(/[a-z]/gi) || []).length;
      const digits = (line.match(/\d/g) || []).length;
      if (line.length < 5 || line.length > 90) return false;
      if (letters < 4) return false;
      if (/^[^a-zA-Z]+$/.test(line)) return false;
      if (/^[a-zA-Z]{1,3}\s?[\-$]?\d/i.test(line)) return false;
      if (/[=]{1,}|[a-z]\s?=\s?[a-z]/i.test(line)) return false;
      const words = line.match(/[a-z]+/gi) || [];
      const shortWords = words.filter((word) => word.length <= 2);
      if (words.length && shortWords.length / words.length > 0.35) return false;
      if (digits > letters && !/\b(kids|piece|pieces|prawn|oyster|pizza|pasta|burger|steak|fish|chips)\b/i.test(line)) return false;
      if (/\b(wine|pinot|rose|sangiovese|sauvignon|chardonnay|merlot|shiraz|riesling|prosecco|beer|cocktail)\b/i.test(line)) return false;
      if (/^\W*[a-z]{1,4}\W*$/i.test(line)) return false;
      if (!foodWords.test(line)) return false;
      return true;
    })
    .join("\n");
}

async function analyzeImageDataUrl(imageDataUrl, label = "菜单照片", options = {}) {
  const data = await postJson("/api/analyze-menu-photo", {
    restaurantName: $("#restaurantName").value.trim(),
    specialNotes: $("#specialNotes").value.trim(),
    imageDataUrl,
  });
  if (data.dishes?.length) {
    if (options.returnData) return data;
    $("#menuText").value = data.dishes.map((dish) => dish.name_en).join("\n");
    renderDishes(data);
    setStep(2);
    toast("菜单图片已识别");
    return true;
  }
  if (!options.returnData) {
    renderRestaurants(state.restaurants.length ? state.restaurants : demoRestaurants, "AI 图片识别暂不可用，正在尝试本机 OCR 识别英文菜单...");
    toast("正在用本机 OCR 识别");
  }
  const ocrText = await recognizeMenuTextInBrowser(imageDataUrl);
  const cleanedText = cleanOcrMenuText(ocrText, label);
  if (!cleanedText) {
    if (options.returnData) return null;
    renderRestaurants(state.restaurants.length ? state.restaurants : demoRestaurants, `${label} 没有识别出清晰食物菜单。酒水或排版复杂菜单先不要整理进点菜列表。`);
    toast("没有识别出菜品");
    return false;
  }
  $("#menuText").value = cleanedText;
  const fallbackData = await postJson("/api/analyze-menu", {
    ...formPayload(),
    menuText: cleanedText,
  });
  if (options.returnData) return fallbackData;
  renderDishes({
    ...fallbackData,
    summary: "已用本机 OCR 识别菜单文字，并整理成中文说明。请检查菜名是否有识别错误。",
  });
  setStep(2);
  toast("菜单文字已识别");
  return true;
}

function renderDishes(data) {
  state.dishes = data.dishes || [];
  state.selectedIds = new Set();
  const summary = $("#summaryBox");
  summary.textContent = data.summary || "";
  summary.classList.toggle("hidden", !data.summary);

  $("#dishList").innerHTML = state.dishes
    .map((dish) => {
      const tags = (dish.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("");
      return `
        <label class="dish-card">
          <input type="checkbox" value="${dish.id}" />
          <div>
            <h3>${dish.name_zh || dish.name_en}</h3>
            <p><strong>${dish.name_en}</strong></p>
            <p>${dish.description_zh || ""}</p>
            <div class="tag-row">${tags}</div>
          </div>
        </label>
      `;
    })
    .join("");

  $$("#dishList input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedIds.add(input.value);
      else state.selectedIds.delete(input.value);
    });
  });
}

function selectedRestrictions() {
  return $$(".chip input:checked").map((input) => input.value);
}

function selectedDishes() {
  return state.dishes.filter((dish) => state.selectedIds.has(String(dish.id)));
}

function renderGenerated(data) {
  state.generated = data;
  $("#bookingMessage").textContent = data.bookingMessage || "";
  $("#orderCard").textContent = data.orderCard || "";
  $("#fallbackCard").textContent = data.fallbackCard || "";
  setStep(3);
}

function saveHistory() {
  if (!state.generated) return;
  const history = JSON.parse(localStorage.getItem("anxinHistory") || "[]");
  const entry = {
    id: Date.now(),
    restaurant: $("#restaurantName").value.trim() || "未命名餐厅",
    time: $("#bookingTime").value.trim(),
    dishes: selectedDishes().map((dish) => dish.name_en).join(", "),
    createdAt: new Date().toLocaleString("zh-CN"),
  };
  localStorage.setItem("anxinHistory", JSON.stringify([entry, ...history].slice(0, 8)));
  renderHistory();
  toast("已保存");
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("anxinHistory") || "[]");
  $("#historyList").innerHTML = history.length
    ? history.map((item) => `
      <div class="history-item">
        <strong>${item.restaurant}</strong>
        <span>${item.createdAt}${item.time ? ` · ${item.time}` : ""}</span>
      </div>
    `).join("")
    : `<div class="history-item"><span>还没有记录。</span></div>`;
}

$("#sampleButton").addEventListener("click", () => {
  renderRestaurants(demoRestaurants, "这是示例餐厅。接入 Google Places key 后会显示真实附近餐厅。");
  selectRestaurant(demoRestaurants[0]);
  $("#partySize").value = "3";
  $("#bookingTime").value = "今晚 6:30pm";
  $("#specialNotes").value = "少辣，不要香菜，有一位老人";
});

$("#menuPhoto").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const notice = `已选择菜单照片：${file.name}。正在识别菜单...`;
  renderRestaurants(demoRestaurants, notice);
  toast("正在识别菜单照片");
  try {
    const imageDataUrl = await fileToCompressedDataUrl(file);
    await analyzeImageDataUrl(imageDataUrl, file.name);
  } catch {
    renderRestaurants(demoRestaurants, "菜单照片识别失败，请重新拍照或先用示例菜单测试。");
    toast("菜单照片识别失败");
  } finally {
    event.target.value = "";
  }
});

$("#menuUrlButton").addEventListener("click", async () => {
  const url = $("#menuUrl").value.trim();
  if (!url) {
    toast("请先粘贴官网或菜单网址");
    return;
  }
  const button = $("#menuUrlButton");
  button.disabled = true;
  button.textContent = "提取中...";
  try {
    const data = await postJson("/api/extract-menu-url", {
      restaurantName: $("#restaurantName").value.trim(),
      specialNotes: $("#specialNotes").value.trim(),
      url,
    });
    await handleMenuData(data, "官网菜单已提取");
  } catch {
    renderRestaurants(demoRestaurants, "菜单网址提取失败，请换菜单页或截图识别。");
    toast("菜单网址提取失败");
  } finally {
    button.disabled = false;
    button.textContent = "提取菜单";
  }
});

async function loadNearbyRestaurants(payload, loadingText = "正在查找...") {
  const button = $("#nearbyButton");
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  try {
    const data = await postJson("/api/nearby-restaurants", payload);
    renderRestaurants(data.restaurants || demoRestaurants, data.message || "");
    const isRealSource = data.source === "google_places" || data.source === "openstreetmap" || data.source === "known_local";
    toast(isRealSource ? "已找到真实附近餐厅" : "已显示示例餐厅");
  } catch {
    renderRestaurants(demoRestaurants, "附近餐厅暂时获取失败，先显示示例餐厅。");
    toast("附近餐厅获取失败");
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

$("#nearbyButton").addEventListener("click", () => {
  loadNearbyRestaurants({ areaName: $("#areaName").value.trim() });
});

$$("[data-area]").forEach((button) => {
  button.addEventListener("click", () => {
    $("#areaName").value = button.dataset.area;
    loadNearbyRestaurants({ areaName: button.dataset.area });
  });
});

$("#locationButton").addEventListener("click", () => {
  if (!window.isSecureContext) {
    renderRestaurants(
      demoRestaurants,
      "手机浏览器需要 HTTPS 才能使用真实定位。现在是本地测试地址，请先输入区域或点下面的常用区域。"
    );
    toast("本地测试地址不能使用手机定位");
    return;
  }
  if (!navigator.geolocation) {
    toast("当前浏览器不支持定位");
    return;
  }
  const button = $("#locationButton");
  button.disabled = true;
  button.textContent = "正在定位...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      button.disabled = false;
      button.textContent = "使用我当前位置";
      loadNearbyRestaurants(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        "正在查找..."
      );
    },
    (error) => {
      button.disabled = false;
      button.textContent = "使用我当前位置";
      const messages = {
        1: "定位权限被拒绝，请输入区域",
        2: "暂时找不到位置，请输入区域",
        3: "定位超时，请输入区域",
      };
      renderRestaurants(demoRestaurants, messages[error.code] || "定位失败，请输入区域");
      toast(messages[error.code] || "定位失败，请输入区域");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
  );
});

$("#analyzeButton").addEventListener("click", async () => {
  const payload = formPayload();
  if (!payload.menuText) {
    toast("这家餐厅暂无线上菜单，可以换一家或到店拍菜单");
    return;
  }
  const button = $("#analyzeButton");
  button.disabled = true;
  button.textContent = "正在看菜单...";
  try {
    const data = await postJson("/api/analyze-menu", payload);
    renderDishes(data);
    setStep(2);
  } catch {
    toast("菜单分析失败，请稍后再试");
  } finally {
    button.disabled = false;
    button.textContent = "看懂菜单";
  }
});

$("#cardButton").addEventListener("click", async () => {
  const dishes = selectedDishes();
  if (!dishes.length) {
    toast("请至少选择一道菜");
    return;
  }
  const button = $("#cardButton");
  button.disabled = true;
  button.textContent = "正在生成...";
  try {
    const data = await postJson("/api/generate-card", {
      ...formPayload(),
      dishes,
      restrictions: selectedRestrictions(),
    });
    renderGenerated(data);
  } catch {
    toast("生成失败，请稍后再试");
  } finally {
    button.disabled = false;
    button.textContent = "生成点餐卡";
  }
});

$$("[data-back]").forEach((button) => {
  button.addEventListener("click", () => setStep(Number(button.dataset.back)));
});

$$("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copy);
    await navigator.clipboard.writeText(target.textContent);
    toast("已复制");
  });
});

$("#saveButton").addEventListener("click", saveHistory);

$("#clearHistory").addEventListener("click", () => {
  localStorage.removeItem("anxinHistory");
  renderHistory();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  }).catch(() => {});
}

renderHistory();
renderRestaurants(demoRestaurants, "v19 已加载：公网静态内测可用，后端部署后会自动升级真实地图和 AI 识别。");
