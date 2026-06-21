const state = {
  dishes: [],
  selectedIds: new Set(),
  generated: null,
  menuDiscoveryId: 0,
  restaurants: [],
  selectedRestaurantId: "",
  selectedMenuSource: "",
  selectedMenuVerified: false,
  menuLinks: [],
  restaurantSearchId: 0,
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

function clearRestaurantSelection() {
  state.selectedRestaurantId = "";
  state.selectedMenuSource = "";
  state.selectedMenuVerified = false;
  state.dishes = [];
  state.selectedIds = new Set();
  state.generated = null;
  $("#restaurantName").value = "";
  $("#menuText").value = "";
  $("#menuUrl").value = "";
  $("#summaryBox").textContent = "";
  $("#summaryBox").classList.add("hidden");
  $("#dishList").innerHTML = "";
  $("#bookingMessage").textContent = "";
  $("#orderCard").textContent = "";
  $("#fallbackCard").textContent = "";
  renderMenuLinks([]);
}

function renderRestaurants(restaurants = demoRestaurants, notice = "") {
  state.restaurants = restaurants;
  const noticeEl = $("#sourceNotice");
  noticeEl.textContent = notice;
  noticeEl.classList.toggle("hidden", !notice);

  $("#restaurantList").innerHTML = restaurants
    .map((restaurant) => {
      const mapsUrl = restaurant.googleMapsUri || googleMapsSearchUrl(restaurant);
      const directionsUrl = googleMapsDirectionsUrl(restaurant);
      const menuLabel = menuStatusLabel(restaurant);
      return `
      <article class="restaurant-card ${restaurant.id === state.selectedRestaurantId ? "selected" : ""}" data-restaurant-id="${restaurant.id}">
        <div class="restaurant-top">
          <strong>${restaurant.name}</strong>
          <span class="rating">${restaurant.rating ? `★ ${restaurant.rating}` : "餐厅"}</span>
        </div>
        <p>${restaurant.address || restaurant.area || "附近"} · ${restaurant.note}</p>
        <div class="tag-row">
          ${(restaurant.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("")}
          <span class="tag">${menuLabel}</span>
        </div>
        <div class="restaurant-actions">
          <button class="restaurant-select-button" type="button" data-restaurant-select="${restaurant.id}">选择并看菜单</button>
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">查看位置</a>
          <a href="${directionsUrl}" target="_blank" rel="noreferrer">导航</a>
        </div>
      </article>
    `;
    })
    .join("");

  $$("[data-restaurant-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const restaurant = restaurants.find((item) => item.id === button.dataset.restaurantSelect);
      selectRestaurant(restaurant);
    });
  });
}

function menuStatusLabel(restaurant = {}) {
  if (restaurant.menuVerified) return "真实菜单";
  if (restaurant.menuSource) return restaurant.menuSource;
  if (restaurant.hasMenu || restaurant.menuText || restaurant.menu) return "待确认菜单";
  return "暂无线上菜单";
}

function googleMapsSearchUrl(restaurant = {}) {
  const query = [restaurant.name, restaurant.address || restaurant.area, "Australia"].filter(Boolean).join(" ");
  if (restaurant.lat && restaurant.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.lat},${restaurant.lng}`)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsDirectionsUrl(restaurant = {}) {
  const destination = restaurant.lat && restaurant.lng
    ? `${restaurant.lat},${restaurant.lng}`
    : [restaurant.name, restaurant.address || restaurant.area, "Australia"].filter(Boolean).join(" ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function renderMenuLinks(menuLinks = []) {
  const list = $("#menuLinkList");
  state.menuLinks = menuLinks;
  if (!menuLinks.length) {
    list.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  const primaryLink = menuLinks.find((link) => link.type === "page") || menuLinks.find((link) => link.type === "pdf") || menuLinks[0];
  list.classList.remove("hidden");
  list.innerHTML = `
    <div class="menu-hub">
      <div>
        <strong>已找到官网菜单</strong>
        <span>系统会直接整理成中文说明。需要核对时再打开原文。</span>
      </div>
      <a href="${primaryLink.url}" target="_blank" rel="noreferrer">打开原文</a>
    </div>
  `;

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
  state.selectedMenuSource = restaurant.menuSource || (restaurant.menuVerified ? "真实菜单" : "");
  state.selectedMenuVerified = Boolean(restaurant.menuVerified);
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
    toast(restaurant.menuVerified ? "已选择餐厅，真实菜单已准备好" : "已选择菜单，请注意来源");
    const data = fallbackLocalMenuData(menu, {
      source: restaurant.menuSource || (restaurant.menuVerified ? "真实菜单" : "菜系练习"),
      verified: restaurant.menuVerified,
      summary: restaurant.menuVerified
        ? "这是当前餐厅对应的菜单来源。仍建议到店前核对是否售罄或菜单更新。"
        : "这是菜系练习/代表菜，不是某家餐厅的真实菜单。可以用来理解菜名，但不要直接拿它向餐厅下单。",
    });
    renderDishes(data);
    setStep(2);
  } else {
    toast("已选择餐厅，正在自动找菜单");
    discoverRestaurantMenu(restaurant, discoveryId);
  }
}

function fallbackLocalMenuData(menuText, options = {}) {
  const dishes = menuText
    .split("\n")
    .map(cleanLocalMenuLine)
    .filter(isUsefulLocalMenuLine)
    .map((line, index) => buildLocalDish(line, index + 1, options));
  return {
    summary: options.summary || (
      dishes.length
        ? "下面只保留较可信的菜品解释。英文原文会保留；没有写清楚的内容会标为需要确认，不会把猜测当事实。"
        : "没有整理出清晰菜品。请换更清楚的菜单页/照片，或选择餐厅官网菜单。"
    ),
    dishes,
  };
}

function cleanLocalMenuLine(line = "") {
  return line
    .replace(/[“”]/g, '"')
    .replace(/\b(GFO|GF|DF|VG|V)\b/gi, "")
    .replace(/\s*\|\s*\$?\d+(\.\d{1,2})?.*$/g, "")
    .replace(/\s+\$?\d+(\.\d{1,2})?\s*$/g, "")
    .replace(/\s+[a-z]{1,2}\s*\d+\s*$/gi, "")
    .replace(/\s+(so|eo|no|a)\s*$/gi, "")
    .replace(/^[~=\-–—\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulLocalMenuLine(line = "") {
  const letters = (line.match(/[a-z]/gi) || []).length;
  const digits = (line.match(/\d/g) || []).length;
  const words = line.match(/[a-z]+/gi) || [];
  const shortWords = words.filter((word) => word.length <= 2);
  const foodWords = /\b(panna cotta|tiramisu|cake|tart|pudding|crumble|gelato|ice cream|sorbet|dessert|pistachio|chocolate|vanilla|caramel|berry|berries|lemon|apple|pear|fig|honey|oyster|prawn|shrimp|fish|chips|fresh catch|catch of the day|calamari|salmon|barramundi|seafood|crab|mussel|scallop|steak|beef|lamb|chicken|pork|duck|burger|sandwich|schnitzel|parmigiana|pizza|pasta|linguine|fettuccine|risotto|gnocchi|salad|soup|bread|toast|egg|eggs|omelette|benedict|pancake|waffle|bagel|avocado|mushroom|cheese|bao|bun|dumpling|wonton|noodle|noodles|ramen|gyoza|karaage|teriyaki|don|bibimbap|bulgogi|kimchi|fried chicken|japchae|pad thai|curry|tom yum|papaya salad|sticky rice|mango)\b/i;
  if (line.length < 5 || line.length > 100) return false;
  if (letters < 4) return false;
  if (/^[^a-zA-Z\u4e00-\u9fff]+$/.test(line)) return false;
  if (/^[a-zA-Z]{1,3}\s?[\-$]?\d/i.test(line)) return false;
  if (/[=]{1,}|[a-z]\s?=\s?[a-z]/i.test(line)) return false;
  if (words.length && shortWords.length / words.length > 0.35) return false;
  if (digits > letters && !/\b(kids|piece|pieces|prawn|oyster|pizza|pasta|burger|steak|fish|chips)\b/i.test(line)) return false;
  if (/\b(wine|pinot|rose|sangiovese|sauvignon|chardonnay|merlot|shiraz|riesling|prosecco|beer|cocktail)\b/i.test(line)) return false;
  return foodWords.test(line);
}

function buildLocalDish(rawLine, index, options = {}) {
  const { name, price } = splitDishPrice(rawLine);
  const source = options.source || "菜单原文";
  const described = describeLocalDish(name);
  const assumptions = [
    ...(described.assumptions || []),
    ...(options.verified ? [] : ["这不是实时库存信息，点餐前仍需以餐厅当天菜单为准。"]),
  ];
  return {
    id: String(index),
    name_en: name,
    original_text: rawLine,
    price: price || "",
    ...described,
    source,
    confidence: options.verified ? described.confidence || "高" : described.confidence === "低" ? "低" : "中",
    assumptions,
    recommendationReason: options.verified ? "来自该餐厅菜单来源，优先展示可读性较高的菜品。" : "菜系练习项，只用于理解菜名和口味。",
  };
}

function splitDishPrice(line) {
  const priceMatch = line.match(/(?:\$?\s?)(\d{1,3}(?:\.\d{1,2})?)\s*$/);
  if (!priceMatch) return { name: line.trim(), price: "" };
  const price = `$${priceMatch[1]}`;
  const name = line.slice(0, priceMatch.index).replace(/[|.\-–—\s]+$/g, "").trim();
  return { name: name || line.trim(), price };
}

function describeLocalDish(name) {
  const lower = name.toLowerCase();
  if (lower.includes("seafood platter")) {
    return {
      name_zh: "海鲜拼盘",
      description_zh: "海鲜拼盘通常是餐厅的分享型主菜，可能包含鱼、虾、贝类、鱿鱼或其他当日海鲜。适合想一次尝试多种海鲜的人；海鲜过敏者不要点。",
      category: "主菜/分享",
      taste: ["鲜味", "适合分享"],
      cautions: ["海鲜过敏者避免", "具体内容需现场确认"],
      tags: ["海鲜", "招牌", "适合分享"],
      assumptions: ["官网确认这是招牌菜，但拼盘具体海鲜组合可能随当日供应变化，请现场确认。"],
      confidence: "高",
    };
  }
  if (lower.includes("seafood mornay")) {
    return {
      name_zh: "奶油芝士焗海鲜",
      description_zh: "Seafood Mornay 通常是海鲜配奶油/芝士白酱的热菜，口感浓郁、奶香明显。适合喜欢奶油海鲜的人；不适合海鲜或奶制品过敏者。",
      category: "主菜",
      taste: ["奶香", "浓郁", "鲜味"],
      cautions: ["海鲜过敏者避免", "含奶制品"],
      tags: ["海鲜", "奶制品", "浓郁"],
      assumptions: ["Mornay 通常含奶油或芝士；具体配方请现场确认。"],
      confidence: "高",
    };
  }
  if (lower.includes("fresh catch")) {
    return {
      name_zh: "当日鲜鱼",
      description_zh: "当日鲜鱼通常会根据当天供应变化，做法和鱼种不固定。适合想吃新鲜鱼的人；点之前最好问 today’s fish 是什么、怎么做。",
      category: "主菜",
      taste: ["鲜味", "相对清淡"],
      cautions: ["鱼类/海鲜过敏者避免", "鱼种和做法需现场确认"],
      tags: ["鱼类", "当日供应", "需确认"],
      assumptions: ["官网提到 fresh catch of the day，但具体鱼种和价格会随当天变化。"],
      confidence: "高",
    };
  }
  if (lower.includes("fish and chips")) {
    return {
      name_zh: "炸鱼薯条",
      description_zh: "澳洲常见安全菜，炸鱼配薯条，口味直接、份量通常不小。适合第一次尝试本地餐或带小孩的人；注意是油炸。",
      category: "主菜/外带",
      taste: ["咸香", "油炸"],
      cautions: ["鱼类过敏者避免", "可能含麸质"],
      tags: ["澳洲本地", "鱼类", "比较安全"],
      assumptions: ["裹粉可能含麸质，具体请现场确认。"],
      confidence: "高",
    };
  }
  if (lower.includes("fresh oysters") || lower.includes("oyster")) {
    return {
      name_zh: "生蚝",
      description_zh: "生蚝通常是冷食或生食海鲜，口感鲜甜带海水味。适合喜欢海鲜的人；孕妇、老人肠胃敏感或海鲜过敏者谨慎。",
      category: "前菜/海鲜",
      taste: ["鲜味", "冷食"],
      cautions: ["海鲜过敏者避免", "可能是生食"],
      tags: ["海鲜", "生食风险"],
      confidence: "中",
    };
  }
  if (lower.includes("calamari")) {
    return {
      name_zh: "鱿鱼/炸鱿鱼",
      description_zh: "Calamari 是鱿鱼，澳洲餐厅常见做法是炸鱿鱼圈或煎鱿鱼。口味咸香，适合分享；海鲜过敏者不要点。",
      category: "前菜/主菜",
      taste: ["咸香", "可能油炸"],
      cautions: ["海鲜过敏者避免", "可能含麸质"],
      tags: ["海鲜", "适合分享"],
      assumptions: ["具体是炸还是煎，需要看菜单或现场确认。"],
      confidence: "中",
    };
  }
  if (lower.includes("turkish delight panna cotta")) {
    return {
      name_zh: "土耳其软糖风味意式奶冻",
      description_zh: "一种像布丁一样软滑的奶冻甜点，通常偏甜，可能有玫瑰糖或土耳其软糖香气。适合饭后甜点；不适合不吃奶制品的人。",
      category: "甜点",
      taste: ["甜", "奶香", "软滑"],
      cautions: ["含奶制品"],
      tags: ["甜点", "奶制品", "偏甜", "口感软"],
      confidence: "高",
    };
  }
  if (lower.includes("persian fairy floss") || lower.includes("pistachio")) {
    return {
      name_zh: "波斯棉花糖配开心果",
      description_zh: "偏甜的甜点，通常有轻盈棉花糖口感和开心果坚果香。对开心果或坚果过敏的人不要点。",
      category: "甜点",
      taste: ["甜", "坚果香"],
      cautions: ["含坚果", "开心果过敏者避免"],
      tags: ["甜点", "含坚果", "偏甜"],
      confidence: "高",
    };
  }
  if (lower.includes("flat white")) {
    return {
      name_zh: "澳式奶咖 Flat White",
      description_zh: "澳洲常见咖啡，奶香明显但咖啡味比拿铁更重，适合想喝顺口奶咖的人。",
      category: "饮品",
      taste: ["咖啡味", "奶香"],
      cautions: ["含牛奶"],
      tags: ["咖啡", "含牛奶"],
      confidence: "高",
    };
  }
  if (lower.includes("long black")) {
    return {
      name_zh: "黑咖啡 Long Black",
      description_zh: "不加奶的黑咖啡，咖啡味明显、偏苦，类似美式但通常更浓。",
      category: "饮品",
      taste: ["苦", "咖啡味重"],
      cautions: [],
      tags: ["咖啡", "无奶", "偏苦"],
      confidence: "高",
    };
  }
  if (lower.includes("avocado toast")) {
    return {
      name_zh: "牛油果吐司",
      description_zh: "早午餐常见菜，通常有牛油果和吐司，可能配水波蛋。想吃全熟蛋可以要求 fully cooked egg。",
      category: "早午餐",
      taste: ["清淡", "奶油口感"],
      cautions: ["可能有半熟蛋"],
      tags: ["早午餐", "比较安全"],
      assumptions: ["配料和鸡蛋熟度按澳洲咖啡店常见做法推测，具体请现场确认。"],
    };
  }
  if (lower.includes("burrata")) {
    return {
      name_zh: "布拉塔奶酪配番茄",
      description_zh: "布拉塔是一种很软、奶香重的意大利奶酪，常配番茄和橄榄油。适合喜欢奶酪的人；不适合不吃奶制品的人。",
      category: "前菜",
      taste: ["奶香", "清爽"],
      cautions: ["含奶制品"],
      tags: ["奶制品", "前菜", "冷食"],
      confidence: "高",
    };
  }
  if (lower.includes("garlic bread")) {
    return {
      name_zh: "蒜香面包",
      description_zh: "蒜香面包通常作为前菜，味道有明显蒜香，适合分享。一般比较安全，但可能含黄油和麸质。",
      category: "前菜/配菜",
      taste: ["蒜香", "咸香"],
      cautions: ["可能含奶制品", "含麸质"],
      tags: ["前菜", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("caesar")) {
    return {
      name_zh: "凯撒沙拉",
      description_zh: "凯撒沙拉通常有生菜、芝士、面包丁和凯撒酱，有时会加鸡肉或培根。想吃清淡可以要求酱汁分开放。",
      category: "沙拉/配菜",
      taste: ["咸香", "清爽"],
      cautions: ["可能含奶制品", "可能含培根或鱼露成分"],
      tags: ["沙拉", "可作配菜"],
      assumptions: ["不同餐厅凯撒酱成分不同，过敏者需要现场确认。"],
      confidence: "中",
    };
  }
  if (lower.includes("panna cotta")) {
    return {
      name_zh: "意式奶冻",
      description_zh: "口感像布丁的奶制甜点，通常偏甜，适合饭后分享。",
      category: "甜点",
      taste: ["甜", "奶香", "软滑"],
      cautions: ["含奶制品"],
      tags: ["甜点", "奶制品"],
    };
  }
  if (lower.includes("prawn") || lower.includes("seafood") || lower.includes("fish") || lower.includes("barramundi")) {
    return {
      name_zh: name,
      description_zh: "海鲜或鱼类菜。一般比较适合想吃清淡本地餐的人；对海鲜过敏的人不要点。",
      category: "主菜",
      taste: ["鲜味", "偏清淡"],
      cautions: ["海鲜过敏者避免"],
      tags: ["海鲜", "需注意过敏"],
    };
  }
  if (lower.includes("lamb")) {
    return {
      name_zh: "羊肉主菜",
      description_zh: "羊肉味道通常比鸡肉和鱼更重，慢煮羊肩会比较软烂、份量可能较大。适合喜欢浓郁肉味的人。",
      category: "主菜",
      taste: ["肉香", "味道较重"],
      cautions: ["不喜欢羊味者谨慎"],
      tags: ["羊肉", "适合分享"],
      confidence: "中",
    };
  }
  if (lower.includes("steak") || lower.includes("beef burger") || lower.includes("burger")) {
    return {
      name_zh: lower.includes("burger") ? "牛肉汉堡" : "牛排/牛肉主菜",
      description_zh: "牛肉类主菜通常份量较大、口味咸香。汉堡一般配薯条；牛排可要求熟度，比如 medium 或 well done。",
      category: "主菜",
      taste: ["咸香", "肉香"],
      cautions: ["汉堡可能含麸质和奶制品"],
      tags: ["牛肉", "份量大"],
      assumptions: ["配菜和酱汁需要看现场菜单确认。"],
      confidence: "中",
    };
  }
  if (lower.includes("pizza") || lower.includes("pasta") || lower.includes("linguine") || lower.includes("fettuccine")) {
    return {
      name_zh: name,
      description_zh: "意式主食类，通常比较容易接受。披萨多含芝士；奶油意面会比较腻。",
      category: "主食",
      taste: ["咸香"],
      cautions: ["可能含奶制品", "可能含麸质"],
      tags: ["主食", "比较安全"],
      assumptions: ["奶制品和麸质按常见做法推测，具体请以菜单或服务员确认为准。"],
    };
  }
  if (lower.includes("chicken") || lower.includes("schnitzel") || lower.includes("parmigiana")) {
    return {
      name_zh: name,
      description_zh: "鸡肉类菜，通常比较稳。Schnitzel/Parmigiana 多是炸鸡排，份量可能比较大。",
      category: "主菜",
      taste: ["咸香"],
      cautions: ["炸物可能偏油"],
      tags: ["鸡肉", "比较安全"],
    };
  }
  if (lower.includes("pad thai")) {
    return {
      name_zh: "泰式炒河粉",
      description_zh: "泰餐常见安全菜，酸甜咸口，通常有蛋、豆芽、花生和肉/虾。花生过敏者不要点或必须确认 no peanuts。",
      category: "主食",
      taste: ["酸甜", "咸香"],
      cautions: ["可能含花生", "可能含蛋或海鲜"],
      tags: ["泰餐", "主食"],
      confidence: "高",
    };
  }
  if (lower.includes("green curry") || lower.includes("massaman") || lower.includes("curry")) {
    return {
      name_zh: "泰式咖喱",
      description_zh: "泰式咖喱通常有椰奶和香料。Green curry 往往更辣，Massaman 通常较温和偏浓郁。不能吃辣要提前说明 mild 或 not spicy。",
      category: "主菜",
      taste: ["香料味", "可能辣", "椰奶香"],
      cautions: ["可能偏辣", "可能含坚果或海鲜酱"],
      tags: ["泰餐", "需确认辣度"],
      assumptions: ["不同餐厅辣度差异很大，需要现场确认。"],
      confidence: "中",
    };
  }
  if (lower.includes("tom yum")) {
    return {
      name_zh: "冬阴功汤",
      description_zh: "酸辣泰式汤，常见有虾和香茅味，味道明显。不能吃辣或海鲜过敏的人要谨慎。",
      category: "汤/主菜",
      taste: ["酸", "辣", "香料味"],
      cautions: ["通常偏辣", "可能含海鲜"],
      tags: ["泰餐", "偏辣", "海鲜"],
      confidence: "高",
    };
  }
  if (lower.includes("xiao long bao") || lower.includes("soup dumpling")) {
    return {
      name_zh: "小笼包/汤包",
      description_zh: "小笼包里面有热汤汁，吃的时候先咬小口放汤，避免烫到。通常是猪肉馅；不吃猪肉或有芝麻/麸质过敏需要确认。",
      category: "点心/主食",
      taste: ["咸鲜", "有汤汁"],
      cautions: ["可能含猪肉", "小心烫口", "可能含麸质"],
      tags: ["中餐", "点心", "热门"],
      confidence: "高",
    };
  }
  if (lower.includes("pan fried pork bun") || lower.includes("pork bun")) {
    return {
      name_zh: "生煎包/猪肉煎包",
      description_zh: "底部煎得香脆，里面通常有猪肉和汤汁。口味咸香，容易烫口；不吃猪肉的人不要点。",
      category: "点心/主食",
      taste: ["咸香", "有汤汁"],
      cautions: ["含猪肉", "小心烫口", "可能含麸质"],
      tags: ["中餐", "点心"],
      confidence: "高",
    };
  }
  if (lower.includes("wonton noodle")) {
    return {
      name_zh: "云吞面",
      description_zh: "港式常见面食，通常是虾/猪肉云吞配细面和清汤。口味比较清淡；海鲜或猪肉忌口需要确认。",
      category: "汤面",
      taste: ["清淡", "鲜味"],
      cautions: ["可能含虾", "可能含猪肉", "含麸质"],
      tags: ["中餐", "汤面", "比较安全"],
      confidence: "高",
    };
  }
  if (lower.includes("shanghai fried noodles")) {
    return {
      name_zh: "上海炒面",
      description_zh: "上海炒面通常是粗面配肉丝、青菜和酱油风味，口味咸香、比较顶饱。适合想吃熟食主食的人；素食或不吃猪肉要确认配料。",
      category: "主食",
      taste: ["咸香", "酱香"],
      cautions: ["含麸质", "可能含猪肉或海鲜"],
      tags: ["中餐", "主食", "熟食"],
      confidence: "高",
    };
  }
  if (lower.includes("mango pancake")) {
    return {
      name_zh: "芒果班戟",
      description_zh: "港式甜点，薄饼皮包奶油和芒果，口感软、偏甜。适合饭后分享；不适合不吃奶制品的人。",
      category: "甜点",
      taste: ["甜", "奶香", "水果味"],
      cautions: ["含奶制品", "可能含麸质"],
      tags: ["甜点", "港式", "含奶"],
      confidence: "高",
    };
  }
  if (lower.includes("tonkotsu ramen") || lower.includes("ramen")) {
    return {
      name_zh: "日式拉面",
      description_zh: "日式汤面，Tonkotsu 是猪骨汤，汤底浓郁。通常有面、叉烧、蛋或笋；不吃猪肉或想清淡的人要谨慎。",
      category: "汤面",
      taste: ["浓郁", "咸香"],
      cautions: ["可能含猪肉", "含麸质", "汤底可能较咸"],
      tags: ["日餐", "拉面", "主食"],
      assumptions: ["不同店铺汤底和配料不同，具体请现场确认。"],
      confidence: "中",
    };
  }
  if (lower.includes("teriyaki chicken")) {
    return {
      name_zh: "照烧鸡肉饭",
      description_zh: "鸡肉配照烧酱和米饭，通常甜咸口，不太辣。适合不想冒险的人；酱汁可能含大豆。",
      category: "主食",
      taste: ["甜咸", "咸香"],
      cautions: ["可能含大豆", "酱汁可能偏甜"],
      tags: ["日餐", "鸡肉", "比较安全"],
      confidence: "高",
    };
  }
  if (lower.includes("green tea ice cream")) {
    return {
      name_zh: "抹茶冰淇淋",
      description_zh: "抹茶味冰淇淋，甜中带一点茶味微苦。适合饭后甜点；不适合不吃奶制品的人。",
      category: "甜点",
      taste: ["甜", "抹茶味", "奶香"],
      cautions: ["含奶制品"],
      tags: ["日餐", "甜点", "含奶"],
      confidence: "高",
    };
  }
  if (lower.includes("gyoza")) {
    return {
      name_zh: "日式煎饺",
      description_zh: "日式煎饺，通常是猪肉或鸡肉馅，底部煎香。适合分享；不吃猪肉或麸质过敏需要确认。",
      category: "小吃/前菜",
      taste: ["咸香"],
      cautions: ["可能含猪肉", "可能含麸质"],
      tags: ["日餐", "适合分享"],
      confidence: "中",
    };
  }
  if (lower.includes("karaage")) {
    return {
      name_zh: "日式炸鸡",
      description_zh: "日式炸鸡块，外脆里嫩，口味咸香。通常比较安全，但属于油炸，可能含麸质。",
      category: "小吃/主菜",
      taste: ["咸香", "油炸"],
      cautions: ["可能含麸质", "油炸"],
      tags: ["日餐", "鸡肉", "比较安全"],
      confidence: "高",
    };
  }
  if (lower.includes("bibimbap")) {
    return {
      name_zh: "韩式拌饭",
      description_zh: "米饭配蔬菜、肉、蛋和韩式辣酱。可以要求 sauce on the side 或 not spicy，适合想吃主食的人。",
      category: "主食",
      taste: ["咸香", "可能辣"],
      cautions: ["可能含蛋", "辣酱可能偏辣", "可能含芝麻"],
      tags: ["韩餐", "主食"],
      confidence: "高",
    };
  }
  if (lower.includes("bulgogi")) {
    return {
      name_zh: "韩式烤/炒牛肉",
      description_zh: "Bulgogi 是韩式甜咸口牛肉，通常不太辣，适合不想冒险的人。可能含酱油、芝麻或蒜。",
      category: "主菜",
      taste: ["甜咸", "肉香"],
      cautions: ["可能含芝麻", "可能含大豆"],
      tags: ["韩餐", "牛肉", "比较安全"],
      confidence: "高",
    };
  }
  if (lower.includes("kimchi stew") || lower.includes("kimchi jjigae")) {
    return {
      name_zh: "泡菜锅/泡菜汤",
      description_zh: "韩式泡菜汤，酸辣明显，常有猪肉、豆腐或海鲜。不能吃辣的人谨慎。",
      category: "汤/主菜",
      taste: ["酸", "辣"],
      cautions: ["通常偏辣", "可能含猪肉或海鲜"],
      tags: ["韩餐", "偏辣"],
      confidence: "高",
    };
  }
  if (lower.includes("korean fried chicken")) {
    return {
      name_zh: "韩式炸鸡",
      description_zh: "韩式炸鸡通常外脆，可能有甜辣酱、蒜香酱或原味。不能吃辣要选 original 或确认 sauce not spicy。",
      category: "主菜/分享",
      taste: ["油炸", "可能甜辣"],
      cautions: ["可能偏辣", "可能含麸质"],
      tags: ["韩餐", "鸡肉", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("seafood pancake")) {
    return {
      name_zh: "韩式海鲜煎饼",
      description_zh: "韩式煎饼里通常有葱、面糊和海鲜，适合分享。海鲜过敏或麸质过敏的人不要点。",
      category: "前菜/分享",
      taste: ["咸香", "外脆"],
      cautions: ["海鲜过敏者避免", "含麸质"],
      tags: ["韩餐", "海鲜", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("japchae")) {
    return {
      name_zh: "韩式炒粉丝",
      description_zh: "韩式粉丝配蔬菜和肉，通常是甜咸口，不太辣。适合想吃主食但不想太辣的人；可能含芝麻和酱油。",
      category: "主食/配菜",
      taste: ["甜咸", "咸香"],
      cautions: ["可能含芝麻", "可能含大豆"],
      tags: ["韩餐", "不太辣", "主食"],
      confidence: "高",
    };
  }
  if (lower.includes("eggs benedict")) {
    return {
      name_zh: "班尼迪克蛋",
      description_zh: "早午餐常见菜，通常是面包、火腿/三文鱼、半熟水波蛋和荷兰酱。想吃全熟蛋要要求 fully cooked eggs。",
      category: "早午餐",
      taste: ["奶香", "咸香"],
      cautions: ["可能有半熟蛋", "可能含奶制品", "可能含麸质"],
      tags: ["早午餐", "蛋类", "需确认熟度"],
      confidence: "高",
    };
  }
  if (lower.includes("salad")) {
    return {
      name_zh: name,
      description_zh: "沙拉类，适合作为配菜或清淡选择。可以注意是否含芝士、培根或坚果。",
      category: "沙拉/配菜",
      taste: ["清爽"],
      cautions: ["可能含芝士或坚果"],
      tags: ["沙拉", "清淡"],
      assumptions: ["具体酱汁和配料需要看菜单细节或现场确认。"],
    };
  }
  if (lower.includes("tiramisu") || lower.includes("cake") || lower.includes("bread") || lower.includes("pancake")) {
    return {
      name_zh: name,
      description_zh: "甜点或烘焙类，通常偏甜，适合饭后或咖啡搭配。",
      category: "甜点/烘焙",
      taste: ["甜"],
      cautions: ["可能含奶制品", "可能含麸质"],
      tags: ["甜点", "偏甜"],
      assumptions: ["过敏信息按常见做法推测，具体请现场确认。"],
    };
  }
  return {
    name_zh: name,
    description_zh: "这是一道菜单菜品。当前版本先给出基础解释，正式 AI 模式会补充更准确的口味、做法和注意事项。",
    category: "未分类",
    taste: [],
    cautions: ["需要现场确认细节"],
    tags: ["待确认"],
    confidence: "低",
    assumptions: ["菜单原文信息不足，不能确认食材、口味和过敏信息。"],
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

const chatswoodRestaurants = [
  {
    id: "cw-dumpling",
    name: "Chatswood 菜系练习：点心/小笼包",
    area: "Chatswood",
    address: "Chatswood, NSW",
    rating: "",
    note: "菜系练习，不是某家餐厅真实菜单。用于先看懂常见菜名。",
    tags: ["中餐", "点心", "练习菜单"],
    hasMenu: true,
    menuSource: "菜系练习",
    menuVerified: false,
    menuText: [
      "Xiao long bao",
      "Pan fried pork buns",
      "Prawn wonton noodle soup",
      "Shanghai fried noodles",
      "Salt and pepper calamari",
      "Mango pancakes",
    ].join("\n"),
  },
  {
    id: "cw-thai",
    name: "Chatswood 菜系练习：泰餐",
    area: "Chatswood",
    address: "Chatswood, NSW",
    rating: "",
    note: "菜系练习，不是某家餐厅真实菜单。重点解释辣度、花生和海鲜风险。",
    tags: ["泰餐", "需确认辣度", "练习菜单"],
    hasMenu: true,
    menuSource: "菜系练习",
    menuVerified: false,
    menuText: [
      "Chicken pad thai",
      "Green curry with beef",
      "Massaman lamb curry",
      "Tom yum prawns",
      "Papaya salad",
      "Mango sticky rice",
    ].join("\n"),
  },
  {
    id: "cw-ramen",
    name: "Chatswood 菜系练习：日式拉面",
    area: "Chatswood",
    address: "Chatswood, NSW",
    rating: "",
    note: "菜系练习，不是某家餐厅真实菜单。适合快速判断汤底、猪肉和油炸小吃。",
    tags: ["日餐", "拉面", "练习菜单"],
    hasMenu: true,
    menuSource: "菜系练习",
    menuVerified: false,
    menuText: [
      "Tonkotsu ramen",
      "Miso ramen",
      "Chicken karaage",
      "Pork gyoza",
      "Teriyaki chicken don",
      "Green tea ice cream",
    ].join("\n"),
  },
  {
    id: "cw-korean",
    name: "Chatswood 菜系练习：韩餐",
    area: "Chatswood",
    address: "Chatswood, NSW",
    rating: "",
    note: "菜系练习，不是某家餐厅真实菜单。覆盖常见主食、汤和分享菜。",
    tags: ["韩餐", "可能偏辣", "练习菜单"],
    hasMenu: true,
    menuSource: "菜系练习",
    menuVerified: false,
    menuText: [
      "Beef bulgogi",
      "Bibimbap",
      "Kimchi stew",
      "Korean fried chicken",
      "Seafood pancake",
      "Japchae glass noodles",
    ].join("\n"),
  },
  {
    id: "cw-cafe",
    name: "Chatswood 菜系练习：咖啡早午餐",
    area: "Chatswood",
    address: "Chatswood, NSW",
    rating: "",
    note: "菜系练习，不是某家咖啡店真实菜单。适合老人、游客和学生先练习使用。",
    tags: ["咖啡", "早午餐", "练习菜单"],
    hasMenu: true,
    menuSource: "菜系练习",
    menuVerified: false,
    menuText: [
      "Flat white",
      "Long black",
      "Avocado toast with poached eggs",
      "Eggs benedict",
      "Chicken schnitzel sandwich",
      "Banana bread",
    ].join("\n"),
  },
];

const areaDemoMenus = {
  bistro: sampleMenu,
  cafe: `Flat white
Long black
Avocado toast with poached eggs
Smoked salmon bagel
Chicken schnitzel sandwich
Mushroom omelette
Banana bread
Kids pancakes`,
  italian: `Garlic bread
Caesar salad
Margherita pizza
Pepperoni pizza
Seafood linguine
Creamy mushroom fettuccine
Chicken parmigiana
Panna cotta`,
  pub: `Fish and chips
Chicken parmigiana
Beef burger with chips
Caesar salad with grilled chicken
Salt and pepper calamari
Steak sandwich
Sticky date pudding`,
  thai: `Chicken pad thai
Green curry with beef
Massaman lamb curry
Tom yum prawns
Cashew nut stir fry
Coconut rice
Mango sticky rice`,
};

function titleCaseArea(areaName = "") {
  return areaName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ") || "Sydney CBD";
}

function staticDemoRestaurantsForArea(areaName = "") {
  const area = titleCaseArea(areaName);
  return [
    {
      id: `demo-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-bistro`,
      name: `${area} Local Bistro`,
      area,
      rating: "4.6",
      note: "适合第一次尝试本地西餐，菜单不复杂，有鱼、虾、披萨和甜点。",
      tags: ["适合老人", "可点安全菜", "英文压力低"],
      menu: areaDemoMenus.bistro,
    },
    {
      id: `demo-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-cafe`,
      name: `${area} Garden Cafe`,
      area,
      rating: "4.5",
      note: "适合早午餐和咖啡，点餐卡很有用，现场不用解释太多。",
      tags: ["早午餐", "适合父母", "儿童友好"],
      menu: areaDemoMenus.cafe,
    },
    {
      id: `demo-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-italian`,
      name: `${area} Laneway Italian`,
      area,
      rating: "4.4",
      note: "适合家庭聚餐，披萨和意面容易提前选好。",
      tags: ["家庭聚餐", "披萨意面", "不容易踩雷"],
      menu: areaDemoMenus.italian,
    },
    {
      id: `demo-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-pub`,
      name: `${area} Family Pub`,
      area,
      rating: "4.3",
      note: "澳洲常见酒吧餐，份量大，适合想体验本地餐的人。",
      tags: ["澳洲本地", "份量大", "可点安全菜"],
      menu: areaDemoMenus.pub,
    },
    {
      id: `demo-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-thai`,
      name: `${area} Thai Kitchen`,
      area,
      rating: "4.4",
      note: "泰餐选择多，但要提前说明辣度。",
      tags: ["泰餐", "需确认辣度", "适合分享"],
      menu: areaDemoMenus.thai,
    },
  ];
}

function localKnownMenuCache(payload = {}) {
  const key = `${payload.restaurantName || ""} ${payload.areaName || ""} ${payload.websiteUri || ""} ${payload.url || ""}`.toLowerCase();
  if (!key.includes("mumm") && !key.includes("mummsonthemyall")) return null;
  const menuText = [
    "Mumm's Seafood Platter",
    "Seafood Mornay",
    "Fresh catch of the day",
    "Takeaway fish and chips",
    "Turkish delight panna cotta",
    "Persian fairy floss and pistachio",
  ].join("\n");
  const analyzed = fallbackLocalMenuData(menuText, {
    source: "官网确认代表菜",
    verified: true,
    summary: "已整理官网确认过的代表菜，不是完整菜单。包含招牌海鲜、当日鱼、外带炸鱼薯条和甜点；完整菜单仍可打开原文核对。",
  });
  return {
    ...analyzed,
    menuText,
    websiteUrl: "https://mummsonthemyall.com.au",
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
  if (/^(cw|chatswood)$/i.test(area)) {
    return {
      source: "static_known",
      message: "当前没有后端 Google Places key，Chatswood 先显示菜系练习菜单，不冒充真实餐厅菜单。真实餐厅需要接 Google Places/OSM 或人工确认库。",
      restaurants: chatswoodRestaurants,
    };
  }
  if (/tea gardens?/i.test(area)) {
    return {
      source: "static_known",
      message: "当前是公网静态内测版：先使用内置 Tea Gardens 真实餐厅库。",
      restaurants: teaGardensRestaurants,
    };
  }
  return {
    source: "static_demo",
    message: `当前是公网静态内测版：先显示 ${titleCaseArea(area)} 示例餐厅。接入 Render/Google Places 后会换成真实附近餐厅。`,
    restaurants: staticDemoRestaurantsForArea(area),
  };
}

function localAnalyzeMenu(payload = {}) {
  return fallbackLocalMenuData(payload.menuText || "", {
    source: "用户输入/照片识别",
    verified: false,
  });
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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  } catch (error) {
    return localApi(url, payload);
  } finally {
    window.clearTimeout(timeoutId);
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
  const foodWords = /\b(panna cotta|tiramisu|cake|tart|pudding|crumble|gelato|ice cream|sorbet|dessert|pistachio|chocolate|vanilla|caramel|berry|berries|lemon|apple|pear|fig|honey|oyster|prawn|shrimp|fish|chips|fresh catch|catch of the day|calamari|salmon|barramundi|seafood|crab|mussel|scallop|steak|beef|lamb|chicken|pork|duck|burger|sandwich|schnitzel|parmigiana|pizza|pasta|linguine|fettuccine|risotto|gnocchi|salad|soup|bread|toast|egg|eggs|omelette|benedict|pancake|waffle|bagel|avocado|mushroom|cheese|bao|bun|dumpling|wonton|noodle|ramen|gyoza|karaage|teriyaki|don|bibimbap|bulgogi|kimchi|fried chicken|japchae|pad thai|curry|tom yum|papaya salad|sticky rice|mango)\b/i;
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
      const cautions = (dish.cautions || []).map((item) => `<span class="risk-tag">${item}</span>`).join("");
      const taste = (dish.taste || []).map((item) => `<span class="taste-tag">${item}</span>`).join("");
      const assumptions = (dish.assumptions || []).map((item) => `<p class="dish-note">需确认：${item}</p>`).join("");
      const meta = [
        dish.category ? `分类：${dish.category}` : "",
        dish.price ? `价格：${dish.price}` : "",
        dish.source ? `来源：${dish.source}` : "",
        dish.confidence ? `可信度：${dish.confidence}` : "",
      ].filter(Boolean).join(" · ");
      return `
        <label class="dish-card">
          <input type="checkbox" value="${dish.id}" />
          <div>
            <div class="dish-title-row">
              <h3>${dish.name_zh || dish.name_en}</h3>
              ${dish.price ? `<span class="price-pill">${dish.price}</span>` : ""}
            </div>
            <p class="dish-original">${dish.original_text || dish.name_en}</p>
            ${meta ? `<p class="dish-meta">${meta}</p>` : ""}
            <p class="dish-description">${dish.description_zh || ""}</p>
            ${dish.recommendationReason ? `<p class="dish-reason">${dish.recommendationReason}</p>` : ""}
            ${taste ? `<div class="tag-row">${taste}</div>` : ""}
            ${cautions ? `<div class="tag-row">${cautions}</div>` : ""}
            ${assumptions}
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
  const searchId = state.restaurantSearchId + 1;
  state.restaurantSearchId = searchId;
  state.menuDiscoveryId += 1;
  clearRestaurantSelection();
  const requestedArea = payload.areaName || "当前位置";
  renderRestaurants([], `正在查找「${requestedArea}」附近餐厅...`);
  const button = $("#nearbyButton");
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  try {
    const data = await postJson("/api/nearby-restaurants", payload);
    if (searchId !== state.restaurantSearchId) return;
    renderRestaurants(data.restaurants || demoRestaurants, data.message || "");
    const isRealSource = data.source === "google_places" || data.source === "openstreetmap" || data.source === "known_local" || data.source === "static_known";
    toast(isRealSource ? "已找到真实附近餐厅" : "已显示示例餐厅");
  } catch {
    if (searchId !== state.restaurantSearchId) return;
    renderRestaurants(demoRestaurants, "附近餐厅暂时获取失败，先显示示例餐厅。");
    toast("附近餐厅获取失败");
  } finally {
    if (searchId === state.restaurantSearchId) {
      button.disabled = false;
      button.textContent = oldText;
    }
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
  if (dishes.some((dish) => String(dish.source || "").includes("菜系练习"))) {
    toast("练习菜单不能生成点餐卡，请选择真实餐厅菜单或拍菜单");
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
renderRestaurants(demoRestaurants, "v26 已加载：菜单必须标明来源；菜系练习不再冒充真实餐厅菜单，也不能生成点餐卡。");
