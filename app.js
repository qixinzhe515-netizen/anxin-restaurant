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
  dishPages: [],
  dishPageIndex: 0,
  currentStep: 1,
  maxStepReached: 1,
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
    nameNote: "中文备注：本地西式小餐馆，适合鱼虾、披萨、牛羊肉和甜点。",
    area: "Sydney CBD",
    rating: "4.6",
    note: "适合第一次尝试本地西餐，菜单不复杂，有鱼、虾、披萨和甜点。",
    tags: ["适合老人", "可点安全菜", "英文压力低"],
    menu: sampleMenu,
  },
  {
    id: "cafe",
    name: "Northside Garden Cafe",
    nameNote: "中文备注：澳式咖啡早午餐，适合早餐、咖啡、吐司和轻食。",
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
    nameNote: "中文备注：意大利餐，适合披萨、意面、蒜蓉面包和家庭聚餐。",
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
  state.currentStep = step;
  state.maxStepReached = Math.max(state.maxStepReached, step);
  $$("[data-step]").forEach((panel) => panel.classList.toggle("active", panel.dataset.step === String(step)));
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
  state.dishPages = [];
  state.dishPageIndex = 0;
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

  $("#restaurantList").innerHTML = groupByDisplay(restaurants, restaurantDisplayGroup, restaurantGroupOrder)
    .map(({ group, items }) => `
      <section class="list-section">
        <div class="list-section-heading">
          <h3>${group}</h3>
          <span>${items.length} 家</span>
        </div>
        ${items.map((restaurant) => {
      const mapsUrl = restaurant.googleMapsUri || googleMapsSearchUrl(restaurant);
      const directionsUrl = googleMapsDirectionsUrl(restaurant);
      const menuLabel = menuStatusLabel(restaurant);
      return `
      <article class="restaurant-card ${restaurant.id === state.selectedRestaurantId ? "selected" : ""}" data-restaurant-id="${restaurant.id}">
        <div class="restaurant-top">
          <strong>${restaurant.name}</strong>
          <span class="rating">${restaurant.rating ? `★ ${restaurant.rating}` : "餐厅"}</span>
        </div>
        ${restaurant.nameNote ? `<p class="restaurant-name-note">${restaurant.nameNote}</p>` : ""}
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
    }).join("")}
      </section>
    `)
    .join("");

  $$("[data-restaurant-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const restaurant = restaurants.find((item) => item.id === button.dataset.restaurantSelect);
      selectRestaurant(restaurant);
    });
  });
}

function groupByDisplay(items, getGroup, preferredOrder = []) {
  const groups = new Map();
  items.forEach((item) => {
    const group = getGroup(item);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = preferredOrder.indexOf(a);
      const bi = preferredOrder.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b, "zh-Hans");
    })
    .map(([group, groupItems]) => ({ group, items: groupItems }));
}

const restaurantGroupOrder = ["泰餐/东南亚", "日餐/韩餐", "西式/融合", "咖啡早午餐", "快餐/轻食", "甜品/饮品", "其他餐厅"];

function restaurantDisplayGroup(restaurant = {}) {
  const text = `${restaurant.name || ""} ${restaurant.nameNote || ""} ${(restaurant.tags || []).join(" ")} ${restaurant.note || ""}`.toLowerCase();
  if (/gelato|冰淇淋|甜品|dessert|咖啡甜品/.test(text)) return "甜品/饮品";
  if (/cafe|咖啡|早午餐|brunch|breakfast/.test(text)) return "咖啡早午餐";
  if (/ooshman|黎巴嫩|快餐|卷饼|薄饼|打包|takeaway|fish and chips|炸鱼|外带/.test(text)) return "快餐/轻食";
  if (/bistro|西式|融合|牛排|意面|pub|酒吧餐|hotel|seafood|海鲜|golf club/.test(text)) return "西式/融合";
  if (/日餐|日本|拉面|寿司|刺身|韩餐|韩式|korean|japanese|ramen/.test(text)) return "日餐/韩餐";
  if (/泰餐|马来西亚|东南亚|thai|mamak|khao pla|咖喱|roti|沙爹/.test(text)) return "泰餐/东南亚";
  return "其他餐厅";
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
    setStep(3);
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
  setStep(3);
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
    setStep(3);
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
    setStep(3);
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
    nameNote: "中文备注：Tea Gardens Hotel，本地河边 pub/hotel 餐厅。适合炸鱼薯条、汉堡、鸡排、披萨和家庭聚餐。",
    area: "Tea Gardens",
    address: "Cnr Maxwell Street & Marine Drive, Tea Gardens",
    rating: "本地",
    note: "官网 Food + Drinks 菜单完整可查，是 Tea Gardens 区域优先样板店。",
    curationReason: "入选原因：OpenStreetMap 本地餐饮点；官网菜单可核验，适合先做高可信中文菜单。",
    tags: ["澳洲酒吧餐", "官网菜单", "真实菜单"],
    websiteUri: "https://teagardenshotel.com/food-drinks",
    hasMenu: true,
    menuSource: "官网 Food + Drinks 菜单",
    menuVerified: true,
    menuText: teaGardensHotelMenuText(),
    menuDishes: teaGardensHotelMenuDishes(),
  },
  {
    id: "known-mumms-seafood",
    name: "Mumm's Seafood",
    nameNote: "中文备注：Mumm's Seafood，河边海鲜餐厅。适合海鲜拼盘、当日鱼、炸鱼薯条和甜点。",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "本地",
    note: "官网可找到菜单入口；当前先整理官网确认代表菜和菜单页线索。",
    curationReason: "入选原因：OpenStreetMap 本地 seafood 餐厅；用户已确认官网有菜单页。",
    tags: ["Seafood", "官网菜单", "真实菜单"],
    websiteUri: "https://mummsonthemyall.com.au",
    hasMenu: true,
    menuSource: "官网菜单页 + 已知菜单文件",
    menuVerified: true,
    menuText: mummsSeafoodMenuText(),
    menuDishes: mummsSeafoodMenuDishes(),
  },
  {
    id: "known-hook-n-cook",
    name: "Hook'n Cook",
    nameNote: "中文备注：Hook'n Cook，本地 fish and chips 外带店。适合炸鱼薯条、汉堡、炸鱿鱼和多人套餐。",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "本地",
    note: "Google Maps 菜单照片可见大量外带菜，适合先选好炸鱼薯条、汉堡和分享套餐。",
    curationReason: "入选原因：OpenStreetMap 本地 fish and chips；用户提供的 Google Maps 菜单照片可读到主要售卖项。",
    tags: ["Fish And Chips", "快餐", "地图照片菜单", "真实菜单"],
    hasMenu: true,
    menuSource: "Google Maps 菜单照片（约9个月前）",
    menuVerified: true,
    menuText: hookNCookMenuText(),
    menuDishes: hookNCookMenuDishes(),
  },
  {
    id: "known-tillermans",
    name: "Tillermans Cafe - Restaurant",
    nameNote: "中文备注：Tillermans，Tea Gardens 咖啡/餐厅。适合咖啡、早午餐和轻食。",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "本地",
    note: "本地 cafe restaurant，适合不会英文的用户先作为轻食候选；暂无可靠线上菜单，不展示编造菜品。",
    curationReason: "入选原因：OpenStreetMap 本地 cafe/restaurant 点；菜单待核验。",
    tags: ["咖啡早午餐", "本地餐厅", "菜单待补"],
    hasMenu: false,
  },
  {
    id: "known-nicoles-art-gallery-cafe",
    name: "Nicole's Art Gallery and Cafe",
    nameNote: "中文备注：Nicole's Art Gallery and Cafe，艺术画廊咖啡馆。适合咖啡、蛋糕和轻食。",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "本地",
    note: "Tea Gardens 河边附近 cafe，适合老人或游客轻松尝试；暂无可靠线上菜单。",
    curationReason: "入选原因：OpenStreetMap 本地 cafe 点；菜单待核验。",
    tags: ["咖啡", "轻食", "菜单待补"],
    hasMenu: false,
  },
  {
    id: "known-mangrove-cafe",
    name: "Mangrove Cafe",
    nameNote: "中文备注：Mangrove Cafe，本地咖啡轻食店。适合早餐、咖啡和简单午餐。",
    area: "Tea Gardens",
    address: "83 Marine Drive, Tea Gardens",
    rating: "本地",
    note: "咖啡和轻食，适合先从简单菜单开始；暂无可靠线上菜单。",
    curationReason: "入选原因：OpenStreetMap 记录了具体地址；菜单待核验。",
    tags: ["咖啡/轻食", "本地餐厅", "菜单待补"],
    hasMenu: false,
  },
  {
    id: "known-jayz-at-the-myall",
    name: "Jayz At The Myall",
    nameNote: "中文备注：Jayz At The Myall，本地咖啡轻食店。适合早上咖啡和简餐。",
    area: "Tea Gardens",
    address: "Tea Gardens",
    rating: "本地",
    note: "OpenStreetMap 显示平日和周六营业时段；暂无可靠线上菜单。",
    curationReason: "入选原因：OpenStreetMap 本地 cafe 点；菜单待核验。",
    tags: ["咖啡", "轻食", "菜单待补"],
    hasMenu: false,
  },
  {
    id: "known-hawks-nest-golf-club-bistro",
    name: "Hawks Nest Golf Club Bistro",
    nameNote: "中文备注：Hawks Nest Golf Club Bistro，桥对面高尔夫俱乐部 bistro。适合家庭式西餐和本地 club 餐。",
    area: "Tea Gardens / Hawks Nest",
    address: "Sanderling Avenue, Hawks Nest",
    rating: "本地",
    note: "Hawks Nest 与 Tea Gardens 隔桥相连，适合作为同一区域候选；暂无可靠线上菜单。",
    curationReason: "入选原因：OpenStreetMap 本地 pub/bistro 点；距离 Tea Gardens 约几公里内。",
    tags: ["Bistro", "俱乐部餐", "菜单待补"],
    hasMenu: false,
  },
  {
    id: "known-benchmark-on-booner",
    name: "Benchmark on Booner",
    nameNote: "中文备注：Benchmark on Booner，Hawks Nest 本地餐厅。适合西式餐和度假区晚餐。",
    area: "Tea Gardens / Hawks Nest",
    address: "100 Booner Street, Hawks Nest",
    rating: "本地",
    note: "桥对面 Hawks Nest 餐厅，适合 Tea Gardens 周边一起推荐；暂无可靠线上菜单。",
    curationReason: "入选原因：OpenStreetMap 本地 restaurant 点；菜单待核验。",
    tags: ["西式/融合", "本地餐厅", "菜单待补"],
    hasMenu: false,
  },
  {
    id: "known-hawks-nest-takeaway",
    name: "Hawks Nest Takeaway",
    nameNote: "中文备注：Hawks Nest Takeaway，桥对面 seafood/fish and chips 外带店。适合炸鱼薯条和简单外带。",
    area: "Tea Gardens / Hawks Nest",
    address: "34 Tuloa Avenue, Hawks Nest",
    rating: "本地",
    note: "OpenStreetMap 标注 seafood takeaway；暂无可靠线上菜单。",
    curationReason: "入选原因：OpenStreetMap 本地 seafood takeaway 点；同属 Tea Gardens 近邻可达范围。",
    tags: ["Fish And Chips", "外带", "菜单待补"],
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

function mummsSeafoodMenuText() {
  return [
    "Fish of the day",
    "Fish and chips",
    "Seafood marinara",
    "Seafood mornay",
    "Mumm's Seafood Platter",
    "Pan-roasted chicken supreme",
    "Oven baked lamb rump",
    "Tenderloin of beef",
    "Oven-baked bread garlic or herb",
    "Chorizo salad",
    "Salmon tartare",
    "Miso butter prawn skewers",
    "Szechuan pepper squid",
    "Duck and portobello ravioli",
    "Sundried tomato and mozzarella arancini",
    "Natural oysters half dozen",
    "Kilpatrick oysters half dozen",
    "Ponzu and wakame oysters half dozen",
    "Sourdough toast",
    "Thick cut raisin toast",
    "Toasted banana bread",
    "Breakfast burger",
    "Poached eggs",
    "Bacon and eggs",
    "Eggs benedict",
    "Smashed avocado",
    "Indo breakfast",
    "Mumm's big breakkie",
    "Turkish delight panna cotta",
    "Citrus tart",
    "Chocolate espresso and hazelnut roulade",
    "Marmalade bread and butter pudding",
    "Affogato",
    "Take-away fish and chips",
    "Fisherman's basket",
    "Calamari and chips",
    "Whiting and chips",
    "Flathead and chips",
    "Orange roughy and chips",
    "Salt'n pepper squid and chips",
    "Hoki fillet",
    "Barramundi fillet",
    "Fish cocktail",
    "Calamari ring",
    "Prawn cutlet",
    "Potato scallop",
    "Seafood stick",
    "Chiko roll",
    "Spring roll",
    "Chips",
    "Garden salad",
    "Fish burger",
    "Chicken burger",
    "Beef burger",
    "Works burger",
    "Bacon and egg roll",
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

function tgDish(name_en, name_zh, category, description_zh, taste = [], cautions = [], tags = [], price = "") {
  return { name_en, name_zh, category, description_zh, taste, cautions, tags, price };
}

function teaGardensHotelMenuDishes() {
  return [
    tgDish("Garlic Bread", "蒜香面包", "前菜/小吃", "经典蒜香面包，可加芝士或火腿芝士。适合等主菜时分享。", ["蒜香", "酥脆"], ["含麸质", "加芝士会含奶制品"], ["适合分享", "安全菜"], "M $8 / NM $10"),
    tgDish("Smoked Chicken Wings", "烟熏鸡翅", "前菜/鸡肉", "店家腌制烟熏鸡翅，味道偏咸香，有烟熏味。", ["烟熏", "咸香"], ["含鸡肉", "酱料过敏需确认"], ["鸡肉", "前菜"], "M $22 / NM $24"),
    tgDish("Calamari Fritti", "意式炸鱿鱼", "前菜/海鲜", "炸鱿鱼配蒜香蛋黄酱、芝麻菜和柠檬。适合分享，但海鲜过敏者不要点。", ["酥脆", "海鲜味", "柠檬清爽"], ["含鱿鱼", "可能含蛋/麸质"], ["海鲜", "适合分享"], "M $20 / NM $22"),
    tgDish("Tea Gardens Asian Chicken Salad", "亚洲风味鸡肉沙拉", "沙拉/鸡肉", "混合生菜、卷心菜沙拉、香草和炸鸡，配甜粘亚洲风味酱和新鲜辣椒。", ["清爽", "甜咸", "可能微辣"], ["含鸡肉", "有辣椒", "酱料成分需确认"], ["沙拉", "鸡肉"], "M $27 / NM $29"),
    tgDish("Poke Bowl", "Poke 米饭碗", "沙拉/米饭", "糙米、毛豆、卷心菜胡萝卜沙拉、腌姜、照烧酱、海藻、芝麻蛋黄酱、牛油果等。", ["清爽", "照烧甜咸", "芝麻香"], ["含芝麻", "酱料可能含蛋/大豆"], ["可素食", "米饭"], "M $19 / NM $22"),
    tgDish("Caesar Salad", "凯撒沙拉配烤鸡", "沙拉/鸡肉", "罗马生菜、培根、蒜香面包丁、帕玛森芝士、水煮蛋和凯撒酱，配烤鸡。", ["芝士香", "咸香", "清爽"], ["含鸡肉", "含培根/猪肉", "含蛋/奶/麸质"], ["沙拉", "相对稳"], "M $24 / NM $27"),
    tgDish("TGH Beef Burger", "Tea Gardens 牛肉汉堡", "汉堡/牛肉", "牛肉饼、双份培根、芝士、甜菜根、生菜、番茄、焦糖洋葱和店家汉堡酱。", ["肉香", "咸甜", "酱香"], ["含牛肉", "含培根/猪肉", "含奶制品/麸质"], ["汉堡", "主食"], "M $25 / NM $27"),
    tgDish("Grilled Chicken Burger", "烤鸡汉堡", "汉堡/鸡肉", "烤鸡配芝士、卷心菜沙拉、酸黄瓜和烟熏辣椒蛋黄酱。", ["鸡肉香", "微辣", "酸爽"], ["含鸡肉", "含奶制品/麸质", "酱料可能微辣"], ["汉堡", "相对安全"], "M $25 / NM $27"),
    tgDish("Crispy Fish Burger", "脆炸鱼汉堡", "汉堡/鱼类", "炸鱼、生菜、番茄、红洋葱、甜菜根酱和塔塔酱。", ["酥脆", "鱼鲜味", "酸甜"], ["鱼类过敏者避免", "可能含蛋/麸质"], ["鱼类", "汉堡"], "M $25 / NM $27"),
    tgDish("House Crumbed Chicken Schnitzel", "店家炸鸡排", "Pub 经典/鸡肉", "裹粉炸鸡排，可配薯条沙拉或蔬菜。比带酱鸡帕玛更简单。", ["酥脆", "咸香"], ["含鸡肉", "含麸质", "油炸"], ["pub 经典", "安全菜"], "M $26 / NM $28"),
    tgDish("Chicken Parmigiana", "芝士番茄鸡排", "Pub 经典/鸡肉", "炸鸡排加 Napoli 番茄酱、火腿、马苏里拉和帕玛森芝士，配薯条沙拉或蔬菜。", ["芝士香", "番茄味", "咸香"], ["含鸡肉", "含火腿/猪肉", "含奶/麸质"], ["pub 经典", "份量足"], "M $30 / NM $32"),
    tgDish("Fish & Chips", "炸鱼薯条", "Pub 经典/鱼类", "炸鱼配薯条、沙拉、柠檬和塔塔酱。第一次去最稳的本地菜之一。", ["酥脆", "鱼鲜味", "咸香"], ["鱼类过敏者避免", "可能含麸质/蛋"], ["本地经典", "安全菜"], "M $27 / NM $29"),
    tgDish("Tea Gardens Famous Calamari Cone", "Tea Gardens 招牌鱿鱼杯", "Pub 经典/海鲜", "鱿鱼配薯条、柠檬和塔塔酱，用 cone 形式供应，适合轻松分享。", ["酥脆", "海鲜味"], ["含鱿鱼", "可能含麸质/蛋"], ["招牌", "海鲜"], "M $23 / NM $26"),
    tgDish("Tea Gardens Fish Cone", "Tea Gardens 炸鱼杯", "Pub 经典/鱼类", "炸鱼配薯条、柠檬和塔塔酱，比完整 Fish & Chips 更像小份/轻食。", ["酥脆", "鱼鲜味"], ["鱼类过敏者避免", "可能含麸质/蛋"], ["鱼类", "轻食"], "M $22 / NM $24"),
    tgDish("250g Hunter Reserve Rump", "250g Hunter Reserve 臀肉牛排", "主菜/牛肉", "250g 牛排，可配薯条沙拉或土豆蔬菜。适合想吃牛排的人。", ["肉香", "咸香"], ["含牛肉", "熟度需说明"], ["牛排", "主菜"], "M $32 / NM $34"),
    tgDish("Bangers & Mash", "香肠土豆泥", "主菜/香肠", "香肠配土豆泥、青豆和肉汁，是澳洲 pub 常见 comfort food。", ["肉香", "肉汁味", "浓郁"], ["含肉类/可能含猪肉", "含奶制品需确认"], ["pub 经典", "老人友好"], "M $24 / NM $27"),
    tgDish("Fish Burrito", "炸鱼卷饼", "主菜/鱼类", "炸鱼、卷心菜沙拉、生菜、辣椒、香草和蒜香蛋黄酱包在卷饼里。", ["酥脆", "清爽", "可能微辣"], ["鱼类过敏者避免", "有辣椒", "含麸质"], ["卷饼", "鱼类"], ""),
    tgDish("Supreme Beef Nachos", "牛肉玉米片", "主菜/牛肉", "牛猪肉碎、番茄莎莎、香菜、牛油果酱、酸奶油、芝士和墨西哥辣椒配玉米片。", ["芝士香", "咸香", "微辣"], ["含牛/猪肉", "含奶制品", "有香菜/辣椒"], ["适合分享", "重口味"], "M $26 / NM $28"),
    tgDish("Bolognese Linguine", "肉酱扁意面", "主菜/意面", "肉酱扁意面，配帕玛森芝士。适合不想冒险的人。", ["番茄肉酱", "芝士香"], ["含肉类", "含麸质/奶制品"], ["意面", "安全菜"], "M $26 / NM $28"),
    tgDish("Margherita Pizza", "玛格丽特披萨", "披萨", "番茄 Napoli 酱、fior di latte、马苏里拉和新鲜罗勒。简单经典。", ["番茄味", "芝士香", "罗勒香"], ["含奶制品", "含麸质"], ["披萨", "素食友好"], "M $25 / NM $28"),
    tgDish("Pepperoni Pizza", "辣香肠披萨", "披萨", "番茄酱、奶酪和 pepperoni。菜单写有芝麻菜，口味咸香。", ["咸香", "芝士香", "肉香"], ["含猪肉/加工肉", "含奶/麸质"], ["披萨", "肉类"], "M $27 / NM $29"),
    tgDish("Hawaiian Pizza", "夏威夷披萨", "披萨", "番茄酱、火腿、菠萝和马苏里拉。甜咸口，适合家庭分享。", ["甜咸", "芝士香"], ["含火腿/猪肉", "含奶/麸质"], ["披萨", "儿童友好"], "M $27 / NM $30"),
    tgDish("Meatlovers Pizza", "肉食披萨", "披萨", "BBQ 酱、火腿、pepperoni、意式香肠、腌鸡肉和马苏里拉。肉很多、口味重。", ["BBQ甜咸", "肉香", "浓郁"], ["含多种肉类/猪肉", "含奶/麸质"], ["披萨", "适合分享"], "M $29 / NM $32"),
    tgDish("Veggie Supreme Pizza", "蔬菜披萨", "披萨", "番茄酱、时令蔬菜和马苏里拉。适合不吃肉的人。", ["番茄味", "蔬菜清甜", "芝士香"], ["含奶/麸质", "蔬菜种类可能变化"], ["素食友好", "披萨"], "M $25 / NM $28"),
    tgDish("Garlic Prawn Pizza", "蒜香虾披萨", "披萨/海鲜", "番茄酱、腌虾、樱桃番茄、奶酪和芝麻菜。蒜香和虾味明显。", ["蒜香", "虾鲜味", "芝士香"], ["虾/海鲜过敏者避免", "含奶/麸质"], ["海鲜", "披萨"], "M $30 / NM $33"),
    tgDish("Chicken Nuggets", "儿童鸡块", "儿童餐", "儿童餐鸡块，配薯条和西瓜或胡萝卜黄瓜条。", ["酥脆", "咸香"], ["含鸡肉", "油炸", "可能含麸质"], ["儿童友好"], "M $12 / NM $14"),
    tgDish("Battered Fish", "儿童炸鱼", "儿童餐/鱼类", "儿童份炸鱼，配薯条和简单蔬果。", ["酥脆", "鱼鲜味"], ["鱼类过敏者避免", "油炸"], ["儿童友好", "鱼类"], "M $12 / NM $14"),
    tgDish("Bolognese Pasta", "儿童肉酱意面", "儿童餐/意面", "儿童份肉酱意面，味道通常比成人主菜更简单。", ["番茄肉酱", "温和"], ["含肉类", "含麸质"], ["儿童友好"], "M $12 / NM $14"),
    tgDish("Chocolate Lava Cake", "巧克力熔岩蛋糕", "甜点", "巧克力熔岩蛋糕配香草冰淇淋和巧克力酱，偏甜。", ["甜", "巧克力浓郁", "奶香"], ["含奶/蛋/麸质", "偏甜"], ["甜点"], "M $13 / NM $15"),
    tgDish("Pecan Pie", "山核桃派", "甜点", "山核桃派配香草冰淇淋和卡仕达酱，甜度较高、坚果香明显。", ["甜", "坚果香", "奶香"], ["含坚果", "含奶/蛋/麸质"], ["甜点", "坚果风险"], "M $12 / NM $15"),
    tgDish("Bowl of Chips", "一碗薯条", "配菜", "单点薯条，适合小孩或不确定点什么时加一份。", ["咸香", "酥脆"], ["油炸"], ["配菜", "安全菜"], "M $8 / NM $10"),
    tgDish("Seasonal Vegetables", "时令蔬菜", "配菜", "时令蔬菜，适合搭配牛排、鸡排或炸鱼。", ["清淡", "蔬菜味"], ["具体蔬菜会变化"], ["配菜", "素食友好"], "M $10 / NM $12"),
    tgDish("Tea Gardens House Salad", "店家沙拉", "配菜/沙拉", "生菜、番茄、黄瓜、红洋葱、橄榄和店家酱汁。", ["清爽", "酸香"], ["酱汁成分需确认"], ["配菜", "素食友好"], "M $10 / NM $12"),
    tgDish("Mashed Potato & Gravy", "土豆泥配肉汁", "配菜", "土豆泥配肉汁，适合老人和小孩，但肉汁可能含肉类高汤。", ["绵密", "肉汁咸香"], ["可能含奶制品", "肉汁可能含肉类"], ["配菜", "老人友好"], "M $10 / NM $12"),
  ];
}

function hookNCookMenuDishes() {
  return [
    tgDish("Hamburger", "普通汉堡", "汉堡", "外带店基础汉堡，适合想点简单主食的人。", ["肉香", "咸香"], ["肉类成分需现场确认", "含麸质"], ["汉堡", "简单"], "$12"),
    tgDish("Steak sandwich", "牛排三明治", "三明治/牛肉", "牛排夹面包，份量通常比普通三明治更扎实。", ["牛肉香", "咸香"], ["含牛肉", "含麸质"], ["牛肉", "主食"], "$16"),
    tgDish("Egg and bacon roll", "鸡蛋培根面包卷", "早餐/猪肉", "鸡蛋和培根夹面包卷，适合早餐或轻午餐。", ["咸香", "蛋香"], ["含培根/猪肉", "含蛋/麸质"], ["早餐", "简单"], "$9.50"),
    tgDish("Chicken burger", "鸡肉汉堡", "汉堡/鸡肉", "鸡肉汉堡，比海鲜类更适合不吃鱼虾的人。", ["鸡肉香", "咸香"], ["含鸡肉", "含麸质"], ["汉堡", "相对安全"], "$14"),
    tgDish("Fish burger", "炸鱼汉堡", "汉堡/鱼类", "炸鱼汉堡，适合想吃 fish and chips 但希望拿着吃的人。", ["酥脆", "鱼鲜味"], ["鱼类过敏者避免", "含麸质"], ["鱼类", "汉堡"], "$12"),
    tgDish("Veggie burger", "素食汉堡", "汉堡/素食", "素食汉堡，适合不吃肉的人；具体素饼成分需现场确认。", ["咸香", "蔬菜味"], ["可能含蛋/奶/麸质"], ["素食友好"], "$12"),
    tgDish("Works burger", "豪华汉堡", "汉堡", "加料版汉堡，照片菜单可见可加培根、芝士、菠萝等。适合胃口大的人。", ["丰富", "肉香", "咸甜"], ["可能含培根/猪肉", "含奶/麸质"], ["份量足"], "$16"),
    tgDish("Chips", "薯条", "炸物/配菜", "外带店基础薯条，可搭配肉汁。", ["咸香", "酥脆"], ["油炸"], ["配菜", "儿童友好"], "$4.50"),
    tgDish("Gravy", "肉汁酱", "酱汁", "肉汁酱，通常倒在薯条或土豆泥上。", ["咸香", "肉汁味"], ["可能含肉类高汤/麸质"], ["酱汁"], "$3"),
    tgDish("Chicken nuggets", "鸡块", "炸物/鸡肉", "鸡块，适合儿童或不想吃海鲜的人。", ["酥脆", "咸香"], ["含鸡肉", "油炸"], ["儿童友好"], "$0.80 each"),
    tgDish("Potato scallop", "炸土豆饼", "炸物/配菜", "澳洲 fish and chips 店常见炸土豆片/土豆饼。", ["酥脆", "土豆香"], ["油炸", "可能含麸质"], ["配菜"], "$2.50"),
    tgDish("Hash brown", "薯饼", "炸物/配菜", "炸薯饼，适合早餐或小吃。", ["酥脆", "土豆香"], ["油炸"], ["配菜"], "$2"),
    tgDish("Corn jack", "Corn Jack 炸玉米小吃", "炸物", "澳洲外带店常见冷冻炸物，里面通常是玉米/蔬菜馅。", ["酥脆", "甜咸"], ["可能含麸质/奶"], ["澳洲小吃"], "$4.50"),
    tgDish("Pluto pup", "炸热狗/玉米狗", "炸物/香肠", "裹粉炸香肠，类似 corn dog。", ["酥脆", "香肠味"], ["含肉类", "含麸质", "油炸"], ["澳洲小吃"], "$4.50"),
    tgDish("Chiko roll", "澳洲炸春卷 Chiko Roll", "炸物", "澳洲老式外带小吃，像厚春卷，里面通常有蔬菜和肉味馅。", ["酥脆", "咸香"], ["具体肉类需确认", "含麸质"], ["澳洲小吃"], "$4.50"),
    tgDish("Battered sav", "裹粉炸香肠", "炸物/香肠", "裹粉油炸的 saveloy 香肠，口味重。", ["酥脆", "香肠味"], ["含肉类", "含麸质", "油炸"], ["澳洲小吃"], "$4.50"),
    tgDish("Pineapple fritter", "炸菠萝圈", "炸物/甜口", "裹粉炸菠萝圈，甜口小吃。", ["甜", "酥脆", "果香"], ["含麸质", "油炸"], ["甜口", "小吃"], "$2"),
    tgDish("Prawn cutlets", "炸虾排", "海鲜炸物", "炸虾排，适合喜欢虾的人。", ["酥脆", "虾鲜味"], ["虾过敏者避免", "可能含麸质"], ["海鲜"], "$1.50 each"),
    tgDish("Fish cocktails", "炸鱼块", "鱼类炸物", "小块炸鱼，适合分享或小份尝试。", ["酥脆", "鱼鲜味"], ["鱼类过敏者避免", "可能含麸质"], ["鱼类", "适合分享"], "$4"),
    tgDish("Fish cocktails and chips", "炸鱼块配薯条", "鱼类/套餐", "炸鱼块加薯条，比单点炸鱼更像一餐。", ["酥脆", "鱼鲜味", "咸香"], ["鱼类过敏者避免", "油炸"], ["套餐", "安全菜"], "$18"),
    tgDish("Seafood stick", "海鲜棒", "海鲜炸物", "外带店常见海鲜棒，通常是鱼浆类制品。", ["咸香", "海鲜味"], ["鱼/海鲜过敏者避免"], ["海鲜小吃"], ""),
    tgDish("Tassie scallop", "塔州扇贝", "贝类炸物", "塔州扇贝，菜单照片里价格被遮挡/未清楚显示。", ["贝类鲜味"], ["贝类过敏者避免", "价格需现场确认"], ["贝类"], ""),
    tgDish("Calamari rings", "鱿鱼圈", "海鲜炸物", "炸鱿鱼圈，适合分享。", ["酥脆", "鱿鱼味"], ["鱿鱼过敏者避免", "可能含麸质"], ["海鲜", "适合分享"], "$1.20 each"),
    tgDish("Salt and pepper squid", "椒盐鱿鱼", "海鲜炸物", "椒盐鱿鱼，比普通鱿鱼圈更有调味。", ["咸香", "微椒香", "海鲜味"], ["鱿鱼过敏者避免", "可能含麸质"], ["海鲜"], "$5"),
    tgDish("Fish cake", "鱼饼", "鱼类炸物", "鱼肉制成的鱼饼，适合小吃或加在套餐里。", ["鱼鲜味", "咸香"], ["鱼类过敏者避免"], ["鱼类"], "$2.50"),
    tgDish("Prawn twister", "炸虾卷", "海鲜炸物", "虾类卷状炸物，适合喜欢虾味小吃的人。", ["酥脆", "虾鲜味"], ["虾过敏者避免"], ["海鲜"], "$4.50"),
    tgDish("Seafood cocktail", "海鲜小食拼", "海鲜炸物", "海鲜混合小食，具体组合需现场确认。", ["海鲜味", "酥脆"], ["海鲜过敏者避免", "内容需确认"], ["海鲜", "待确认"], "$5"),
    tgDish("Grilled barramundi and chips", "烤澳洲盲曹鱼配薯条", "鱼类/套餐", "烤 barramundi 配薯条，比炸鱼更清爽。", ["鱼鲜味", "较清爽"], ["鱼类过敏者避免"], ["鱼类", "少油一点"], "$22"),
    tgDish("Tassie salmon and chips", "塔州三文鱼配薯条", "鱼类/套餐", "塔州三文鱼配薯条，鱼味比白鱼更浓。", ["三文鱼香", "鱼鲜味"], ["鱼类过敏者避免"], ["鱼类"], "$22"),
    tgDish("Seven pieces calamari and chips", "7块鱿鱼配薯条", "海鲜/套餐", "7块鱿鱼加薯条，适合鱿鱼爱好者。", ["酥脆", "鱿鱼味"], ["鱿鱼过敏者避免", "油炸"], ["套餐", "海鲜"], "$15.50"),
    tgDish("Tinny special", "Tinny 小份海鲜炸物套餐", "海鲜/分享套餐", "照片菜单可见包含鱿鱼、盐胡椒鱿鱼、虾排、鱼块和小薯条，适合两人小分享。", ["酥脆", "海鲜味", "咸香"], ["海鲜过敏者避免", "油炸", "组合需现场核对"], ["分享", "热门"], "$24"),
    tgDish("Boatload special", "Boatload 大份海鲜炸物套餐", "海鲜/分享套餐", "照片菜单可见包含多份鱿鱼、盐胡椒鱿鱼、虾排、鱼块、塔塔酱和中薯，适合多人分享。", ["酥脆", "海鲜味", "份量大"], ["海鲜过敏者避免", "油炸", "组合需现场核对"], ["多人分享", "套餐"], "$42"),
    tgDish("Meal deal for two", "两人炸鱼薯条套餐", "套餐/分享", "2块鱼、2只虾排和薯条，适合两人简单点。", ["酥脆", "鱼鲜味", "虾鲜味"], ["鱼/虾过敏者避免", "油炸"], ["两人套餐"], "$31"),
    tgDish("Meal deal for four", "四人炸鱼海鲜套餐", "套餐/分享", "4块鱼、4只虾排、4个鱿鱼圈和薯条，适合四人分享。", ["酥脆", "海鲜味", "份量大"], ["鱼/虾/鱿鱼过敏者避免", "油炸"], ["四人套餐"], "$72"),
  ];
}

function mummsSeafoodMenuDishes() {
  return [
    tgDish("Fish of the day", "当日市场鲜鱼", "主菜/鱼类", "菜单写明看 specials board，当天鱼种和做法会变化。适合想吃本地鲜鱼的人。", ["鱼鲜味", "当天变化"], ["鱼类过敏者避免", "价格和鱼种需现场确认"], ["当日供应", "鱼类"], "MP"),
    tgDish("Fish and chips", "炸鱼薯条", "主菜/鱼类", "啤酒面糊炸 orange roughy，配花园沙拉和自制塔塔酱。", ["酥脆", "鱼鲜味", "咸香"], ["鱼类过敏者避免", "含麸质", "油炸"], ["安全菜", "本地经典"], "$29.9"),
    tgDish("Seafood marinara", "海鲜番茄白酒扁意面", "主菜/海鲜意面", "混合海鲜配白酒蒜香番茄 sugo 和 linguine。海鲜味明显，适合喜欢意面的人。", ["番茄味", "蒜香", "海鲜鲜味"], ["海鲜过敏者避免", "含麸质", "含酒香"], ["海鲜", "意面"], "$36.9"),
    tgDish("Seafood mornay", "奶油芝士焗海鲜", "主菜/海鲜", "鱼、鱿鱼、虾和青口放在奶油芝士酱里，配脆面包和花园沙拉。", ["奶香", "浓郁", "海鲜味"], ["海鲜过敏者避免", "含奶制品", "含麸质"], ["海鲜", "浓郁"], "$36.9"),
    tgDish("Mumm's Seafood Platter", "Mumm's 海鲜拼盘", "主菜/海鲜分享", "拼盘含生蚝、鲜虾、虾串、烤鱼、炸 orange roughy、四川鱿鱼、番茄辣青口、时令水果和薯条。", ["海鲜鲜味", "丰富", "适合分享"], ["海鲜过敏者避免", "有辣味元素", "组合可能随供应变化"], ["招牌", "分享", "推荐"], "1人 $80 / 2人 $150"),
    tgDish("Pan-roasted chicken supreme", "香煎鸡胸上腿肉", "主菜/鸡肉", "鸡肉配蒜香 speck 土豆、炒菠菜、甜玉米和百里香肉汁。比海鲜更稳。", ["鸡肉香", "草本香", "肉汁味"], ["含鸡肉", "speck 可能为猪肉", "GF"], ["不吃海鲜可选", "主菜"], "$32.9"),
    tgDish("Oven baked lamb rump", "摩洛哥香料烤羊臀肉", "主菜/羊肉", "羊臀肉配摩洛哥香料、茄子鹰嘴豆泥、烤胡萝卜和石榴。", ["羊肉香", "香料味", "微甜"], ["含羊肉", "GF", "香料味明显"], ["羊肉", "特色"], "$37.9"),
    tgDish("Tenderloin of beef", "牛柳配红酒汁", "主菜/牛肉", "牛柳配土豆泥、西兰花苗、辣根黄油和红酒汁。适合想吃牛排的人。", ["肉香", "黄油香", "红酒汁"], ["含牛肉", "含奶制品", "熟度需说明"], ["牛肉", "高级主菜"], "$47.9"),
    tgDish("Oven-baked bread garlic or herb", "烤蒜香/香草面包", "面包/前菜", "烤面包可选蒜香或香草味，适合等主菜时分享。", ["蒜香", "香草味", "酥脆"], ["含麸质", "可能含奶制品"], ["前菜", "适合分享"], "$13"),
    tgDish("Chorizo salad", "西班牙辣香肠沙拉", "沙拉/肉类", "chorizo、波斯 feta、蜂蜜胡萝卜、baby cos、生核桃和第戎芥末酱。", ["咸香", "微辣", "坚果香"], ["含猪肉香肠", "含奶制品", "含核桃"], ["沙拉", "重口一点"], "$25.9"),
    tgDish("Salmon tartare", "三文鱼塔塔", "前菜/生食海鲜", "生三文鱼配牛油果、烤芝麻、酱油姜汁。口感清爽但属于生食。", ["鲜味", "清爽", "姜香"], ["生食", "鱼类过敏者避免", "含芝麻/大豆"], ["前菜", "生食"], "$25.9"),
    tgDish("Miso butter prawn skewers", "味噌黄油虾串", "前菜/虾", "澳洲虾串配花椰菜慕斯和炸韭葱，味噌黄油味浓。", ["虾鲜味", "黄油香", "味噌咸香"], ["虾过敏者避免", "含奶制品", "GF"], ["虾", "前菜"], "$25.9"),
    tgDish("Szechuan pepper squid", "四川花椒鱿鱼", "前菜/海鲜", "鱿鱼配辣粉丝沙拉、蒜香酱油蘸酱。会有椒香和一点辣感。", ["椒香", "微辣", "海鲜味"], ["鱿鱼过敏者避免", "含大豆/可能含麸质"], ["海鲜", "有辣"], "$24.9"),
    tgDish("Duck and portobello ravioli", "鸭肉蘑菇意式饺", "前菜/意式饺", "鸭肉和 portobello 蘑菇 ravioli，配南瓜泥和橙味酱汁。", ["鸭肉香", "蘑菇香", "微甜"], ["含鸭肉", "含麸质", "可能含奶制品"], ["前菜", "特色"], "$25.9"),
    tgDish("Sundried tomato and mozzarella arancini", "日晒番茄马苏里拉炸饭团", "前菜/素食", "炸意式米饭团，含日晒番茄和 mozzarella，配松子和罗勒蒜香蛋黄酱。", ["芝士香", "番茄味", "酥脆"], ["含奶制品", "含松子", "可能含蛋"], ["素食", "前菜"], "$21.9"),
    tgDish("Natural oysters half dozen", "半打原味生蚝", "生蚝/海鲜", "Karuah NSW Latitude 31 oyster co 生蚝，原味吃最清爽。", ["鲜味", "海水味", "清爽"], ["生食", "贝类过敏者避免"], ["生蚝", "本地海鲜"], "$34.9"),
    tgDish("Kilpatrick oysters half dozen", "半打培根焗生蚝 Kilpatrick", "生蚝/海鲜", "生蚝加脆培根和 Kilpatrick 酱，比原味更咸香。", ["咸香", "培根味", "海鲜味"], ["贝类过敏者避免", "含培根/猪肉"], ["生蚝", "熟/焗风味"], "$39.9"),
    tgDish("Ponzu and wakame oysters half dozen", "半打柚子酱海藻生蚝", "生蚝/海鲜", "生蚝配 ponzu、海藻和青柠，酸鲜清爽。", ["酸鲜", "海藻味", "清爽"], ["生食", "贝类过敏者避免", "含大豆需确认"], ["生蚝", "清爽"], "$39.9"),
    tgDish("Sourdough toast", "酸面包吐司", "早餐", "酸面包配果酱、vegemite 或蜂蜜。早餐里最简单。", ["面包香", "可甜可咸"], ["含麸质", "可换无麸质需加价"], ["早餐", "简单"], "$10"),
    tgDish("Thick cut raisin toast", "厚切葡萄干吐司", "早餐", "两片厚切葡萄干吐司配黄油，偏甜。", ["甜", "黄油香", "肉桂/果干味"], ["含麸质", "含奶制品"], ["早餐", "甜口"], "$10"),
    tgDish("Toasted banana bread", "烤香蕉蛋糕", "早餐/甜点", "店家自制 banana bread，配黄油。适合配咖啡。", ["香蕉香", "甜", "黄油香"], ["含麸质", "含奶/蛋可能性高"], ["早餐", "咖啡搭配"], "$10"),
    tgDish("Breakfast burger", "早餐汉堡", "早餐/汉堡", "培根、鸡蛋、薯饼、芝士和番茄 relish 的早餐汉堡。", ["咸香", "芝士香", "蛋香"], ["含培根/猪肉", "含蛋/奶/麸质"], ["早餐", "份量足"], "$17"),
    tgDish("Poached eggs", "水波蛋酸面包", "早餐/鸡蛋", "散养水波蛋放在烤酸面包上。简单清淡。", ["蛋香", "清淡"], ["含蛋", "含麸质"], ["早餐", "简单"], "$15"),
    tgDish("Bacon and eggs", "培根鸡蛋早餐", "早餐/猪肉", "培根和鸡蛋配烤番茄、烤酸面包。", ["咸香", "蛋香"], ["含培根/猪肉", "含蛋/麸质"], ["早餐", "经典"], "$21"),
    tgDish("Eggs benedict", "班尼迪克蛋", "早餐/鸡蛋", "水波蛋、脆培根、荷兰酱和烤酸面包。酱汁浓郁。", ["蛋香", "奶油酸香", "咸香"], ["含蛋", "含培根/猪肉", "含奶/麸质"], ["早餐", "经典"], "$25"),
    tgDish("Smashed avocado", "牛油果酸面包", "早餐/素食", "牛油果泥配青柠、海盐、feta 和 dukkah，放在酸面包上。可加水波蛋。", ["清爽", "牛油果", "芝士咸香"], ["含奶制品", "dukkah 可能含坚果/芝麻"], ["早餐", "素食"], "$20"),
    tgDish("Indo breakfast", "印尼炒饭早餐", "早餐/米饭", "印尼炒饭配煎蛋、牛油果泥、辣椒、青柠和新鲜香草。可加培根。", ["咸香", "微辣", "香草味"], ["含蛋", "有辣椒", "加培根含猪肉"], ["早餐", "米饭"], "$22"),
    tgDish("Mumm's big breakkie", "Mumm's 大早餐", "早餐/拼盘", "水波蛋、脆培根、烤番茄、牛油果泥、小香肠、薯饼和酸面包。", ["丰富", "咸香", "份量足"], ["含蛋", "含培根/香肠", "含麸质"], ["早餐", "份量足"], "$27.5"),
    tgDish("Turkish delight panna cotta", "土耳其软糖风味意式奶冻", "甜点", "奶冻配波斯 fairy floss 和开心果碎，可做无麸质选项。", ["甜", "奶香", "软滑"], ["含奶制品", "含开心果", "偏甜"], ["甜点"], "$19"),
    tgDish("Citrus tart", "柑橘挞", "甜点", "柑橘挞配焦橙糖浆，酸甜口，比巧克力甜点更清爽。", ["酸甜", "橙香"], ["含麸质/奶/蛋可能性高"], ["甜点", "清爽"], "$18.5"),
    tgDish("Chocolate espresso and hazelnut roulade", "巧克力咖啡榛子卷", "甜点", "巧克力、espresso 和榛子 roulade，配巧克力淋酱。", ["巧克力", "咖啡香", "坚果香"], ["含榛子", "含咖啡因", "GF"], ["甜点", "坚果风险"], "$18.5"),
    tgDish("Marmalade bread and butter pudding", "橙酱面包黄油布丁", "甜点", "面包黄油布丁配橙子冰淇淋，温暖浓郁、偏甜。", ["甜", "黄油香", "橙香"], ["含麸质", "含奶/蛋"], ["甜点", "温热"], "$18.5"),
    tgDish("Affogato", "阿芙佳朵咖啡冰淇淋", "甜点/咖啡", "espresso、香草冰淇淋、biscotti，可选 Frangelico、Baileys、Kahlua 或 Tia Maria。", ["咖啡香", "奶香", "甜"], ["含咖啡因", "含奶制品", "可含酒精"], ["甜点", "成人"], "$21.5"),
    tgDish("Take-away fish and chips", "外带炸鱼薯条", "外带/鱼类", "外带菜单的炸鱼薯条，4块 hoki fish cocktails。", ["酥脆", "鱼鲜味"], ["鱼类过敏者避免", "油炸"], ["外带", "安全菜"], "$16.5"),
    tgDish("Fisherman's basket", "渔夫炸海鲜篮", "外带/海鲜套餐", "2块 hoki 鱼块、海鲜棒、4个鱿鱼圈、2个虾排和薯条。", ["酥脆", "海鲜味", "份量足"], ["海鲜过敏者避免", "油炸"], ["外带", "套餐"], "$23.8"),
    tgDish("Calamari and chips", "鱿鱼配薯条", "外带/海鲜", "鱿鱼加薯条，适合喜欢鱿鱼的人。", ["酥脆", "鱿鱼味"], ["鱿鱼过敏者避免", "油炸"], ["外带", "海鲜"], "$17.5"),
    tgDish("Whiting and chips", "牙鳕鱼配薯条", "外带/鱼类", "whiting 配薯条，鱼味相对温和。", ["鱼鲜味", "酥脆"], ["鱼类过敏者避免"], ["外带", "鱼类"], "$17"),
    tgDish("Flathead and chips", "扁头鱼配薯条", "外带/鱼类", "flathead 配薯条，是澳洲常见白肉鱼。", ["鱼鲜味", "酥脆"], ["鱼类过敏者避免"], ["外带", "鱼类"], "$17.5"),
    tgDish("Orange roughy and chips", "橙鲷鱼配薯条", "外带/鱼类", "orange roughy 配薯条，价格比普通鱼薯条高。", ["鱼鲜味", "酥脆"], ["鱼类过敏者避免"], ["外带", "鱼类"], "$22"),
    tgDish("Salt'n pepper squid and chips", "椒盐鱿鱼配薯条", "外带/海鲜", "椒盐鱿鱼加薯条，调味比普通炸鱿鱼更重。", ["咸香", "椒香", "鱿鱼味"], ["鱿鱼过敏者避免"], ["外带", "海鲜"], "$17.5"),
    tgDish("Hoki fillet", "Hoki 鱼柳", "外带/单点鱼", "单点 hoki 鱼柳，可选 grilled 或 crumbed 需加价。", ["鱼鲜味"], ["鱼类过敏者避免"], ["外带", "单点"], "$12"),
    tgDish("Barramundi fillet", "澳洲盲曹鱼柳", "外带/单点鱼", "单点 barramundi 鱼柳，比 hoki 更有本地鱼特色。", ["鱼鲜味"], ["鱼类过敏者避免"], ["外带", "单点"], "$16"),
    tgDish("Fish cocktail", "炸鱼块", "外带/小吃", "单个炸鱼块，适合加点或给孩子。", ["酥脆", "鱼鲜味"], ["鱼类过敏者避免"], ["外带", "小吃"], "$2.7 ea"),
    tgDish("Calamari ring", "鱿鱼圈", "外带/小吃", "单个鱿鱼圈，适合加点。", ["酥脆", "鱿鱼味"], ["鱿鱼过敏者避免"], ["外带", "小吃"], "$2.2 ea"),
    tgDish("Prawn cutlet", "炸虾排", "外带/小吃", "单个炸虾排，适合加到套餐里。", ["酥脆", "虾鲜味"], ["虾过敏者避免"], ["外带", "小吃"], "$3 ea"),
    tgDish("Potato scallop", "炸土豆饼", "外带/配菜", "澳洲 fish and chips 店常见炸土豆片。", ["酥脆", "土豆香"], ["油炸", "可能含麸质"], ["外带", "配菜"], "$2 ea"),
    tgDish("Seafood stick", "海鲜棒", "外带/小吃", "鱼浆类海鲜棒，适合加点。", ["咸香", "海鲜味"], ["鱼/海鲜过敏者避免"], ["外带", "小吃"], "$2.1 ea"),
    tgDish("Chiko roll", "澳洲炸春卷 Chiko Roll", "外带/小吃", "澳洲经典炸卷类小吃，具体馅料需现场确认。", ["酥脆", "咸香"], ["可能含肉类/麸质"], ["外带", "澳洲小吃"], "$6 ea"),
    tgDish("Spring roll", "春卷", "外带/小吃", "炸春卷，通常是蔬菜或混合馅。", ["酥脆", "咸香"], ["含麸质", "馅料需确认"], ["外带", "小吃"], "$6 ea"),
    tgDish("Chips", "薯条", "外带/配菜", "外带薯条，可选普通或大份。", ["酥脆", "咸香"], ["油炸"], ["外带", "配菜"], "Reg $7.7 / Large $10.5"),
    tgDish("Garden salad", "花园沙拉", "外带/沙拉", "简单花园沙拉，适合搭配炸物。", ["清爽"], ["酱汁成分需确认"], ["外带", "清爽"], "$7"),
    tgDish("Fish burger", "炸鱼汉堡", "外带/汉堡", "鱼肉汉堡，适合不想拿刀叉的人。", ["鱼鲜味", "酱香"], ["鱼类过敏者避免", "含麸质"], ["外带", "汉堡"], "$13.5"),
    tgDish("Chicken burger", "鸡肉汉堡", "外带/汉堡", "鸡肉汉堡，适合不吃海鲜的人。", ["鸡肉香", "咸香"], ["含鸡肉", "含麸质"], ["外带", "汉堡"], "$14.5"),
    tgDish("Beef burger", "牛肉汉堡", "外带/汉堡", "牛肉汉堡，份量比鱼汉堡更扎实。", ["牛肉香", "咸香"], ["含牛肉", "含麸质"], ["外带", "汉堡"], "$16"),
    tgDish("Works burger", "豪华汉堡", "外带/汉堡", "加料版汉堡，适合很饿或想吃丰富配料的人。", ["丰富", "肉香", "咸香"], ["含肉类", "含麸质/奶需确认"], ["外带", "份量足"], "$20"),
    tgDish("Bacon and egg roll", "培根鸡蛋面包卷", "外带/早餐", "培根和鸡蛋卷，适合早午餐或简单外带。", ["咸香", "蛋香"], ["含培根/猪肉", "含蛋/麸质"], ["外带", "早餐"], "$10.5"),
  ];
}

function chargrillCharliesStIvesDishes() {
  return [
    tgDish("Chargrilled chicken", "炭烤鸡", "主菜/鸡肉", "品牌官网确认的核心菜，适合家庭分享或搭配沙拉。", ["炭烤香", "鸡肉香"], ["含鸡肉"], ["安全菜", "家庭"], ""),
    tgDish("Whole chicken", "整只炭烤鸡", "主菜/分享", "适合一家人分着吃，通常搭配沙拉和配菜更完整。", ["炭烤香", "份量足"], ["含鸡肉"], ["家庭", "分享"], ""),
    tgDish("Half chicken", "半只炭烤鸡", "主菜/鸡肉", "比整鸡更适合一到两个人，点餐压力低。", ["炭烤香", "鸡肉香"], ["含鸡肉"], ["安全菜"], ""),
    tgDish("Chicken roll", "鸡肉面包卷", "轻食/鸡肉", "品牌官网确认 burgers & rolls，适合外带。", ["鸡肉香", "酱香"], ["含鸡肉", "含麸质"], ["外带"], ""),
    tgDish("Old Fashioned Roll", "经典老式鸡肉卷", "轻食/卷", "Chargrill Charlie's 社媒提到的经典 roll，通常是烤鸡和沙拉类夹馅。", ["清爽", "鸡肉香"], ["含鸡肉", "含麸质"], ["外带", "安全菜"], ""),
    tgDish("Schnitzel Roll", "炸鸡排卷", "轻食/炸鸡", "社媒提到的 schnitzel roll，口感更酥脆，适合想吃重一点的人。", ["酥脆", "鸡肉香"], ["含鸡肉", "含麸质", "油炸"], ["外带"], ""),
    tgDish("Burgers", "汉堡", "主食/汉堡", "品牌官网确认 burgers，适合想点简单主食的人。", ["咸香", "份量足"], ["含麸质", "具体肉类需确认"], ["安全菜"], ""),
    tgDish("Salads", "沙拉", "沙拉/配菜", "官网确认 salads，是烤鸡最常见搭配。", ["清爽"], ["酱汁需确认"], ["配菜", "轻食"], ""),
    tgDish("Sides", "配菜", "配菜", "搭配烤鸡或汉堡的小食，具体品类随门店变化。", ["咸香"], ["具体成分需确认"], ["配菜"], ""),
    tgDish("Gourmet catering", "家庭/聚会餐盘", "分享/聚会", "官网确认有 gourmet catering，适合多人聚餐但需要提前向店员确认。", ["份量足"], ["需提前确认"], ["分享", "家庭"], ""),
  ];
}

function charmedThaiDishes() {
  return [
    tgDish("Charmed sampler", "Charmed 前菜拼盘", "前菜/分享", "菜单写明包含 spring roll、chicken satay、steamed dumpling、crab prawns roll，适合两人分享。", ["丰富", "咸香"], ["含鸡肉", "含虾蟹", "可能含麸质"], ["分享", "前菜"], "$24.90"),
    tgDish("Spring roll", "春卷", "前菜/炸物", "泰式炸春卷，适合先点一个安全小吃。", ["酥脆", "咸香"], ["含麸质", "油炸"], ["前菜", "安全菜"], "$12.90"),
    tgDish("Curry puff", "咖喱角", "前菜/炸物", "咖喱馅炸酥角，通常带香料味但不一定很辣。", ["酥脆", "咖喱香"], ["含麸质", "油炸"], ["前菜"], "$12.90"),
    tgDish("Thai fish cake", "泰式鱼饼", "前菜/鱼类", "泰餐常见鱼饼，菜单标注中辣。", ["鱼鲜味", "香料味", "中辣"], ["鱼类过敏者避免", "有辣"], ["前菜", "泰餐经典"], "$13.90"),
    tgDish("Duck spring roll", "鸭肉春卷", "前菜/鸭肉", "鸭肉馅春卷，比普通春卷味道更重。", ["酥脆", "鸭肉香"], ["含鸭肉", "含麸质"], ["前菜"], "$13.90"),
    tgDish("Golden bag", "黄金袋", "前菜/炸物", "小袋状炸点心，适合分享。", ["酥脆", "咸香"], ["油炸", "馅料需确认"], ["前菜"], "$13.90"),
    tgDish("Crab prawns roll", "蟹虾卷", "前菜/海鲜", "菜单写明 deep fried net roll，馅料有蟹肉和虾肉，配 plum sauce。", ["酥脆", "虾蟹鲜味", "微甜"], ["虾蟹过敏者避免", "油炸"], ["海鲜", "前菜"], "$13.90"),
    tgDish("Steamed dumpling", "蒸饺", "前菜/点心", "菜单标注 Must Try，蒸制比炸物清淡。", ["咸香", "柔软"], ["馅料需确认", "可能含麸质"], ["前菜", "老人友好"], "$14.90"),
    tgDish("Chicken satay", "鸡肉沙爹串", "前菜/鸡肉", "鸡肉串配沙爹酱，适合不想吃辣的人，但花生风险要注意。", ["花生香", "鸡肉香"], ["含鸡肉", "可能含花生"], ["前菜", "安全菜"], "$15.90"),
    tgDish("Easy Fried Prawn Stick", "炸虾条", "前菜/虾", "菜单写明配 homemade sweet chilli sauce。", ["酥脆", "虾鲜味", "甜辣"], ["虾过敏者避免", "油炸"], ["海鲜", "前菜"], "$15.90"),
    tgDish("Sear bay scallops", "煎海湾扇贝", "前菜/海鲜", "4 个扇贝，可选 ginger and shallot 或 chilli lime coriander dressing。", ["扇贝鲜味", "清爽"], ["贝类过敏者避免"], ["海鲜"], "$16.90"),
    tgDish("Delicious crispy Thai's devil wing", "泰式魔鬼脆鸡翅", "前菜/鸡肉", "菜单标注 Must Try 和辣椒，适合能吃辣的人。", ["酥脆", "辣", "鸡肉香"], ["含鸡肉", "有辣"], ["前菜", "辣"], "$16.90"),
    tgDish("Green papaya salad", "青木瓜沙拉", "沙拉/泰餐", "菜单标注 Must Try，酸辣清爽。", ["酸辣", "清爽"], ["有辣", "可能含鱼露/花生"], ["沙拉", "泰餐经典"], "$17.90"),
    tgDish("Grilled prawn satay", "烤虾沙爹串", "前菜/虾", "菜单标注 Chef Recommended，虾配沙爹风味。", ["虾鲜味", "花生香"], ["虾过敏者避免", "可能含花生"], ["推荐", "海鲜"], "$17.90"),
    tgDish("Mild hot & sour coconut soup", "椰香酸辣鸡汤", "汤/鸡肉", "菜单写明 lean chicken fillet & mushroom，酸辣但相对温和。", ["酸辣", "椰香"], ["含鸡肉", "有辣"], ["汤", "温和"], "$18.90"),
    tgDish("Hot & sour soup local prawn", "本地虾酸辣汤", "汤/虾", "菜单写明 mixed Thai herb & fresh chilli，辣味更明显。", ["酸辣", "虾鲜味"], ["虾过敏者避免", "有辣"], ["汤", "海鲜"], "$18.90"),
    tgDish("Lunch box", "泰式午餐盒", "午餐/套餐", "午餐页写明可选 2 个前菜，加一份主菜；普通蛋白 $20.90，虾/混合海鲜/鸭/脆皮猪肉 $23.90。", ["组合", "省事"], ["按选择可能含海鲜/猪肉/鸭肉"], ["午餐", "套餐"], "$20.90 / $23.90"),
    tgDish("Pad kana moo krob w/rice", "脆皮猪肉芥兰饭", "午餐/猪肉饭", "午餐页写明 crispy pork belly、Chinese broccoli 和 oyster sauce。", ["咸香", "脆皮猪肉"], ["含猪肉", "蚝油含海鲜"], ["午餐", "饭"], "$19.90"),
    tgDish("Pad ka praw gai sub w/rice", "鸡肉末罗勒饭", "午餐/鸡肉饭", "鸡肉末配蒜、辣椒、罗勒和蚝油炒饭，菜单标辣。", ["罗勒香", "辣", "咸香"], ["含鸡肉", "有辣", "蚝油含海鲜"], ["午餐", "饭"], "$17.90"),
    tgDish("Prik khing moo krob", "红咖喱酱脆皮猪肉饭", "午餐/猪肉饭", "脆皮猪肉配红咖喱酱、四季豆和 zucchini，菜单标辣。", ["咖喱香", "辣", "猪肉香"], ["含猪肉", "有辣"], ["午餐", "饭"], "$19.90"),
    tgDish("Massaman beef w/rice", "马萨曼牛肉饭", "午餐/牛肉咖喱", "牛肉块配马萨曼咖喱、椰奶、腰果和小土豆。", ["椰香", "香料味", "微甜"], ["含牛肉", "含腰果"], ["午餐", "咖喱"], "$19.90"),
    tgDish("Gang phed ped yang w/rice", "红咖喱烤鸭饭", "午餐/鸭肉咖喱", "烤鸭红咖喱，配番茄、菠萝和荔枝。", ["椰香", "甜辣", "鸭肉香"], ["含鸭肉", "有辣"], ["咖喱", "午餐"], "$19.90"),
    tgDish("Yellow curry chicken w/rice", "黄咖喱鸡饭", "午餐/鸡肉咖喱", "鸡腿肉黄咖喱，配土豆，菜单写 medium hot。", ["咖喱香", "椰香", "中辣"], ["含鸡肉", "有辣"], ["咖喱", "午餐"], "$18.90"),
    tgDish("Pad ka praw gai krob w/rice", "脆鸡罗勒饭", "午餐/鸡肉饭", "脆鸡配蒜、辣椒、罗勒和蚝油，菜单标辣。", ["酥脆", "罗勒香", "辣"], ["含鸡肉", "有辣"], ["午餐", "饭"], "$18.90"),
    tgDish("Pineapple fried rice", "菠萝炒饭", "午餐/炒饭", "香米炒菠萝、虾、鸡肉、菠萝、番茄、腰果等。", ["微甜", "坚果香", "饭香"], ["含虾", "含鸡肉", "含腰果"], ["炒饭", "午餐"], "$19.90"),
    tgDish("Charmed crispy chicken w/rice", "Charmed 脆鸡饭", "午餐/鸡肉饭", "脆鸡配甜辣蘸酱，适合不想吃太复杂的人。", ["酥脆", "甜辣", "鸡肉香"], ["含鸡肉", "油炸"], ["安全菜", "午餐"], "$18.90"),
    tgDish("Hokkien mee w/sambal chilli", "参巴福建面", "午餐/面", "福建面配鸡蛋面、脆猪肉片、虾、豆腐、蔬菜和 sambal chilli paste。", ["酱香", "辣", "海鲜味"], ["含猪肉", "含虾", "有辣"], ["面", "午餐"], "$19.90"),
    tgDish("Koo wa gai noodles", "泰式海鲜炒河粉", "午餐/面", "宽米粉配鸡、虾、豆芽、调味酱和炸洋葱。", ["咸香", "海鲜味"], ["含鸡肉", "含虾"], ["面", "午餐"], "$19.90"),
    tgDish("Pad Thai gai krob", "脆鸡泰式炒河粉", "午餐/面", "泰式炒河粉配脆鸡、蒜香韭菜、豆芽、豆腐、蛋和花生。", ["酸甜", "花生香", "鸡肉香"], ["含鸡肉", "含蛋", "含花生"], ["泰餐经典", "面"], "$18.90"),
    tgDish("BBQ chicken salad", "烤鸡沙拉", "肉类/沙拉", "菜单写明黄瓜、番茄、泰式香草、混合沙拉叶和 chilli lime dressing。", ["清爽", "鸡肉香", "微辣"], ["含鸡肉", "有辣"], ["沙拉", "鸡肉"], "$26.90"),
    tgDish("BBQ chicken green papaya salad", "烤鸡青木瓜沙拉", "肉类/沙拉", "菜单标注 Must Try，青木瓜沙拉配烤鸡。", ["酸辣", "清爽", "鸡肉香"], ["含鸡肉", "有辣"], ["推荐", "沙拉"], "$26.90"),
    tgDish("Banana blossom salad", "香蕉花沙拉", "肉类/沙拉", "椰香鸡肉香蕉花沙拉，菜单标注 Popular。", ["椰香", "清爽"], ["含鸡肉", "可能含椰子"], ["人气", "沙拉"], "$26.90"),
    tgDish("Duck salad", "鸭肉沙拉", "鸭肉/沙拉", "烤鸭胸肉配 homemade chilli paste、泰式香草、椰奶、炸洋葱和腰果。", ["鸭肉香", "辣", "坚果香"], ["含鸭肉", "含腰果", "有辣"], ["鸭肉", "沙拉"], "$29.90"),
    tgDish("Massaman lamb cutlets", "马萨曼羊排", "羊肉/主菜", "羊排配土豆和腰果，菜单标注 Must Try。", ["羊肉香", "咖喱香", "微甜"], ["含羊肉", "含腰果"], ["推荐", "主菜"], "$35.90"),
    tgDish("Basil moo grob", "罗勒脆皮猪肉", "猪肉/主菜", "脆皮猪肉配蒜、辣椒和罗勒炒制。", ["猪肉香", "罗勒香", "辣"], ["含猪肉", "有辣"], ["主菜", "重口"], "$27.90"),
    tgDish("Wok toss marinade beef slice", "腌牛肉片炒菜", "牛肉/主菜", "牛肉片配蒜、切长红椒和蒸混合青菜，菜单标注 Must Try。", ["牛肉香", "蒜香"], ["含牛肉"], ["推荐", "主菜"], "$26.90"),
  ];
}

function stIvesClubDishes() {
  return [
    tgDish("Starters", "前菜小吃", "前菜/分享", "官网 2026 菜单分类确认有 Starters，适合先点小吃分着吃。", ["咸香", "适合分享"], ["具体品项需到店确认"], ["前菜"], ""),
    tgDish("Club Favourites", "Club 经典主菜", "主菜/澳式", "官网菜单分类确认有 Club Favourites，通常是 schnitzel、steak、roast、pie 等澳式 club 常见主菜。", ["份量足", "澳式"], ["具体菜品需以店内菜单为准"], ["主菜", "安全菜"], ""),
    tgDish("Burgers", "汉堡类", "主食/汉堡", "官网菜单分类确认有 Burgers，适合不会英文用户快速选择。", ["咸香", "份量足"], ["含麸质", "肉类需确认"], ["主食"], ""),
    tgDish("Pizza & Pasta", "披萨和意面", "主食/意式", "官网菜单分类确认有 Pizza & Pasta，适合家庭分享或儿童。", ["芝士香", "酱香"], ["含麸质", "可能含奶制品"], ["披萨", "意面"], ""),
    tgDish("From the Ocean", "海鲜主菜", "海鲜/主菜", "官网菜单分类确认有 From the Ocean，通常适合点鱼、虾、鱿鱼等海鲜。", ["海鲜味"], ["海鲜过敏者避免"], ["海鲜"], ""),
    tgDish("Sides", "配菜", "配菜", "官网菜单分类确认有 Sides，可搭配主菜。", ["咸香"], ["具体成分需确认"], ["配菜"], ""),
    tgDish("Kids", "儿童餐", "儿童/简餐", "官网菜单分类确认有 Kids，适合带孩子的家庭。", ["温和", "简单"], ["具体成分需确认"], ["有小孩"], ""),
    tgDish("Desserts", "甜点", "甜点", "官网菜单分类确认有 Desserts，适合饭后点。", ["甜"], ["可能含奶/蛋/麸质"], ["甜点"], ""),
    tgDish("Combo Deals", "套餐组合", "套餐/分享", "官网在线菜单分类确认有 Combo Deals，适合想省事直接点套餐的人。", ["组合", "份量足"], ["内容需确认"], ["套餐"], ""),
    tgDish("Gluten Free", "无麸质选项", "特殊饮食", "官网在线菜单分类确认有 Gluten Free，适合需要避开麸质的人先问店员。", ["可定制"], ["仍需店员确认交叉污染"], ["无麸质"], ""),
    tgDish("Vegetarian", "素食选项", "素食", "官网在线菜单分类确认有 Vegetarian，适合素食或想吃清淡的人。", ["清爽"], ["蛋奶素需确认"], ["素食"], ""),
  ];
}

const stIvesRestaurants = [
  {
    id: "stives-archies-cafe",
    name: "Archies Cafe Co",
    nameNote: "中文备注：Archies Cafe Co，现代早午餐咖啡馆。主打地中海/中东风味 brunch、三明治、tacos 和彩色健康碗。",
    area: "St Ives",
    address: "St Ives Shopping Village, 166 Mona Vale Road, St Ives",
    rating: "本地",
    note: "官方商场页列出多款明确菜品，适合早午餐和不会英文用户先看图式点餐。",
    curationReason: "入选原因：St Ives Shopping Village 官方 dining 页面；菜单方向清楚，非中餐环境。",
    tags: ["咖啡早午餐", "官方商场页", "真实菜单线索"],
    websiteUri: "https://stivesvillage.com.au/stores/archies-cafe-co/",
    hasMenu: true,
    menuSource: "St Ives Shopping Village 官方页面",
    menuVerified: true,
    menuDishes: [
      tgDish("Archie's Style Turkish Eggs", "Archies 土耳其风味鸡蛋", "早餐/鸡蛋", "官方页列出的春季菜单菜品。通常是酸奶/香料油风味鸡蛋，适合喜欢咸香早午餐的人。", ["咸香", "香料味", "蛋香"], ["含蛋", "可能含奶制品", "香料味明显"], ["早午餐", "素食"], "$19"),
      tgDish("Burrata", "布拉塔奶酪", "前菜/奶酪", "奶香很足的意式软奶酪，适合分享。", ["奶香", "清爽", "柔软"], ["含奶制品"], ["适合分享", "素食"], "$21"),
      tgDish("Archie's Power Bowl", "Archies 能量碗", "早餐/健康碗", "官方页列出的素食 power bowl，适合想吃蔬菜、谷物或轻食的人。", ["清爽", "蔬菜味"], ["具体配料需现场确认"], ["素食", "轻食"], "$19"),
      tgDish("Fried Chicken Sandwich", "炸鸡三明治", "三明治/鸡肉", "炸鸡三明治，适合想吃扎实一点但不想研究复杂菜单的人。", ["酥脆", "鸡肉香", "咸香"], ["含鸡肉", "含麸质", "油炸"], ["三明治", "安全菜"], "$17"),
      tgDish("Corn fritters with aburi miso salmon", "玉米饼配炙烧味噌三文鱼", "早午餐/海鲜", "官方页列出的招牌菜：玉米 fritters、炙烧味噌三文鱼、三文鱼籽、水波蛋、牛油果、毛豆、七味粉和柚子荷兰酱。", ["玉米甜香", "三文鱼鲜味", "日式酱香"], ["含鱼/鱼籽", "含蛋", "酱料可能含奶"], ["招牌", "早午餐"], ""),
      tgDish("Flathead tacos", "Flathead 鱼 tacos", "主食/鱼类", "官方页列出的三件 tacos，使用 flathead 鱼。适合想吃鱼但不想点完整主菜的人。", ["鱼鲜味", "清爽", "可能微辣"], ["鱼类过敏者避免", "含麸质需确认"], ["鱼类", "轻食"], ""),
    ],
    menuText: ["Archie's Style Turkish Eggs", "Burrata", "Archie's Power Bowl", "Fried Chicken Sandwich", "Corn fritters with aburi miso salmon", "Flathead tacos"].join("\n"),
  },
  {
    id: "stives-living-room-cafe",
    name: "The Living Room Café",
    nameNote: "中文备注：The Living Room Café，持牌咖啡餐厅。适合早餐、轻食、沙拉和家庭午餐。",
    area: "St Ives",
    address: "Level 1 Shop 16, St Ives Shopping Village",
    rating: "本地",
    note: "官方商场页说明有大量 breakfast、light meal、lunch options。",
    curationReason: "入选原因：St Ives Shopping Village 官方页面，明确列出 bacon and eggs、omelettes、French toast、salads 等。",
    tags: ["咖啡早午餐", "官方商场页", "老人友好"],
    websiteUri: "https://stivesvillage.com.au/stores/the-living-room-cafe/",
    hasMenu: true,
    menuSource: "St Ives Shopping Village 官方页面",
    menuVerified: true,
    menuDishes: [
      tgDish("Bacon and eggs", "培根鸡蛋早餐", "早餐/猪肉", "经典澳式早餐，培根加鸡蛋，适合第一次来不知道点什么的人。", ["咸香", "蛋香"], ["含培根/猪肉", "含蛋"], ["早餐", "安全菜"], ""),
      tgDish("Omelette", "煎蛋卷", "早餐/鸡蛋", "蛋卷类早餐，通常可配蔬菜、芝士或火腿，具体馅料现场确认。", ["蛋香", "柔软"], ["含蛋", "可能含奶/火腿"], ["早餐", "老人友好"], ""),
      tgDish("French toast", "法式吐司", "早餐/甜口", "吐司裹蛋奶煎制，通常偏甜，适合配咖啡。", ["甜", "蛋奶香", "柔软"], ["含蛋", "含奶", "含麸质"], ["甜口早餐"], ""),
      tgDish("Salads", "沙拉类午餐", "午餐/沙拉", "官方页说明有 delicious salads，适合想吃清淡午餐的人。", ["清爽"], ["酱汁成分需确认"], ["轻食", "午餐"], ""),
      tgDish("Light lunch meals", "轻午餐", "午餐/轻食", "官方页说明有 light meal 和 lunch options，适合家庭或老人简单吃。", ["温和", "易接受"], ["具体菜品需现场确认"], ["轻食", "老人友好"], ""),
      tgDish("Meals inspired by flavours from around the world", "世界风味午餐", "午餐/主菜", "官方页说明有 inspired by flavours from around the world 的餐食，适合想吃比普通早餐更正式的一餐。", ["风味更丰富"], ["具体菜品需现场确认"], ["午餐", "主菜"], ""),
      tgDish("Quick bite", "快速简餐", "轻食/快餐", "官方页说适合 quick bite with the family，适合赶时间或不想研究菜单的人。", ["简单", "方便"], ["具体成分需确认"], ["轻食", "家庭"], ""),
      tgDish("Long lunch", "长午餐/聚餐", "午餐/聚餐", "官方页说适合 long lunch with friends，适合坐下来慢慢吃。", ["适合聚餐"], ["具体菜品需现场确认"], ["聚餐", "午餐"], ""),
    ],
    menuText: ["Bacon and eggs", "Omelette", "French toast", "Salads", "Light lunch meals", "Meals inspired by flavours from around the world", "Quick bite", "Long lunch"].join("\n"),
  },
  {
    id: "stives-jjs-eatery",
    name: "JJ's Eatery",
    nameNote: "中文备注：JJ's Eatery，现代澳式 cafe restaurant。适合早餐、午餐、risotto、osso bucco、pot pie、pasta、三明治和汉堡。",
    area: "St Ives",
    address: "Level 1 Shop 95, St Ives Shopping Village",
    rating: "本地",
    note: "官方商场页列出多款 gourmet lunch 和 cafe favourites。",
    curationReason: "入选原因：St Ives Shopping Village 官方页面，明确提及 risotto、osso bucco、pot pies、pasta、sandwich、wrap、burger。",
    tags: ["澳式咖啡餐厅", "官方商场页", "真实菜单线索"],
    websiteUri: "https://stivesvillage.com.au/stores/jjs-cafe-restaurant/",
    hasMenu: true,
    menuSource: "St Ives Shopping Village 官方页面",
    menuVerified: true,
    menuDishes: [
      tgDish("Risotto", "意式烩饭", "主菜/米饭", "官方页列出的 gourmet lunch。通常是奶油或高汤慢煮米饭，口感浓郁。", ["浓郁", "米香"], ["可能含奶制品", "口味需现场确认"], ["午餐", "主食"], ""),
      tgDish("Osso bucco", "慢炖小牛膝", "主菜/肉类", "意式慢炖肉菜，通常肉质软烂、酱汁浓。适合想吃正餐的人。", ["肉香", "浓郁", "软烂"], ["含肉类", "可能含酒香"], ["主菜", "老人友好"], ""),
      tgDish("Pot pies", "酥皮派", "主菜/派", "官方页列出的 pot pies，通常是咸派，内馅可能为鸡肉、牛肉或蔬菜。", ["酥皮香", "浓郁"], ["含麸质", "具体内馅需确认"], ["午餐", "暖胃"], ""),
      tgDish("Pasta", "意面", "主菜/意面", "官方页列出的 pasta，适合不想冒险的人。", ["酱香", "咸香"], ["含麸质", "酱料需确认"], ["主食", "安全菜"], ""),
      tgDish("Takeaway sandwich", "外带三明治", "轻食/三明治", "适合赶时间时外带，具体夹馅现场确认。", ["清爽", "方便"], ["含麸质", "夹馅需确认"], ["外带", "轻食"], ""),
      tgDish("Wrap", "卷饼", "轻食/卷饼", "轻食卷饼，比正餐更简单，适合午休快速吃。", ["清爽", "方便"], ["含麸质", "夹馅需确认"], ["外带", "轻食"], ""),
      tgDish("Burger", "汉堡", "主食/汉堡", "官方页提到 burger，适合想点简单主食的人。", ["咸香", "份量足"], ["含麸质", "肉类需确认"], ["安全菜", "主食"], ""),
    ],
    menuText: ["Risotto", "Osso bucco", "Pot pies", "Pasta", "Takeaway sandwich", "Wrap", "Burger"].join("\n"),
  },
  {
    id: "stives-oscars-chargrill",
    name: "Oscar's Chargrill",
    nameNote: "中文备注：Oscar's Chargrill，中东/Turkish 风味快餐。适合 kebab、shish、pide、沙拉和外带。",
    area: "St Ives",
    address: "Level 1 Shop 15, St Ives Shopping Village",
    rating: "本地",
    note: "官方商场页明确写有 kebabs、shish、pides、fresh salads、sides、sweets。",
    curationReason: "入选原因：St Ives Shopping Village 官方页面；菜系清楚，适合不会英文用户提前选常见安全菜。",
    tags: ["Turkish", "快餐/轻食", "官方商场页"],
    websiteUri: "https://stivesvillage.com.au/stores/oscars-chargrill/",
    hasMenu: true,
    menuSource: "St Ives Shopping Village 官方页面",
    menuVerified: true,
    menuDishes: [
      tgDish("Kebabs", "土耳其烤肉卷", "主食/卷饼", "土耳其风味烤肉卷，通常可选鸡肉、牛羊肉或素食配料。", ["烤肉香", "酱香", "方便"], ["肉类需确认", "含麸质", "酱料可能含奶/蛋"], ["外带", "安全菜"], ""),
      tgDish("Shish", "土耳其烤串", "主菜/烤肉", "烤串类，适合想吃肉但不想点卷饼的人。", ["炭烤香", "肉香"], ["具体肉类需确认"], ["烤肉", "主菜"], ""),
      tgDish("Pides", "土耳其船形披萨", "主食/面食", "土耳其风味船形面饼，通常有肉、芝士或蔬菜馅。", ["面饼香", "芝士/肉香"], ["含麸质", "馅料需确认"], ["主食", "适合分享"], ""),
      tgDish("Fresh salads", "新鲜沙拉", "沙拉/配菜", "适合搭配烤肉或想吃清淡一点。", ["清爽"], ["酱汁成分需确认"], ["配菜", "轻食"], ""),
      tgDish("Sides", "配菜", "配菜", "可搭配 kebab 或 shish 的小食，具体品类现场确认。", ["咸香"], ["具体成分需确认"], ["配菜"], ""),
      tgDish("Sweets", "土耳其甜点", "甜点", "官方页提到 sweets，可能偏甜，适合饭后。", ["甜"], ["可能含坚果/奶制品"], ["甜点"], ""),
    ],
    menuText: ["Kebabs", "Shish", "Pides", "Fresh salads", "Sides", "Sweets"].join("\n"),
  },
  {
    id: "stives-cafe-milligram",
    name: "Café Milligram",
    nameNote: "中文备注：Café Milligram，咖啡早午餐店。适合咖啡、brunch、甜点和健康午餐。",
    area: "St Ives",
    address: "Level 1 Shop 25, St Ives Shopping Village",
    rating: "本地",
    note: "官方商场页说明有 brunch favourites、house-made sweet treats、healthy affordable lunch options。",
    curationReason: "入选原因：St Ives Shopping Village 官方页面；适合老人、学生和家庭轻食。",
    tags: ["咖啡早午餐", "甜点", "菜单待加深"],
    websiteUri: "https://stivesvillage.com.au/stores/cafe-milligram/",
    hasMenu: true,
    menuSource: "St Ives Shopping Village 官方页面",
    menuVerified: true,
    menuDishes: [
      tgDish("Brunch favourites", "早午餐经典", "早餐/早午餐", "官方页提到的 brunch favourites，适合早餐到午餐之间吃。", ["温和", "咖啡搭配"], ["具体菜品需现场确认"], ["早午餐"], ""),
      tgDish("House-made sweet treats", "店内自制甜点", "甜点", "适合配咖啡，通常偏甜。", ["甜", "咖啡搭配"], ["可能含奶/蛋/麸质/坚果"], ["甜点"], ""),
      tgDish("Healthy lunch options", "健康午餐", "午餐/轻食", "官方页提到 healthy affordable lunch options，适合想吃轻食的人。", ["清爽", "健康"], ["具体配料需现场确认"], ["轻食", "午餐"], ""),
      tgDish("Coffee", "咖啡", "饮品", "官方页强调 coffee，适合早午餐搭配。", ["咖啡香"], ["含咖啡因"], ["咖啡"], ""),
      tgDish("All-day menu", "全天菜单", "全天/简餐", "官方页说明有 diverse all-day menu，适合不确定早餐还是午餐时间的人。", ["选择多", "灵活"], ["具体菜品需现场确认"], ["全天", "简餐"], ""),
      tgDish("Quick bite", "快速简餐", "轻食", "官方页提到 quick bite between errands，适合购物途中快速吃。", ["方便", "轻食"], ["具体成分需确认"], ["外带", "轻食"], ""),
      tgDish("Leisurely lunch", "慢午餐", "午餐/聚餐", "官方页提到 leisurely lunch with friends，适合坐下聊天吃饭。", ["轻松", "适合聚餐"], ["具体菜品需确认"], ["午餐", "聚餐"], ""),
      tgDish("Afternoon tea", "下午茶", "下午茶/甜点", "官方页写明下午可 unwind with a decadent treat。", ["甜", "咖啡搭配"], ["可能含奶/蛋/麸质"], ["下午茶", "甜点"], ""),
      tgDish("Signature mocha", "招牌摩卡", "饮品/咖啡", "官方页提到 signature mocha，咖啡加巧克力风味，通常偏甜。", ["咖啡香", "巧克力", "甜"], ["含咖啡因", "可能含奶"], ["咖啡"], ""),
    ],
    menuText: ["Brunch favourites", "House-made sweet treats", "Healthy lunch options", "Coffee", "All-day menu", "Quick bite", "Leisurely lunch", "Afternoon tea", "Signature mocha"].join("\n"),
  },
  {
    id: "stives-sushiru",
    name: "Sushiru",
    nameNote: "中文备注：Sushiru，日式寿司火车/日餐。适合寿司、刺身、nigiri、maki、tempura、udon、teriyaki。",
    area: "St Ives",
    address: "Shop 117, 166 Mona Vale Road, St Ives",
    rating: "本地",
    note: "官方商场页明确列出 sushi、sashimi、nigiri、maki、tempura、udon、teriyaki。",
    curationReason: "入选原因：St Ives Shopping Village 官方页面和 AGFG 地址信息；非中餐，适合轻午餐。",
    tags: ["日餐", "寿司", "官方商场页"],
    websiteUri: "https://stivesvillage.com.au/stores/sushiru/",
    hasMenu: true,
    menuSource: "St Ives Shopping Village 官方页面",
    menuVerified: true,
    menuDishes: [
      tgDish("Sushi", "寿司", "寿司/主食", "寿司火车基础选择，适合看图拿取。", ["米醋香", "清爽"], ["可能含生鱼", "酱油含大豆/麸质"], ["日餐", "轻食"], ""),
      tgDish("Sashimi", "刺身", "刺身/生食", "生鱼片，适合能接受生食的人。", ["鲜味", "清爽"], ["生食", "鱼类过敏者避免"], ["日餐", "生食"], ""),
      tgDish("Nigiri", "握寿司", "寿司", "饭团上放鱼或其他配料的寿司。", ["米醋香", "鲜味"], ["可能含生食"], ["寿司"], ""),
      tgDish("Maki", "寿司卷", "寿司", "卷寿司，通常比刺身更容易接受。", ["米醋香", "清爽"], ["配料需确认"], ["寿司", "安全菜"], ""),
      tgDish("Tempura", "天妇罗", "炸物", "日式炸物，通常有虾或蔬菜。", ["酥脆", "油炸香"], ["虾过敏者需确认", "含麸质"], ["炸物"], ""),
      tgDish("Udon", "乌冬面", "面食", "日式粗面，热汤或炒面形式都比较容易接受。", ["温和", "汤味"], ["含麸质"], ["面食", "老人友好"], ""),
      tgDish("Teriyaki", "照烧类", "主菜", "甜咸照烧酱，常见鸡肉或鱼肉，适合不想吃生食的人。", ["甜咸", "酱香"], ["具体肉类需确认"], ["熟食", "安全菜"], ""),
    ],
    menuText: ["Sushi", "Sashimi", "Nigiri", "Maki", "Tempura", "Udon", "Teriyaki"].join("\n"),
  },
  {
    id: "stives-karoo",
    name: "Karoo & Co The Old School",
    nameNote: "中文备注：Karoo & Co The Old School，意式/融合餐厅。适合披萨、意面、burrata、calamari 和分享菜单。",
    area: "St Ives",
    address: "205 Mona Vale Road, St Ives",
    rating: "4.3",
    note: "官网确认 St Ives 分店和 dinner menu；OpenTable 页面提到 burrata、calamari、polenta fries、pizzas、seasonal pastas。",
    curationReason: "入选原因：OpenTable St Ives 页面显示约 4.3；官网确认 St Ives 地址和菜单入口。",
    tags: ["意式/融合", "本地好评", "菜单可核验"],
    websiteUri: "https://www.karooandco.com/st-ives-1",
    hasMenu: true,
    menuSource: "Karoo 官网 + OpenTable 菜单描述",
    menuVerified: true,
    menuDishes: [
      tgDish("Burrata", "布拉塔奶酪", "前菜/奶酪", "柔软奶香的意式奶酪，适合分享。", ["奶香", "清爽"], ["含奶制品"], ["前菜", "适合分享"], ""),
      tgDish("Calamari", "鱿鱼", "前菜/海鲜", "OpenTable 描述的分享菜单菜品，通常是炸或煎鱿鱼。", ["海鲜味", "咸香"], ["鱿鱼过敏者避免"], ["海鲜", "分享"], ""),
      tgDish("Polenta fries", "玉米糊薯条", "前菜/素食", "玉米 polenta 做成的炸条，适合分享。", ["酥脆", "玉米香"], ["油炸", "可能含奶制品"], ["前菜", "素食"], ""),
      tgDish("Pizzas", "木火披萨", "披萨", "官网和餐厅资料显示有披萨，适合家庭分享。", ["芝士香", "面饼香"], ["含麸质/奶制品"], ["披萨", "分享"], ""),
      tgDish("Seasonal pastas", "季节意面", "意面", "OpenTable 描述有 seasonal pastas，具体酱汁随季节变化。", ["酱香", "主食"], ["含麸质", "具体配料需确认"], ["意面"], ""),
      tgDish("Rocket and pear salad", "芝麻菜梨沙拉", "沙拉/配菜", "OpenTable 描述的 rocket & pear salad，适合搭配披萨意面。", ["清爽", "微甜"], ["可能含坚果/芝士"], ["沙拉", "配菜"], ""),
      tgDish("Grilled greens", "烤绿叶蔬菜", "配菜/蔬菜", "适合作为主菜配菜，较清淡。", ["蔬菜味", "炭烤香"], ["具体酱料需确认"], ["配菜", "素食"], ""),
    ],
    menuText: ["Burrata", "Calamari", "Polenta fries", "Pizzas", "Seasonal pastas", "Rocket and pear salad", "Grilled greens"].join("\n"),
  },
  {
    id: "stives-chargrill-charlies",
    name: "Chargrill Charlie's St Ives",
    nameNote: "中文备注：Chargrill Charlie's，澳式炭烤鸡和沙拉连锁。适合烤鸡、汉堡、卷、沙拉和家庭外带。",
    area: "St Ives",
    address: "213 Mona Vale Road, St Ives",
    rating: "本地",
    note: "品牌官网确认主打 chargrilled chicken、burgers & rolls、salads。",
    curationReason: "入选原因：连锁品牌官网菜单方向明确；Tripadvisor 评论也集中提到 chicken & salads。",
    tags: ["澳式烤鸡", "外带", "菜单可核验"],
    websiteUri: "https://chargrillcharlies.com/our-food",
    hasMenu: true,
    menuSource: "Chargrill Charlie's 官网菜单方向",
    menuVerified: true,
    menuDishes: chargrillCharliesStIvesDishes(),
    menuText: ["Chargrilled chicken", "Whole chicken", "Half chicken", "Chicken roll", "Old Fashioned Roll", "Schnitzel Roll", "Burgers", "Salads", "Sides", "Gourmet catering"].join("\n"),
  },
  {
    id: "stives-resunga",
    name: "Resunga Indian Curry Restaurant & Bar",
    nameNote: "中文备注：Resunga Indian Curry，印度餐厅。适合咖喱、samosa、tandoori、素食和米饭。",
    area: "St Ives",
    address: "Shop 2, 235 Mona Vale Road, St Ives",
    rating: "菜单",
    note: "Quandoo 菜单页列出 samosa、tandoori lamb cutlet、tandoori tiger prawn 等菜品。",
    curationReason: "入选原因：第三方菜单页和 AGFG 地址信息可核验；非中餐环境。",
    tags: ["印度餐", "菜单可核验", "素食可选"],
    websiteUri: "https://www.quandoo.com.au/place/resunga-indian-curry-restaurant-bar-53622/menu",
    hasMenu: true,
    menuSource: "Quandoo 菜单页 + AGFG 地址信息",
    menuVerified: true,
    menuDishes: [
      tgDish("Vegetable Samosa", "蔬菜咖喱角", "前菜/素食", "土豆、青豆、姜蒜、姜黄、香菜、辣椒、孜然等馅料的炸三角。", ["香料味", "酥脆", "微辣"], ["含麸质", "油炸", "有辣椒"], ["素食", "前菜"], "$7.90"),
      tgDish("Tandoori Lamb Cutlet", "坦都里羊排", "前菜/羊肉", "羊排用酸奶、姜蒜和香料腌制后入炉烤。", ["烤肉香", "香料味"], ["含羊肉", "含奶制品"], ["羊肉", "前菜"], "$15.90"),
      tgDish("Tandoori Tiger Prawn", "坦都里大虾", "前菜/虾", "半壳大虾用坦都里酱腌制后烤制，配薄荷酱。", ["虾鲜味", "香料味"], ["虾过敏者避免", "含奶制品需确认"], ["虾", "前菜"], "$16.90"),
      tgDish("Korma Beef/Lamb/Chicken", "Korma 温和腰果奶油咖喱", "主菜/咖喱", "Quandoo 菜单写明 ground roasted cashew nuts、spices 和 fresh cream，可选牛/羊/鸡。", ["温和", "奶油香", "腰果香"], ["含腰果", "含奶制品", "可选肉类"], ["咖喱", "不太辣"], "$16.90"),
      tgDish("Vindaloo Beef/Lamb/Chicken", "Vindaloo 辣咖喱", "主菜/咖喱", "Goa 风格热辣咖喱，菜单写明 boneless meat、red wine 和 very hot sauce。", ["很辣", "酸香", "重口"], ["有辣", "可能含酒", "可选肉类"], ["咖喱", "辣"], "$16.90"),
      tgDish("Kadai Cosht", "Kadai 羊肉香料咖喱", "主菜/羊肉", "菜单写明 Mughlai dish，羊肉在芳香香料 gravy 中烹制。", ["羊肉香", "香料味", "中辣"], ["含羊肉"], ["羊肉", "咖喱"], "$16.90"),
      tgDish("Prawns Malabar", "马拉巴尔虾咖喱", "主菜/海鲜", "虾、蘑菇、洋葱番茄酱、椰香和混合香料。", ["虾鲜味", "椰香", "番茄香"], ["虾过敏者避免", "可能含椰子"], ["海鲜", "咖喱"], "$17.90"),
      tgDish("Mole Fish", "椰香罗望子鱼咖喱", "主菜/鱼类", "鱼柳配 tamarin sauce、snow peas 和椰香。", ["酸香", "鱼鲜味", "椰香"], ["鱼类过敏者避免"], ["鱼", "海鲜"], "$17.90"),
      tgDish("Mango Chicken", "芒果鸡咖喱", "主菜/鸡肉", "菜单写明 boneless chicken，以很温和的 gravy 和 mango 调味。", ["温和", "微甜", "芒果香"], ["含鸡肉"], ["咖喱", "不太辣"], "$16.90"),
      tgDish("Chicken Tikka Masala", "鸡肉 Tikka Masala", "主菜/鸡肉", "坦都里鸡柳配 capsicum、番茄、洋葱、香菜和 masala。", ["香料味", "番茄香", "鸡肉香"], ["含鸡肉"], ["咖喱", "经典"], "$16.90"),
      tgDish("Chicken Jalfrezi", "鸡肉 Jalfrezi", "主菜/鸡肉", "鸡肉配 capsicum、cherry tomato、洋葱和 chopped masala 炒制。", ["番茄香", "香料味"], ["含鸡肉"], ["咖喱", "鸡肉"], "$16.90"),
      tgDish("Hariyali Goat", "薄荷香菜山羊咖喱", "主菜/山羊肉", "嫩山羊肉用 homemade sauce、mint 和 cilantro 烹制。", ["香草味", "肉香"], ["含山羊肉"], ["咖喱", "特色"], "$17.90"),
    ],
    menuText: ["Vegetable Samosa", "Tandoori Lamb Cutlet", "Tandoori Tiger Prawn", "Korma Beef/Lamb/Chicken", "Vindaloo Beef/Lamb/Chicken", "Kadai Cosht", "Prawns Malabar", "Mole Fish", "Mango Chicken", "Chicken Tikka Masala", "Chicken Jalfrezi", "Hariyali Goat"].join("\n"),
  },
  {
    id: "stives-charmed-thai",
    name: "Charmed by Hanuman Thai",
    nameNote: "中文备注：Charmed by Hanuman Thai，St Ives 泰餐。适合咖喱、炒河粉、炒饭和家庭分享菜。",
    area: "St Ives",
    address: "Shop 2-3, 198A Mona Vale Road, St Ives",
    rating: "菜单",
    note: "官网确认 St Ives 店、午餐/晚餐营业；菜单图片页已整理前菜、午餐盒、午餐主菜和部分晚餐肉类主菜。",
    curationReason: "入选原因：独立官网确认地址、营业时间、menu/order online 入口；菜单图片可核验，非中餐环境。",
    tags: ["泰餐", "官网菜单图片", "真实菜单"],
    websiteUri: "https://www.charmedthai.com.au/stives/",
    hasMenu: true,
    menuSource: "Charmed Thai St Ives 官网菜单图片",
    menuVerified: true,
    menuDishes: charmedThaiDishes(),
    menuText: [
      "Charmed sampler",
      "Spring roll",
      "Curry puff",
      "Thai fish cake",
      "Duck spring roll",
      "Golden bag",
      "Crab prawns roll",
      "Steamed dumpling",
      "Chicken satay",
      "Easy Fried Prawn Stick",
      "Sear bay scallops",
      "Delicious crispy Thai's devil wing",
      "Green papaya salad",
      "Grilled prawn satay",
      "Mild hot & sour coconut soup",
      "Hot & sour soup local prawn",
      "Lunch box",
      "Pad kana moo krob w/rice",
      "Pad ka praw gai sub w/rice",
      "Prik khing moo krob",
      "Massaman beef w/rice",
      "Gang phed ped yang w/rice",
      "Yellow curry chicken w/rice",
      "Pad ka praw gai krob w/rice",
      "Pineapple fried rice",
      "Charmed crispy chicken w/rice",
      "Hokkien mee w/sambal chilli",
      "Koo wa gai noodles",
      "Pad Thai gai krob",
      "BBQ chicken salad",
      "BBQ chicken green papaya salad",
      "Banana blossom salad",
      "Duck salad",
      "Massaman lamb cutlets",
      "Basil moo grob",
      "Wok toss marinade beef slice",
    ].join("\n"),
  },
  {
    id: "stives-st-ives-club",
    name: "The St Ives Club",
    nameNote: "中文备注：The St Ives Club，本地 club/pub 餐厅。适合家庭聚餐、酒吧餐和外带。",
    area: "St Ives",
    address: "100 Killeaton Street, St Ives",
    rating: "菜单",
    note: "官网 2026 Brasserie 菜单页确认分类，包括 Starters、Club Favourites、Burgers、Pizza & Pasta、From the Ocean、Sides、Kids、Desserts、Gluten Free、Vegetarian。",
    curationReason: "入选原因：官网菜单页确认 St Ives 地址和餐厅服务；本地 club 场景适合家庭。",
    tags: ["Club 餐", "官网菜单页", "分类已整理"],
    websiteUri: "https://www.thestivesclub.online/menu",
    hasMenu: true,
    menuSource: "The St Ives Club 2026 Brasserie 官网菜单页",
    menuVerified: true,
    menuDishes: stIvesClubDishes(),
    menuText: ["Starters", "Club Favourites", "Burgers", "Pizza & Pasta", "From the Ocean", "Sides", "Kids", "Desserts", "Combo Deals", "Gluten Free", "Vegetarian"].join("\n"),
  },
];

const chatswoodRestaurants = [
  {
    id: "cw-khao-pla",
    name: "Khao Pla Chatswood",
    nameNote: "中文备注：Khao Pla，泰式餐厅。主打泰式咖喱、炒河粉、海鲜和招牌猪肋排。",
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
    nameNote: "中文备注：Mamak，马来西亚餐。主打 roti 印度煎饼、咖喱、沙爹、椰浆饭和炒面。",
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
    nameNote: "中文备注：Sunday Seoul，韩式小酒馆/餐厅。主打韩式汤锅、煎饼、炸鸡和分享菜。",
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
    nameNote: "中文备注：Kazuma，现代日餐。主打刺身、寿司、定食、盖饭和黑豚炸猪排。",
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
    nameNote: "中文备注：Bistro Kai，现代西式/日式融合餐。主打意面、牛排、猪战斧、海鲜和甜点。",
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
    nameNote: "中文备注：Manpuku，日式拉面店。主打豚骨拉面、辣拉面、日式小吃和盖饭。",
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
    nameNote: "中文备注：Cafe Markus，咖啡早午餐。主打澳式早餐、吐司、三明治、贝果和咖啡。",
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
    nameNote: "中文备注：Chimichuri，创意咖啡早午餐。主打班尼迪克蛋、特色吐司、海鲜意面和甜品。",
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
    nameNote: "中文备注：Ooshman，黎巴嫩快餐。主打黎巴嫩薄饼、披萨、卷饼、烤鸡和素食鹰嘴豆丸。",
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
    nameNote: "中文备注：Gelateria Gondola，意式冰淇淋/甜品。主打 gelato、雪葩、开心果、巧克力和咖啡甜品。",
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

const chatswoodStaticMenuExtensions = {
  "cw-kazuma": [
    ["Tiger Tempura Prawn Roll", "老虎虾天妇罗寿司卷", "", "公开内容提到的寿司卷类菜，通常是炸虾配寿司饭和酱汁，适合想吃熟海鲜寿司的人。", "寿司/熟海鲜", ["酥脆", "鲜味", "酱汁味"], ["含虾", "可能含麸质"], ["寿司", "熟食", "海鲜"]],
    ["Sashimi Teishoku", "刺身定食", "", "Kazuma 官方介绍有 teishoku 午餐盘和新鲜刺身；这类套餐通常配主菜、米饭和小菜。", "定食/刺身", ["鲜味", "清爽"], ["生食", "鱼类过敏者避免"], ["午餐", "定食"]],
    ["Sushi Teishoku", "寿司定食", "", "寿司配定食小菜的午餐形式，适合想一次吃到寿司和配菜的人。", "定食/寿司", ["米醋香", "鲜味"], ["可能含生鱼", "酱油含麸质"], ["午餐", "寿司"]],
    ["Kurobuta Pork Katsu Set", "黑豚炸猪排定食", "", "黑豚炸猪排做成定食，适合不吃生食、想点稳妥热食的人。", "定食/猪肉", ["酥脆", "肉香"], ["含猪肉", "油炸", "可能含麸质"], ["定食", "相对安全"]],
  ],
  "cw-bistro-kai": [
    ["Seasoned Fries", "调味薯条", "", "公开评价和菜单信息提到的配菜，适合搭配牛排或分享菜。", "配菜", ["咸香", "酥脆"], ["油炸"], ["配菜", "适合分享"]],
    ["Beef Tartare", "生拌牛肉塔塔", "", "公开评价中提到的 Bistro Kai 菜品。通常是调味生牛肉，适合能接受生食的人。", "前菜/牛肉", ["肉香", "酸咸", "清爽"], ["生食", "含牛肉"], ["前菜", "特色"]],
    ["Lychee Granita", "荔枝冰沙 Granita", "", "公开报道提到的荔枝 granita，通常是清爽冰沙甜品，适合饭后解腻。", "甜品/冰品", ["荔枝香", "清爽", "甜"], ["冰品", "甜度需确认"], ["甜品", "清爽"]],
    ["Pandan Irish Coffee", "班兰爱尔兰咖啡", "", "公开评价提到的创意饮品，咖啡和酒香更明显，适合成年人饭后饮用。", "饮品/酒精", ["咖啡香", "班兰香", "酒香"], ["含酒精", "含咖啡因"], ["饮品", "特色"]],
  ],
  "cw-manpuku": [
    ["Shio Tonkotsu", "盐味豚骨拉面", "$21", "盐味猪骨汤底，配炙烧叉烧、白菜、笋干和葱。比酱油豚骨更清一点。", "拉面/豚骨", ["豚骨香", "咸香"], ["含猪肉", "含麸质"], ["拉面", "经典"]],
    ["Miso Ramen", "味噌拉面", "$17", "味噌猪鸡混合汤底，味道比盐味和酱油更浓厚，有发酵豆香。", "拉面/味噌", ["味噌香", "浓郁"], ["可能含猪肉", "含麸质"], ["拉面", "浓汤"]],
    ["Tsukemen", "日式蘸面", "$17.50", "面和浓汤分开，蘸着吃。汤底偏浓、微酸，适合想试不同吃法的人。", "拉面/蘸面", ["浓郁", "酸咸"], ["可能含猪肉", "含麸质"], ["蘸面", "特色"]],
    ["Aburi Chashu Ramen", "炙烧叉烧拉面", "$19.50", "炙烧叉烧、木耳、鸡蛋、芝麻、海苔和大量豆芽的拉面，肉香明显。", "拉面/猪肉", ["肉香", "浓郁", "炙烤香"], ["含猪肉", "含麸质"], ["叉烧", "拉面"]],
    ["Ramen Salad", "冷拉面沙拉", "$14.50", "冷面配蔬菜，可选芝麻酱或柚子味噌酱。适合天气热或想吃清爽一点的人。", "冷面/沙拉", ["清爽", "芝麻香", "微酸"], ["含麸质", "酱汁过敏需确认"], ["冷面", "清爽"]],
    ["Vegetable Ramen", "蔬菜拉面", "$15.50", "海鲜和蔬菜汤底加少量豆乳，配豆芽、玉米、南瓜和炸豆腐。适合不想吃肉的人。", "拉面/蔬菜", ["蔬菜甜味", "清淡"], ["可能含海鲜汤底", "含麸质"], ["蔬菜", "素食需确认"]],
    ["Yuzu Shio Coriander Ramen", "柚子盐味香菜拉面", "$17.50", "柚子盐味汤底加香菜，味道清香但香菜存在感强。", "拉面/清汤", ["柚子香", "清爽", "香菜味"], ["不吃香菜者避免", "含麸质"], ["清爽", "香菜"]],
    ["Chilli Bomb Add-on", "辣椒球加料", "", "给拉面加辣用，适合能吃辣的人；不吃辣或老人小孩不要加。", "加料/辣味", ["辣", "香料味"], ["明显增加辣度"], ["加料", "辣味"]],
  ],
  "cw-cafe-markus": [
    ["Toast and Regular Coffee Deal", "吐司配普通咖啡套餐", "", "公开页面提到的早餐特价，适合只想简单吃一点、配一杯咖啡的人。", "早餐/套餐", ["面包香", "咖啡香"], ["含麸质", "咖啡因"], ["早餐", "简单"]],
    ["Bacon Egg Roll and Regular Coffee Deal", "培根鸡蛋卷配咖啡套餐", "", "公开页面提到的早餐组合，比单点吐司更顶饱。", "早餐/套餐", ["咸香", "蛋香", "咖啡香"], ["含猪肉", "含鸡蛋", "含麸质"], ["早餐", "套餐"]],
    ["Chicken Schnitzel Wrap", "炸鸡排卷饼", "", "点评中提到鸡排卷/三明治份量大。卷饼版适合午餐打包。", "卷饼/鸡肉", ["酥脆", "咸香"], ["含鸡肉", "油炸", "含麸质"], ["午餐", "打包"]],
    ["French Fries", "薯条", "", "点评中提到薯条酥脆，适合配三明治或给小孩点。", "配菜", ["咸香", "酥脆"], ["油炸"], ["配菜", "儿童友好"]],
  ],
  "cw-chimichuri": [
    ["Bacon And Egg Cheese Burger", "培根鸡蛋芝士汉堡", "$10", "全天早餐菜单里的简单汉堡，适合早餐或快速午餐。", "早餐/汉堡", ["咸香", "芝士香", "蛋香"], ["含猪肉", "含鸡蛋", "含奶制品"], ["早餐", "简单"]],
    ["Breaky Burger", "早餐汉堡", "$15", "早餐风格汉堡，通常比培根蛋卷更丰富，适合想吃饱的人。", "早餐/汉堡", ["咸香", "丰富"], ["配料需确认", "含麸质"], ["早餐", "主食"]],
    ["Eggs On Toasted", "吐司配鸡蛋", "$12", "吐司配鸡蛋，口味最简单，适合老人或不想冒险的人。", "早餐/鸡蛋", ["蛋香", "面包香"], ["含鸡蛋", "含麸质"], ["简单", "早餐"]],
    ["Golden Poached Eggs On Red Velvet Croissant", "红丝绒牛角包水波蛋", "$25", "特色红丝绒牛角包配水波蛋，摆盘感强，口味偏创意。", "早午餐/特色", ["蛋香", "黄油香", "微甜"], ["含鸡蛋", "含奶制品", "含麸质"], ["特色", "早午餐"]],
    ["Seafood Tom Yum Pasta", "冬阴功海鲜意面", "$26", "官方菜单里的海鲜冬阴功意面，酸辣奶香，适合能接受重口味的人。", "意面/海鲜", ["酸辣", "海鲜味", "浓郁"], ["海鲜过敏者避免", "可能偏辣"], ["特色", "海鲜"]],
    ["Rich Beef Briskets Burger", "慢炖牛腩汉堡", "$25", "牛腩汉堡，肉味重、份量感强，适合午餐。", "汉堡/牛肉", ["肉香", "浓郁"], ["含牛肉", "含麸质"], ["主食", "午餐"]],
    ["Prawn Salad", "鲜虾沙拉", "$25", "虾和蔬菜沙拉，比汉堡和意面更清爽。", "沙拉/海鲜", ["清爽", "虾鲜味"], ["虾过敏者避免", "酱汁需确认"], ["沙拉", "清爽"]],
    ["Tropical Churro Sundae", "热带吉拿棒圣代", "$23", "吉拿棒配圣代，甜度较高，适合饭后分享或下午茶。", "甜品", ["甜", "酥脆", "奶香"], ["含奶制品", "含麸质"], ["甜品", "分享"]],
    ["Side Churro", "吉拿棒小食", "$10", "单点吉拿棒，外脆内软，适合想吃一点甜食的人。", "甜品/小吃", ["甜", "肉桂香", "酥脆"], ["含麸质", "油炸"], ["甜品", "小食"]],
    ["Sun-Kissed Salmon", "阳光三文鱼早午餐", "", "社媒菜单提到的三文鱼菜，通常偏清爽，适合喜欢鱼类早午餐的人。", "早午餐/鱼类", ["鱼香", "清爽"], ["鱼类过敏者避免"], ["早午餐", "鱼类"]],
    ["Scallops and Sunshine", "扇贝 Sunshine 早午餐", "", "新菜单社媒提到的扇贝菜，适合想尝试海鲜创意菜的人。", "海鲜/特色", ["鲜味", "清爽"], ["贝类过敏者避免"], ["海鲜", "特色"]],
    ["Raspberry Green Dream", "覆盆子绿色特饮", "", "社媒提到的饮品，偏果香清爽，适合不想喝咖啡的人。", "饮品", ["莓果香", "清爽"], ["糖分需确认"], ["饮品", "冷饮"]],
    ["Iced Long Black", "冰长黑咖啡", "", "不加奶的冰黑咖啡，咖啡味更直接。", "咖啡/饮品", ["咖啡香", "微苦"], ["含咖啡因"], ["咖啡", "冷饮"]],
  ],
  "cw-ooshman": [
    ["Zaatar & Cheese", "百里香芝士薄饼", "", "Ooshman 常见薄饼组合，香草味和芝士味都明显。", "薄饼/芝士", ["香草味", "芝士香", "咸香"], ["含奶制品", "含麸质", "芝麻过敏需确认"], ["薄饼", "经典"]],
    ["Deluxe Falafel Wrap", "豪华鹰嘴豆丸卷饼", "", "素食卷饼升级版，通常配更多蔬菜和酱汁。", "卷饼/素食", ["豆香", "酱汁味", "清爽"], ["油炸", "芝麻酱需确认"], ["素食友好", "打包"]],
    ["Garlic Goddess Wrap", "蒜香女神卷饼", "", "公开新菜单提到的卷饼，蒜香味会比较明显。", "卷饼/鸡肉", ["蒜香", "咸香"], ["蒜味明显", "酱汁需确认"], ["卷饼", "新菜单"]],
    ["Chicken & Mushroom Boat", "鸡肉蘑菇船形薄饼", "", "新菜单提到的 boat 类薄饼，鸡肉和蘑菇组合，适合热食打包。", "薄饼/鸡肉", ["鸡肉香", "菌菇香"], ["含鸡肉", "含麸质"], ["热食", "打包"]],
    ["Pistachio Delight", "开心果甜点", "", "新菜单提到的开心果甜点，坚果香明显。", "甜品/坚果", ["开心果香", "甜"], ["含坚果", "可能含奶制品"], ["甜品", "坚果"]],
    ["Tiramisu", "提拉米苏", "", "新菜单提到的甜点，咖啡和奶香明显，适合饭后。", "甜品", ["咖啡香", "奶香", "甜"], ["含奶制品", "含咖啡因"], ["甜品", "饭后"]],
    ["Pepperoni Burst", "意式辣香肠披萨", "", "披萨类菜单项，肉香和咸香明显，适合想点熟悉口味的人。", "披萨/肉类", ["肉香", "咸香", "可能微辣"], ["含肉类", "含麸质"], ["披萨", "快餐"]],
    ["Super Supreme", "至尊披萨", "", "配料更丰富的披萨，适合分享。", "披萨/分享", ["咸香", "丰富"], ["配料需确认", "含麸质"], ["披萨", "分享"]],
    ["Habibi Yiros", "中东烤肉卷/盘", "", "Yiros 风格肉类主食，酱汁和肉味明显。", "主食/肉类", ["肉香", "酱汁味"], ["肉类需确认", "含麸质"], ["主食", "打包"]],
    ["Spinach Pie", "菠菜派", "", "菠菜馅烤点，适合想吃素食或轻食的人。", "烘焙/素食", ["菠菜香", "面香"], ["含麸质", "可能含奶制品"], ["素食友好", "轻食"]],
    ["Crispy Chicken", "脆皮鸡", "", "炸/脆皮鸡类小食或主食，适合小孩和想吃稳妥肉类的人。", "鸡肉/小吃", ["酥脆", "鸡肉香"], ["含鸡肉", "油炸"], ["鸡肉", "简单"]],
    ["Lebo Fries", "黎巴嫩风味薯条", "", "Ooshman 风格薯条，通常会加酱汁或调味，适合分享。", "配菜", ["咸香", "酥脆", "酱汁味"], ["油炸", "酱汁需确认"], ["配菜", "分享"]],
    ["Big Mix Breakfast", "大份混合早餐薄饼", "", "早餐菜单提到的 Big Mix，通常配料更丰富，适合想吃饱的人。", "早餐/薄饼", ["丰富", "咸香"], ["配料需确认", "含麸质"], ["早餐", "份量大"]],
  ],
  "cw-gondola": [
    ["Fresh Crepes", "现做可丽饼", "", "官网评价提到店里也做 fresh crepes，可搭配 gelato 或甜酱。", "甜品/可丽饼", ["甜", "面香"], ["含麸质", "可能含奶制品"], ["甜品", "现做"]],
    ["Baked Apples Cinnamon Spice & Pastry Gelato", "烤苹果肉桂酥皮口味 Gelato", "", "官网提到的特殊口味，像苹果派风味，肉桂香明显。", "甜品/特色口味", ["苹果香", "肉桂香", "甜"], ["可能含奶制品", "可能含麸质"], ["特色", "季节口味"]],
    ["Tahini Black Sesame Gelato", "黑芝麻芝麻酱 Gelato", "", "官方社媒提到的特别口味，芝麻和坚果感明显。", "甜品/芝麻", ["芝麻香", "浓郁"], ["芝麻过敏者避免", "可能含奶制品"], ["特色", "芝麻"]],
    ["Chocolate Orange Gelato", "巧克力橙子 Gelato", "", "官方社媒提到的特别口味，巧克力浓郁，带橙子清香。", "甜品/巧克力", ["巧克力香", "橙香", "甜"], ["可能含奶制品"], ["特色", "巧克力"]],
    ["Vegan Sorbet Special", "纯素雪葩特别口味", "", "官方社媒提到会为乳糖不耐和纯素客人做 sorbet 特别口味。", "甜品/纯素", ["水果香", "清爽"], ["具体水果过敏需确认"], ["纯素友好", "可能无奶"]],
    ["Hot Chocolate", "热巧克力", "", "官方 Facebook 提到小杯热巧克力，适合小孩或不喝咖啡的人。", "饮品", ["巧克力香", "甜"], ["可能含奶制品"], ["饮品", "儿童友好"]],
    ["Dulce de Leche Gelato", "焦糖牛奶口味 Gelato", "", "公开内容提到的口味，奶香和焦糖味明显。", "甜品/焦糖", ["焦糖香", "奶香", "甜"], ["含奶制品"], ["甜品", "经典"]],
    ["Stracciatella Gelato", "巧克力碎片奶香 Gelato", "", "意式经典口味，奶底配巧克力碎片，适合第一次尝试。", "甜品/经典", ["奶香", "巧克力香", "甜"], ["含奶制品"], ["经典", "甜品"]],
    ["Fresh Strawberry Gelato", "新鲜草莓口味 Gelato", "", "公开内容提到的水果口味，草莓香和甜酸感明显。", "甜品/水果", ["草莓香", "甜酸"], ["水果过敏需确认"], ["水果", "清爽"]],
    ["Cremino", "巧克力榛子 Cremino", "", "公开内容提到的巧克力榛子风味，通常较浓郁。", "甜品/坚果", ["巧克力香", "榛子香", "浓郁"], ["含坚果", "可能含奶制品"], ["坚果", "浓郁"]],
    ["Tiramisu Affogato", "提拉米苏风味 Affogato", "", "公开内容提到的提拉米苏风味咖啡甜品，咖啡、奶香和可可味明显。", "甜品/咖啡", ["咖啡香", "奶香", "可可味"], ["含咖啡因", "可能含奶制品"], ["咖啡", "甜品"]],
    ["Dubai Chocolate Gelato", "迪拜巧克力口味 Gelato", "", "公开内容提到的热门巧克力口味，通常更浓郁、甜度较高。", "甜品/巧克力", ["巧克力香", "浓郁", "甜"], ["可能含奶制品", "坚果需确认"], ["热门", "巧克力"]],
  ],
};

function applyChatswoodStaticMenuExtensions() {
  chatswoodRestaurants.forEach((restaurant) => {
    const rows = chatswoodStaticMenuExtensions[restaurant.id] || [];
    if (!rows.length) return;
    const start = restaurant.menuDishes?.length || 0;
    const additions = rows.map(([name_en, name_zh, price, description_zh, category, taste, cautions, tags], index) => ({
      id: String(start + index + 1),
      name_en,
      name_zh,
      original_text: name_en,
      price,
      description_zh,
      category,
      taste,
      cautions,
      tags,
      source: restaurant.menuSource,
      confidence: "中高",
      recommendationReason: "来自该餐厅公开菜单/官网/订餐页信息整理；当天是否售罄仍以餐厅现场为准。",
    }));
    restaurant.menuDishes = [...(restaurant.menuDishes || []), ...additions];
    restaurant.menuText = [
      restaurant.menuText || "",
      ...rows.map(([name_en, , price]) => `${name_en}${price ? ` ${price}` : ""}`),
    ].filter(Boolean).join("\n");
  });
}

applyChatswoodStaticMenuExtensions();

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

const knownAreaLocations = [
  { area: "Tea Gardens", latitude: -32.6671, longitude: 152.1609 },
  { area: "Chatswood", latitude: -33.7969, longitude: 151.1803 },
  { area: "St Ives", latitude: -33.7293, longitude: 151.1595 },
  { area: "Hurstville", latitude: -33.9667, longitude: 151.1020 },
  { area: "Sydney CBD", latitude: -33.8688, longitude: 151.2093 },
  { area: "Parramatta", latitude: -33.8150, longitude: 151.0011 },
];

function distanceKm(aLat, aLng, bLat, bLng) {
  const radius = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const lat1 = aLat * Math.PI / 180;
  const lat2 = bLat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestKnownArea(latitude, longitude) {
  return knownAreaLocations
    .map((item) => ({ ...item, distanceKm: distanceKm(latitude, longitude, item.latitude, item.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

async function resolveAreaFromLocation(latitude, longitude) {
  try {
    const data = await postJson("/api/reverse-location", { latitude, longitude });
    if (data?.areaName) return data;
  } catch {}
  const nearest = nearestKnownArea(latitude, longitude);
  return {
    source: "nearest_known_area",
    areaName: nearest?.area || "Sydney CBD",
    displayName: nearest ? `${nearest.area} 附近` : "当前位置附近",
    distanceKm: nearest?.distanceKm,
  };
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
  const menuText = mummsSeafoodMenuText();
  const analyzed = {
    summary: "已整理 Mumm's 官网食品菜单：午晚餐、早餐、甜点和外带食物都已合并成中文解释；酒水菜单已跳过。",
    dishes: enrichStructuredDishes(mummsSeafoodMenuDishes(), "Mumm's 官网菜单文件"),
  };
  const fallbackOptions = {
    source: "Mumm's 官网菜单文件",
    verified: true,
    summary: analyzed.summary,
  };
  return {
    ...analyzed,
    menuText,
    ...fallbackOptions,
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
  const areaKey = area.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (/^(cw|chatswood)$/i.test(area)) {
    return {
      source: "static_known",
      message: "Chatswood 只显示本地好评、非中文环境、菜单可核验的真实餐厅。",
      restaurants: chatswoodRestaurants,
    };
  }
  if (areaKey === "stives" || areaKey === "stlves") {
    return {
      source: "static_known",
      message: "St Ives 先显示 11 家真实候选；中餐默认不放，菜单来源不足的店已标注待补。",
      restaurants: stIvesRestaurants,
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

function localReverseLocation(payload = {}) {
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { source: "static_error", areaName: "", displayName: "无法识别当前位置" };
  }
  const nearest = nearestKnownArea(latitude, longitude);
  return {
    source: "nearest_known_area",
    areaName: nearest?.area || "Sydney CBD",
    displayName: nearest ? `${nearest.area} 附近` : "当前位置附近",
    distanceKm: nearest?.distanceKm,
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
  if (url === "/api/reverse-location") return localReverseLocation(payload);
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
    setStep(3);
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
  setStep(3);
  toast("菜单文字已识别");
  return true;
}

function renderDishes(data) {
  state.dishes = data.dishes || [];
  state.selectedIds = new Set();
  state.dishPages = groupByDisplay(state.dishes, dishDisplayGroup, dishGroupOrder);
  state.dishPageIndex = 0;
  const summary = $("#summaryBox");
  summary.textContent = data.summary || "";
  summary.classList.toggle("hidden", !data.summary);
  renderDishPage();
}

function renderDishPage() {
  const list = $("#dishList");
  if (!state.dishPages.length) {
    list.innerHTML = `<div class="soft-box">没有可显示的菜品。</div>`;
    return;
  }
  state.dishPageIndex = Math.max(0, Math.min(state.dishPageIndex, state.dishPages.length - 1));
  const page = state.dishPages[state.dishPageIndex];
  list.innerHTML = `
    <div class="dish-page-shell">
      <div class="dish-page-top">
        <div>
          <p>菜单第 ${state.dishPageIndex + 1} / ${state.dishPages.length} 页</p>
          <h3>${page.group}</h3>
        </div>
        <span>${page.items.length} 道</span>
      </div>
      <div class="dish-page-tabs" aria-label="菜单分页">
        ${state.dishPages.map((item, index) => `
          <button type="button" class="${index === state.dishPageIndex ? "active" : ""}" data-dish-page="${index}">
            ${item.group}
            <span>${item.items.length}</span>
          </button>
        `).join("")}
      </div>
      <section class="list-section">
        ${page.items.map(renderDishCard).join("")}
      </section>
      <div class="dish-page-actions">
        <button type="button" data-dish-prev ${state.dishPageIndex === 0 ? "disabled" : ""}>上一页</button>
        <button type="button" data-dish-next ${state.dishPageIndex === state.dishPages.length - 1 ? "disabled" : ""}>下一页</button>
      </div>
    </div>
  `;

  $$("[data-dish-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dishPageIndex = Number(button.dataset.dishPage);
      renderDishPage();
    });
  });
  const prev = $("[data-dish-prev]");
  const next = $("[data-dish-next]");
  if (prev) prev.addEventListener("click", () => {
    state.dishPageIndex -= 1;
    renderDishPage();
  });
  if (next) next.addEventListener("click", () => {
    state.dishPageIndex += 1;
    renderDishPage();
  });

  $$("#dishList input").forEach((input) => {
    input.checked = state.selectedIds.has(input.value);
    input.addEventListener("change", () => {
      if (input.checked) state.selectedIds.add(input.value);
      else state.selectedIds.delete(input.value);
    });
  });
}

const dishGroupOrder = ["前菜/小吃", "主菜", "主食/面饭", "甜品", "饮品", "配菜/酱汁", "其他"];

function dishDisplayGroup(dish = {}) {
  const category = String(dish.category || "");
  const tags = (dish.tags || []).join(" ");
  const text = `${category} ${dish.name_zh || ""} ${dish.name_en || ""} ${tags}`.toLowerCase();
  if (/饮品|咖啡|coffee|latte|drink|juice|wine|beer/.test(text)) return "饮品";
  if (/甜|甜点|甜品|冰淇淋|雪葩|gelato|sorbet|cake|tiramisu|panna cotta|dessert|waffle|pancake|toast.*sweet|affogato/.test(text)) return "甜品";
  if (/配菜|酱汁|薯条|chips|gravy|salad box|side|seasonal vegetables/.test(text)) return "配菜/酱汁";
  if (/前菜|小吃|分享|海鲜小吃|点心|烘焙|轻食|starter|snack|entree|karaage|gyoza|tofu|croquette|calamari/.test(text)) return "前菜/小吃";
  if (/主菜|咖喱|牛肉|鸡肉|猪肉|鱼类|海鲜|贝类|牛排|烤鸡|汉堡|披萨|bistro|steak|burger|pork|beef|chicken|fish|seafood|oyster|ribs/.test(text)) return "主菜";
  if (/主食|米粉|米饭|炒饭|拉面|汤面|意面|盖饭|碗饭|卷饼|薄饼|roti|ramen|pasta|rice|noodle|donburi|wrap|manoush|breakfast|早午餐|早餐|三明治|吐司|贝果/.test(text)) return "主食/面饭";
  return "其他";
}

function renderDishCard(dish) {
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
  const bookingText = data.bookingMessage || "";
  const restaurant = $("#restaurantName").value.trim() || "restaurant";
  $("#smsLink").href = `sms:?body=${encodeURIComponent(bookingText)}`;
  $("#emailLink").href = `mailto:?subject=${encodeURIComponent(`Booking request - ${restaurant}`)}&body=${encodeURIComponent(bookingText)}`;
  $("#contactActions").classList.toggle("hidden", !bookingText);
  setStep(4);
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
  $("#partySize").value = "3";
  $("#bookingTime").value = "今晚 6:30pm";
  $("#specialNotes").value = "少辣，不要香菜，有一位老人";
  setStep(2);
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
    setStep(2);
    toast(isRealSource ? "已找到真实附近餐厅" : "已显示示例餐厅");
  } catch {
    if (searchId !== state.restaurantSearchId) return;
    renderRestaurants(demoRestaurants, "附近餐厅暂时获取失败，先显示示例餐厅。");
    setStep(2);
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
      "手机浏览器需要 HTTPS 才能使用真实定位。现在是本地测试地址，请先输入区域，或点输入框下面的常用区域。"
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
    async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      button.textContent = "正在识别区域...";
      try {
        const resolved = await resolveAreaFromLocation(latitude, longitude);
        const areaName = resolved.areaName || "";
        if (areaName) $("#areaName").value = areaName;
        toast(areaName ? `已定位到 ${areaName}` : "已获取当前位置");
        await loadNearbyRestaurants(
          {
            areaName,
            latitude,
            longitude,
          },
          "正在查找..."
        );
      } finally {
        button.disabled = false;
        button.textContent = "使用我当前位置";
      }
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
    setStep(3);
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
    button.textContent = "生成预约信息和点餐卡";
  }
});

$("#toContactButton").addEventListener("click", () => {
  const dishes = selectedDishes();
  if (!dishes.length) {
    toast("请至少选择一道菜");
    return;
  }
  setStep(4);
});

$$("[data-back]").forEach((button) => {
  button.addEventListener("click", () => setStep(Number(button.dataset.back)));
});

let touchStartX = 0;
let touchStartY = 0;
let touchStartTarget = null;

document.addEventListener("touchstart", (event) => {
  const touch = event.touches?.[0];
  if (!touch) return;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTarget = event.target;
}, { passive: true });

document.addEventListener("touchend", (event) => {
  if (!touchStartTarget || touchStartTarget.closest("input, textarea, button, a, label, [contenteditable='true']")) {
    touchStartTarget = null;
    return;
  }
  const touch = event.changedTouches?.[0];
  if (!touch) return;
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const isLeftSwipe = dx < -70 && Math.abs(dy) < 60 && Math.abs(dx) > Math.abs(dy) * 1.4;
  if (isLeftSwipe && state.currentStep > 1) {
    setStep(state.currentStep - 1);
    toast("已返回上一页");
  }
  touchStartTarget = null;
}, { passive: true });

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
setStep(1);
renderRestaurants(demoRestaurants, "v54 已加载：已固化每个区的地址、地图、菜单来源和防串店操作规则。");
