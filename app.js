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
        ${restaurant.curationReason ? `<p class="restaurant-curation">${restaurant.curationReason}</p>` : ""}
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
  if (restaurant.menuDishes?.length) {
    toast("已选择餐厅，结构化真实菜单已准备好");
    renderDishes({
      summary: "这是已整理的样板菜单：每道菜都固定中文名、解释、口味和忌口提醒。仍建议到店前核对是否售罄或菜单更新。",
      dishes: enrichStructuredDishes(restaurant.menuDishes, restaurant.menuSource || "真实菜单"),
    });
    setStep(2);
    return;
  }
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

function enrichStructuredDishes(dishes = [], source = "真实菜单") {
  return dishes.map((dish, index) => ({
    id: String(dish.id || index + 1),
    confidence: "高",
    source,
    recommendationReason: "来自该餐厅对应菜单，适合直接加入点餐卡；当天是否售罄仍以餐厅现场为准。",
    ...dish,
    original_text: dish.original_text || dish.name_en,
  }));
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
  const foodWords = /\b(panna cotta|tiramisu|cake|tart|pudding|crumble|gelato|ice cream|sorbet|dessert|pistachio|chocolate|vanilla|caramel|berry|berries|lemon|apple|pear|fig|honey|oyster|prawn|shrimp|fish|chips|gravy|fresh catch|catch of the day|calamari|squid|salmon|barramundi|seafood|crab|mussel|scallop|steak|beef|lamb|chicken|pork|duck|hamburger|burger|sandwich|schnitzel|parmigiana|nugget|nuggets|poke bowl|bangers|mash|nachos|burrito|bolognese|lava cake|pecan pie|seasonal vegetables|house salad|potato scallop|hash brown|corn jack|pluto pup|chiko roll|battered sav|spring roll|dim sim|pineapple fritter|fish cocktail|fish cocktails|prawn cutlet|prawn cutlets|seafood stick|fish cake|prawn twister|tinny special|boatload special|meal deal|pizza|pasta|linguine|fettuccine|risotto|gnocchi|salad|soup|bread|toast|egg|eggs|omelette|benedict|pancake|waffle|bagel|avocado|mushroom|cheese|bao|bun|dumpling|wonton|noodle|noodles|ramen|gyoza|karaage|teriyaki|don|bibimbap|bulgogi|kimchi|fried chicken|japchae|pad thai|pad see eiw|kee mao|khao pad|biryani|curry|massaman|gaeng|tom yum|som tum|larb|papaya salad|sticky rice|roti|mango|betel|sriracha|tamarind)\b/i;
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
  if (lower.includes("pla's pork ribs") || lower.includes("pork ribs")) {
    return {
      name_zh: "泰式罗望子猪肋排",
      description_zh: "Khao Pla 官网菜单里的招牌菜，猪肋排二次烹调后配罗望子酱，通常酸甜咸香、肉味重。适合喜欢肉类和泰式酸甜口的人。",
      category: "招牌主菜",
      taste: ["酸甜", "肉香", "浓郁"],
      cautions: ["含猪肉", "酱汁成分需确认"],
      tags: ["招牌", "猪肉", "酸甜"],
      confidence: "高",
    };
  }
  if (lower.includes("massaman")) {
    return {
      name_zh: "玛莎曼牛肉咖喱",
      description_zh: "南泰风格咖喱，Khao Pla 菜单写的是慢炖牛脸肉、罗望子和棕榈糖。口味通常温和浓郁、带酸甜，不是最辣的咖喱。",
      category: "咖喱/主菜",
      taste: ["浓郁", "微甜", "香料味"],
      cautions: ["含牛肉", "可能含坚果或椰奶，过敏者需确认"],
      tags: ["泰餐", "咖喱", "牛肉"],
      confidence: "高",
    };
  }
  if (lower.includes("gaeng keaw wan") || lower.includes("green curry")) {
    return {
      name_zh: "泰式青咖喱鸡",
      description_zh: "青咖喱配鸡腿肉、泰国茄子、野姜、青柠叶、辣椒和罗勒。香料味明显，通常会辣，适合能吃一点辣的人。",
      category: "咖喱/主菜",
      taste: ["椰香", "香料味", "可能偏辣"],
      cautions: ["含鸡肉", "通常有辣椒", "可能含椰奶"],
      tags: ["泰餐", "咖喱", "需确认辣度"],
      confidence: "高",
    };
  }
  if (lower.includes("tom yum")) {
    return {
      name_zh: "冬阴功虾汤",
      description_zh: "酸辣汤，菜单写有香蕉虾、香茅、南姜、青柠叶和香菜。味道鲜、酸、辣都明显；不吃辣或海鲜过敏者要避开。",
      category: "汤/海鲜",
      taste: ["酸", "辣", "鲜味"],
      cautions: ["虾/海鲜过敏者避免", "通常偏辣"],
      tags: ["泰餐", "海鲜", "酸辣"],
      confidence: "高",
    };
  }
  if (lower.includes("pad thai")) {
    return {
      name_zh: "泰式炒河粉",
      description_zh: "经典泰餐，Khao Pla 菜单写有鸡肉、鸡蛋、花生、豆芽、罗望子、虾米和棕榈糖。酸甜咸香，通常比较安全，但花生过敏者不能点。",
      category: "米粉/主食",
      taste: ["酸甜", "咸香"],
      cautions: ["含花生", "含鸡蛋", "可能含虾米"],
      tags: ["泰餐", "主食", "花生风险"],
      confidence: "高",
    };
  }
  if (lower.includes("pad see eiw")) {
    return {
      name_zh: "泰式酱油炒河粉",
      description_zh: "宽河粉配鸡肉、鸡蛋、黑酱油和芥兰，味道比 Pad Thai 更咸香，不太酸甜。适合不想吃太辣的人，但仍需确认是否加辣。",
      category: "米粉/主食",
      taste: ["咸香", "酱香"],
      cautions: ["含鸡蛋", "可能含麸质/酱油"],
      tags: ["泰餐", "主食", "相对安全"],
      confidence: "高",
    };
  }
  if (lower.includes("som tum") || lower.includes("papaya salad")) {
    return {
      name_zh: "青木瓜沙拉",
      description_zh: "泰式青木瓜沙拉，通常酸、辣、脆，菜单写有花生、虾米、罗望子和青柠汁。非常需要确认辣度。",
      category: "沙拉/前菜",
      taste: ["酸", "辣", "清爽"],
      cautions: ["含花生", "可能含虾米", "通常偏辣"],
      tags: ["泰餐", "需确认辣度", "花生风险"],
      confidence: "高",
    };
  }
  if (lower.includes("prawn toast")) {
    return {
      name_zh: "炸虾吐司",
      description_zh: "虾肉铺在酸面包上油炸，菜单写有芝麻油和白泡菜蛋黄酱。外脆、海鲜味明显，适合分享。",
      category: "前菜/小吃",
      taste: ["咸香", "油炸", "鲜味"],
      cautions: ["虾/海鲜过敏者避免", "含麸质", "可能含蛋黄酱"],
      tags: ["泰餐", "海鲜", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("salt and pepper calamari")) {
    return {
      name_zh: "椒盐炸鱿鱼",
      description_zh: "炸鱿鱼配冬阴功香料盐，咸香、微辣、适合分享。海鲜过敏者不要点。",
      category: "前菜/海鲜",
      taste: ["咸香", "油炸", "微辣"],
      cautions: ["海鲜过敏者避免", "可能含麸质"],
      tags: ["海鲜", "适合分享"],
      confidence: "高",
    };
  }
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
  if (lower.includes("fish & chips") || lower.includes("fish and chips")) {
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
  if (lower.includes("fish cocktails and chips")) {
    return {
      name_zh: "鱼块配薯条",
      description_zh: "Fish cocktails 是小块炸鱼，配薯条更适合分享或给小孩点。口味咸香，比较安全；鱼类过敏者不要点。",
      category: "主菜/外带",
      taste: ["咸香", "油炸"],
      cautions: ["鱼类过敏者避免", "可能含麸质"],
      tags: ["炸鱼", "薯条", "适合小孩"],
      confidence: "高",
    };
  }
  if (lower.includes("gravy")) {
    return {
      name_zh: "肉汁酱",
      description_zh: "常见热酱汁，通常浇在薯条或炸物上，味道咸香浓郁。配方可能含麸质。",
      category: "酱汁/配料",
      taste: ["咸香", "浓郁"],
      cautions: ["可能含麸质", "配方需确认"],
      tags: ["酱汁", "配薯条"],
      confidence: "中",
    };
  }
  if (lower.includes("smoked chicken wings")) {
    return {
      name_zh: "烟熏鸡翅",
      description_zh: "烟熏鸡翅通常是腌制后烟熏/烤制，肉香明显，适合分享；口味可能偏咸。",
      category: "前菜/分享",
      taste: ["烟熏味", "咸香"],
      cautions: ["可能偏咸", "酱料需确认"],
      tags: ["鸡肉", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("poke bowl")) {
    return {
      name_zh: "Poke 碗饭",
      description_zh: "Poke 碗饭通常有米饭、蔬菜、蛋白质和酱汁，偏清爽。具体鱼/肉和酱料需要看当天菜单。",
      category: "主食/碗饭",
      taste: ["清爽", "可能偏酸"],
      cautions: ["配料和酱汁需确认"],
      tags: ["碗饭", "相对清爽", "需确认配料"],
      confidence: "高",
    };
  }
  if (lower.includes("asian chicken salad")) {
    return {
      name_zh: "亚洲风味鸡肉沙拉",
      description_zh: "通常有蔬菜、鸡肉和偏甜/酸的酱汁。想清淡可以要求 dressing on the side。",
      category: "沙拉/主菜",
      taste: ["清爽", "可能酸甜"],
      cautions: ["酱料需确认", "可能微辣"],
      tags: ["鸡肉", "沙拉", "可酱汁分开"],
      confidence: "高",
    };
  }
  if (lower.includes("bangers") && lower.includes("mash")) {
    return {
      name_zh: "香肠土豆泥",
      description_zh: "英澳 pub 常见菜，香肠配土豆泥和肉汁。通常份量扎实；可能含猪肉和奶制品。",
      category: "主菜/pub food",
      taste: ["肉香", "咸香"],
      cautions: ["可能含猪肉", "可能含奶制品"],
      tags: ["pub food", "香肠", "份量扎实"],
      confidence: "高",
    };
  }
  if (lower.includes("nachos")) {
    return {
      name_zh: "牛肉玉米片",
      description_zh: "玉米片配牛肉、芝士、酱和酸奶油等，适合分享。可能偏咸或微辣。",
      category: "主菜/分享",
      taste: ["咸香", "可能辣"],
      cautions: ["可能含奶制品", "酱料辣度需确认"],
      tags: ["适合分享", "含芝士", "可能微辣"],
      confidence: "高",
    };
  }
  if (lower.includes("burrito")) {
    return {
      name_zh: "鱼肉卷饼",
      description_zh: "卷饼类主食，里面通常有鱼/肉、米饭或蔬菜和酱。不能吃辣要确认 sauce not spicy。",
      category: "主食",
      taste: ["咸香", "可能辣"],
      cautions: ["可能含麸质", "酱料辣度需确认"],
      tags: ["卷饼", "主食", "需确认辣度"],
      confidence: "高",
    };
  }
  if (lower.includes("bolognese")) {
    return {
      name_zh: lower.includes("linguine") ? "肉酱扁意面" : "肉酱意面",
      description_zh: "番茄肉酱意面，口味比较熟悉，适合不想冒险的人。通常含麸质，可能撒芝士。",
      category: "意面/主食",
      taste: ["番茄味", "肉酱味"],
      cautions: ["含麸质", "可能含奶制品"],
      tags: ["意面", "肉酱", "比较安全"],
      confidence: "高",
    };
  }
  if (lower.includes("chocolate lava cake")) {
    return {
      name_zh: "巧克力熔岩蛋糕",
      description_zh: "巧克力味浓、甜度高的甜点，通常适合饭后分享。",
      category: "甜点",
      taste: ["甜", "巧克力味"],
      cautions: ["可能含奶制品", "可能含麸质"],
      tags: ["甜点", "巧克力", "偏甜"],
      confidence: "高",
    };
  }
  if (lower.includes("pecan pie")) {
    return {
      name_zh: "山核桃派",
      description_zh: "坚果香明显，通常很甜。坚果过敏者不要点。",
      category: "甜点",
      taste: ["甜", "坚果香"],
      cautions: ["含坚果", "可能含奶制品", "可能含麸质"],
      tags: ["甜点", "含坚果", "偏甜"],
      confidence: "高",
    };
  }
  if (lower.includes("seasonal vegetables")) {
    return {
      name_zh: "时令蔬菜",
      description_zh: "蔬菜配菜，适合想吃清淡一点或给老人搭配主菜。",
      category: "配菜",
      taste: ["清淡"],
      cautions: ["调味需确认"],
      tags: ["蔬菜", "配菜", "清淡"],
      confidence: "高",
    };
  }
  if (lower.includes("mashed potato")) {
    return {
      name_zh: "土豆泥配肉汁",
      description_zh: "口感软，适合老人和小孩；可能含奶制品。",
      category: "配菜",
      taste: ["咸香", "口感软"],
      cautions: ["可能含奶制品", "肉汁配方需确认"],
      tags: ["配菜", "口感软"],
      confidence: "高",
    };
  }
  if (lower.includes("veggie supreme pizza")) {
    return {
      name_zh: "蔬菜披萨",
      description_zh: "蔬菜披萨，通常有芝士和多种蔬菜，适合不想吃肉的人；仍可能含奶制品和麸质。",
      category: "披萨/主食",
      taste: ["咸香", "芝士味"],
      cautions: ["含奶制品", "含麸质"],
      tags: ["披萨", "蔬菜"],
      confidence: "高",
    };
  }
  if (lower.includes("garlic prawn pizza")) {
    return {
      name_zh: "蒜香虾披萨",
      description_zh: "虾和蒜香风味披萨，适合喜欢海鲜的人；海鲜过敏者不要点。",
      category: "披萨/主食",
      taste: ["蒜香", "鲜味", "咸香"],
      cautions: ["海鲜过敏者避免", "含奶制品", "含麸质"],
      tags: ["披萨", "海鲜", "蒜香"],
      confidence: "高",
    };
  }
  if (lower.includes("chicken nuggets")) {
    return {
      name_zh: "鸡块",
      description_zh: "油炸鸡块，适合小孩或当小吃。口味简单，但属于油炸，可能含麸质。",
      category: "小吃/快餐",
      taste: ["咸香", "油炸"],
      cautions: ["可能含麸质", "油炸"],
      tags: ["鸡肉", "适合小孩", "快餐"],
      confidence: "高",
    };
  }
  if (lower.includes("hamburger") || lower.includes("works burger") || lower.includes("fish burger") || lower.includes("chicken burger") || lower.includes("veggie burger")) {
    const isFish = lower.includes("fish");
    const isChicken = lower.includes("chicken");
    const isVeggie = lower.includes("veggie");
    return {
      name_zh: isFish ? "炸鱼汉堡" : isChicken ? "鸡肉汉堡" : isVeggie ? "素食汉堡" : lower.includes("works") ? "豪华汉堡" : "汉堡",
      description_zh: "外带店常见汉堡，通常有面包、生菜、酱和肉/鱼/蔬菜饼。Works burger 通常配料更多。适合想要简单主食的人。",
      category: "主食/快餐",
      taste: ["咸香"],
      cautions: ["含麸质", "酱料和配料需确认"],
      tags: ["汉堡", "快餐", "比较安全"],
      confidence: "高",
    };
  }
  if (lower.includes("steak sandwich")) {
    return {
      name_zh: "牛排三明治",
      description_zh: "澳洲外带店常见主食，通常是牛肉片夹面包，可能配洋葱、酱和生菜。份量通常比普通三明治大。",
      category: "主食/快餐",
      taste: ["肉香", "咸香"],
      cautions: ["含麸质", "酱料需确认"],
      tags: ["牛肉", "三明治", "份量大"],
      confidence: "高",
    };
  }
  if (lower.includes("egg and bacon roll")) {
    return {
      name_zh: "鸡蛋培根面包卷",
      description_zh: "早餐/快餐常见，鸡蛋和培根夹面包，口味咸香。适合早餐；不吃猪肉或不吃半熟蛋要确认。",
      category: "早餐/快餐",
      taste: ["咸香"],
      cautions: ["含猪肉", "含麸质", "鸡蛋熟度需确认"],
      tags: ["早餐", "培根", "比较安全"],
      confidence: "高",
    };
  }
  if (/^chips\b/.test(lower) || lower.includes("minimum chips")) {
    return {
      name_zh: "薯条",
      description_zh: "外带店最常见配菜，油炸土豆条，口味咸香。适合小孩和分享；注意偏油。",
      category: "配菜/外带",
      taste: ["咸香", "油炸"],
      cautions: ["油炸", "可能和海鲜同油锅"],
      tags: ["薯条", "配菜", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("bowl of chips")) {
    return {
      name_zh: "一碗薯条",
      description_zh: "一份薯条，适合作为配菜或分享；注意偏油，可能和海鲜同油锅。",
      category: "配菜/外带",
      taste: ["咸香", "油炸"],
      cautions: ["油炸", "可能和海鲜同油锅"],
      tags: ["薯条", "配菜", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("potato scallop")) {
    return {
      name_zh: "炸土豆饼",
      description_zh: "澳洲炸鱼薯条店常见小吃，土豆片裹面糊油炸。不是海鲜 scallop。",
      category: "小吃/配菜",
      taste: ["咸香", "油炸"],
      cautions: ["含麸质", "油炸"],
      tags: ["土豆", "小吃", "不是海鲜"],
      confidence: "高",
    };
  }
  if (lower.includes("hash brown")) {
    return {
      name_zh: "薯饼",
      description_zh: "炸土豆薯饼，口味简单，适合小孩或当配菜。",
      category: "小吃/配菜",
      taste: ["咸香", "油炸"],
      cautions: ["油炸"],
      tags: ["土豆", "适合小孩"],
      confidence: "高",
    };
  }
  if (lower.includes("corn jack") || lower.includes("pluto pup") || lower.includes("chiko roll") || lower.includes("battered sav") || lower.includes("spring roll") || lower.includes("dim sim")) {
    return {
      name_zh: lower.includes("pluto") ? "炸热狗/玉米狗" : lower.includes("dim sim") ? "澳式炸/蒸点心" : lower.includes("spring") ? "春卷" : "澳洲外带炸物小吃",
      description_zh: "外带店常见小吃，多数是油炸，适合尝鲜或给孩子少量分享。具体肉馅和配料需要现场确认。",
      category: "小吃/外带",
      taste: ["咸香", "油炸"],
      cautions: ["油炸", "可能含麸质", "馅料需确认"],
      tags: ["小吃", "外带", "需确认馅料"],
      confidence: "中",
    };
  }
  if (lower.includes("prawn cutlet") || lower.includes("seafood stick") || lower.includes("seafood cocktail") || lower.includes("tassie scallop") || lower.includes("prawn twister")) {
    return {
      name_zh: lower.includes("prawn") ? "炸虾类小吃" : lower.includes("scallop") ? "扇贝/海鲜小吃" : "海鲜小吃",
      description_zh: "海鲜类外带小吃，多数是油炸。适合喜欢海鲜的人；海鲜过敏者不要点。",
      category: "海鲜小吃",
      taste: ["鲜味", "咸香", "油炸"],
      cautions: ["海鲜过敏者避免", "可能含麸质"],
      tags: ["海鲜", "外带", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("fish cocktails")) {
    return {
      name_zh: "炸鱼块",
      description_zh: "小块炸鱼，适合分享或给小孩点。比整条鱼更容易分着吃。",
      category: "海鲜小吃",
      taste: ["咸香", "油炸"],
      cautions: ["鱼类过敏者避免", "可能含麸质"],
      tags: ["炸鱼", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("fish cake")) {
    return {
      name_zh: "鱼饼",
      description_zh: "鱼饼/鱼糕类炸物，通常是鱼肉加工成饼状再煎炸或油炸。鱼类过敏者不要点。",
      category: "海鲜小吃",
      taste: ["咸香", "油炸"],
      cautions: ["鱼类过敏者避免", "可能含麸质"],
      tags: ["鱼类", "小吃", "外带"],
      confidence: "高",
    };
  }
  if (lower.includes("calamari") || lower.includes("salt and pepper squid")) {
    return {
      name_zh: lower.includes("fritti") ? "意式炸鱿鱼" : lower.includes("cone") ? "招牌鱿鱼杯" : lower.includes("seven pieces") ? "七块鱿鱼配薯条" : lower.includes("salt and pepper") ? "椒盐鱿鱼" : "鱿鱼圈",
      description_zh: "鱿鱼类炸物，口味咸香，适合分享。海鲜过敏者不要点；有时会比较有嚼劲。",
      category: "海鲜小吃/分享",
      taste: ["咸香", "油炸"],
      cautions: ["海鲜过敏者避免", "可能含麸质"],
      tags: ["鱿鱼", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("grilled barramundi")) {
    return {
      name_zh: "烤澳洲盲曹鱼配薯条",
      description_zh: "Barramundi 是澳洲常见白肉鱼，烤的通常比炸鱼清淡。适合想吃鱼但不想太油的人。",
      category: "主菜/鱼类",
      taste: ["鲜味", "相对清淡"],
      cautions: ["鱼类过敏者避免"],
      tags: ["鱼类", "相对清淡"],
      confidence: "高",
    };
  }
  if (lower.includes("fish cone")) {
    return {
      name_zh: "炸鱼杯",
      description_zh: "Tea Gardens Hotel 的炸鱼杯，通常是外带/分享形式的炸鱼。鱼类过敏者不要点。",
      category: "海鲜小吃/分享",
      taste: ["咸香", "油炸"],
      cautions: ["鱼类过敏者避免", "可能含麸质"],
      tags: ["炸鱼", "适合分享"],
      confidence: "高",
    };
  }
  if (lower.includes("tassie salmon")) {
    return {
      name_zh: "塔州三文鱼配薯条",
      description_zh: "三文鱼配薯条，鱼味比白肉鱼更明显，通常油脂更丰富。适合喜欢三文鱼的人。",
      category: "主菜/鱼类",
      taste: ["鲜味", "鱼油香"],
      cautions: ["鱼类过敏者避免"],
      tags: ["三文鱼", "主菜"],
      confidence: "高",
    };
  }
  if (lower.includes("tinny special") || lower.includes("boatload special") || lower.includes("meal deal")) {
    return {
      name_zh: lower.includes("boatload") ? "海鲜炸物大份套餐" : lower.includes("tinny") ? "海鲜炸物小份套餐" : "多人套餐",
      description_zh: "套餐通常包含多种炸海鲜和薯条，适合两人或多人分享。具体内容可能按当天菜单板为准。",
      category: "套餐/分享",
      taste: ["咸香", "油炸", "适合分享"],
      cautions: ["海鲜过敏者避免", "可能含麸质", "具体内容需现场确认"],
      tags: ["套餐", "适合分享", "热门"],
      assumptions: ["来自地图照片中的菜单板，价格和组合可能已经变化。"],
      confidence: "中",
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
    menuSource: "官网 Food + Drinks 菜单",
    menuVerified: true,
    menuText: teaGardensHotelMenuText(),
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
    note: "Google Maps 菜单照片可见大量外带菜，适合先选好炸鱼薯条、汉堡和分享套餐。",
    tags: ["Fish And Chips", "快餐", "地图照片菜单"],
    hasMenu: true,
    menuSource: "Google Maps 菜单照片（约9个月前）",
    menuVerified: true,
    menuText: hookNCookMenuText(),
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

function hookNCookMenuText() {
  return [
    "Hamburger",
    "Steak sandwich",
    "Egg and bacon roll",
    "Chicken burger",
    "Fish burger",
    "Veggie burger",
    "Works burger",
    "Chips",
    "Gravy",
    "Chicken nuggets",
    "Potato scallop",
    "Hash brown",
    "Corn jack",
    "Pluto pup",
    "Chiko roll",
    "Battered sav",
    "Spring roll",
    "Dim sim",
    "Pineapple fritter",
    "Prawn cutlets",
    "Fish cocktails",
    "Fish cocktails and chips",
    "Seafood stick",
    "Tassie scallop",
    "Calamari rings",
    "Salt and pepper squid",
    "Fish cake",
    "Prawn twister",
    "Seafood cocktail",
    "Grilled barramundi and chips",
    "Tassie salmon and chips",
    "Seven pieces calamari and chips",
    "Tinny special",
    "Boatload special",
    "Meal deal for two",
    "Meal deal for four",
  ].join("\n");
}

function teaGardensHotelMenuText() {
  return [
    "Garlic Bread",
    "Smoked Chicken Wings",
    "Calamari Fritti",
    "Tea Gardens Asian Chicken Salad",
    "Poke Bowl",
    "Caesar Salad",
    "TGH Beef Burger",
    "Grilled Chicken Burger",
    "Crispy Fish Burger",
    "Chicken Parmigiana",
    "Fish & Chips",
    "Tea Gardens Famous Calamari Cone",
    "Tea Gardens Fish Cone",
    "Meat lovers pizza",
    "Hawaiian pizza",
    "Bangers & Mash",
    "Fish Burrito",
    "Supreme Beef Nachos",
    "Bolognese Linguine",
    "Margherita pizza",
    "Pepperoni pizza",
    "Veggie Supreme pizza",
    "Garlic Prawn pizza",
    "Chicken Nuggets",
    "Grilled Chicken Breast",
    "Battered Fish",
    "Bolognese Pasta",
    "Chocolate Lava Cake",
    "Pecan Pie",
    "Bowl of Chips",
    "Seasonal Vegetables",
    "Tea Gardens House Salad",
    "Mashed Potato & Gravy",
  ].join("\n");
}

const chatswoodRestaurants = [
  {
    id: "cw-khao-pla",
    name: "Khao Pla Chatswood",
    area: "Chatswood",
    address: "Shop 7/370-374 Victoria Avenue, Chatswood NSW 2067",
    rating: "4.6",
    userRatingCount: "2000+",
    note: "本地评价强，官网 PDF 菜单已整理，泰餐选择多，适合先看懂辣度、花生、海鲜和招牌菜。",
    curationReason: "入选原因：本地订单平台约 4.6 分、2000+ 评分；Tripadvisor 也长期排在 Chatswood 前列。",
    tags: ["泰餐", "本地好评", "官网菜单", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://khaopla.com.au/",
    menuSource: "官网 PDF 菜单（Khao Pla）",
    menuVerified: true,
    menuDishes: [
      { name_en: "Massaman beef cheek curry", name_zh: "玛莎曼慢炖牛脸肉咖喱", price: "$25", category: "咖喱/主菜", description_zh: "南泰风格咖喱，慢炖牛脸肉配罗望子和棕榈糖。通常浓郁、微甜、香料味明显，辣度比青咖喱温和。", taste: ["浓郁", "微甜", "香料味"], cautions: ["含牛肉", "可能含椰奶", "坚果/过敏需确认"], tags: ["泰餐", "咖喱", "相对稳"] },
      { name_en: "Gaeng Keaw Wan green curry chicken", name_zh: "泰式青咖喱鸡", price: "$25", category: "咖喱/主菜", description_zh: "鸡腿肉青咖喱，配泰国茄子、野姜、青柠叶、辣椒和罗勒。椰香明显，通常会辣。", taste: ["椰香", "香料味", "偏辣"], cautions: ["含鸡肉", "通常有辣椒", "可能含椰奶"], tags: ["泰餐", "咖喱", "需确认辣度"] },
      { name_en: "Gaeng Ngor confit duck curry", name_zh: "红咖喱油封鸭", price: "$29", category: "咖喱/主菜", description_zh: "油封鸭咖喱，菜单写有鸭血冻、红毛丹、菠萝、樱桃番茄和青柠叶。口味偏浓郁，带果香和甜酸感。", taste: ["浓郁", "果香", "微甜"], cautions: ["含鸭肉", "含鸭血冻", "辣度需确认"], tags: ["泰餐", "咖喱", "特色"] },
      { name_en: "Tom Yum banana prawn soup", name_zh: "冬阴功香蕉虾汤", price: "$30", category: "汤/海鲜", description_zh: "酸辣虾汤，配香茅、南姜、青柠叶和香菜。味道鲜、酸、辣都明显，不吃辣的人要提前说明。", taste: ["酸", "辣", "鲜味"], cautions: ["虾/海鲜过敏者避免", "通常偏辣", "有香菜"], tags: ["泰餐", "海鲜", "酸辣"] },
      { name_en: "Gaeng Pla Phuket curry with Coral trout and betel leaf", name_zh: "普吉珊瑚鳟鱼蒌叶咖喱", price: "$31", category: "咖喱/鱼类", description_zh: "普吉风格鱼咖喱，使用珊瑚鳟鱼和蒌叶。鱼肉鲜味明显，咖喱香料味较重。", taste: ["鲜味", "香料味", "可能偏辣"], cautions: ["鱼类过敏者避免", "辣度需确认"], tags: ["泰餐", "鱼类", "特色"] },
      { name_en: "Gai Yang char grilled turmeric lemongrass half chicken", name_zh: "姜黄香茅炭烤半鸡", price: "$18", category: "烤鸡/主菜", description_zh: "半只鸡用姜黄和香茅腌制后炭烤。相比咖喱更直接，适合想吃肉但不想太复杂的人。", taste: ["炭烤香", "香茅味", "咸香"], cautions: ["含鸡肉", "酱料辣度需确认"], tags: ["泰餐", "鸡肉", "相对安全"] },
      { name_en: "Kra Pao minced chicken with chilli and holy basil", name_zh: "泰式打抛辣炒鸡肉碎", price: "$21", category: "炒菜/主菜", description_zh: "鸡肉碎配辣椒和圣罗勒快炒，味道咸香、有罗勒香，通常偏辣。可加皮蛋。", taste: ["咸香", "罗勒香", "偏辣"], cautions: ["含鸡肉", "有辣椒", "加皮蛋需另点"], tags: ["泰餐", "下饭", "需确认辣度"] },
      { name_en: "Gai Nam Prik Pao chicken with cashew nut and chilli jam", name_zh: "腰果辣椒酱炒鸡", price: "$21", category: "炒菜/主菜", description_zh: "鸡肉配腰果、葱和泰式辣椒酱快炒。通常咸甜带微辣，适合配饭。", taste: ["咸甜", "坚果香", "微辣"], cautions: ["含腰果", "含鸡肉", "坚果过敏者避免"], tags: ["泰餐", "鸡肉", "坚果风险"] },
      { name_en: "Nua Pad Cha Pru beef with Phuket curry paste and betel leaf", name_zh: "普吉咖喱蒌叶炒牛肉", price: "$24", category: "炒菜/牛肉", description_zh: "牛肉配普吉咖喱酱、秋葵和蒌叶快炒。香料味重，适合能接受泰式香草味的人。", taste: ["香料味", "咸香", "可能偏辣"], cautions: ["含牛肉", "辣度需确认"], tags: ["泰餐", "牛肉", "特色"] },
      { name_en: "Kana Moo Krob crispy pork belly with Chinese broccoli", name_zh: "芥兰炒脆皮猪肉", price: "$24.5", category: "炒菜/猪肉", description_zh: "脆皮猪肉配芥兰和辣椒快炒。口味咸香、油脂感较重，很适合配饭。", taste: ["咸香", "肉香", "油脂感"], cautions: ["含猪肉", "有辣椒", "可能偏油"], tags: ["泰餐", "猪肉", "下饭"] },
      { name_en: "Crying Tiger Wagyu striploin", name_zh: "泰式烤和牛牛排", price: "$27", category: "牛排/主菜", description_zh: "伊森风格腌制和牛牛排，通常配泰式蘸酱。肉味明显，蘸酱可能酸辣。", taste: ["肉香", "炭烤香", "蘸酱酸辣"], cautions: ["含牛肉", "蘸酱辣度需确认"], tags: ["泰餐", "牛肉", "适合吃肉"] },
      { name_en: "Salt and Pepper Calamari with Tom Yum spice salt", name_zh: "冬阴功椒盐炸鱿鱼", price: "$19", category: "前菜/海鲜", description_zh: "炸鱿鱼配冬阴功香料盐，咸香、微辣，适合分享。", taste: ["咸香", "油炸", "微辣"], cautions: ["海鲜过敏者避免", "可能含麸质"], tags: ["海鲜", "适合分享", "前菜"] },
      { name_en: "Pla Tao Si fish fillets with black beans", name_zh: "豆豉炒鱼片", price: "$24", category: "鱼类/主菜", description_zh: "鱼片配豆豉、葱和韭葱快炒。味道偏咸香，有豆豉发酵香。", taste: ["咸香", "豆豉香", "鲜味"], cautions: ["鱼类过敏者避免", "可能含酱油"], tags: ["鱼类", "下饭"] },
      { name_en: "Pla Neung Manow steamed Basa fillet with chilli lime dressing", name_zh: "青柠辣汁蒸巴沙鱼", price: "$24", category: "鱼类/主菜", description_zh: "蒸巴沙鱼配白菜、芹菜、香菜和青柠辣汁。比炸物清爽，但酸辣味明显。", taste: ["酸", "辣", "清爽"], cautions: ["鱼类过敏者避免", "有辣椒", "有香菜"], tags: ["鱼类", "相对清爽"] },
      { name_en: "Yum Nashi Pear salad with crispy soft shell crab", name_zh: "水梨软壳蟹沙拉", price: "$28", category: "沙拉/海鲜", description_zh: "水梨沙拉配炸软壳蟹、香菜、椰丝、虾米、花生、辣椒和青柠汁。酸辣清爽但过敏点多。", taste: ["酸", "辣", "清爽"], cautions: ["蟹/海鲜过敏者避免", "含花生", "可能含虾米"], tags: ["海鲜", "沙拉", "花生风险"] },
      { name_en: "Hoy Pad Ped baby clam with Sriracha sauce", name_zh: "是拉差辣酱炒小蛤蜊", price: "$28", category: "贝类/主菜", description_zh: "小蛤蜊配自家是拉差辣酱和泰式罗勒快炒，可加煎面。鲜味明显，通常会辣。", taste: ["鲜味", "辣", "罗勒香"], cautions: ["贝类过敏者避免", "通常偏辣"], tags: ["海鲜", "贝类", "下饭"] },
      { name_en: "Yum Mango green mango salad with crispy whole fish", name_zh: "青芒果炸全鱼沙拉", price: "MP", category: "鱼类/沙拉", description_zh: "青芒果沙拉配当日炸全鱼、香菜、葱、花生和椰丝。酸爽开胃，鱼种和价格会按当天变化。", taste: ["酸", "鲜味", "脆口"], cautions: ["鱼类过敏者避免", "含花生", "价格需现场确认"], tags: ["鱼类", "当日供应", "分享"] },
      { name_en: "Makua Tord fried red curry battered eggplant", name_zh: "红咖喱炸茄子", price: "$14", category: "蔬菜/前菜", description_zh: "茄子裹红咖喱面糊油炸，配甜辣酱和花生。外脆内软，适合分享。", taste: ["甜辣", "油炸", "软糯"], cautions: ["含花生", "可能含麸质", "油炸"], tags: ["蔬菜", "前菜", "花生风险"] },
      { name_en: "Salt and Pepper Tofu and Mushroom", name_zh: "冬阴功椒盐豆腐蘑菇", price: "$18", category: "素食/前菜", description_zh: "炸豆腐和三种蘑菇，配冬阴功香料盐。咸香、微辣，适合不想吃肉的人。", taste: ["咸香", "菌菇香", "微辣"], cautions: ["可能含麸质", "可能与海鲜同厨房处理"], tags: ["豆腐", "蘑菇", "素食友好"] },
      { name_en: "Pad Pak mixed vegetables with tofu", name_zh: "豆腐炒杂菜", price: "$20", category: "素食/主菜", description_zh: "杂菜和豆腐配素蚝油快炒。口味比咖喱清淡，适合想吃蔬菜的人。", taste: ["咸香", "清淡"], cautions: ["酱汁成分需确认"], tags: ["蔬菜", "豆腐", "素食友好"] },
      { name_en: "Pad Thai chicken noodle with egg peanuts tamarind and dried shrimp", name_zh: "鸡肉泰式炒河粉", price: "$20", category: "米粉/主食", description_zh: "鸡肉炒河粉，配鸡蛋、花生、豆芽、罗望子、虾米和棕榈糖。酸甜咸香，属于泰餐常见安全菜。", taste: ["酸甜", "咸香"], cautions: ["含花生", "含鸡蛋", "可能含虾米"], tags: ["泰餐", "主食", "热门"] },
      { name_en: "Pad See Eiw flat rice noodle with chicken egg and Chinese broccoli", name_zh: "鸡肉酱油炒河粉", price: "$20", category: "米粉/主食", description_zh: "宽河粉配鸡肉、鸡蛋、黑酱油和芥兰快炒。比 Pad Thai 更咸香，不太酸甜。", taste: ["咸香", "酱香", "锅气"], cautions: ["含鸡蛋", "可能含酱油/麸质"], tags: ["泰餐", "主食", "相对安全"] },
      { name_en: "Kuy Teaw Kee Mao drunken noodles with chicken chilli and holy basil", name_zh: "鸡肉醉鬼炒河粉", price: "$20", category: "米粉/主食", description_zh: "宽河粉配鸡肉、鸡蛋、辣椒、白菜、竹笋和圣罗勒快炒。香气重，通常比普通炒河粉更辣。", taste: ["咸香", "罗勒香", "偏辣"], cautions: ["含鸡蛋", "有辣椒", "含鸡肉"], tags: ["泰餐", "主食", "需确认辣度"] },
      { name_en: "Khao Pad fried rice with chicken egg tomato and Chinese broccoli", name_zh: "鸡肉泰式炒饭", price: "$20", category: "米饭/主食", description_zh: "鸡肉、鸡蛋、番茄和芥兰炒饭。口味直接，适合老人、小孩或不想尝试太复杂味道的人。", taste: ["咸香", "锅气"], cautions: ["含鸡蛋", "含鸡肉"], tags: ["泰餐", "主食", "比较安全"] },
      { name_en: "Khao Pad Man Goong fried rice with banana prawns and shrimp paste", name_zh: "虾膏香蕉虾炒饭", price: "$28", category: "米饭/海鲜", description_zh: "炒饭配香蕉虾和辣虾膏。虾味和鲜味很明显，可能微辣。", taste: ["鲜味", "虾香", "可能微辣"], cautions: ["虾/海鲜过敏者避免", "可能含虾膏"], tags: ["海鲜", "炒饭"] },
      { name_en: "Goong Ob Woon Sen banana prawns with vermicelli noodles", name_zh: "粉丝焖香蕉虾", price: "$28", category: "粉丝/海鲜", description_zh: "香蕉虾配粉丝和中式芹菜砂锅焖制。鲜味重，粉丝会吸收酱汁。", taste: ["鲜味", "咸香"], cautions: ["虾/海鲜过敏者避免", "有芹菜"], tags: ["海鲜", "粉丝", "适合分享"] },
      { name_en: "Moo Grob Prik Khing crispy pork belly with red curry paste", name_zh: "红咖喱脆皮猪肉", price: "$25.5", category: "猪肉/主菜", description_zh: "脆皮猪肉配红咖喱酱、豆角和青柠叶快炒。肉香重，通常咸辣下饭。", taste: ["咸香", "肉香", "可能偏辣"], cautions: ["含猪肉", "可能偏油", "辣度需确认"], tags: ["泰餐", "猪肉", "下饭"] },
      { name_en: "Pla's Pork Ribs with tamarind sauce", name_zh: "泰式罗望子猪肋排", price: "$27", category: "招牌主菜", description_zh: "Khao Pla 招牌猪肋排，二次烹调后配罗望子酱。酸甜咸香、肉味重，适合喜欢肉类的人。", taste: ["酸甜", "肉香", "浓郁"], cautions: ["含猪肉", "酱汁成分需确认"], tags: ["招牌", "猪肉", "推荐"] },
      { name_en: "Steam Coral Trout with ginger and soy", name_zh: "姜葱豉油蒸珊瑚鳟鱼", price: "$31", category: "鱼类/主菜", description_zh: "珊瑚鳟鱼片配姜和酱油清蒸。比咖喱和炸物更清淡，适合想吃鱼的人。", taste: ["鲜味", "姜香", "清淡"], cautions: ["鱼类过敏者避免", "可能含酱油"], tags: ["鱼类", "相对清淡"] },
      { name_en: "Kids Meal fried rice or noodles with fried chicken wings", name_zh: "儿童餐：炒饭或面配炸鸡翅", price: "$17", category: "儿童餐", description_zh: "可选番茄炒饭或面，配炸鸡翅、煎蛋、蔬菜和橙汁。适合小孩或想点简单菜的人。", taste: ["咸香", "口味简单"], cautions: ["含鸡肉", "含鸡蛋", "油炸"], tags: ["儿童友好", "简单"] },
      { name_en: "Black Sticky Rice with Thai milk tea ice cream", name_zh: "黑糯米配泰奶冰淇淋", price: "$11", category: "甜点", description_zh: "温热黑糯米配茉莉西米、菠萝蜜、泰式奶茶冰淇淋和黑甘蔗糖浆。甜、糯、奶香明显。", taste: ["甜", "糯", "奶香"], cautions: ["含奶制品", "偏甜"], tags: ["甜点", "泰式", "适合饭后"] },
    ],
    menuText: [
      "Massaman beef cheek curry 25",
      "Gaeng Keaw Wan green curry chicken 25",
      "Gaeng Ngor confit duck curry 29",
      "Tom Yum banana prawn soup 30",
      "Gaeng Pla Phuket curry with Coral trout and betel leaf 31",
      "Gai Yang char grilled turmeric lemongrass half chicken 18",
      "Kra Pao minced chicken with chilli and holy basil 21",
      "Gai Nam Prik Pao chicken with cashew nut and chilli jam 21",
      "Nua Pad Cha Pru beef with Phuket curry paste and betel leaf 24",
      "Kana Moo Krob crispy pork belly with Chinese broccoli 24.5",
      "Crying Tiger Wagyu striploin 27",
      "Salt and Pepper Calamari with Tom Yum spice salt 19",
      "Pla Tao Si fish fillets with black beans 24",
      "Pla Neung Manow steamed Basa fillet with chilli lime dressing 24",
      "Yum Nashi Pear salad with crispy soft shell crab 28",
      "Hoy Pad Ped baby clam with Sriracha sauce 28",
      "Yum Mango green mango salad with crispy whole fish",
      "Makua Tord fried red curry battered eggplant 14",
      "Salt and Pepper Tofu and Mushroom 18",
      "Pad Pak mixed vegetables with tofu 20",
      "Kana Fai Dang Chinese broccoli with tofu and chilli 21",
      "Tao Hu Prik Khing tofu and mushroom with red curry paste 22",
      "Kra Pao Jay tofu and vegetables with holy basil 21",
      "Hed Pad Nam Man Hoy four mushrooms with mushroom sauce 21",
      "Pad Thai chicken noodle with egg peanuts tamarind and dried shrimp 20",
      "Pad See Eiw flat rice noodle with chicken egg and Chinese broccoli 20",
      "Kuy Teaw Kee Mao drunken noodles with chicken chilli and holy basil 20",
      "Khao Pad fried rice with chicken egg tomato and Chinese broccoli 20",
      "Biryani Thai style rice with braised beef 25",
      "Khao Pad Man Goong fried rice with banana prawns and shrimp paste 28",
      "Goong Ob Woon Sen banana prawns with vermicelli noodles 28",
      "Moo Grob Prik Khing crispy pork belly with red curry paste 25.5",
      "Pla's Pork Ribs with tamarind sauce 27",
      "Steam Coral Trout with ginger and soy 31",
      "Kids Meal fried rice or noodles with fried chicken wings 17",
      "Black Sticky Rice with Thai milk tea ice cream 11",
    ].join("\n"),
  },
  {
    id: "cw-mamak",
    name: "Mamak Chatswood",
    area: "Chatswood",
    address: "P9 & P10/1-5 Railway Street, Chatswood NSW 2067",
    rating: "4.1",
    userRatingCount: "400+",
    note: "本地老牌马来西亚餐，官网菜单和 Chatswood 点餐页可核验；适合练习 roti、咖喱、炒面和椰浆饭。",
    curationReason: "入选原因：评价量大、Tripadvisor 约 4.1 分且曾列 Chatswood 前排；不是最高分餐厅，后续可被更高评分餐厅替换。",
    tags: ["马来西亚餐", "本地老牌", "官网菜单", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://mamak.com.au/mamakmenu",
    menuSource: "Mamak 官网菜单 + Chatswood 点餐页",
    menuVerified: true,
    menuDishes: [
      { name_en: "Roti canai", name_zh: "原味印度煎饼 Roti Canai", price: "$11", category: "主食/小吃", description_zh: "Mamak 经典 roti，外层酥脆、里面松软，通常配两种咖喱蘸酱和辣参巴。适合第一次尝试。", taste: ["酥脆", "咖喱香", "可能微辣"], cautions: ["含麸质", "蘸酱可能偏辣"], tags: ["招牌", "适合分享", "相对安全"] },
      { name_en: "Roti telur", name_zh: "鸡蛋印度煎饼", price: "$12", category: "主食/小吃", description_zh: "在 roti 里加入鸡蛋，口感更厚实，味道温和。适合早餐感或不想太辣的人。", taste: ["蛋香", "酥软"], cautions: ["含鸡蛋", "含麸质"], tags: ["roti", "比较安全"] },
      { name_en: "Roti planta", name_zh: "黄油印度煎饼", price: "$12", category: "主食/小吃", description_zh: "黄油味更浓的 roti，口感更香更油润。适合喜欢奶香的人。", taste: ["黄油香", "酥脆"], cautions: ["含奶制品", "含麸质", "可能偏油"], tags: ["roti", "奶香"] },
      { name_en: "Roti bawang", name_zh: "洋葱印度煎饼", price: "$12", category: "主食/小吃", description_zh: "加入甜红洋葱的 roti，带洋葱甜味和香气。适合配咖喱蘸酱。", taste: ["洋葱香", "微甜", "酥脆"], cautions: ["含麸质"], tags: ["roti", "配咖喱"] },
      { name_en: "Roti telur bawang", name_zh: "鸡蛋洋葱印度煎饼", price: "$13", category: "主食/小吃", description_zh: "鸡蛋和洋葱版 roti，像更有层次的煎蛋饼，适合想吃扎实一点的人。", taste: ["蛋香", "洋葱香", "咸香"], cautions: ["含鸡蛋", "含麸质"], tags: ["roti", "比较顶饱"] },
      { name_en: "Murtabak chicken or lamb", name_zh: "鸡肉或羊肉夹馅煎饼", price: "$19", category: "主食/肉类", description_zh: "夹有香料肉、卷心菜、鸡蛋和洋葱的厚煎饼。可选鸡肉或羊肉，份量更扎实。", taste: ["香料味", "肉香", "咸香"], cautions: ["含鸡蛋", "含麸质", "肉类需选择"], tags: ["马来西亚餐", "主食", "适合分享"] },
      { name_en: "Chicken or Beef Satay", name_zh: "马来沙爹鸡肉或牛肉串", price: "", category: "烤串/前菜", description_zh: "炭烤鸡肉或牛肉串，配甜辣花生沙爹酱。适合分享，但花生过敏者不能点。", taste: ["炭烤香", "花生香", "甜辣"], cautions: ["含花生", "肉类需选择"], tags: ["招牌", "适合分享", "花生风险"] },
      { name_en: "Kari ayam", name_zh: "马来鸡肉咖喱", price: "$25", category: "咖喱/主菜", description_zh: "经典鸡肉咖喱，用现磨香料和大块土豆烹煮。适合配饭或 roti。", taste: ["咖喱香", "浓郁", "可能微辣"], cautions: ["含鸡肉", "辣度需确认"], tags: ["咖喱", "鸡肉", "配饭"] },
      { name_en: "Kari ikan", name_zh: "酸香鱼咖喱", price: "$27", category: "咖喱/鱼类", description_zh: "鱼咖喱，配番茄、秋葵和茄子，口味偏酸香。适合喜欢鱼和咖喱的人。", taste: ["酸香", "咖喱味", "鲜味"], cautions: ["鱼类过敏者避免", "辣度需确认"], tags: ["咖喱", "鱼类"] },
      { name_en: "Kari kambing", name_zh: "慢炖羊肉咖喱", price: "$27", category: "咖喱/羊肉", description_zh: "羊肉咖喱慢炖到软烂，菜单标注 spicy，通常比鸡肉咖喱更重口。", taste: ["浓郁", "羊肉香", "偏辣"], cautions: ["含羊肉", "通常偏辣"], tags: ["咖喱", "羊肉", "重口味"] },
      { name_en: "Kari sayur", name_zh: "马来素菜咖喱", price: "$22", category: "素食/咖喱", description_zh: "蔬菜咖喱，含扁豆、番茄、胡萝卜、土豆、长豆和茄子。适合不吃肉的人。", taste: ["咖喱香", "蔬菜甜味"], cautions: ["辣度需确认"], tags: ["素食友好", "咖喱"] },
      { name_en: "Sambal udang", name_zh: "参巴辣炒虎虾", price: "$30", category: "海鲜/主菜", description_zh: "虎虾用火辣参巴酱快炒，虾味明显，通常偏辣。", taste: ["辣", "鲜味", "参巴香"], cautions: ["虾/海鲜过敏者避免", "通常偏辣"], tags: ["海鲜", "重口味"] },
      { name_en: "Sambal sotong", name_zh: "参巴辣炒鱿鱼", price: "$26", category: "海鲜/主菜", description_zh: "鱿鱼配火辣参巴酱快炒。口感有嚼劲，味道偏辣。", taste: ["辣", "咸香", "海鲜味"], cautions: ["海鲜过敏者避免", "通常偏辣"], tags: ["海鲜", "参巴"] },
      { name_en: "Ayam goreng", name_zh: "马来香料炸鸡", price: "$24 for 4", category: "炸鸡/主菜", description_zh: "马来西亚风味炸鸡，用香草和香料腌制。适合不想吃咖喱但想吃肉的人。", taste: ["香料味", "油炸", "咸香"], cautions: ["含鸡肉", "油炸", "可能含麸质"], tags: ["炸鸡", "比较安全"] },
      { name_en: "Ayam berempah", name_zh: "香料炒鸡块", price: "$25", category: "鸡肉/主菜", description_zh: "小块鸡肉配完整香料快炒，香料味比普通炸鸡更明显。", taste: ["香料味", "咸香"], cautions: ["含鸡肉", "辣度需确认"], tags: ["鸡肉", "配饭"] },
      { name_en: "Kangkung belacan", name_zh: "虾酱炒空心菜", price: "$21", category: "蔬菜/配菜", description_zh: "空心菜配辣椒和马来虾酱快炒，味道咸香、虾酱味明显。", taste: ["咸香", "虾酱味", "可能微辣"], cautions: ["含虾酱", "海鲜过敏者避免"], tags: ["蔬菜", "下饭"] },
      { name_en: "Kacang panjang belacan", name_zh: "虾酱炒长豆", price: "$21", category: "蔬菜/配菜", description_zh: "长豆配辣椒和虾酱快炒，口感脆，适合配饭。", taste: ["咸香", "脆口", "虾酱味"], cautions: ["含虾酱", "海鲜过敏者避免"], tags: ["蔬菜", "下饭"] },
      { name_en: "Rojak", name_zh: "马来罗惹沙拉", price: "$22", category: "沙拉/分享", description_zh: "马来西亚沙拉，含虾和椰子炸物、炸豆腐、水煮蛋、沙葛、黄瓜和浓稠辣花生酱。过敏点较多。", taste: ["甜辣", "花生香", "脆口"], cautions: ["含花生", "含虾", "含鸡蛋"], tags: ["沙拉", "适合分享", "花生风险"] },
      { name_en: "Nasi Lemak", name_zh: "椰浆饭", price: "$14", category: "米饭/主食", description_zh: "马来西亚代表菜，椰香米饭配参巴、花生、脆江鱼仔、黄瓜和水煮蛋。可加咖喱或炸鸡。", taste: ["椰香", "咸香", "可能微辣"], cautions: ["含花生", "含鸡蛋", "可能含鱼干"], tags: ["招牌", "主食", "可加肉"] },
      { name_en: "Mee goreng", name_zh: "马来炒福建面", price: "$19", category: "炒面/主食", description_zh: "辣炒福建面，含鸡蛋、虾、鱼饼和豆芽。味道咸香偏辣。", taste: ["咸香", "锅气", "偏辣"], cautions: ["含虾/海鲜", "含鸡蛋", "含麸质"], tags: ["炒面", "热门"] },
      { name_en: "Maggi goreng", name_zh: "马来炒 Maggi 面", price: "$19", category: "炒面/主食", description_zh: "用 Maggi 方便面做的炒面版本，口味更街头、更重口。", taste: ["咸香", "锅气", "可能偏辣"], cautions: ["含麸质", "配料需确认"], tags: ["炒面", "街头风味"] },
      { name_en: "Nasi goreng", name_zh: "马来炒饭", price: "$19", category: "炒饭/主食", description_zh: "马来炒饭，配辣参巴、鸡蛋、虾、四季豆和蔬菜，撒炸葱。", taste: ["咸香", "锅气", "可能偏辣"], cautions: ["含虾", "含鸡蛋"], tags: ["炒饭", "主食"] },
      { name_en: "Ais kacang", name_zh: "马来红豆刨冰", price: "$11", category: "甜点", description_zh: "刨冰甜点，含红豆、玉米、仙草、玫瑰糖浆和炼奶。甜度高，适合饭后分享。", taste: ["甜", "冰凉", "奶香"], cautions: ["含奶制品", "偏甜"], tags: ["甜点", "冰品"] },
      { name_en: "Cendol", name_zh: "煎蕊冰", price: "$11", category: "甜点", description_zh: "班兰粉条配椰奶、椰糖浆、红豆和刨冰。椰香重，甜度较高。", taste: ["椰香", "甜", "冰凉"], cautions: ["含椰奶", "偏甜"], tags: ["甜点", "马来西亚经典"] },
    ],
    menuText: [
      "Roti canai",
      "Roti telur",
      "Roti planta",
      "Roti bawang",
      "Roti telur bawang",
      "Murtabak chicken or lamb",
      "Chicken or Beef Satay",
      "Kari ayam",
      "Kari ikan",
      "Kari kambing",
      "Kari sayur",
      "Sambal udang",
      "Sambal sotong",
      "Ayam goreng",
      "Ayam berempah",
      "Kangkung belacan",
      "Kacang panjang belacan",
      "Rojak",
      "Nasi Lemak",
      "Mee goreng",
      "Maggi goreng",
      "Nasi goreng",
      "Ais kacang",
      "Cendol",
    ].join("\n"),
  },
  {
    id: "cw-sunday-seoul",
    name: "Sunday Seoul",
    area: "Chatswood",
    address: "Shop 2, 7 Help Street, Chatswood NSW 2067",
    rating: "4.6",
    userRatingCount: "440+",
    note: "本地评价强的韩式 casual bar & dining，官网和官网 PDF 菜单可核验；适合看懂韩式汤锅、煎饼、炸鸡和分享菜。",
    curationReason: "入选原因：本地外卖平台约 4.6 分、440+ 评分；第三方页面也显示 Google 约 4.5 分。",
    tags: ["韩餐", "本地好评", "官网菜单", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://sundayseoul.com.au/",
    menuSource: "Sunday Seoul 官网菜单 PDF",
    menuVerified: true,
    menuDishes: [
      { name_en: "Spicy Tomato Mussel Stew", name_zh: "辣番茄鲜青口鱿鱼汤", price: "$36", category: "汤锅/海鲜", description_zh: "鲜青口和鱿鱼煮在辣番茄汤底里。酸辣、海鲜味明显，吃完汤可加意面。", taste: ["酸辣", "番茄味", "海鲜鲜味"], cautions: ["含青口/鱿鱼", "通常偏辣", "可加意面 $7"], tags: ["招牌汤锅", "海鲜", "适合分享"] },
      { name_en: "Clam & Prawn Stew", name_zh: "蛤蜊鲜虾汤锅", price: "$33", category: "汤锅/海鲜", description_zh: "蛤蜊和虾煮成的清鲜汤锅，比辣番茄汤更直接，适合喜欢海鲜汤的人。", taste: ["鲜味", "清爽", "海鲜味"], cautions: ["含蛤蜊/虾", "可加意面 $7"], tags: ["海鲜", "汤锅", "适合分享"] },
      { name_en: "Homemade Hamburg Steak", name_zh: "自制芝士汉堡排饭", price: "$29", category: "肉类/主食", description_zh: "自制汉堡肉排，配芝士、烤蔬菜和米饭。口味比较稳，适合不想吃太辣的人。", taste: ["肉香", "芝士香", "咸香"], cautions: ["含牛/肉类成分需确认", "含奶制品"], tags: ["主食", "相对安全", "不偏辣"] },
      { name_en: "Minari Pancake w dried shrimp", name_zh: "水芹干虾韩式煎饼", price: "$26", category: "煎饼/分享", description_zh: "水芹菜和干虾做的韩式煎饼，外脆内软，有草本香和虾的鲜味。", taste: ["香脆", "水芹香", "虾鲜味"], cautions: ["含虾", "可能含麸质/鸡蛋"], tags: ["煎饼", "适合分享", "海鲜风险"] },
      { name_en: "Rose Tteokbokki", name_zh: "玫瑰酱韩式炒年糕", price: "$28", category: "年糕/分享", description_zh: "鱼饼、培根、香肠、年糕和粉丝做成的玫瑰酱年糕。奶香和辣味会比传统年糕更柔和。", taste: ["奶香", "微辣", "软糯"], cautions: ["含鱼饼", "含培根/香肠", "可能含奶制品"], tags: ["年糕", "适合分享", "热门"] },
      { name_en: "Squid Pancake", name_zh: "鱿鱼葱煎饼", price: "$26", category: "煎饼/海鲜", description_zh: "鱿鱼和葱做的韩式煎饼，口感香脆，有鱿鱼的嚼劲。", taste: ["香脆", "葱香", "海鲜味"], cautions: ["含鱿鱼", "可能含麸质/鸡蛋"], tags: ["煎饼", "海鲜", "适合分享"] },
      { name_en: "Wagyu Chili Mapo Tofu", name_zh: "和牛辣麻婆豆腐", price: "$28", category: "豆腐/牛肉", description_zh: "辣味麻婆豆腐，上面有切片和牛。适合想吃下饭菜的人，但通常会辣。", taste: ["辣", "豆腐嫩", "牛肉香"], cautions: ["含牛肉", "通常偏辣", "有香菜需确认"], tags: ["下饭", "豆腐", "辣味"] },
      { name_en: "Pad Thai w Sweet&spicy chicken", name_zh: "甜辣炸鸡泰式炒河粉", price: "$28", category: "面食/鸡肉", description_zh: "泰式炒河粉配韩式甜辣炸鸡，味道偏甜辣，份量感强。", taste: ["甜辣", "酸甜", "油炸香"], cautions: ["含鸡肉", "可能含花生/鸡蛋", "油炸"], tags: ["主食", "融合菜", "热门"] },
      { name_en: "Deep Fried Whole Chicken", name_zh: "韩式整只炸鸡", price: "$36", category: "炸鸡/分享", description_zh: "整只炸鸡配腌萝卜。适合几个人分享，口味比汤锅更容易接受。", taste: ["酥脆", "咸香", "油炸"], cautions: ["含鸡肉", "可能含麸质", "油炸"], tags: ["炸鸡", "适合分享", "相对安全"] },
      { name_en: "Deep Fried Boneless Chicken", name_zh: "韩式无骨炸鸡", price: "Half $22 / Whole $40", category: "炸鸡/分享", description_zh: "无骨炸鸡，可选原味、甜辣、酱油蒜香或墨西哥辣椒味。适合怕骨头麻烦的人。", taste: ["酥脆", "可选酱味", "可能辣"], cautions: ["含鸡肉", "可能含麸质", "辣味口味需确认"], tags: ["炸鸡", "无骨", "适合分享"] },
      { name_en: "Boneless Chicken Flavour Upgrade", name_zh: "无骨炸鸡口味升级", price: "Half $23 / Whole $42", category: "炸鸡/口味", description_zh: "无骨炸鸡加味版本，可选甜辣、酱油蒜香或墨西哥辣椒等口味。", taste: ["甜辣", "蒜香", "可选辣"], cautions: ["含鸡肉", "酱汁可能偏甜或偏辣"], tags: ["炸鸡", "可选口味"] },
      { name_en: "Gochujang Jjigae", name_zh: "韩式辣酱午餐肉牛肉乌冬锅", price: "$38", category: "汤锅/肉类", description_zh: "韩式辣酱汤，里面有午餐肉、牛肉片和乌冬面。味道重、辣度高，适合能吃辣的人。", taste: ["辣", "浓郁", "咸香"], cautions: ["含牛肉/午餐肉", "通常偏辣", "可加面 $5 或饭 $3"], tags: ["汤锅", "重口味", "下饭"] },
      { name_en: "Skewered Oden w cooked live mussel", name_zh: "鱼饼串青口汤锅", price: "$38", category: "汤锅/鱼饼", description_zh: "鱼饼串汤配煮青口，汤味鲜，适合想喝热汤和分享的人。", taste: ["鲜味", "鱼饼香", "热汤"], cautions: ["含鱼饼", "含青口", "可加面 $5 或饭 $3"], tags: ["汤锅", "适合分享", "海鲜风险"] },
    ],
    menuText: [
      "Spicy Tomato Mussel Stew 36",
      "Clam & Prawn Stew 33",
      "Homemade Hamburg Steak 29",
      "Minari Pancake w dried shrimp 26",
      "Rose Tteokbokki 28",
      "Squid Pancake 26",
      "Wagyu Chili Mapo Tofu 28",
      "Pad Thai w Sweet&spicy chicken 28",
      "Deep Fried Whole Chicken 36",
      "Deep Fried Boneless Chicken Half 22 Whole 40",
      "Deep Fried Boneless Chicken flavours Original Crispy Sweet&spicy Soy garlic Jalapeno Half 23 Whole 42",
      "Gochujang Jjigae 38 Noodle +5 Rice +3",
      "Skewered Oden w cooked live mussel 38 Noodle +5 Rice +3",
    ].join("\n"),
  },
  {
    id: "cw-kazuma",
    name: "Kazuma Chatswood",
    area: "Chatswood",
    address: "Shop 2-001A, 345 Victoria Avenue, Chatswood NSW 2067",
    rating: "4.7",
    userRatingCount: "19+",
    note: "新开的日餐，OpenTable 评价好，官网确认有刺身、寿司、Teishoku 定食、Donburi 和黑豚猪排。",
    curationReason: "入选原因：OpenTable 约 4.7 分；官网和 Chatswood Chase 页面确认菜单方向和地址。",
    tags: ["日餐", "本地好评", "官网菜单", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://www.kazuma.com.au/",
    menuSource: "Kazuma 官网 + OpenTable/Chatswood Chase 菜单信息",
    menuVerified: true,
    menuDishes: [
      { name_en: "Fresh Sashimi", name_zh: "新鲜刺身", price: "", category: "刺身/海鲜", description_zh: "生鱼片，重点是鱼的新鲜度和切片口感。适合能接受生食的人。", taste: ["鲜味", "清爽"], cautions: ["生食", "鱼类过敏者避免"], tags: ["日餐", "海鲜", "生食"] },
      { name_en: "Sushi Platter", name_zh: "寿司拼盘", price: "", category: "寿司/分享", description_zh: "多款寿司组合，适合第一次去时分享，也方便看懂不同鱼类和配料。", taste: ["鲜味", "米醋香"], cautions: ["可能含生鱼", "酱油含麸质"], tags: ["寿司", "适合分享"] },
      { name_en: "Teishoku Lunch Tray", name_zh: "日式定食套餐", price: "", category: "定食/午餐", description_zh: "日式套餐，一般包含主菜、米饭和小菜。适合老人或不想研究菜单的人。", taste: ["咸香", "均衡"], cautions: ["配菜每日可能变化"], tags: ["午餐", "相对安全"] },
      { name_en: "Donburi Rice Bowl", name_zh: "日式盖饭", price: "", category: "米饭/主食", description_zh: "主菜盖在米饭上，点餐简单，适合快速吃正餐。", taste: ["咸香", "酱汁味"], cautions: ["具体肉类需确认"], tags: ["主食", "简单"] },
      { name_en: "Kurobuta Pork Donkatsu", name_zh: "黑豚炸猪排", price: "", category: "猪肉/炸物", description_zh: "黑豚猪肉炸猪排，外层酥脆、肉味更浓。适合想吃稳妥肉类主菜的人。", taste: ["酥脆", "肉香"], cautions: ["含猪肉", "油炸", "可能含麸质"], tags: ["招牌", "猪肉", "炸物"] },
      { name_en: "Wagyu Beef Steak with Bone Marrow", name_zh: "和牛牛排配牛骨髓", price: "$56", category: "牛肉/主菜", description_zh: "和牛牛排配骨髓，肉味和油脂香会比较重。适合想吃高级肉类主菜的人。", taste: ["肉香", "油脂香", "浓郁"], cautions: ["含牛肉", "价格较高"], tags: ["牛肉", "推荐分享"] },
      { name_en: "Beef Sukiyaki", name_zh: "牛肉寿喜烧", price: "$26", category: "锅物/牛肉", description_zh: "日式甜咸酱汁煮牛肉和配菜，通常口味温和，适合不想吃生食的人。", taste: ["甜咸", "牛肉香", "温和"], cautions: ["含牛肉", "可能含鸡蛋"], tags: ["热菜", "相对安全"] },
      { name_en: "12pc Sushi Platter with Scallop", name_zh: "12 件扇贝寿司拼盘", price: "$56", category: "寿司/分享", description_zh: "12 件寿司拼盘，包含扇贝元素。适合两人分享或想一次试多款寿司。", taste: ["鲜味", "米醋香", "贝类鲜味"], cautions: ["可能含生食", "贝类过敏者避免"], tags: ["寿司", "分享"] },
      { name_en: "12pc Sashimi Platter", name_zh: "12 件刺身拼盘", price: "", category: "刺身/分享", description_zh: "多种生鱼片拼盘，重点是新鲜度。适合能接受生食的人，不适合孕妇或怕生食的人。", taste: ["鲜味", "清爽"], cautions: ["生食", "鱼类过敏者避免"], tags: ["刺身", "分享"] },
      { name_en: "Matcha Cheesecake", name_zh: "抹茶芝士蛋糕", price: "", category: "甜点", description_zh: "抹茶味芝士蛋糕，通常奶香浓、微苦微甜，适合饭后分享。", taste: ["抹茶香", "奶香", "甜"], cautions: ["含奶制品", "可能含麸质"], tags: ["甜点", "饭后"] },
    ],
    menuText: ["Fresh Sashimi", "Sushi Platter", "Teishoku Lunch Tray", "Donburi Rice Bowl", "Kurobuta Pork Donkatsu", "Wagyu Beef Steak with Bone Marrow 56", "Beef Sukiyaki 26", "12pc Sushi Platter with Scallop 56", "12pc Sashimi Platter", "Matcha Cheesecake"].join("\n"),
  },
  {
    id: "cw-bistro-kai",
    name: "Bistro Kai",
    area: "Chatswood",
    address: "316 Victoria Avenue, Chatswood NSW 2067",
    rating: "4.6",
    userRatingCount: "130+",
    note: "现代 bistro，OpenTable 评价好，官网晚餐菜单可核验，适合想吃西式/日式融合餐的人。",
    curationReason: "入选原因：OpenTable 约 4.6 分、132 人评价；官网菜单列出晚餐主菜和分享菜。",
    tags: ["Bistro", "本地好评", "官网菜单", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://www.kaiandmore.com.au/dinner-menu",
    menuSource: "Bistro Kai 官网 dinner menu",
    menuVerified: true,
    menuDishes: [
      { name_en: "Mussel Pasta", name_zh: "青口贝番茄海鲜意面", price: "", category: "意面/海鲜", description_zh: "青口贝、贝类高汤、番茄和香草做的意面。海鲜味明显，适合喜欢贝类的人。", taste: ["鲜味", "番茄味", "香草味"], cautions: ["贝类过敏者避免", "含麸质"], tags: ["海鲜", "意面"] },
      { name_en: "Chicken Maryland", name_zh: "香草酱鸡腿排", price: "", category: "鸡肉/主菜", description_zh: "鸡腿排配 chimichurri 和酸奶。比牛排更温和，酱汁带草本香。", taste: ["鸡肉香", "草本香", "微酸"], cautions: ["含鸡肉", "含奶制品"], tags: ["鸡肉", "相对安全"] },
      { name_en: "Wagyu Chuck Tail Flap", name_zh: "和牛牛排配第戎酱汁", price: "", category: "牛肉/主菜", description_zh: "MBS 6-7 和牛部位，配土耳其辣椒、第戎芥末和肉汁。肉味重，适合吃牛排。", taste: ["肉香", "浓郁", "微辣"], cautions: ["含牛肉", "芥末味"], tags: ["牛肉", "主菜"] },
      { name_en: "Pork Tomahawk", name_zh: "叉烧风味猪战斧", price: "", category: "猪肉/分享", description_zh: "500g 猪战斧，配叉烧风味和柠檬。份量大，适合两人以上分享。", taste: ["肉香", "甜咸", "柠檬清爽"], cautions: ["含猪肉", "份量大"], tags: ["分享菜", "猪肉"] },
      { name_en: "Koshihikari Risotto", name_zh: "越光米蘑菇橄榄烩饭", price: "", category: "素食/主菜", description_zh: "用越光米做的烩饭，配腌橄榄和蘑菇。适合不想吃肉的人。", taste: ["菌菇香", "咸香", "浓郁"], cautions: ["可能含奶制品"], tags: ["素食友好", "米饭"] },
      { name_en: "Carbonara", name_zh: "培根蛋黄芝士意面 Carbonara", price: "", category: "意面/猪肉", description_zh: "经典 carbonara 风格，官网写有 Pecorino Romano 和 guanciale。奶酪香和咸香明显。", taste: ["芝士香", "咸香", "浓郁"], cautions: ["含猪肉", "含奶制品", "含麸质"], tags: ["意面", "经典"] },
      { name_en: "Short Ribs", name_zh: "慢煮牛小排", price: "", category: "牛肉/分享", description_zh: "500g 牛小排，配苦菊/菊苣和肉汁。份量大，适合两人分享。", taste: ["肉香", "浓郁"], cautions: ["含牛肉", "份量大"], tags: ["分享菜", "牛肉"] },
      { name_en: "Westholme Wagyu T-bone", name_zh: "Westholme 和牛 T 骨牛排", price: "", category: "牛排/分享", description_zh: "600g MBS 6-7 和牛 T 骨，配肉汁和柠檬。价格和份量都偏高，适合分享。", taste: ["肉香", "油脂香", "浓郁"], cautions: ["含牛肉", "价格较高", "份量大"], tags: ["牛排", "分享"] },
      { name_en: "Sydney Rock Oysters", name_zh: "悉尼岩蚝", price: "", category: "海鲜/生蚝", description_zh: "生蚝，味道鲜甜带海水感。适合喜欢生食海鲜的人。", taste: ["鲜味", "海水味", "清爽"], cautions: ["生食", "贝类过敏者避免"], tags: ["海鲜", "生食"] },
      { name_en: "Tiramisu", name_zh: "提拉米苏", price: "", category: "甜点", description_zh: "咖啡和奶酪风味甜点，口感柔软，适合饭后分享。", taste: ["咖啡香", "奶香", "甜"], cautions: ["含奶制品", "含咖啡因"], tags: ["甜点", "饭后"] },
    ],
    menuText: ["Mussel Pasta", "Chicken Maryland", "Wagyu Chuck Tail Flap", "Pork Tomahawk", "Koshihikari Risotto", "Carbonara", "Short Ribs", "Westholme Wagyu T-bone", "Sydney Rock Oysters", "Tiramisu"].join("\n"),
  },
  {
    id: "cw-manpuku",
    name: "Manpuku Chatswood",
    area: "Chatswood",
    address: "226 Victoria Avenue, Chatswood NSW 2067",
    rating: "4.4",
    userRatingCount: "90+",
    note: "拉面店，本地评价稳定，官方站点确认 Chatswood 分店，外卖菜单有高点赞招牌拉面。",
    curationReason: "入选原因：Tripadvisor 约 4.4 分；Uber Eats 显示多款拉面有 96%+ 点赞。",
    tags: ["日式拉面", "本地好评", "菜单可核验", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://www.ramenmanpuku.com/",
    menuSource: "Manpuku 官网 + OpenTable/Uber Eats 菜单信息",
    menuVerified: true,
    menuDishes: [
      { name_en: "Long Name Ramen", name_zh: "招牌 Long Name 拉面", price: "$26", category: "拉面/招牌", description_zh: "Manpuku 招牌拉面，外卖平台显示点赞很高。适合第一次去不知道点什么的人。", taste: ["浓郁", "咸香", "豚骨感"], cautions: ["可能含猪肉", "含麸质"], tags: ["招牌", "拉面"] },
      { name_en: "Manpuku Red Ramen", name_zh: "Manpuku 红汤辣拉面", price: "$29", category: "拉面/辣味", description_zh: "红汤辣味拉面，适合能接受辣味和浓汤的人。", taste: ["辣", "浓郁"], cautions: ["可能偏辣", "可能含猪肉"], tags: ["辣味", "热门"] },
      { name_en: "Tonkotsu Shoyu Ramen", name_zh: "豚骨酱油拉面", price: "$24.50", category: "拉面/豚骨", description_zh: "经典豚骨酱油汤底，咸香浓郁，比辣拉面更稳。", taste: ["豚骨香", "酱油咸香"], cautions: ["含猪肉", "含麸质"], tags: ["经典", "相对安全"] },
      { name_en: "Gyokai Black Ramen", name_zh: "鱼介黑蒜油拉面", price: "$28", category: "拉面/鱼介", description_zh: "鱼介风味加黑蒜油，味道比普通豚骨更重，适合喜欢浓香的人。", taste: ["鱼介鲜味", "蒜香", "浓郁"], cautions: ["鱼类/海鲜成分需确认"], tags: ["特色", "浓汤"] },
      { name_en: "Karaage Chicken", name_zh: "日式炸鸡块", price: "$14.50", category: "小吃/鸡肉", description_zh: "日式炸鸡，外脆里嫩，适合配拉面分享。", taste: ["酥脆", "咸香"], cautions: ["含鸡肉", "油炸"], tags: ["小吃", "适合分享"] },
      { name_en: "Pork Gyoza", name_zh: "猪肉煎饺", price: "$6.50", category: "小吃/猪肉", description_zh: "日式煎饺，外皮煎香，里面是猪肉馅。适合配拉面。", taste: ["咸香", "煎香"], cautions: ["含猪肉", "含麸质"], tags: ["小吃", "适合分享"] },
      { name_en: "Octopus Karaage", name_zh: "炸章鱼块", price: "$8", category: "小吃/海鲜", description_zh: "章鱼裹粉油炸，有嚼劲，适合喜欢海鲜小吃的人。", taste: ["酥脆", "海鲜味"], cautions: ["海鲜过敏者避免", "油炸"], tags: ["海鲜", "小吃"] },
      { name_en: "Agedashi Tofu", name_zh: "日式炸豆腐", price: "$7", category: "豆腐/小吃", description_zh: "炸豆腐浸在日式酱汁里，外软内嫩，适合不想吃肉的人。", taste: ["豆香", "酱汁咸香"], cautions: ["可能含酱油/麸质"], tags: ["豆腐", "素食友好"] },
      { name_en: "Unagi Donburi", name_zh: "鳗鱼盖饭", price: "$31", category: "米饭/鱼类", description_zh: "烤鳗鱼配照烧酱盖在米饭上，甜咸鲜香，适合作为正餐。", taste: ["甜咸", "鱼香", "酱香"], cautions: ["鱼类过敏者避免"], tags: ["盖饭", "鱼类"] },
      { name_en: "Pumpkin Croquette", name_zh: "南瓜可乐饼", price: "$11.50", category: "小吃/素食", description_zh: "南瓜泥裹粉油炸，口感软糯微甜，适合不吃肉的人。", taste: ["微甜", "酥脆", "软糯"], cautions: ["油炸", "可能含麸质"], tags: ["素食友好", "小吃"] },
    ],
    menuText: ["Long Name Ramen 26", "Manpuku Red Ramen 29", "Tonkotsu Shoyu Ramen 24.50", "Gyokai Black Ramen 28", "Karaage Chicken 14.50", "Pork Gyoza 6.50", "Octopus Karaage 8", "Agedashi Tofu 7", "Unagi Donburi 31", "Pumpkin Croquette 11.50"].join("\n"),
  },
  {
    id: "cw-cafe-markus",
    name: "Cafe Markus",
    area: "Chatswood",
    address: "Shop 16/9 Spring Street, Chatswood NSW 2067",
    rating: "4.8",
    userRatingCount: "570+",
    note: "本地高分咖啡早午餐，适合老人、游客和刚来的学生先从简单英文菜单开始。",
    curationReason: "入选原因：Fantuan 约 4.8 分、571 条评价；Tripadvisor 也列在 Chatswood 前排。",
    tags: ["咖啡", "本地好评", "早午餐", "菜单可核验"],
    hasMenu: true,
    websiteUri: "https://www.tripadvisor.com/Restaurant_Review-g261607-d10353560-Reviews-Cafe_Markus-Chatswood_Willoughby_Greater_Sydney_New_South_Wales.html",
    menuSource: "Cafe Markus 公开菜单/点评信息",
    menuVerified: true,
    menuDishes: [
      { name_en: "Eggs Benedict", name_zh: "班尼迪克蛋", price: "", category: "早午餐/鸡蛋", description_zh: "水波蛋配荷兰酱，常见澳洲早午餐。口感 creamy，适合不想吃重口的人。", taste: ["蛋香", "奶油感"], cautions: ["含鸡蛋", "含奶制品"], tags: ["早午餐", "经典"] },
      { name_en: "Big Breakfast", name_zh: "澳式大早餐", price: "", category: "早午餐/拼盘", description_zh: "通常包含鸡蛋、培根/香肠、吐司和配菜。份量大，适合早午餐当正餐。", taste: ["咸香", "丰富"], cautions: ["可能含猪肉", "含麸质"], tags: ["份量大", "简单"] },
      { name_en: "Bacon Egg Roll", name_zh: "培根鸡蛋卷/汉堡", price: "", category: "早餐/简餐", description_zh: "培根和鸡蛋夹在面包里，点餐最简单，适合赶时间。", taste: ["咸香", "蛋香"], cautions: ["含猪肉", "含鸡蛋"], tags: ["简单", "早餐"] },
      { name_en: "Croissant", name_zh: "牛角包", price: "", category: "烘焙/轻食", description_zh: "法式酥皮面包，可配咖啡。适合只想吃一点的人。", taste: ["黄油香", "酥脆"], cautions: ["含奶制品", "含麸质"], tags: ["轻食", "咖啡搭配"] },
      { name_en: "Flat White", name_zh: "澳式奶咖 Flat White", price: "", category: "咖啡/饮品", description_zh: "澳洲常见奶咖，奶泡比 cappuccino 更细腻，咖啡味和奶香平衡。", taste: ["咖啡香", "奶香"], cautions: ["含奶制品，可问植物奶"], tags: ["咖啡", "澳洲常见"] },
      { name_en: "Smashed Avocado", name_zh: "牛油果吐司", price: "", category: "早午餐/吐司", description_zh: "牛油果压成泥放在吐司上，澳洲 cafe 很常见。口味清爽，适合不想吃肉的人。", taste: ["清爽", "牛油果香"], cautions: ["含麸质", "配料需确认"], tags: ["素食友好", "早午餐"] },
      { name_en: "Pancakes", name_zh: "松饼/煎饼", price: "", category: "甜口早午餐", description_zh: "偏甜的早午餐，通常配水果、糖浆或奶油。适合小孩或想吃甜的人。", taste: ["甜", "松软"], cautions: ["含鸡蛋", "含奶制品", "含麸质"], tags: ["儿童友好", "甜口"] },
      { name_en: "Chicken Schnitzel Sandwich", name_zh: "炸鸡排三明治", price: "", category: "三明治/鸡肉", description_zh: "炸鸡排夹面包，份量比普通吐司更大，适合作为午餐。", taste: ["酥脆", "咸香"], cautions: ["含鸡肉", "油炸", "含麸质"], tags: ["午餐", "简单"] },
      { name_en: "Salmon Bagel", name_zh: "烟熏三文鱼贝果", price: "", category: "贝果/鱼类", description_zh: "贝果夹烟熏三文鱼和奶油芝士类配料，适合喜欢清爽咸香口味的人。", taste: ["烟熏香", "咸香", "奶香"], cautions: ["鱼类过敏者避免", "含奶制品", "含麸质"], tags: ["鱼类", "早午餐"] },
      { name_en: "Iced Latte", name_zh: "冰拿铁", price: "", category: "咖啡/饮品", description_zh: "冰咖啡加牛奶，夏天常点。咖啡味比 flat white 更淡一些。", taste: ["咖啡香", "奶香", "冰凉"], cautions: ["含咖啡因", "含奶制品，可问植物奶"], tags: ["咖啡", "冷饮"] },
    ],
    menuText: ["Eggs Benedict", "Big Breakfast", "Bacon Egg Roll", "Croissant", "Flat White", "Smashed Avocado", "Pancakes", "Chicken Schnitzel Sandwich", "Salmon Bagel", "Iced Latte"].join("\n"),
  },
  {
    id: "cw-chimichuri",
    name: "Chimichuri",
    area: "Chatswood",
    address: "1/6 Help Street, Chatswood NSW 2067",
    rating: "4.5",
    userRatingCount: "50+",
    note: "Chatswood 本地热门 cafe，菜单有创意，适合想尝试澳式早午餐但怕看不懂菜名的人。",
    curationReason: "入选原因：Tripadvisor 约 4.5 分；公开菜单页和社媒可核验多款 brunch 菜。",
    tags: ["咖啡", "本地好评", "早午餐", "菜单可核验"],
    hasMenu: true,
    websiteUri: "https://chimichuri-chatswood.hey-restaurants.com/menu",
    menuSource: "Chimichuri 公开菜单页 + 社媒菜单信息",
    menuVerified: true,
    menuDishes: [
      { name_en: "Chimichuri Egg", name_zh: "Chimichuri 招牌蛋", price: "$20", category: "早午餐/鸡蛋", description_zh: "店名同款鸡蛋早午餐，通常是比较安全的 brunch 选择。", taste: ["蛋香", "咸香"], cautions: ["含鸡蛋"], tags: ["招牌", "早午餐"] },
      { name_en: "Black Benedict", name_zh: "黑色班尼迪克蛋", price: "$25", category: "早午餐/鸡蛋", description_zh: "创意版班尼迪克蛋，适合想尝试特色摆盘的人。", taste: ["蛋香", "浓郁"], cautions: ["含鸡蛋", "含奶制品"], tags: ["特色", "早午餐"] },
      { name_en: "Big Khahuna", name_zh: "Big Khahuna 大份早午餐", price: "$28", category: "早午餐/主食", description_zh: "大份量 brunch 菜，适合当正餐，不适合只想轻食的人。", taste: ["丰富", "咸香"], cautions: ["配料需现场确认"], tags: ["份量大", "主食"] },
      { name_en: "Seafood Tom Yum Linguine", name_zh: "冬阴功海鲜扁意面", price: "", category: "意面/海鲜", description_zh: "海鲜意面加冬阴功酸辣风味，味道比普通意面更重。", taste: ["酸辣", "海鲜味"], cautions: ["海鲜过敏者避免", "可能偏辣"], tags: ["特色", "海鲜"] },
      { name_en: "Matcha Green Tea Waffle", name_zh: "抹茶华夫饼", price: "", category: "甜品/早午餐", description_zh: "抹茶味华夫饼，偏甜，适合饭后或下午茶。", taste: ["甜", "抹茶香"], cautions: ["含麸质", "可能含奶制品"], tags: ["甜品", "下午茶"] },
      { name_en: "Smashed Avocado", name_zh: "牛油果吐司", price: "", category: "早午餐/吐司", description_zh: "牛油果吐司是 cafe 常见安全菜，适合不想吃肉或想点清爽早餐的人。", taste: ["清爽", "牛油果香"], cautions: ["含麸质", "配料需确认"], tags: ["素食友好", "简单"] },
      { name_en: "French Toast", name_zh: "法式吐司", price: "", category: "甜口早午餐", description_zh: "吐司裹蛋奶煎制，通常偏甜、口感柔软，适合下午茶。", taste: ["甜", "蛋奶香", "柔软"], cautions: ["含鸡蛋", "含奶制品", "含麸质"], tags: ["甜口", "下午茶"] },
      { name_en: "Soft Shell Crab Burger", name_zh: "软壳蟹汉堡", price: "", category: "汉堡/海鲜", description_zh: "炸软壳蟹夹汉堡，海鲜味和酥脆口感明显。", taste: ["酥脆", "海鲜味"], cautions: ["蟹类过敏者避免", "油炸", "含麸质"], tags: ["海鲜", "特色"] },
      { name_en: "Smoked Salmon Toast", name_zh: "烟熏三文鱼吐司", price: "", category: "早午餐/鱼类", description_zh: "烟熏三文鱼配吐司类底，咸香清爽，适合不想吃油炸的人。", taste: ["烟熏香", "咸香"], cautions: ["鱼类过敏者避免", "含麸质"], tags: ["鱼类", "清爽"] },
      { name_en: "Cold Brew Coffee", name_zh: "冷萃咖啡", price: "", category: "咖啡/饮品", description_zh: "冷泡咖啡，酸苦感比普通冰咖啡更柔和，适合喜欢咖啡味的人。", taste: ["咖啡香", "冰凉"], cautions: ["含咖啡因"], tags: ["咖啡", "冷饮"] },
    ],
    menuText: ["Chimichuri Egg 20", "Black Benedict 25", "Big Khahuna 28", "Seafood Tom Yum Linguine", "Matcha Green Tea Waffle", "Smashed Avocado", "French Toast", "Soft Shell Crab Burger", "Smoked Salmon Toast", "Cold Brew Coffee"].join("\n"),
  },
  {
    id: "cw-ooshman",
    name: "Ooshman Chatswood",
    area: "Chatswood",
    address: "Chatswood, NSW",
    rating: "4.6",
    userRatingCount: "340+",
    note: "黎巴嫩披萨/卷饼快餐，本地评价好，适合想吃简单、便宜、可打包的用户。",
    curationReason: "入选原因：EatClub 约 4.6 分、345 人评价；官网 Chatswood 分店页面有本地评价。",
    tags: ["黎巴嫩", "本地好评", "快餐", "菜单可核验"],
    hasMenu: true,
    websiteUri: "https://ooshman.au/locations/chatswood/",
    menuSource: "Ooshman 官网分店页 + 公开菜单信息",
    menuVerified: true,
    menuDishes: [
      { name_en: "Lahem w Jibne", name_zh: "牛羊肉芝士黎巴嫩披萨", price: "", category: "披萨/肉类", description_zh: "黎巴嫩风格肉馅加芝士薄饼，味道咸香，适合打包。", taste: ["肉香", "芝士香"], cautions: ["含肉类", "含奶制品", "含麸质"], tags: ["招牌", "快餐"] },
      { name_en: "Manoush", name_zh: "黎巴嫩薄饼 Manoush", price: "", category: "薄饼/主食", description_zh: "黎巴嫩薄饼，可做芝士、肉或香料口味。适合想点简单主食。", taste: ["面香", "咸香"], cautions: ["含麸质", "具体馅料需确认"], tags: ["主食", "简单"] },
      { name_en: "Wrap", name_zh: "黎巴嫩卷饼", price: "", category: "卷饼/主食", description_zh: "肉类或素菜卷进饼里，吃起来方便，适合边走边吃或打包。", taste: ["咸香", "酱汁味"], cautions: ["酱汁和肉类需选择"], tags: ["打包", "简单"] },
      { name_en: "Garlic Chicken Pizza", name_zh: "蒜香鸡肉披萨", price: "", category: "披萨/鸡肉", description_zh: "鸡肉和蒜香酱的薄饼/披萨，味道直接，适合不想冒险的人。", taste: ["蒜香", "鸡肉香"], cautions: ["含鸡肉", "含麸质"], tags: ["鸡肉", "相对安全"] },
      { name_en: "Chips", name_zh: "薯条", price: "", category: "配菜", description_zh: "炸薯条，适合小孩或配卷饼一起点。", taste: ["咸香", "酥脆"], cautions: ["油炸"], tags: ["小孩友好", "配菜"] },
      { name_en: "Zaatar Manoush", name_zh: "百里香芝麻薄饼", price: "", category: "薄饼/素食", description_zh: "黎巴嫩香料 zaatar 薄饼，味道像香草、芝麻和橄榄油。适合想吃素食轻食的人。", taste: ["香草味", "芝麻香", "咸香"], cautions: ["含麸质", "芝麻过敏者避免"], tags: ["素食友好", "经典"] },
      { name_en: "Cheese Manoush", name_zh: "芝士黎巴嫩薄饼", price: "", category: "薄饼/芝士", description_zh: "芝士薄饼，口味简单，适合小孩或不想吃肉的人。", taste: ["芝士香", "咸香"], cautions: ["含奶制品", "含麸质"], tags: ["儿童友好", "简单"] },
      { name_en: "Sujuk Pizza", name_zh: "辣香肠黎巴嫩披萨", price: "", category: "披萨/肉类", description_zh: "sujuk 是中东风味辣香肠，味道比普通肉馅更重。", taste: ["肉香", "香料味", "可能微辣"], cautions: ["含肉类", "辣度需确认", "含麸质"], tags: ["重口味", "快餐"] },
      { name_en: "Falafel Wrap", name_zh: "鹰嘴豆丸卷饼", price: "", category: "卷饼/素食", description_zh: "炸鹰嘴豆丸配蔬菜和酱料卷起来，适合不吃肉的人。", taste: ["豆香", "酱汁味", "咸香"], cautions: ["油炸", "芝麻酱/过敏需确认"], tags: ["素食友好", "打包"] },
      { name_en: "Chicken Tawouk Wrap", name_zh: "中东烤鸡卷饼", price: "", category: "卷饼/鸡肉", description_zh: "烤鸡肉卷饼，通常配蒜酱和蔬菜。比牛羊肉更温和。", taste: ["鸡肉香", "蒜香", "咸香"], cautions: ["含鸡肉", "蒜味明显"], tags: ["鸡肉", "相对安全"] },
    ],
    menuText: ["Lahem w Jibne", "Manoush", "Wrap", "Garlic Chicken Pizza", "Chips", "Zaatar Manoush", "Cheese Manoush", "Sujuk Pizza", "Falafel Wrap", "Chicken Tawouk Wrap"].join("\n"),
  },
  {
    id: "cw-gondola",
    name: "Gelateria Gondola",
    area: "Chatswood",
    address: "2/77 Archer Street, Chatswood NSW 2067",
    rating: "4.7",
    userRatingCount: "90+",
    note: "本地高分意式 gelato，适合饭后、老人小孩和游客，不需要复杂英文交流。",
    curationReason: "入选原因：Tripadvisor 约 4.7 分、96 条评价；Broadsheet 和官网都强调手工意式 gelato。",
    tags: ["甜品", "本地好评", "官网菜单", "真实菜单"],
    hasMenu: true,
    websiteUri: "https://gelateriagondola.com.au/",
    menuSource: "Gelateria Gondola 官网 + Tripadvisor/Broadsheet",
    menuVerified: true,
    menuDishes: [
      { name_en: "Gelato", name_zh: "意式冰淇淋 Gelato", price: "", category: "甜品/冰淇淋", description_zh: "意式冰淇淋，口感比普通冰淇淋更绵密。可以直接指口味点。", taste: ["甜", "奶香", "绵密"], cautions: ["多数口味含奶制品"], tags: ["招牌", "甜品"] },
      { name_en: "Sorbetti", name_zh: "水果雪葩 Sorbetti", price: "", category: "甜品/水果", description_zh: "水果型冰品，通常没有奶，口感清爽，适合不想吃奶制品的人。", taste: ["水果香", "清爽", "甜酸"], cautions: ["过敏需确认具体水果"], tags: ["清爽", "可能无奶"] },
      { name_en: "Cocco Pandan", name_zh: "椰子班兰口味 gelato", price: "", category: "甜品/特色口味", description_zh: "椰子和班兰香，带东南亚甜品风味。适合喜欢椰香的人。", taste: ["椰香", "班兰香", "甜"], cautions: ["可能含奶制品"], tags: ["特色", "椰香"] },
      { name_en: "Lychee Lampone", name_zh: "荔枝覆盆子口味", price: "", category: "甜品/水果", description_zh: "荔枝和覆盆子组合，通常果香明显、甜酸清爽。", taste: ["荔枝香", "莓果酸甜"], cautions: ["水果过敏需确认"], tags: ["水果", "清爽"] },
      { name_en: "Coffee", name_zh: "咖啡", price: "", category: "饮品", description_zh: "可搭配 gelato 的咖啡，适合下午茶。", taste: ["咖啡香"], cautions: ["含咖啡因"], tags: ["饮品", "下午茶"] },
      { name_en: "Pistachio Gelato", name_zh: "开心果意式冰淇淋", price: "", category: "甜品/坚果", description_zh: "开心果口味通常坚果香明显、甜度适中，是 gelato 店常见热门口味。", taste: ["坚果香", "奶香", "甜"], cautions: ["含坚果", "可能含奶制品"], tags: ["热门", "坚果"] },
      { name_en: "Dark Chocolate Gelato", name_zh: "黑巧克力意式冰淇淋", price: "", category: "甜品/巧克力", description_zh: "巧克力味更浓，甜度通常比普通巧克力口味低一点。", taste: ["巧克力香", "微苦", "甜"], cautions: ["可能含奶制品"], tags: ["经典", "巧克力"] },
      { name_en: "Hazelnut Gelato", name_zh: "榛子意式冰淇淋", price: "", category: "甜品/坚果", description_zh: "榛子味香浓，适合喜欢 Nutella 风味的人。", taste: ["榛子香", "奶香", "甜"], cautions: ["含坚果", "可能含奶制品"], tags: ["坚果", "经典"] },
      { name_en: "Lemon Sorbet", name_zh: "柠檬雪葩", price: "", category: "甜品/水果", description_zh: "柠檬味雪葩，酸甜清爽，适合饭后解腻。", taste: ["酸", "甜", "清爽"], cautions: ["酸味明显"], tags: ["清爽", "可能无奶"] },
      { name_en: "Affogato", name_zh: "咖啡浇冰淇淋 Affogato", price: "", category: "甜品/咖啡", description_zh: "热 espresso 淋在冰淇淋上，咖啡苦味和冰淇淋甜味混合。", taste: ["咖啡香", "甜", "微苦"], cautions: ["含咖啡因", "含奶制品"], tags: ["饭后", "咖啡"] },
    ],
    menuText: ["Gelato", "Sorbetti", "Cocco Pandan", "Lychee Lampone", "Coffee", "Pistachio Gelato", "Dark Chocolate Gelato", "Hazelnut Gelato", "Lemon Sorbet", "Affogato"].join("\n"),
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
      message: "Chatswood 只显示本地好评、非中文环境、菜单可核验的真实餐厅。",
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
  const dishes = payload.dishes || [];
  const restrictions = [...(payload.restrictions || []), payload.specialNotes || ""].filter(Boolean);
  const dishLines = dishes.map((dish) => `- ${dish.name_en || dish.name_zh}`).join("\n");
  const requestText = restrictions.join(", ") || "None";
  return {
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
  const foodWords = /\b(panna cotta|tiramisu|cake|tart|pudding|crumble|gelato|ice cream|sorbet|dessert|pistachio|chocolate|vanilla|caramel|berry|berries|lemon|apple|pear|fig|honey|oyster|prawn|shrimp|fish|chips|fresh catch|catch of the day|calamari|salmon|barramundi|seafood|crab|mussel|scallop|steak|beef|lamb|chicken|pork|duck|burger|sandwich|schnitzel|parmigiana|pizza|pasta|linguine|fettuccine|risotto|gnocchi|salad|soup|bread|toast|egg|eggs|omelette|benedict|pancake|waffle|bagel|avocado|mushroom|cheese|bao|bun|dumpling|wonton|noodle|ramen|gyoza|karaage|teriyaki|don|bibimbap|bulgogi|kimchi|fried chicken|japchae|pad thai|pad see eiw|kee mao|khao pad|biryani|curry|massaman|gaeng|tom yum|som tum|larb|papaya salad|sticky rice|roti|mango|betel|sriracha|tamarind)\b/i;
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
        <span>${item.createdAt}</span>
      </div>
    `).join("")
    : `<div class="history-item"><span>还没有记录。</span></div>`;
}

$("#sampleButton").addEventListener("click", () => {
  renderRestaurants(demoRestaurants, "这是示例餐厅。接入 Google Places key 后会显示真实附近餐厅。");
  selectRestaurant(demoRestaurants[0]);
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
renderRestaurants(demoRestaurants, "v39 已加载：已删除 Chatswood 练习餐厅，只保留真实餐厅。");
