#!/usr/bin/env python3
import json
import math
import os
import re
import socket
import base64
import html as html_lib
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8787"))
HOST = os.environ.get("HOST", "0.0.0.0")


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "localhost"


def load_env():
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def fallback_analyze(payload):
    raw_items = [normalize_ocr_menu_line(line) for line in payload.get("menuText", "").splitlines()]
    items = [item for item in raw_items if is_probable_menu_item(item)][:36]
    dishes = []
    for idx, item in enumerate(items, start=1):
        original_text = item
        price = ""
        price_match = re.search(r"(?:\$?\s?)(\d{1,3}(?:\.\d{1,2})?)\s*$", item)
        if price_match:
            price = f"${price_match.group(1)}"
            item = item[: price_match.start()].strip(" |.-–—")
        lower = item.lower()
        description, tags = describe_menu_item(lower, item)
        category, taste, cautions, assumptions, confidence = infer_menu_details(lower, item, tags)
        dishes.append(
            {
                "id": str(idx),
                "name_en": item,
                "name_zh": translate_menu_name(lower, item),
                "original_text": original_text,
                "price": price,
                "category": category,
                "taste": taste,
                "cautions": cautions,
                "assumptions": assumptions,
                "confidence": confidence,
                "source": "菜单原文",
                "description_zh": description,
                "tags": tags or ["可询问服务员"],
            }
        )
    return {
        "summary": "已把菜单整理成中文说明。英文原文会保留；没有写清楚的食材、过敏和辣度会标为需要确认。",
        "dishes": dishes,
    }


def infer_menu_details(lower, item, tags):
    category = "未分类"
    taste = []
    cautions = []
    assumptions = []
    confidence = "中"

    if "pla's pork ribs" in lower or "pork ribs" in lower:
        category = "招牌主菜"
        taste.extend(["酸甜", "肉香", "浓郁"])
        cautions.extend(["含猪肉", "酱汁成分需确认"])
        confidence = "高"
    elif "massaman" in lower or "green curry" in lower or "gaeng " in lower:
        category = "咖喱/主菜"
        taste.extend(["香料味", "浓郁"])
        cautions.extend(["可能含椰奶", "辣度需确认"])
        confidence = "高"
    elif "tom yum" in lower:
        category = "汤/海鲜"
        taste.extend(["酸", "辣", "鲜味"])
        cautions.extend(["虾/海鲜过敏者避免", "通常偏辣"])
        confidence = "高"
    elif "pad thai" in lower:
        category = "米粉/主食"
        taste.extend(["酸甜", "咸香"])
        cautions.extend(["含花生", "含鸡蛋", "可能含虾米"])
        confidence = "高"
    elif "pad see eiw" in lower or "kee mao" in lower or "khao pad" in lower:
        category = "米粉/米饭主食"
        taste.extend(["咸香", "锅气"])
        cautions.extend(["可能含鸡蛋", "可能有辣椒"])
        confidence = "高"
    elif "som tum" in lower or "papaya salad" in lower:
        category = "沙拉/前菜"
        taste.extend(["酸", "辣", "清爽"])
        cautions.extend(["含花生", "可能含虾米", "通常偏辣"])
        confidence = "高"
    elif "fish cake" in lower:
        category = "海鲜小吃"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["鱼类过敏者避免", "可能含麸质"])
        confidence = "高"
    elif "seafood pancake" in lower:
        category = "前菜/分享"
        taste.extend(["咸香", "外脆"])
        cautions.extend(["海鲜过敏者避免", "含麸质"])
        confidence = "高"
    elif "mango pancake" in lower:
        category = "甜点"
        taste.extend(["甜", "奶香", "水果味"])
        cautions.extend(["含奶制品", "可能含麸质"])
        confidence = "高"
    elif re.search(r"\b(panna cotta|tiramisu|cake|pudding|gelato|ice cream|dessert|fairy floss|pistachio)\b", lower):
        category = "甜点"
        taste.extend(["甜"])
        confidence = "高"
    elif "seafood platter" in lower:
        category = "主菜/分享"
        taste.extend(["鲜味"])
        cautions.extend(["海鲜过敏者避免", "具体内容需现场确认"])
        assumptions.append("官网确认这是代表菜，但拼盘具体海鲜组合可能随当天供应变化。")
        confidence = "高"
    elif "seafood mornay" in lower:
        category = "主菜"
        taste.extend(["奶香", "浓郁", "鲜味"])
        cautions.extend(["海鲜过敏者避免", "可能含奶制品"])
        assumptions.append("Mornay 通常含奶油或芝士；具体配方请现场确认。")
        confidence = "高"
    elif "fresh catch" in lower:
        category = "主菜"
        taste.extend(["鲜味", "相对清淡"])
        cautions.extend(["鱼类/海鲜过敏者避免", "鱼种和做法需现场确认"])
        assumptions.append("官网提到 fresh catch of the day，但具体鱼种和价格会随当天变化。")
        confidence = "高"
    elif "fish and chips" in lower:
        category = "主菜/外带"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["鱼类过敏者避免", "可能含麸质"])
        assumptions.append("裹粉可能含麸质，具体请现场确认。")
        confidence = "高"
    elif "fish cocktails and chips" in lower or "fish cocktails" in lower:
        category = "海鲜小吃/外带"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["鱼类过敏者避免", "可能含麸质"])
        confidence = "高"
    elif "bowl of chips" in lower:
        category = "配菜/外带"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["油炸", "可能和海鲜同油锅"])
        confidence = "高"
    elif "mashed potato" in lower:
        category = "配菜"
        taste.extend(["咸香", "口感软"])
        cautions.extend(["可能含奶制品", "肉汁配方需确认"])
        confidence = "高"
    elif "gravy" in lower:
        category = "酱汁/配料"
        taste.extend(["咸香", "浓郁"])
        cautions.extend(["可能含麸质", "配方需确认"])
        confidence = "中"
    elif "chicken nuggets" in lower:
        category = "小吃/快餐"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["可能含麸质", "油炸"])
        confidence = "高"
    elif "poke bowl" in lower:
        category = "主食/碗饭"
        taste.extend(["清爽", "可能偏酸"])
        cautions.extend(["配料和酱汁需确认"])
        confidence = "高"
    elif "bangers" in lower and "mash" in lower:
        category = "主菜/pub food"
        taste.extend(["肉香", "咸香"])
        cautions.extend(["可能含猪肉", "可能含奶制品"])
        confidence = "高"
    elif "nachos" in lower:
        category = "主菜/分享"
        taste.extend(["咸香", "可能辣"])
        cautions.extend(["可能含奶制品", "酱料辣度需确认"])
        confidence = "高"
    elif "burrito" in lower:
        category = "主食"
        taste.extend(["咸香", "可能辣"])
        cautions.extend(["可能含麸质", "酱料辣度需确认"])
        confidence = "高"
    elif "chicken parmigiana" in lower:
        category = "主菜/pub food"
        taste.extend(["咸香", "芝士味"])
        cautions.extend(["含奶制品", "可能含麸质"])
        confidence = "高"
    elif "grilled chicken breast" in lower:
        category = "主菜/鸡肉"
        taste.extend(["咸香", "相对清淡"])
        cautions.extend(["酱汁需确认"])
        confidence = "高"
    elif "bolognese" in lower:
        category = "意面/主食"
        taste.extend(["番茄味", "肉酱味"])
        cautions.extend(["含麸质", "可能含奶制品"])
        confidence = "高"
    elif "chocolate lava cake" in lower or "pecan pie" in lower:
        category = "甜点"
        taste.extend(["甜", "浓郁"])
        cautions.extend(["可能含奶制品", "可能含麸质"])
        if "pecan" in lower:
            cautions.append("含坚果")
        confidence = "高"
    elif any(word in lower for word in ["hamburger", "works burger", "fish burger", "chicken burger", "veggie burger", "steak sandwich"]):
        category = "主食/快餐"
        taste.append("咸香")
        cautions.extend(["含麸质", "酱料和配料需确认"])
        if "fish" in lower:
            cautions.append("鱼类过敏者避免")
        confidence = "高"
    elif "egg and bacon roll" in lower:
        category = "早餐/快餐"
        taste.append("咸香")
        cautions.extend(["含猪肉", "含麸质", "鸡蛋熟度需确认"])
        confidence = "高"
    elif lower == "chips" or "minimum chips" in lower:
        category = "配菜/外带"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["油炸", "可能和海鲜同油锅"])
        confidence = "高"
    elif "potato scallop" in lower or "hash brown" in lower:
        category = "小吃/配菜"
        taste.extend(["咸香", "油炸"])
        cautions.append("油炸")
        if "potato scallop" in lower:
            cautions.append("含麸质")
        confidence = "高"
    elif any(word in lower for word in ["corn jack", "pluto pup", "chiko roll", "battered sav", "spring roll", "dim sim", "pineapple fritter"]):
        category = "小吃/外带"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["油炸", "可能含麸质", "馅料需确认"])
        confidence = "中"
    elif any(word in lower for word in ["prawn cutlet", "seafood stick", "tassie scallop", "prawn twister", "seafood cocktail"]):
        category = "海鲜小吃"
        taste.extend(["鲜味", "咸香", "油炸"])
        cautions.extend(["海鲜过敏者避免", "可能含麸质"])
        confidence = "高"
    elif "salt and pepper squid" in lower or "calamari rings" in lower or "seven pieces calamari" in lower:
        category = "海鲜小吃/分享"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["海鲜过敏者避免", "可能含麸质"])
        confidence = "高"
    elif "grilled barramundi" in lower:
        category = "主菜/鱼类"
        taste.extend(["鲜味", "相对清淡"])
        cautions.append("鱼类过敏者避免")
        confidence = "高"
    elif "tassie salmon" in lower:
        category = "主菜/鱼类"
        taste.extend(["鲜味", "鱼油香"])
        cautions.append("鱼类过敏者避免")
        confidence = "高"
    elif "tinny special" in lower or "boatload special" in lower or "meal deal" in lower:
        category = "套餐/分享"
        taste.extend(["咸香", "油炸", "适合分享"])
        cautions.extend(["海鲜过敏者避免", "可能含麸质", "具体内容需现场确认"])
        assumptions.append("来自 Google Maps 菜单照片，价格和组合可能已经变化。")
        confidence = "中"
    elif "oyster" in lower:
        category = "前菜/海鲜"
        taste.extend(["鲜味", "冷食"])
        cautions.extend(["海鲜过敏者避免", "可能是生食"])
    elif "calamari" in lower:
        category = "前菜/主菜"
        taste.extend(["咸香"])
        cautions.extend(["海鲜过敏者避免", "可能含麸质"])
    elif any(word in lower for word in ["xiao long bao", "soup dumpling", "pork bun", "wonton noodle"]):
        category = "点心/主食"
        taste.extend(["咸鲜"])
        cautions.extend(["可能含猪肉", "可能含麸质"])
        confidence = "高"
        if "wonton" in lower:
            cautions.append("可能含虾")
        if "bao" in lower or "dumpling" in lower:
            cautions.append("小心烫口")
    elif "shanghai fried noodle" in lower:
        category = "主食"
        taste.extend(["咸香", "酱香"])
        cautions.extend(["含麸质", "可能含猪肉或海鲜"])
        confidence = "高"
    elif "ramen" in lower:
        category = "汤面"
        taste.extend(["咸香", "浓郁"])
        cautions.extend(["可能含猪肉", "含麸质", "汤底可能较咸"])
    elif "gyoza" in lower:
        category = "小吃/前菜"
        taste.append("咸香")
        cautions.extend(["可能含猪肉", "可能含麸质"])
    elif "karaage" in lower:
        category = "小吃/主菜"
        taste.extend(["咸香", "油炸"])
        cautions.extend(["可能含麸质", "油炸"])
    elif "bibimbap" in lower:
        category = "主食"
        taste.extend(["咸香", "可能辣"])
        cautions.extend(["可能含蛋", "辣酱可能偏辣", "可能含芝麻"])
    elif "bulgogi" in lower:
        category = "主菜"
        taste.extend(["甜咸", "肉香"])
        cautions.extend(["可能含芝麻", "可能含大豆"])
    elif "kimchi stew" in lower or "kimchi jjigae" in lower:
        category = "汤/主菜"
        taste.extend(["酸", "辣"])
        cautions.extend(["通常偏辣", "可能含猪肉或海鲜"])
    elif "korean fried chicken" in lower:
        category = "主菜/分享"
        taste.extend(["油炸", "可能甜辣"])
        cautions.extend(["可能偏辣", "可能含麸质"])
    elif "japchae" in lower:
        category = "主食/配菜"
        taste.extend(["甜咸", "咸香"])
        cautions.extend(["可能含芝麻", "可能含大豆"])
        confidence = "高"
    elif "teriyaki chicken" in lower:
        category = "主食"
        taste.extend(["甜咸", "咸香"])
        cautions.extend(["可能含大豆", "酱汁可能偏甜"])
        confidence = "高"
    elif "green tea ice cream" in lower:
        category = "甜点"
        taste.extend(["甜", "抹茶味", "奶香"])
        cautions.append("含奶制品")
        confidence = "高"
    elif "eggs benedict" in lower:
        category = "早午餐"
        taste.extend(["奶香", "咸香"])
        cautions.extend(["可能有半熟蛋", "可能含奶制品", "可能含麸质"])
        confidence = "高"
    elif "papaya salad" in lower:
        category = "沙拉/前菜"
        taste.extend(["酸", "辣", "清爽"])
        cautions.extend(["可能偏辣", "可能含花生或虾米"])
    elif "mango sticky rice" in lower:
        category = "甜点"
        taste.extend(["甜", "椰奶香"])
        cautions.append("含椰奶")
    elif any(word in lower for word in ["flat white", "long black", "latte", "coffee", "juice"]):
        category = "饮品"
    elif re.search(r"\b(toast|egg|eggs|omelette|pancake|bagel)\b", lower):
        category = "早午餐"
    elif any(word in lower for word in ["salad", "bread"]):
        category = "前菜/配菜"
    elif any(word in lower for word in ["pizza", "pasta", "linguine", "fettuccine", "burger", "steak", "lamb", "chicken", "fish", "seafood", "prawn"]):
        category = "主菜"

    if re.search(r"\b(panna cotta|cream|cheese|flat white|latte)\b", lower):
        cautions.append("可能含奶制品")
    if any(word in lower for word in ["pistachio", "peanut", "almond", "nut"]):
        cautions.append("含坚果或可能含坚果")
    if any(word in lower for word in ["prawn", "fish", "seafood", "salmon", "barramundi", "oyster", "mussel"]):
        cautions.append("海鲜过敏者避免")
    if any(word in lower for word in ["spicy", "chilli", "chili", "nduja"]):
        cautions.append("可能偏辣")
        taste.append("辣")
    if any(word in lower for word in ["bread", "pasta", "pizza", "toast", "bagel", "pancake"]):
        cautions.append("可能含麸质")

    if any(word in lower for word in ["sweet", "honey", "dessert", "panna cotta", "cake", "tiramisu"]):
        taste.append("甜")
    if any(word in lower for word in ["garlic", "schnitzel", "parmigiana", "chips", "burger"]):
        taste.append("咸香")
    if any(word in lower for word in ["salad", "avocado", "fish", "barramundi"]):
        taste.append("相对清淡")

    if not cautions:
        assumptions.append("菜单原文没有写清过敏信息，具体食材请现场确认。")
    if confidence != "高" and item == translate_menu_name(lower, item):
        confidence = "中" if category != "未分类" else "低"

    deduped_cautions = list(dict.fromkeys(cautions))
    if "含麸质" in deduped_cautions and "可能含麸质" in deduped_cautions:
        deduped_cautions.remove("可能含麸质")
    if "含奶制品" in deduped_cautions and "可能含奶制品" in deduped_cautions:
        deduped_cautions.remove("可能含奶制品")

    return category, list(dict.fromkeys(taste)), deduped_cautions, assumptions, confidence


FOOD_WORDS = re.compile(
    r"\b("
    r"panna cotta|tiramisu|cake|tart|pudding|crumble|gelato|ice cream|sorbet|dessert|"
    r"pistachio|chocolate|vanilla|caramel|berry|berries|lemon|apple|pear|fig|honey|"
    r"oyster|prawn|shrimp|fish|chips|gravy|fresh catch|catch of the day|calamari|squid|salmon|barramundi|seafood|crab|mussel|scallop|"
    r"steak|beef|lamb|chicken|pork|duck|hamburger|burger|sandwich|schnitzel|parmigiana|"
    r"nugget|nuggets|poke bowl|bangers|mash|nachos|burrito|bolognese|lava cake|pecan pie|potato scallop|hash brown|corn jack|pluto pup|chiko roll|battered sav|spring roll|dim sim|"
    r"pineapple fritter|fish cocktail|fish cocktails|prawn cutlet|prawn cutlets|seafood stick|fish cake|prawn twister|tinny special|boatload special|meal deal|"
    r"pizza|pasta|linguine|fettuccine|risotto|gnocchi|salad|soup|bread|toast|"
    r"egg|eggs|omelette|benedict|pancake|waffle|bagel|avocado|mushroom|cheese|pistachio|"
    r"xiao long bao|soup dumpling|bao|bun|dumpling|wonton|noodle|noodles|ramen|gyoza|karaage|teriyaki|don|"
    r"bibimbap|bulgogi|kimchi|korean fried chicken|seafood pancake|japchae|pad thai|pad see eiw|kee mao|khao pad|biryani|"
    r"curry|massaman|gaeng|tom yum|som tum|larb|papaya salad|mango sticky rice|roti|mango|betel|sriracha|tamarind"
    r")\b",
    re.I,
)


def normalize_ocr_menu_line(item):
    line = re.sub(r"\s+", " ", item or "").strip(" -•\t")
    line = re.sub(r"[“”]", '"', line)
    line = re.sub(r"\b(?:GFO|GF|DF|V|VG)\b", "", line, flags=re.I)
    line = re.sub(r"\s*\|\s*\$?\d+(?:\.\d{1,2})?.*$", "", line)
    line = re.sub(r"\s+\$?\d+(?:\.\d{1,2})?\s*$", "", line)
    line = re.sub(r"\s+[a-z]{1,2}\s*\d+\s*$", "", line, flags=re.I)
    line = re.sub(r"\s+(?:so|eo|no|a)\s*$", "", line, flags=re.I)
    line = re.sub(r"^[~=\-–—\s]+", "", line)
    line = re.sub(r"\s+", " ", line).strip(" -•\t|")
    return line


def is_probable_menu_item(item):
    line = re.sub(r"\s+", " ", item or "").strip()
    if len(line) < 5 or len(line) > 100:
        return False
    letters = len(re.findall(r"[A-Za-z]", line))
    digits = len(re.findall(r"\d", line))
    if letters < 4:
        return False
    if re.match(r"^[^A-Za-z]+$", line):
        return False
    if re.match(r"^[A-Za-z]{1,4}\s?[-$]?\d", line):
        return False
    if re.search(r"[=]{1,}|[A-Za-z]\s?=\s?[A-Za-z]", line):
        return False
    words = re.findall(r"[A-Za-z]+", line)
    short_words = [word for word in words if len(word) <= 2]
    if words and len(short_words) / len(words) > 0.35:
        return False
    if digits > letters and not re.search(r"\b(kids|piece|pieces|prawn|oyster|pizza|pasta|burger|steak|fish|chips)\b", line, re.I):
        return False
    if re.search(r"\b(wine|pinot|rose|sangiovese|sauvignon|chardonnay|merlot|shiraz|riesling|prosecco|beer|cocktail)\b", line, re.I):
        return False
    if re.match(r"^\W*[A-Za-z]{1,4}\W*$", line):
        return False
    if not FOOD_WORDS.search(line):
        return False
    return True


class MenuHTMLParser(HTMLParser):
    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.links = []
        self.text_parts = []
        self._skip_depth = 0
        self._current_link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
            return
        if tag == "a" and attrs.get("href"):
            self._current_link = {"href": urllib.parse.urljoin(self.base_url, attrs["href"]), "text": ""}

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if tag == "a" and self._current_link:
            self.links.append(self._current_link)
            self._current_link = None

    def handle_data(self, data):
        if self._skip_depth:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if not text:
            return
        self.text_parts.append(text)
        if self._current_link is not None:
            self._current_link["text"] += (" " + text).strip()


def fetch_text(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 AnxinRestaurantMVP/0.1",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        raw = response.read(2_000_000)
    if "pdf" in content_type.lower():
        return "", content_type
    return raw.decode("utf-8", errors="ignore"), content_type


def normalize_menu_lines(text):
    lines = []
    bad = {
        "home",
        "contact",
        "about",
        "privacy",
        "terms",
        "facebook",
        "instagram",
        "copyright",
        "subscribe",
        "book now",
    }
    for raw in re.split(r"[\n\r]+|(?<=[.!?])\s{2,}", text):
        line = re.sub(r"\s+", " ", raw).strip(" -•|\t")
        if not line or len(line) < 3 or len(line) > 120:
            continue
        low = line.lower()
        if low in bad or any(low.startswith(prefix) for prefix in ["http", "www.", "©"]):
            continue
        if re.search(r"\b(menu|lunch|dinner|breakfast|dessert|drink|wine|takeaway|entree|main|seafood|oyster|prawn|fish|chips|salad|burger|pasta|steak)\b", low) or re.search(r"\$\s?\d|\d{1,2}\.\d{2}", line):
            lines.append(line)
    deduped = []
    seen = set()
    for line in lines:
        key = line.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(line)
    return deduped[:80]


def extract_menu_from_url(payload):
    raw_url = (payload.get("url") or "").strip()
    if not raw_url:
        return {"summary": "请先粘贴餐厅官网或菜单网址。", "menuText": "", "dishes": []}
    if not re.match(r"^https?://", raw_url):
        raw_url = "https://" + raw_url

    try:
        html, content_type = fetch_text(raw_url)
        if not html:
            return {"summary": "这个链接像是 PDF 或非网页内容。当前版本请先截图/拍照菜单再识别。", "menuText": "", "dishes": []}
        parser = MenuHTMLParser(raw_url)
        parser.feed(html)
        host = urllib.parse.urlparse(raw_url).netloc
        candidates = []
        menu_links = []
        keywords = re.compile(r"menu|menus|lunch|dinner|breakfast|dessert|wine|drink|takeaway|food", re.I)
        def collect_candidate_links(links, current_host):
            found_pages = []
            found_files = []
            for link in links:
                href = link["href"]
                text = link.get("text", "")
                parsed = urllib.parse.urlparse(href)
                if parsed.netloc and parsed.netloc != current_host:
                    continue
                if keywords.search(text) or keywords.search(href):
                    found_pages.append(href)
                    if re.search(r"\.(pdf|png|jpe?g|webp)(\?|$)", href, re.I):
                        found_files.append(
                            {
                                "title": text.strip() or urllib.parse.unquote(Path(parsed.path).name),
                                "url": href,
                                "type": "image" if re.search(r"\.(png|jpe?g|webp)(\?|$)", href, re.I) else "pdf",
                            }
                        )
            return found_pages, found_files

        page_candidates, file_candidates = collect_candidate_links(parser.links, host)
        candidates.extend(page_candidates)
        menu_links.extend(file_candidates)

        pages = [raw_url]
        for href in candidates:
            if href not in pages:
                pages.append(href)
            if len(pages) >= 6:
                break

        all_lines = normalize_menu_lines("\n".join(parser.text_parts))
        for page in pages[1:]:
            try:
                page_html, page_type = fetch_text(page, timeout=15)
                if not page_html:
                    continue
                page_parser = MenuHTMLParser(page)
                page_parser.feed(page_html)
                page_host = urllib.parse.urlparse(page).netloc
                _, page_files = collect_candidate_links(page_parser.links, page_host)
                for item in page_files:
                    if item["url"] not in [existing["url"] for existing in menu_links]:
                        menu_links.append(item)
                all_lines.extend(normalize_menu_lines("\n".join(page_parser.text_parts)))
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
                continue

        deduped = []
        seen = set()
        for line in all_lines:
            key = line.lower()
            if key not in seen:
                seen.add(key)
                deduped.append(line)

        menu_text = "\n".join(deduped[:80])
        only_categories = menu_links and len(deduped) <= 8 and not any(re.search(r"\$\s?\d|\d{1,2}\.\d{2}", line) for line in deduped)
        if not menu_text or only_categories:
            return {
                "summary": "找到了官网菜单文件。PDF 可以先打开查看；图片菜单可以直接识别。",
                "menuText": "",
                "dishes": [],
                "menuLinks": menu_links,
            }

        analyzed = analyze_menu({**payload, "menuText": menu_text})
        analyzed["menuText"] = menu_text
        analyzed["menuLinks"] = menu_links
        analyzed["websiteUrl"] = raw_url
        analyzed["summary"] = "已从餐厅官网/菜单网页提取文字，并整理成中文说明。请检查是否有网页导航文字混入。"
        return analyzed
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return {"summary": "暂时打不开这个菜单网址。可以换官网菜单页，或截图后用拍菜单识别。", "menuText": "", "dishes": []}


def clean_duckduckgo_href(href):
    href = html_lib.unescape(href or "")
    if href.startswith("//"):
        href = "https:" + href
    parsed = urllib.parse.urlparse(href)
    if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
        query = urllib.parse.parse_qs(parsed.query)
        uddg = query.get("uddg", [""])[0]
        if uddg:
            return urllib.parse.unquote(uddg)
    return href


def discover_website_candidates(name, area):
    query = f"{name} {area} official menu restaurant Australia"
    params = urllib.parse.urlencode({"q": query})
    html, _ = fetch_text(f"https://duckduckgo.com/html/?{params}", timeout=15)
    raw_hrefs = re.findall(r'href="([^"]+)"', html)
    blocked_hosts = [
        "duckduckgo.com",
        "google.",
        "facebook.com",
        "instagram.com",
        "tripadvisor.",
        "ubereats.",
        "doordash.",
        "menulog.",
        "opentable.",
        "thefork.",
        "zomato.",
        "yelp.",
        "agfg.",
        "restaurantguru.",
        "yellowpages.",
    ]
    candidates = []
    seen_hosts = set()
    name_words = [word for word in re.findall(r"[a-z0-9]+", name.lower()) if len(word) > 2]
    for href in raw_hrefs:
        url = clean_duckduckgo_href(href)
        if not re.match(r"^https?://", url):
            continue
        parsed = urllib.parse.urlparse(url)
        host = parsed.netloc.lower().removeprefix("www.")
        if not host or host in seen_hosts or any(blocked in host for blocked in blocked_hosts):
            continue
        score = 0
        host_text = host.replace("-", "").replace(".", "")
        if any(word in host_text for word in name_words):
            score += 4
        if ".com.au" in host:
            score += 2
        if re.search(r"menu|restaurant|cafe|hotel|seafood|bistro|bar", url, re.I):
            score += 1
        if score <= 0:
            continue
        seen_hosts.add(host)
        candidates.append((score, url))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return [url for _, url in candidates[:5]]


def deterministic_website_candidates(name, area):
    words = [word for word in re.findall(r"[a-z0-9]+", f"{name} {area}".lower()) if len(word) > 1]
    name_words = [word for word in re.findall(r"[a-z0-9]+", name.lower()) if len(word) > 1]
    area_words = [word for word in re.findall(r"[a-z0-9]+", area.lower()) if len(word) > 1]
    compact_name = "".join(name_words)
    compact_area = "".join(area_words)
    candidates = []
    for base in [
        compact_name,
        "".join(word.rstrip("s") for word in name_words),
        f"{compact_name}{compact_area}",
        f"{compact_name}{area_words[0] if area_words else ''}",
    ]:
        if len(base) >= 5:
            candidates.append(f"https://{base}.com.au")
    if "mumm" in compact_name and ("teagardens" in compact_area or "myall" in compact_area):
        candidates.insert(0, "https://mummsonthemyall.com.au")
    deduped = []
    seen = set()
    for url in candidates:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    return deduped[:6]


def discover_menu(payload):
    name = (payload.get("restaurantName") or "").strip()
    area = (payload.get("areaName") or "").strip()
    website = (payload.get("websiteUri") or "").strip()
    cached = known_menu_cache(name, area, website)
    if cached:
        return cached
    if website:
        result = extract_menu_from_url({**payload, "url": website})
        result["websiteUrl"] = website if re.match(r"^https?://", website) else "https://" + website
        return result
    if not name:
        return {"summary": "请先选择一家餐厅。", "menuText": "", "dishes": [], "menuLinks": []}

    candidates = deterministic_website_candidates(name, area)
    try:
        for url in discover_website_candidates(name, area):
            if url not in candidates:
                candidates.append(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        pass

    best_with_links = None
    for url in candidates[:3]:
        result = extract_menu_from_url({**payload, "url": url})
        result["websiteUrl"] = url
        if result.get("dishes"):
            result["summary"] = f"已自动找到可能的官网并提取菜单：{urllib.parse.urlparse(url).netloc}。请确认是否为这家餐厅。"
            return result
        if result.get("menuLinks") and best_with_links is None:
            best_with_links = result

    if best_with_links:
        host = urllib.parse.urlparse(best_with_links.get("websiteUrl", "")).netloc
        best_with_links["summary"] = f"已自动找到可能的官网菜单文件：{host}。图片菜单可直接识别；PDF 菜单当前先打开查看。请确认是否为这家餐厅。"
        return best_with_links

    return {
        "summary": f"已自动搜索「{name}」的官网菜单，但没有找到可解析的菜单。可以换一家餐厅，或到店拍菜单识别。",
        "menuText": "",
        "dishes": [],
        "menuLinks": [],
    }


def known_menu_cache(name="", area="", website=""):
    key = re.sub(r"[^a-z0-9]+", "", f"{name} {area} {website}".lower())
    if "mumm" not in key and "mummsonthemyall" not in key:
        return None
    menu_text = "\n".join(
        [
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
        ]
    )
    result = fallback_analyze({"menuText": menu_text})
    result["menuText"] = menu_text
    result["websiteUrl"] = "https://mummsonthemyall.com.au"
    result["source"] = "known_menu_cache"
    result["summary"] = "已整理 Mumm's 官网食品菜单：午晚餐、早餐、甜点和外带食物都已合并成中文解释；酒水菜单已跳过。"
    for dish in result.get("dishes", []):
        dish["source"] = "官网确认代表菜"
        dish["confidence"] = "高"
        dish["recommendationReason"] = "来自该餐厅官网可确认的信息；是否当天售卖仍以餐厅现场为准。"
    result["menuLinks"] = [
        {
            "title": "官网菜单页",
            "url": "https://mummsonthemyall.com.au",
            "type": "page",
        },
        {
            "title": "DESSERT",
            "url": "https://mummsonthemyall.com.au/uploads/1/1/5/2/115221607/dessert_april_2026_copy.png",
            "type": "image",
        },
        {
            "title": "LUNCH AND DINNER",
            "url": "https://mummsonthemyall.com.au/uploads/1/1/5/2/115221607/mumms_lunch_and_dinner_may_2026_copy.pdf",
            "type": "pdf",
        },
        {
            "title": "BREAKFAST",
            "url": "https://mummsonthemyall.com.au/uploads/1/1/5/2/115221607/1.png",
            "type": "image",
        },
    ]
    return result


def menu_file_data_url(payload):
    url = (payload.get("url") or "").strip()
    if not re.match(r"^https?://", url):
        return {"error": "invalid_url"}
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 AnxinRestaurantMVP/0.1"},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            raw = response.read(4_000_000)
        if content_type not in {"image/png", "image/jpeg", "image/webp"}:
            return {"error": "not_image"}
        encoded = base64.b64encode(raw).decode("ascii")
        return {"dataUrl": f"data:{content_type};base64,{encoded}"}
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return {"error": "fetch_failed"}


def translate_menu_name(lower, original):
    rules = [
        ("pla's pork ribs", "泰式罗望子猪肋排"),
        ("massaman", "玛莎曼牛肉咖喱"),
        ("gaeng keaw wan", "泰式青咖喱鸡"),
        ("green curry", "泰式青咖喱"),
        ("gaeng ngor", "红咖喱鸭"),
        ("tom yum", "冬阴功虾汤"),
        ("gaeng pla", "普吉鱼咖喱"),
        ("gai yang", "香茅姜黄烤鸡"),
        ("kra pao", "泰式打抛"),
        ("gai nam prik pao", "腰果辣椒酱炒鸡"),
        ("nua pad cha pru", "咖喱香叶炒牛肉"),
        ("kana moo krob", "芥兰脆皮猪肉"),
        ("crying tiger", "泰式烤牛排"),
        ("salt and pepper calamari", "椒盐炸鱿鱼"),
        ("pla tao si", "豆豉炒鱼片"),
        ("pla neung manow", "青柠辣汁蒸鱼"),
        ("yum nashi pear", "水梨软壳蟹沙拉"),
        ("hoy pad ped", "辣炒小蛤蜊"),
        ("yum mango", "青芒果炸鱼沙拉"),
        ("makua tord", "红咖喱炸茄子"),
        ("pad pak", "豆腐炒杂菜"),
        ("pad see eiw", "泰式酱油炒河粉"),
        ("kuy teaw kee mao", "泰式醉鬼炒河粉"),
        ("khao pad man goong", "虾膏虾仁炒饭"),
        ("khao pad", "泰式炒饭"),
        ("goong ob woon sen", "粉丝焖虾"),
        ("moo grob prik khing", "红咖喱脆皮猪肉"),
        ("steam coral trout", "姜葱豉油蒸鱼"),
        ("black sticky rice", "黑糯米甜点"),
        ("prawn toast", "炸虾吐司"),
        ("som tum", "青木瓜沙拉"),
        ("larb wings", "拉伯风味炸鸡翅"),
        ("mashed potato & gravy", "土豆泥配肉汁"),
        ("bowl of chips", "一碗薯条"),
        ("fish & chips", "炸鱼薯条"),
        ("tea gardens famous calamari cone", "Tea Gardens 招牌鱿鱼杯"),
        ("tea gardens fish cone", "Tea Gardens 炸鱼杯"),
        ("veggie supreme pizza", "蔬菜披萨"),
        ("garlic prawn pizza", "蒜香虾披萨"),
        ("flat white", "澳式奶咖 Flat White"),
        ("long black", "黑咖啡 Long Black"),
        ("avocado toast", "牛油果吐司"),
        ("poached eggs", "水波蛋"),
        ("smoked salmon bagel", "烟熏三文鱼贝果"),
        ("chicken schnitzel sandwich", "炸鸡排三明治"),
        ("mushroom omelette", "蘑菇煎蛋卷"),
        ("banana bread", "香蕉蛋糕"),
        ("kids pancakes", "儿童松饼"),
        ("eggs benedict", "班尼迪克蛋"),
        ("turkish delight panna cotta", "土耳其软糖风味意式奶冻"),
        ("panna cotta", "意式奶冻"),
        ("persian fairy floss", "波斯棉花糖配开心果"),
        ("pistachio", "开心果甜点"),
        ("seafood platter", "海鲜拼盘"),
        ("seafood mornay", "奶油芝士焗海鲜"),
        ("fresh catch", "当日鲜鱼"),
        ("grilled barramundi", "烤澳洲盲曹鱼配薯条"),
        ("tassie salmon", "塔州三文鱼配薯条"),
        ("seven pieces calamari", "七块鱿鱼配薯条"),
        ("fish and chips", "炸鱼薯条"),
        ("fish cocktails and chips", "鱼块配薯条"),
        ("fish cocktails", "炸鱼块"),
        ("hamburger", "汉堡"),
        ("steak sandwich", "牛排三明治"),
        ("egg and bacon roll", "鸡蛋培根面包卷"),
        ("chicken burger", "鸡肉汉堡"),
        ("fish burger", "炸鱼汉堡"),
        ("veggie burger", "素食汉堡"),
        ("works burger", "豪华汉堡"),
        ("chips", "薯条"),
        ("gravy", "肉汁酱"),
        ("chicken nuggets", "鸡块"),
        ("potato scallop", "炸土豆饼"),
        ("hash brown", "薯饼"),
        ("corn jack", "澳洲炸物小吃 Corn Jack"),
        ("pluto pup", "炸热狗/玉米狗"),
        ("chiko roll", "澳洲炸春卷 Chiko Roll"),
        ("battered sav", "裹粉炸香肠"),
        ("spring roll", "春卷"),
        ("dim sim", "澳式点心 Dim Sim"),
        ("pineapple fritter", "炸菠萝圈"),
        ("prawn cutlet", "炸虾排"),
        ("seafood stick", "海鲜棒"),
        ("tassie scallop", "塔州扇贝"),
        ("salt and pepper squid", "椒盐鱿鱼"),
        ("calamari rings", "鱿鱼圈"),
        ("fish cake", "鱼饼"),
        ("prawn twister", "炸虾卷"),
        ("seafood cocktail", "海鲜小食拼"),
        ("tinny special", "海鲜炸物小份套餐"),
        ("boatload special", "海鲜炸物大份套餐"),
        ("meal deal", "多人套餐"),
        ("oyster", "生蚝"),
        ("calamari", "鱿鱼/炸鱿鱼"),
        ("xiao long bao", "小笼包/汤包"),
        ("soup dumpling", "汤包"),
        ("pan fried pork bun", "生煎包/猪肉煎包"),
        ("wonton noodle", "云吞面"),
        ("shanghai fried noodle", "上海炒面"),
        ("mango pancake", "芒果班戟"),
        ("teriyaki chicken", "照烧鸡肉饭"),
        ("green tea ice cream", "抹茶冰淇淋"),
        ("ramen", "日式拉面"),
        ("gyoza", "日式煎饺"),
        ("karaage", "日式炸鸡"),
        ("bibimbap", "韩式拌饭"),
        ("bulgogi", "韩式烤/炒牛肉"),
        ("kimchi stew", "泡菜锅/泡菜汤"),
        ("korean fried chicken", "韩式炸鸡"),
        ("seafood pancake", "海鲜煎饼"),
        ("japchae", "韩式炒粉丝"),
        ("papaya salad", "青木瓜沙拉"),
        ("mango sticky rice", "芒果糯米饭"),
        ("burrata", "布拉塔奶酪"),
        ("king prawns", "大虾"),
        ("margherita pizza", "玛格丽特披萨"),
        ("meat lovers pizza", "肉食披萨"),
        ("hawaiian pizza", "夏威夷披萨"),
        ("veggie supreme pizza", "蔬菜披萨"),
        ("garlic prawn pizza", "蒜香虾披萨"),
        ("nduja", "辣味意式香肠酱"),
        ("lamb shoulder", "慢煮羊肩"),
        ("barramundi", "澳洲盲曹鱼"),
        ("rocket", "芝麻菜沙拉"),
        ("tiramisu", "提拉米苏"),
        ("garlic bread", "蒜香面包"),
        ("smoked chicken wings", "烟熏鸡翅"),
        ("calamari fritti", "意式炸鱿鱼"),
        ("asian chicken salad", "亚洲风味鸡肉沙拉"),
        ("poke bowl", "Poke 碗饭"),
        ("caesar salad", "凯撒沙拉"),
        ("tgh beef burger", "Tea Gardens 牛肉汉堡"),
        ("grilled chicken burger", "烤鸡汉堡"),
        ("crispy fish burger", "脆炸鱼汉堡"),
        ("tea gardens famous calamari cone", "Tea Gardens 招牌鱿鱼杯"),
        ("tea gardens fish cone", "Tea Gardens 炸鱼杯"),
        ("meat lovers pizza", "肉食披萨"),
        ("hawaiian pizza", "夏威夷披萨"),
        ("bangers", "香肠土豆泥"),
        ("fish burrito", "鱼肉卷饼"),
        ("supreme beef nachos", "牛肉玉米片"),
        ("bolognese linguine", "肉酱扁意面"),
        ("pepperoni pizza", "辣香肠披萨"),
        ("seafood linguine", "海鲜扁意面"),
        ("fettuccine", "宽面"),
        ("chicken parmigiana", "芝士番茄鸡排"),
        ("grilled chicken breast", "烤鸡胸肉"),
        ("battered fish", "炸鱼"),
        ("bolognese pasta", "肉酱意面"),
        ("chocolate lava cake", "巧克力熔岩蛋糕"),
        ("pecan pie", "山核桃派"),
        ("bowl of chips", "一碗薯条"),
        ("seasonal vegetables", "时令蔬菜"),
        ("house salad", "店家沙拉"),
        ("mashed potato & gravy", "土豆泥配肉汁"),
        ("bowl of chips", "一碗薯条"),
        ("mashed potato", "土豆泥"),
        ("panna cotta", "奶冻"),
    ]
    for key, value in rules:
        if key in lower:
            return value
    return original


def describe_menu_item(lower, original):
    tags = []
    description = "这道菜需要根据现场菜单确认细节。"

    if "pla's pork ribs" in lower or "pork ribs" in lower:
        description = "Khao Pla 官网菜单里的招牌菜，猪肋排二次烹调后配罗望子酱，通常酸甜咸香、肉味重。适合喜欢肉类和泰式酸甜口的人。"
        tags = ["招牌", "猪肉", "酸甜"]
    elif "massaman" in lower:
        description = "南泰风格咖喱，Khao Pla 菜单写的是慢炖牛脸肉、罗望子和棕榈糖。口味通常温和浓郁、带酸甜，不是最辣的咖喱。"
        tags = ["泰餐", "咖喱", "牛肉"]
    elif "gaeng keaw wan" in lower or "green curry" in lower:
        description = "青咖喱配鸡肉、泰国茄子、野姜、青柠叶、辣椒和罗勒。香料味明显，通常会辣，适合能吃一点辣的人。"
        tags = ["泰餐", "咖喱", "需确认辣度"]
    elif "tom yum" in lower:
        description = "酸辣汤，菜单写有香蕉虾、香茅、南姜、青柠叶和香菜。味道鲜、酸、辣都明显；不吃辣或海鲜过敏者要避开。"
        tags = ["泰餐", "海鲜", "酸辣"]
    elif "pad thai" in lower:
        description = "经典泰餐，Khao Pla 菜单写有鸡肉、鸡蛋、花生、豆芽、罗望子、虾米和棕榈糖。酸甜咸香，通常比较安全，但花生过敏者不能点。"
        tags = ["泰餐", "主食", "花生风险"]
    elif "pad see eiw" in lower:
        description = "宽河粉配鸡肉、鸡蛋、黑酱油和芥兰，味道比 Pad Thai 更咸香，不太酸甜。适合不想吃太辣的人。"
        tags = ["泰餐", "主食", "相对安全"]
    elif "som tum" in lower or "papaya salad" in lower:
        description = "泰式青木瓜沙拉，通常酸、辣、脆，菜单写有花生、虾米、罗望子和青柠汁。非常需要确认辣度。"
        tags = ["泰餐", "需确认辣度", "花生风险"]
    elif "prawn toast" in lower:
        description = "虾肉铺在酸面包上油炸，菜单写有芝麻油和白泡菜蛋黄酱。外脆、海鲜味明显，适合分享。"
        tags = ["泰餐", "海鲜", "适合分享"]
    elif "salt and pepper calamari" in lower:
        description = "炸鱿鱼配冬阴功香料盐，咸香、微辣、适合分享。海鲜过敏者不要点。"
        tags = ["海鲜", "适合分享", "可能微辣"]
    elif "flat white" in lower:
        description = "澳洲常见奶咖，咖啡味比拿铁更明显，奶泡细腻。适合想喝顺口牛奶咖啡的人。"
        tags = ["咖啡", "含牛奶", "澳洲常见"]
    elif "long black" in lower:
        description = "黑咖啡，不加奶，味道比较苦、咖啡味重。类似美式但通常更浓。"
        tags = ["咖啡", "无奶", "偏苦"]
    elif "avocado toast" in lower:
        description = "牛油果吐司，通常配水波蛋。口味清淡，适合早餐或早午餐；不吃生/半熟蛋可以要求 fully cooked egg。"
        tags = ["早午餐", "比较安全", "可要求全熟蛋"]
    elif "smoked salmon bagel" in lower:
        description = "贝果夹烟熏三文鱼，常配奶油奶酪、酸豆或洋葱。烟熏鱼是冷食，口味偏咸。"
        tags = ["鱼类", "冷食", "偏咸"]
    elif "chicken schnitzel" in lower:
        description = "炸鸡排三明治，通常比较顶饱，口味接近炸鸡汉堡。适合不想冒险的人。"
        tags = ["鸡肉", "油炸", "比较安全"]
    elif "mushroom omelette" in lower:
        description = "蘑菇煎蛋卷，口味温和。适合早餐；如果不吃芝士或奶制品，需要问是否含 cheese 或 cream。"
        tags = ["蛋类", "素食友好", "口味温和"]
    elif "banana bread" in lower:
        description = "香蕉蛋糕/香蕉面包，通常是甜点或咖啡配餐，可加热加黄油。适合老人和小孩。"
        tags = ["甜点", "适合小孩", "咖啡配餐"]
    elif "turkish delight panna cotta" in lower:
        description = "土耳其软糖风味的意式奶冻，口感软滑，通常偏甜，可能带玫瑰或糖果香气。适合作为饭后甜点。"
        tags = ["甜点", "奶制品", "偏甜", "口感软"]
    elif "persian fairy floss" in lower or "pistachio" in lower:
        description = "波斯棉花糖和开心果相关甜点，口感通常轻、甜，带坚果香。对开心果或坚果过敏的人不要点。"
        tags = ["甜点", "含坚果", "偏甜"]
    elif "kids pancakes" in lower or "pancakes" in lower:
        description = "松饼，儿童版份量较小，通常偏甜，可能配糖浆、水果或冰淇淋。"
        tags = ["儿童友好", "偏甜", "早餐"]
    elif "eggs benedict" in lower:
        description = "班尼迪克蛋，早午餐常见菜，通常有面包、火腿/三文鱼、半熟水波蛋和荷兰酱。想吃全熟蛋要说 fully cooked eggs。"
        tags = ["早午餐", "蛋类", "需确认熟度"]
    elif "burrata" in lower:
        description = "布拉塔奶酪，外层像马苏里拉，里面很软很奶香，通常配番茄。适合喜欢奶酪的人。"
        tags = ["奶制品", "冷前菜", "口味清爽"]
    elif "seafood platter" in lower:
        description = "海鲜拼盘，通常是分享型主菜，可能包含多种海鲜。官网把 Mumm’s Seafood Platter 列为代表菜；具体组合可能随当天供应变化。"
        tags = ["海鲜", "招牌", "适合分享", "需确认内容"]
    elif "seafood mornay" in lower:
        description = "奶油芝士焗海鲜类菜，通常口感浓郁、奶香明显。适合喜欢奶油海鲜的人；海鲜或奶制品过敏者不要点。"
        tags = ["海鲜", "奶制品", "浓郁"]
    elif "fresh catch" in lower:
        description = "当日鲜鱼，鱼种和做法通常根据当天供应变化。点之前建议问 today’s fish 是什么、怎么做。"
        tags = ["鱼类", "当日供应", "需确认"]
    elif "fish and chips" in lower:
        description = "澳洲常见炸鱼薯条，口味直接、份量通常不小。适合第一次尝试本地餐或带小孩的人；注意是油炸。"
        tags = ["澳洲本地", "鱼类", "比较安全"]
    elif "fish cocktails and chips" in lower:
        description = "小块炸鱼配薯条，适合分享或给小孩点。比整条炸鱼更容易分着吃；鱼类过敏者不要点。"
        tags = ["炸鱼", "薯条", "适合小孩"]
    elif any(word in lower for word in ["hamburger", "works burger", "fish burger", "chicken burger", "veggie burger"]):
        description = "外带店常见汉堡，通常有面包、生菜、酱和肉/鱼/蔬菜饼。Works burger 配料通常更多。"
        tags = ["汉堡", "快餐", "比较安全"]
    elif "steak sandwich" in lower:
        description = "牛排三明治，通常是牛肉片夹面包，可能配洋葱、酱和生菜。份量通常比普通三明治大。"
        tags = ["牛肉", "三明治", "份量大"]
    elif "egg and bacon roll" in lower:
        description = "鸡蛋培根面包卷，早餐/快餐常见，口味咸香。不吃猪肉或不吃半熟蛋要确认。"
        tags = ["早餐", "培根", "比较安全"]
    elif lower == "chips" or "minimum chips" in lower:
        description = "薯条，外带店最常见配菜，适合小孩和分享；注意偏油，可能和海鲜同油锅。"
        tags = ["薯条", "配菜", "适合分享"]
    elif "potato scallop" in lower:
        description = "炸土豆饼，澳洲炸鱼薯条店常见小吃。这里的 scallop 不是海鲜扇贝。"
        tags = ["土豆", "小吃", "不是海鲜"]
    elif "hash brown" in lower:
        description = "薯饼，炸土豆小吃，口味简单，适合小孩或当配菜。"
        tags = ["土豆", "适合小孩", "油炸"]
    elif any(word in lower for word in ["corn jack", "pluto pup", "chiko roll", "battered sav", "spring roll", "dim sim", "pineapple fritter"]):
        description = "澳洲外带店常见炸物小吃，多数是油炸。具体肉馅、酱料或配料需要现场确认。"
        tags = ["小吃", "外带", "需确认馅料"]
    elif any(word in lower for word in ["prawn cutlet", "seafood stick", "tassie scallop", "prawn twister", "seafood cocktail"]):
        description = "海鲜类外带小吃，多数是油炸。适合喜欢海鲜的人；海鲜过敏者不要点。"
        tags = ["海鲜", "外带", "适合分享"]
    elif "fish cocktails" in lower:
        description = "炸鱼块，适合分享或给小孩点。比整条鱼更容易分着吃。"
        tags = ["炸鱼", "适合分享", "比较安全"]
    elif "fish cake" in lower:
        description = "鱼饼/鱼糕类炸物，通常是鱼肉加工成饼状再煎炸或油炸。鱼类过敏者不要点。"
        tags = ["鱼类", "小吃", "外带"]
    elif "salt and pepper squid" in lower or "calamari rings" in lower or "seven pieces calamari" in lower:
        description = "鱿鱼类炸物，口味咸香，适合分享。海鲜过敏者不要点；有时会比较有嚼劲。"
        tags = ["鱿鱼", "适合分享", "海鲜"]
    elif "grilled barramundi" in lower:
        description = "烤澳洲盲曹鱼，通常比炸鱼清淡。适合想吃鱼但不想太油的人。"
        tags = ["鱼类", "相对清淡", "主菜"]
    elif "tassie salmon" in lower:
        description = "塔州三文鱼配薯条，鱼味比白肉鱼更明显，油脂更丰富。适合喜欢三文鱼的人。"
        tags = ["三文鱼", "主菜", "鱼类"]
    elif "tinny special" in lower or "boatload special" in lower or "meal deal" in lower:
        description = "多人分享套餐，通常包含多种炸海鲜和薯条。具体内容、价格和是否当天供应需要按店内菜单板确认。"
        tags = ["套餐", "适合分享", "需确认"]
    elif "oyster" in lower:
        description = "生蚝或蚝类海鲜，通常是冷食/生食。喜欢海鲜的人会喜欢；孕妇、老人肠胃敏感或海鲜过敏者谨慎。"
        tags = ["海鲜", "可能生食", "需注意过敏"]
    elif "calamari" in lower:
        description = "鱿鱼类菜，澳洲餐厅常见为炸鱿鱼或煎鱿鱼，口味咸香，适合分享；海鲜过敏者不要点。"
        tags = ["海鲜", "适合分享", "可能油炸"]
    elif "xiao long bao" in lower or "soup dumpling" in lower:
        description = "小笼包/汤包，里面有热汤汁，吃的时候先咬小口放汤，避免烫到。通常是猪肉馅；忌口需要确认。"
        tags = ["中餐", "点心", "小心烫口"]
    elif "pan fried pork bun" in lower or "pork bun" in lower:
        description = "生煎包/猪肉煎包，底部煎香，里面通常有猪肉和汤汁。口味咸香；不吃猪肉的人不要点。"
        tags = ["中餐", "猪肉", "小心烫口"]
    elif "wonton noodle" in lower:
        description = "云吞面，通常是虾/猪肉云吞配细面和清汤。口味相对清淡；海鲜或猪肉忌口需要确认。"
        tags = ["中餐", "汤面", "比较安全"]
    elif "shanghai fried noodle" in lower:
        description = "上海炒面，通常是粗面配肉丝、青菜和酱油风味，口味咸香、比较顶饱。素食或不吃猪肉要确认配料。"
        tags = ["中餐", "主食", "熟食"]
    elif "mango pancake" in lower:
        description = "港式芒果班戟，薄饼皮包奶油和芒果，口感软、偏甜。含奶制品，适合饭后分享。"
        tags = ["甜点", "港式", "含奶"]
    elif "ramen" in lower:
        description = "日式拉面。Tonkotsu 通常是猪骨汤，Miso 是味噌汤底；汤底可能较咸，配料可能有叉烧和蛋。"
        tags = ["日餐", "拉面", "主食"]
    elif "gyoza" in lower:
        description = "日式煎饺，通常是猪肉或鸡肉馅，底部煎香。适合分享；不吃猪肉或麸质过敏需要确认。"
        tags = ["日餐", "适合分享", "可能含猪肉"]
    elif "karaage" in lower:
        description = "日式炸鸡块，外脆里嫩，口味咸香。通常比较安全，但属于油炸，可能含麸质。"
        tags = ["日餐", "鸡肉", "油炸"]
    elif "teriyaki chicken" in lower:
        description = "照烧鸡肉饭，甜咸口鸡肉配米饭，通常不辣，比较稳。酱汁可能含大豆。"
        tags = ["日餐", "鸡肉", "比较安全"]
    elif "green tea ice cream" in lower:
        description = "抹茶冰淇淋，甜中带一点茶味微苦，通常含奶制品。适合饭后甜点。"
        tags = ["日餐", "甜点", "含奶"]
    elif "bibimbap" in lower:
        description = "韩式拌饭，米饭配蔬菜、肉、蛋和韩式辣酱。可以要求 sauce on the side 或 not spicy。"
        tags = ["韩餐", "主食", "可能辣"]
    elif "bulgogi" in lower:
        description = "韩式甜咸口牛肉，通常不太辣，适合不想冒险的人。可能含酱油、芝麻或蒜。"
        tags = ["韩餐", "牛肉", "比较安全"]
    elif "kimchi stew" in lower or "kimchi jjigae" in lower:
        description = "韩式泡菜汤，酸辣明显，常有猪肉、豆腐或海鲜。不能吃辣的人谨慎。"
        tags = ["韩餐", "偏辣", "汤"]
    elif "korean fried chicken" in lower:
        description = "韩式炸鸡，可能有甜辣酱、蒜香酱或原味。不能吃辣要选 original 或确认 sauce not spicy。"
        tags = ["韩餐", "鸡肉", "适合分享"]
    elif "seafood pancake" in lower:
        description = "韩式海鲜煎饼，通常有葱、面糊和海鲜，适合分享。海鲜或麸质过敏者不要点。"
        tags = ["韩餐", "海鲜", "适合分享"]
    elif "japchae" in lower:
        description = "韩式炒粉丝，通常是甜咸口，配蔬菜和肉，不太辣。可能含芝麻和酱油。"
        tags = ["韩餐", "不太辣", "主食"]
    elif "papaya salad" in lower:
        description = "青木瓜沙拉，通常酸辣清爽，可能含鱼露、花生或虾米。不能吃辣或花生过敏需要确认。"
        tags = ["泰餐", "可能偏辣", "可能含花生"]
    elif "mango sticky rice" in lower:
        description = "芒果糯米饭，泰式甜点，椰奶香明显，偏甜。适合饭后分享；不适合不吃椰奶/甜食的人。"
        tags = ["泰餐", "甜点", "椰奶"]
    elif any(word in lower for word in ["prawn", "prawns", "shrimp"]):
        description = "虾类菜，通常比较容易接受。对海鲜过敏的人不要点；可以要求少蒜或 sauce on the side。"
        tags = ["海鲜", "可能有蒜", "适合分享"]
    elif "margherita pizza" in lower:
        description = "经典披萨，主要是番茄酱、芝士和罗勒。口味简单，适合小孩和不想踩雷的人。"
        tags = ["披萨", "比较安全", "含芝士"]
    elif any(word in lower for word in ["spicy", "chilli", "chili", "nduja"]):
        description = "这道菜可能偏辣。Nduja 是辣味意式香肠酱，不太能吃辣的话建议选择 mild 或不要点。"
        tags = ["可能偏辣", "肉类", "需确认辣度"]
    elif "lamb" in lower:
        description = "羊肉菜，通常味道较浓、份量较大，适合分享。不喜欢羊味的人谨慎。"
        tags = ["羊肉", "适合分享", "味道较重"]
    elif any(word in lower for word in ["barramundi", "fish"]):
        description = "鱼类主菜。Barramundi 是澳洲常见白肉鱼，口味相对温和，适合想吃清淡一点的人。"
        tags = ["鱼类", "口味温和", "主菜"]
    elif "salad" in lower or "rocket" in lower:
        description = "沙拉类。Rocket 是芝麻菜，带一点苦味和辛香，通常作为配菜更合适。"
        tags = ["沙拉", "清爽", "配菜"]
    elif "tiramisu" in lower:
        description = "意式甜点，含咖啡味和奶油，通常是冷的。适合饭后分享。"
        tags = ["甜点", "含咖啡", "适合分享"]
    elif "garlic bread" in lower:
        description = "蒜香面包，常作为前菜，味道明显有蒜，适合分享。"
        tags = ["前菜", "有蒜", "适合分享"]
    elif "smoked chicken wings" in lower:
        description = "烟熏鸡翅，通常是腌制后烟熏/烤制，肉香明显。适合分享；口味可能偏咸。"
        tags = ["鸡肉", "适合分享", "可能偏咸"]
    elif "calamari fritti" in lower or "calamari cone" in lower or "fish cone" in lower:
        description = "pub 常见炸海鲜小吃，通常配酱和柠檬，适合分享。海鲜过敏者不要点。"
        tags = ["海鲜", "油炸", "适合分享"]
    elif "asian chicken salad" in lower:
        description = "亚洲风味鸡肉沙拉，通常有蔬菜、鸡肉和偏甜/酸的酱汁。想清淡可以要求 dressing on the side。"
        tags = ["鸡肉", "沙拉", "可酱汁分开"]
    elif "poke bowl" in lower:
        description = "Poke 碗饭通常有米饭、蔬菜、蛋白质和酱汁，偏清爽。具体鱼/肉和酱料需要看当天菜单。"
        tags = ["碗饭", "相对清爽", "需确认配料"]
    elif "caesar" in lower:
        description = "凯撒沙拉，常有生菜、芝士、面包丁和凯撒酱，有时会加鸡肉或培根。"
        tags = ["沙拉", "可能含培根", "可作配菜"]
    elif "bangers" in lower and "mash" in lower:
        description = "英澳 pub 常见菜，香肠配土豆泥和肉汁。通常份量扎实；可能含猪肉和奶制品。"
        tags = ["pub food", "香肠", "份量扎实"]
    elif "nachos" in lower:
        description = "玉米片配牛肉、芝士、酱和酸奶油等，适合分享。可能偏咸或微辣。"
        tags = ["适合分享", "含芝士", "可能微辣"]
    elif "burrito" in lower:
        description = "卷饼类主食，里面通常有鱼/肉、米饭或蔬菜和酱。不能吃辣要确认 sauce not spicy。"
        tags = ["卷饼", "主食", "需确认辣度"]
    elif "bolognese" in lower:
        description = "番茄肉酱意面，口味比较熟悉，适合不想冒险的人。通常含麸质，可能撒芝士。"
        tags = ["意面", "肉酱", "比较安全"]
    elif "chocolate lava cake" in lower:
        description = "巧克力熔岩蛋糕，甜度高、巧克力味浓，通常适合饭后分享。"
        tags = ["甜点", "巧克力", "偏甜"]
    elif "pecan pie" in lower:
        description = "山核桃派，坚果香明显，通常很甜。坚果过敏者不要点。"
        tags = ["甜点", "含坚果", "偏甜"]
    elif "seasonal vegetables" in lower:
        description = "时令蔬菜配菜，适合想吃清淡一点或给老人搭配主菜。"
        tags = ["蔬菜", "配菜", "清淡"]
    elif "mashed potato" in lower:
        description = "土豆泥配肉汁，口感软，适合老人和小孩；可能含奶制品。"
        tags = ["配菜", "口感软", "可能含奶"]
    elif "pepperoni" in lower:
        description = "辣香肠披萨，通常不是很辣，但偏咸、偏油，含猪肉。"
        tags = ["披萨", "猪肉", "偏咸"]
    elif any(word in lower for word in ["seafood", "linguine"]):
        description = "海鲜意面，可能有虾、贝类或鱼。对海鲜过敏的人不要点。"
        tags = ["海鲜", "意面", "需注意过敏"]
    elif any(word in lower for word in ["fettuccine", "pasta"]):
        description = "意面类，通常比较容易接受。如果是 creamy，说明奶油味较重。"
        tags = ["意面", "比较安全", "可能含奶"]
    elif "parmigiana" in lower:
        description = "澳洲酒吧常见鸡排，通常是炸鸡排上面加番茄酱和芝士，份量较大。"
        tags = ["鸡肉", "含芝士", "份量大"]
    elif "panna cotta" in lower:
        description = "意式奶冻，口感像布丁，偏甜，通常适合作为饭后甜点。"
        tags = ["甜点", "奶制品", "口感软"]

    if any(word in lower for word in ["spicy", "chilli", "chili", "nduja"]) and "可能偏辣" not in tags:
        tags.append("可能偏辣")
    if any(word in lower for word in ["prawn", "fish", "barramundi", "seafood", "salmon"]) and "海鲜" not in tags and "鱼类" not in tags:
        tags.append("海鲜")
    if any(word in lower for word in ["kids", "pancakes"]) and "儿童友好" not in tags:
        tags.append("儿童友好")

    return description, tags[:4]


def fallback_card(payload):
    restaurant = payload.get("restaurantName") or "your restaurant"
    party = payload.get("partySize") or "2"
    time = payload.get("bookingTime") or "tonight"
    dishes = payload.get("dishes", [])
    restrictions = payload.get("restrictions", [])
    special = payload.get("specialNotes") or ""
    dish_lines = "\n".join(f"- {dish.get('name_en', '')}" for dish in dishes)
    requests = []
    for raw in restrictions + ([special] if special else []):
        for item in re.split(r"[,，;；]", str(raw)):
            item = item.strip()
            if item and item.lower() not in [existing.lower() for existing in requests]:
                requests.append(item)
    request_text = ", ".join(requests)
    return {
        "bookingMessage": (
            f"Hi {restaurant}, I would like to book a table for {party} people at {time}. "
            "Could you please confirm if a table is available? Thank you."
        ),
        "orderCard": (
            "We would like to order:\n"
            f"{dish_lines}\n\n"
            f"Special requests: {request_text or 'None'}\n\n"
            "If anything is unavailable, please point to the menu or write it down for us."
        ),
        "fallbackCard": (
            "Sorry, my English is limited.\n"
            "Could you please speak slowly, point to the menu, or write it down?\n"
            "Thank you for your help."
        ),
    }


def fallback_restaurants(area_name=""):
    known = known_restaurants(area_name)
    if known:
        return known
    area = area_name or "Sydney"
    sample_menus = {
        "bistro": "\n".join(
            [
                "Burrata with heirloom tomatoes and basil oil",
                "Grilled king prawns with garlic butter and lemon",
                "Wood-fired margherita pizza",
                "Spicy nduja pizza with mozzarella and chilli honey",
                "Slow cooked lamb shoulder with rosemary potatoes",
                "Pan roasted barramundi with fennel salad",
                "Rocket parmesan salad",
                "Tiramisu",
                "Kids pasta with tomato sauce",
            ]
        ),
        "cafe": "\n".join(
            [
                "Flat white",
                "Long black",
                "Avocado toast with poached eggs",
                "Smoked salmon bagel",
                "Chicken schnitzel sandwich",
                "Mushroom omelette",
                "Banana bread",
                "Kids pancakes",
            ]
        ),
        "italian": "\n".join(
            [
                "Garlic bread",
                "Caesar salad",
                "Margherita pizza",
                "Pepperoni pizza",
                "Seafood linguine",
                "Creamy mushroom fettuccine",
                "Chicken parmigiana",
                "Panna cotta",
            ]
        ),
        "pub": "\n".join(
            [
                "Fish and chips",
                "Chicken parmigiana",
                "Beef burger with chips",
                "Caesar salad with grilled chicken",
                "Salt and pepper calamari",
                "Steak sandwich",
                "Sticky date pudding",
            ]
        ),
        "thai": "\n".join(
            [
                "Chicken pad thai",
                "Green curry with beef",
                "Massaman lamb curry",
                "Tom yum prawns",
                "Cashew nut stir fry",
                "Coconut rice",
                "Mango sticky rice",
            ]
        ),
        "seafood": "\n".join(
            [
                "Fresh oysters",
                "Grilled barramundi",
                "Garlic prawns",
                "Seafood platter",
                "Calamari and chips",
                "Greek salad",
                "Lemon tart",
            ]
        ),
        "japanese": "\n".join(
            [
                "Chicken teriyaki don",
                "Salmon sashimi",
                "Pork gyoza",
                "Tempura udon",
                "Karaage chicken",
                "Miso soup",
                "Green tea ice cream",
            ]
        ),
        "breakfast": "\n".join(
            [
                "Eggs benedict",
                "Big breakfast",
                "Smashed avocado",
                "Belgian waffles",
                "Breakfast burrito",
                "Iced latte",
                "Fresh orange juice",
            ]
        ),
    }
    specs = [
        ("local-bistro", f"{area} Local Bistro", "4.6", "适合第一次尝试本地西餐，选择比较稳。", ["西餐", "适合老人", "第一次尝试"], "bistro", "$$"),
        ("garden-cafe", f"{area} Garden Cafe", "4.5", "适合早午餐、咖啡和轻食，点餐相对简单。", ["早午餐", "咖啡", "儿童友好"], "cafe", "$"),
        ("laneway-italian", f"{area} Laneway Italian", "4.4", "适合家庭聚餐，披萨和意面容易提前选好。", ["意餐", "家庭聚餐", "不容易踩雷"], "italian", "$$"),
        ("harbour-pub", f"{area} Family Pub", "4.3", "澳洲常见酒吧餐，份量大，适合想体验本地餐的人。", ["澳洲本地", "份量大", "可点安全菜"], "pub", "$$"),
        ("thai-kitchen", f"{area} Thai Kitchen", "4.4", "泰餐选择多，但要提前说明辣度。", ["泰餐", "需确认辣度", "适合分享"], "thai", "$$"),
        ("seafood-grill", f"{area} Seafood Grill", "4.2", "适合海鲜，但过敏用户需要谨慎。", ["海鲜", "适合分享", "需注意过敏"], "seafood", "$$$"),
        ("japanese-dining", f"{area} Japanese Dining", "4.5", "日餐菜单结构清楚，适合不想现场解释太多。", ["日餐", "选择清楚", "比较安全"], "japanese", "$$"),
        ("breakfast-club", f"{area} Breakfast Club", "4.1", "早餐和咖啡类，适合白天先练习使用。", ["早餐", "咖啡", "轻食"], "breakfast", "$"),
    ]
    return {
        "source": "demo",
        "message": "真实餐厅暂时获取失败。下面是演示餐厅，不是真实地图结果。",
        "restaurants": [
            {
                "id": f"demo-{slug}",
                "name": name,
                "area": area,
                "address": f"{area}, NSW",
                "rating": rating,
                "userRatingCount": str(120 + index * 37),
                "priceLevel": price,
                "note": note,
                "tags": tags,
                "googleMapsUri": "",
                "websiteUri": "",
                "hasMenu": True,
                "menuText": sample_menus[menu_key],
            }
            for index, (slug, name, rating, note, tags, menu_key, price) in enumerate(specs)
        ],
    }


def khao_pla_structured_dishes():
    rows = [
        ("Massaman beef cheek curry", "玛莎曼慢炖牛脸肉咖喱", "$25", "南泰风格咖喱，慢炖牛脸肉配罗望子和棕榈糖。通常浓郁、微甜、香料味明显，辣度比青咖喱温和。", "咖喱/主菜", ["浓郁", "微甜", "香料味"], ["含牛肉", "可能含椰奶", "坚果/过敏需确认"], ["泰餐", "咖喱", "相对稳"]),
        ("Gaeng Keaw Wan green curry chicken", "泰式青咖喱鸡", "$25", "鸡腿肉青咖喱，配泰国茄子、野姜、青柠叶、辣椒和罗勒。椰香明显，通常会辣。", "咖喱/主菜", ["椰香", "香料味", "偏辣"], ["含鸡肉", "通常有辣椒", "可能含椰奶"], ["泰餐", "咖喱", "需确认辣度"]),
        ("Gaeng Ngor confit duck curry", "红咖喱油封鸭", "$29", "油封鸭咖喱，菜单写有鸭血冻、红毛丹、菠萝、樱桃番茄和青柠叶。口味偏浓郁，带果香和甜酸感。", "咖喱/主菜", ["浓郁", "果香", "微甜"], ["含鸭肉", "含鸭血冻", "辣度需确认"], ["泰餐", "咖喱", "特色"]),
        ("Tom Yum banana prawn soup", "冬阴功香蕉虾汤", "$30", "酸辣虾汤，配香茅、南姜、青柠叶和香菜。味道鲜、酸、辣都明显，不吃辣的人要提前说明。", "汤/海鲜", ["酸", "辣", "鲜味"], ["虾/海鲜过敏者避免", "通常偏辣", "有香菜"], ["泰餐", "海鲜", "酸辣"]),
        ("Gaeng Pla Phuket curry with Coral trout and betel leaf", "普吉珊瑚鳟鱼蒌叶咖喱", "$31", "普吉风格鱼咖喱，使用珊瑚鳟鱼和蒌叶。鱼肉鲜味明显，咖喱香料味较重。", "咖喱/鱼类", ["鲜味", "香料味", "可能偏辣"], ["鱼类过敏者避免", "辣度需确认"], ["泰餐", "鱼类", "特色"]),
        ("Gai Yang char grilled turmeric lemongrass half chicken", "姜黄香茅炭烤半鸡", "$18", "半只鸡用姜黄和香茅腌制后炭烤。相比咖喱更直接，适合想吃肉但不想太复杂的人。", "烤鸡/主菜", ["炭烤香", "香茅味", "咸香"], ["含鸡肉", "酱料辣度需确认"], ["泰餐", "鸡肉", "相对安全"]),
        ("Kra Pao minced chicken with chilli and holy basil", "泰式打抛辣炒鸡肉碎", "$21", "鸡肉碎配辣椒和圣罗勒快炒，味道咸香、有罗勒香，通常偏辣。", "炒菜/主菜", ["咸香", "罗勒香", "偏辣"], ["含鸡肉", "有辣椒"], ["泰餐", "下饭", "需确认辣度"]),
        ("Gai Nam Prik Pao chicken with cashew nut and chilli jam", "腰果辣椒酱炒鸡", "$21", "鸡肉配腰果、葱和泰式辣椒酱快炒。通常咸甜带微辣，适合配饭。", "炒菜/主菜", ["咸甜", "坚果香", "微辣"], ["含腰果", "含鸡肉", "坚果过敏者避免"], ["泰餐", "鸡肉", "坚果风险"]),
        ("Nua Pad Cha Pru beef with Phuket curry paste and betel leaf", "普吉咖喱蒌叶炒牛肉", "$24", "牛肉配普吉咖喱酱、秋葵和蒌叶快炒。香料味重，适合能接受泰式香草味的人。", "炒菜/牛肉", ["香料味", "咸香", "可能偏辣"], ["含牛肉", "辣度需确认"], ["泰餐", "牛肉", "特色"]),
        ("Kana Moo Krob crispy pork belly with Chinese broccoli", "芥兰炒脆皮猪肉", "$24.5", "脆皮猪肉配芥兰和辣椒快炒。口味咸香、油脂感较重，很适合配饭。", "炒菜/猪肉", ["咸香", "肉香", "油脂感"], ["含猪肉", "有辣椒", "可能偏油"], ["泰餐", "猪肉", "下饭"]),
        ("Crying Tiger Wagyu striploin", "泰式烤和牛牛排", "$27", "伊森风格腌制和牛牛排，通常配泰式蘸酱。肉味明显，蘸酱可能酸辣。", "牛排/主菜", ["肉香", "炭烤香", "蘸酱酸辣"], ["含牛肉", "蘸酱辣度需确认"], ["泰餐", "牛肉", "适合吃肉"]),
        ("Salt and Pepper Calamari with Tom Yum spice salt", "冬阴功椒盐炸鱿鱼", "$19", "炸鱿鱼配冬阴功香料盐，咸香、微辣，适合分享。", "前菜/海鲜", ["咸香", "油炸", "微辣"], ["海鲜过敏者避免", "可能含麸质"], ["海鲜", "适合分享", "前菜"]),
        ("Pla Tao Si fish fillets with black beans", "豆豉炒鱼片", "$24", "鱼片配豆豉、葱和韭葱快炒。味道偏咸香，有豆豉发酵香。", "鱼类/主菜", ["咸香", "豆豉香", "鲜味"], ["鱼类过敏者避免", "可能含酱油"], ["鱼类", "下饭"]),
        ("Pla Neung Manow steamed Basa fillet with chilli lime dressing", "青柠辣汁蒸巴沙鱼", "$24", "蒸巴沙鱼配白菜、芹菜、香菜和青柠辣汁。比炸物清爽，但酸辣味明显。", "鱼类/主菜", ["酸", "辣", "清爽"], ["鱼类过敏者避免", "有辣椒", "有香菜"], ["鱼类", "相对清爽"]),
        ("Yum Nashi Pear salad with crispy soft shell crab", "水梨软壳蟹沙拉", "$28", "水梨沙拉配炸软壳蟹、香菜、椰丝、虾米、花生、辣椒和青柠汁。酸辣清爽但过敏点多。", "沙拉/海鲜", ["酸", "辣", "清爽"], ["蟹/海鲜过敏者避免", "含花生", "可能含虾米"], ["海鲜", "沙拉", "花生风险"]),
        ("Hoy Pad Ped baby clam with Sriracha sauce", "是拉差辣酱炒小蛤蜊", "$28", "小蛤蜊配自家是拉差辣酱和泰式罗勒快炒，可加煎面。鲜味明显，通常会辣。", "贝类/主菜", ["鲜味", "辣", "罗勒香"], ["贝类过敏者避免", "通常偏辣"], ["海鲜", "贝类", "下饭"]),
        ("Yum Mango green mango salad with crispy whole fish", "青芒果炸全鱼沙拉", "MP", "青芒果沙拉配当日炸全鱼、香菜、葱、花生和椰丝。酸爽开胃，鱼种和价格会按当天变化。", "鱼类/沙拉", ["酸", "鲜味", "脆口"], ["鱼类过敏者避免", "含花生", "价格需现场确认"], ["鱼类", "当日供应", "分享"]),
        ("Makua Tord fried red curry battered eggplant", "红咖喱炸茄子", "$14", "茄子裹红咖喱面糊油炸，配甜辣酱和花生。外脆内软，适合分享。", "蔬菜/前菜", ["甜辣", "油炸", "软糯"], ["含花生", "可能含麸质", "油炸"], ["蔬菜", "前菜", "花生风险"]),
        ("Salt and Pepper Tofu and Mushroom", "冬阴功椒盐豆腐蘑菇", "$18", "炸豆腐和三种蘑菇，配冬阴功香料盐。咸香、微辣，适合不想吃肉的人。", "素食/前菜", ["咸香", "菌菇香", "微辣"], ["可能含麸质", "可能与海鲜同厨房处理"], ["豆腐", "蘑菇", "素食友好"]),
        ("Pad Pak mixed vegetables with tofu", "豆腐炒杂菜", "$20", "杂菜和豆腐配素蚝油快炒。口味比咖喱清淡，适合想吃蔬菜的人。", "素食/主菜", ["咸香", "清淡"], ["酱汁成分需确认"], ["蔬菜", "豆腐", "素食友好"]),
        ("Pad Thai chicken noodle with egg peanuts tamarind and dried shrimp", "鸡肉泰式炒河粉", "$20", "鸡肉炒河粉，配鸡蛋、花生、豆芽、罗望子、虾米和棕榈糖。酸甜咸香，属于泰餐常见安全菜。", "米粉/主食", ["酸甜", "咸香"], ["含花生", "含鸡蛋", "可能含虾米"], ["泰餐", "主食", "热门"]),
        ("Pad See Eiw flat rice noodle with chicken egg and Chinese broccoli", "鸡肉酱油炒河粉", "$20", "宽河粉配鸡肉、鸡蛋、黑酱油和芥兰快炒。比 Pad Thai 更咸香，不太酸甜。", "米粉/主食", ["咸香", "酱香", "锅气"], ["含鸡蛋", "可能含酱油/麸质"], ["泰餐", "主食", "相对安全"]),
        ("Kuy Teaw Kee Mao drunken noodles with chicken chilli and holy basil", "鸡肉醉鬼炒河粉", "$20", "宽河粉配鸡肉、鸡蛋、辣椒、白菜、竹笋和圣罗勒快炒。香气重，通常比普通炒河粉更辣。", "米粉/主食", ["咸香", "罗勒香", "偏辣"], ["含鸡蛋", "有辣椒", "含鸡肉"], ["泰餐", "主食", "需确认辣度"]),
        ("Khao Pad fried rice with chicken egg tomato and Chinese broccoli", "鸡肉泰式炒饭", "$20", "鸡肉、鸡蛋、番茄和芥兰炒饭。口味直接，适合老人、小孩或不想尝试太复杂味道的人。", "米饭/主食", ["咸香", "锅气"], ["含鸡蛋", "含鸡肉"], ["泰餐", "主食", "比较安全"]),
        ("Khao Pad Man Goong fried rice with banana prawns and shrimp paste", "虾膏香蕉虾炒饭", "$28", "炒饭配香蕉虾和辣虾膏。虾味和鲜味很明显，可能微辣。", "米饭/海鲜", ["鲜味", "虾香", "可能微辣"], ["虾/海鲜过敏者避免", "可能含虾膏"], ["海鲜", "炒饭"]),
        ("Goong Ob Woon Sen banana prawns with vermicelli noodles", "粉丝焖香蕉虾", "$28", "香蕉虾配粉丝和中式芹菜砂锅焖制。鲜味重，粉丝会吸收酱汁。", "粉丝/海鲜", ["鲜味", "咸香"], ["虾/海鲜过敏者避免", "有芹菜"], ["海鲜", "粉丝", "适合分享"]),
        ("Moo Grob Prik Khing crispy pork belly with red curry paste", "红咖喱脆皮猪肉", "$25.5", "脆皮猪肉配红咖喱酱、豆角和青柠叶快炒。肉香重，通常咸辣下饭。", "猪肉/主菜", ["咸香", "肉香", "可能偏辣"], ["含猪肉", "可能偏油", "辣度需确认"], ["泰餐", "猪肉", "下饭"]),
        ("Pla's Pork Ribs with tamarind sauce", "泰式罗望子猪肋排", "$27", "Khao Pla 招牌猪肋排，二次烹调后配罗望子酱。酸甜咸香、肉味重，适合喜欢肉类的人。", "招牌主菜", ["酸甜", "肉香", "浓郁"], ["含猪肉", "酱汁成分需确认"], ["招牌", "猪肉", "推荐"]),
        ("Steam Coral Trout with ginger and soy", "姜葱豉油蒸珊瑚鳟鱼", "$31", "珊瑚鳟鱼片配姜和酱油清蒸。比咖喱和炸物更清淡，适合想吃鱼的人。", "鱼类/主菜", ["鲜味", "姜香", "清淡"], ["鱼类过敏者避免", "可能含酱油"], ["鱼类", "相对清淡"]),
        ("Kids Meal fried rice or noodles with fried chicken wings", "儿童餐：炒饭或面配炸鸡翅", "$17", "可选番茄炒饭或面，配炸鸡翅、煎蛋、蔬菜和橙汁。适合小孩或想点简单菜的人。", "儿童餐", ["咸香", "口味简单"], ["含鸡肉", "含鸡蛋", "油炸"], ["儿童友好", "简单"]),
        ("Black Sticky Rice with Thai milk tea ice cream", "黑糯米配泰奶冰淇淋", "$11", "温热黑糯米配茉莉西米、菠萝蜜、泰式奶茶冰淇淋和黑甘蔗糖浆。甜、糯、奶香明显。", "甜点", ["甜", "糯", "奶香"], ["含奶制品", "偏甜"], ["甜点", "泰式", "适合饭后"]),
    ]
    return [
        {
            "id": str(index),
            "name_en": name_en,
            "name_zh": name_zh,
            "original_text": name_en,
            "price": price,
            "description_zh": description,
            "category": category,
            "taste": taste,
            "cautions": cautions,
            "tags": tags,
            "source": "官网 PDF 菜单（Khao Pla）",
            "confidence": "高",
            "recommendationReason": "来自该餐厅对应菜单，适合直接加入点餐卡；当天是否售罄仍以餐厅现场为准。",
        }
        for index, (name_en, name_zh, price, description, category, taste, cautions, tags) in enumerate(rows, start=1)
    ]


def mamak_structured_dishes():
    rows = [
        ("Roti canai", "原味印度煎饼 Roti Canai", "$11", "Mamak 经典 roti，外层酥脆、里面松软，通常配两种咖喱蘸酱和辣参巴。适合第一次尝试。", "主食/小吃", ["酥脆", "咖喱香", "可能微辣"], ["含麸质", "蘸酱可能偏辣"], ["招牌", "适合分享", "相对安全"]),
        ("Roti telur", "鸡蛋印度煎饼", "$12", "在 roti 里加入鸡蛋，口感更厚实，味道温和。适合早餐感或不想太辣的人。", "主食/小吃", ["蛋香", "酥软"], ["含鸡蛋", "含麸质"], ["roti", "比较安全"]),
        ("Roti planta", "黄油印度煎饼", "$12", "黄油味更浓的 roti，口感更香更油润。适合喜欢奶香的人。", "主食/小吃", ["黄油香", "酥脆"], ["含奶制品", "含麸质", "可能偏油"], ["roti", "奶香"]),
        ("Roti bawang", "洋葱印度煎饼", "$12", "加入甜红洋葱的 roti，带洋葱甜味和香气。适合配咖喱蘸酱。", "主食/小吃", ["洋葱香", "微甜", "酥脆"], ["含麸质"], ["roti", "配咖喱"]),
        ("Roti telur bawang", "鸡蛋洋葱印度煎饼", "$13", "鸡蛋和洋葱版 roti，像更有层次的煎蛋饼，适合想吃扎实一点的人。", "主食/小吃", ["蛋香", "洋葱香", "咸香"], ["含鸡蛋", "含麸质"], ["roti", "比较顶饱"]),
        ("Murtabak chicken or lamb", "鸡肉或羊肉夹馅煎饼", "$19", "夹有香料肉、卷心菜、鸡蛋和洋葱的厚煎饼。可选鸡肉或羊肉，份量更扎实。", "主食/肉类", ["香料味", "肉香", "咸香"], ["含鸡蛋", "含麸质", "肉类需选择"], ["马来西亚餐", "主食", "适合分享"]),
        ("Chicken or Beef Satay", "马来沙爹鸡肉或牛肉串", "", "炭烤鸡肉或牛肉串，配甜辣花生沙爹酱。适合分享，但花生过敏者不能点。", "烤串/前菜", ["炭烤香", "花生香", "甜辣"], ["含花生", "肉类需选择"], ["招牌", "适合分享", "花生风险"]),
        ("Kari ayam", "马来鸡肉咖喱", "$25", "经典鸡肉咖喱，用现磨香料和大块土豆烹煮。适合配饭或 roti。", "咖喱/主菜", ["咖喱香", "浓郁", "可能微辣"], ["含鸡肉", "辣度需确认"], ["咖喱", "鸡肉", "配饭"]),
        ("Kari ikan", "酸香鱼咖喱", "$27", "鱼咖喱，配番茄、秋葵和茄子，口味偏酸香。适合喜欢鱼和咖喱的人。", "咖喱/鱼类", ["酸香", "咖喱味", "鲜味"], ["鱼类过敏者避免", "辣度需确认"], ["咖喱", "鱼类"]),
        ("Kari kambing", "慢炖羊肉咖喱", "$27", "羊肉咖喱慢炖到软烂，菜单标注 spicy，通常比鸡肉咖喱更重口。", "咖喱/羊肉", ["浓郁", "羊肉香", "偏辣"], ["含羊肉", "通常偏辣"], ["咖喱", "羊肉", "重口味"]),
        ("Kari sayur", "马来素菜咖喱", "$22", "蔬菜咖喱，含扁豆、番茄、胡萝卜、土豆、长豆和茄子。适合不吃肉的人。", "素食/咖喱", ["咖喱香", "蔬菜甜味"], ["辣度需确认"], ["素食友好", "咖喱"]),
        ("Sambal udang", "参巴辣炒虎虾", "$30", "虎虾用火辣参巴酱快炒，虾味明显，通常偏辣。", "海鲜/主菜", ["辣", "鲜味", "参巴香"], ["虾/海鲜过敏者避免", "通常偏辣"], ["海鲜", "重口味"]),
        ("Sambal sotong", "参巴辣炒鱿鱼", "$26", "鱿鱼配火辣参巴酱快炒。口感有嚼劲，味道偏辣。", "海鲜/主菜", ["辣", "咸香", "海鲜味"], ["海鲜过敏者避免", "通常偏辣"], ["海鲜", "参巴"]),
        ("Ayam goreng", "马来香料炸鸡", "$24 for 4", "马来西亚风味炸鸡，用香草和香料腌制。适合不想吃咖喱但想吃肉的人。", "炸鸡/主菜", ["香料味", "油炸", "咸香"], ["含鸡肉", "油炸", "可能含麸质"], ["炸鸡", "比较安全"]),
        ("Ayam berempah", "香料炒鸡块", "$25", "小块鸡肉配完整香料快炒，香料味比普通炸鸡更明显。", "鸡肉/主菜", ["香料味", "咸香"], ["含鸡肉", "辣度需确认"], ["鸡肉", "配饭"]),
        ("Kangkung belacan", "虾酱炒空心菜", "$21", "空心菜配辣椒和马来虾酱快炒，味道咸香、虾酱味明显。", "蔬菜/配菜", ["咸香", "虾酱味", "可能微辣"], ["含虾酱", "海鲜过敏者避免"], ["蔬菜", "下饭"]),
        ("Kacang panjang belacan", "虾酱炒长豆", "$21", "长豆配辣椒和虾酱快炒，口感脆，适合配饭。", "蔬菜/配菜", ["咸香", "脆口", "虾酱味"], ["含虾酱", "海鲜过敏者避免"], ["蔬菜", "下饭"]),
        ("Rojak", "马来罗惹沙拉", "$22", "马来西亚沙拉，含虾和椰子炸物、炸豆腐、水煮蛋、沙葛、黄瓜和浓稠辣花生酱。过敏点较多。", "沙拉/分享", ["甜辣", "花生香", "脆口"], ["含花生", "含虾", "含鸡蛋"], ["沙拉", "适合分享", "花生风险"]),
        ("Nasi Lemak", "椰浆饭", "$14", "马来西亚代表菜，椰香米饭配参巴、花生、脆江鱼仔、黄瓜和水煮蛋。可加咖喱或炸鸡。", "米饭/主食", ["椰香", "咸香", "可能微辣"], ["含花生", "含鸡蛋", "可能含鱼干"], ["招牌", "主食", "可加肉"]),
        ("Mee goreng", "马来炒福建面", "$19", "辣炒福建面，含鸡蛋、虾、鱼饼和豆芽。味道咸香偏辣。", "炒面/主食", ["咸香", "锅气", "偏辣"], ["含虾/海鲜", "含鸡蛋", "含麸质"], ["炒面", "热门"]),
        ("Maggi goreng", "马来炒 Maggi 面", "$19", "用 Maggi 方便面做的炒面版本，口味更街头、更重口。", "炒面/主食", ["咸香", "锅气", "可能偏辣"], ["含麸质", "配料需确认"], ["炒面", "街头风味"]),
        ("Nasi goreng", "马来炒饭", "$19", "马来炒饭，配辣参巴、鸡蛋、虾、四季豆和蔬菜，撒炸葱。", "炒饭/主食", ["咸香", "锅气", "可能偏辣"], ["含虾", "含鸡蛋"], ["炒饭", "主食"]),
        ("Ais kacang", "马来红豆刨冰", "$11", "刨冰甜点，含红豆、玉米、仙草、玫瑰糖浆和炼奶。甜度高，适合饭后分享。", "甜点", ["甜", "冰凉", "奶香"], ["含奶制品", "偏甜"], ["甜点", "冰品"]),
        ("Cendol", "煎蕊冰", "$11", "班兰粉条配椰奶、椰糖浆、红豆和刨冰。椰香重，甜度较高。", "甜点", ["椰香", "甜", "冰凉"], ["含椰奶", "偏甜"], ["甜点", "马来西亚经典"]),
    ]
    return [
        {
            "id": str(index),
            "name_en": name_en,
            "name_zh": name_zh,
            "original_text": name_en,
            "price": price,
            "description_zh": description,
            "category": category,
            "taste": taste,
            "cautions": cautions,
            "tags": tags,
            "source": "Mamak 官网菜单 + Chatswood 点餐页",
            "confidence": "高",
            "recommendationReason": "来自 Mamak 官网菜单并确认有 Chatswood 点餐页；当天是否售罄仍以餐厅现场为准。",
        }
        for index, (name_en, name_zh, price, description, category, taste, cautions, tags) in enumerate(rows, start=1)
    ]


def sunday_seoul_structured_dishes():
    rows = [
        ("Spicy Tomato Mussel Stew", "辣番茄鲜青口鱿鱼汤", "$36", "鲜青口和鱿鱼煮在辣番茄汤底里。酸辣、海鲜味明显，吃完汤可加意面。", "汤锅/海鲜", ["酸辣", "番茄味", "海鲜鲜味"], ["含青口/鱿鱼", "通常偏辣", "可加意面 $7"], ["招牌汤锅", "海鲜", "适合分享"]),
        ("Clam & Prawn Stew", "蛤蜊鲜虾汤锅", "$33", "蛤蜊和虾煮成的清鲜汤锅，比辣番茄汤更直接，适合喜欢海鲜汤的人。", "汤锅/海鲜", ["鲜味", "清爽", "海鲜味"], ["含蛤蜊/虾", "可加意面 $7"], ["海鲜", "汤锅", "适合分享"]),
        ("Homemade Hamburg Steak", "自制芝士汉堡排饭", "$29", "自制汉堡肉排，配芝士、烤蔬菜和米饭。口味比较稳，适合不想吃太辣的人。", "肉类/主食", ["肉香", "芝士香", "咸香"], ["含牛/肉类成分需确认", "含奶制品"], ["主食", "相对安全", "不偏辣"]),
        ("Minari Pancake w dried shrimp", "水芹干虾韩式煎饼", "$26", "水芹菜和干虾做的韩式煎饼，外脆内软，有草本香和虾的鲜味。", "煎饼/分享", ["香脆", "水芹香", "虾鲜味"], ["含虾", "可能含麸质/鸡蛋"], ["煎饼", "适合分享", "海鲜风险"]),
        ("Rose Tteokbokki", "玫瑰酱韩式炒年糕", "$28", "鱼饼、培根、香肠、年糕和粉丝做成的玫瑰酱年糕。奶香和辣味会比传统年糕更柔和。", "年糕/分享", ["奶香", "微辣", "软糯"], ["含鱼饼", "含培根/香肠", "可能含奶制品"], ["年糕", "适合分享", "热门"]),
        ("Squid Pancake", "鱿鱼葱煎饼", "$26", "鱿鱼和葱做的韩式煎饼，口感香脆，有鱿鱼的嚼劲。", "煎饼/海鲜", ["香脆", "葱香", "海鲜味"], ["含鱿鱼", "可能含麸质/鸡蛋"], ["煎饼", "海鲜", "适合分享"]),
        ("Wagyu Chili Mapo Tofu", "和牛辣麻婆豆腐", "$28", "辣味麻婆豆腐，上面有切片和牛。适合想吃下饭菜的人，但通常会辣。", "豆腐/牛肉", ["辣", "豆腐嫩", "牛肉香"], ["含牛肉", "通常偏辣", "有香菜需确认"], ["下饭", "豆腐", "辣味"]),
        ("Pad Thai w Sweet&spicy chicken", "甜辣炸鸡泰式炒河粉", "$28", "泰式炒河粉配韩式甜辣炸鸡，味道偏甜辣，份量感强。", "面食/鸡肉", ["甜辣", "酸甜", "油炸香"], ["含鸡肉", "可能含花生/鸡蛋", "油炸"], ["主食", "融合菜", "热门"]),
        ("Deep Fried Whole Chicken", "韩式整只炸鸡", "$36", "整只炸鸡配腌萝卜。适合几个人分享，口味比汤锅更容易接受。", "炸鸡/分享", ["酥脆", "咸香", "油炸"], ["含鸡肉", "可能含麸质", "油炸"], ["炸鸡", "适合分享", "相对安全"]),
        ("Deep Fried Boneless Chicken", "韩式无骨炸鸡", "Half $22 / Whole $40", "无骨炸鸡，可选原味、甜辣、酱油蒜香或墨西哥辣椒味。适合怕骨头麻烦的人。", "炸鸡/分享", ["酥脆", "可选酱味", "可能辣"], ["含鸡肉", "可能含麸质", "辣味口味需确认"], ["炸鸡", "无骨", "适合分享"]),
        ("Boneless Chicken Flavour Upgrade", "无骨炸鸡口味升级", "Half $23 / Whole $42", "无骨炸鸡加味版本，可选甜辣、酱油蒜香或墨西哥辣椒等口味。", "炸鸡/口味", ["甜辣", "蒜香", "可选辣"], ["含鸡肉", "酱汁可能偏甜或偏辣"], ["炸鸡", "可选口味"]),
        ("Gochujang Jjigae", "韩式辣酱午餐肉牛肉乌冬锅", "$38", "韩式辣酱汤，里面有午餐肉、牛肉片和乌冬面。味道重、辣度高，适合能吃辣的人。", "汤锅/肉类", ["辣", "浓郁", "咸香"], ["含牛肉/午餐肉", "通常偏辣", "可加面 $5 或饭 $3"], ["汤锅", "重口味", "下饭"]),
        ("Skewered Oden w cooked live mussel", "鱼饼串青口汤锅", "$38", "鱼饼串汤配煮青口，汤味鲜，适合想喝热汤和分享的人。", "汤锅/鱼饼", ["鲜味", "鱼饼香", "热汤"], ["含鱼饼", "含青口", "可加面 $5 或饭 $3"], ["汤锅", "适合分享", "海鲜风险"]),
    ]
    return [
        {
            "id": str(index),
            "name_en": name_en,
            "name_zh": name_zh,
            "original_text": name_en,
            "price": price,
            "description_zh": description,
            "category": category,
            "taste": taste,
            "cautions": cautions,
            "tags": tags,
            "source": "Sunday Seoul 官网菜单 PDF",
            "confidence": "高",
            "recommendationReason": "来自 Sunday Seoul 官网 PDF 菜单；当天是否售罄仍以餐厅现场为准。",
        }
        for index, (name_en, name_zh, price, description, category, taste, cautions, tags) in enumerate(rows, start=1)
    ]


def simple_structured_dishes(rows, source):
    return [
        {
            "id": str(index),
            "name_en": name_en,
            "name_zh": name_zh,
            "original_text": name_en,
            "price": price,
            "description_zh": description,
            "category": category,
            "taste": taste,
            "cautions": cautions,
            "tags": tags,
            "source": source,
            "confidence": "中高",
            "recommendationReason": "来自该餐厅公开菜单/官网/订餐页信息整理；当天是否售罄仍以餐厅现场为准。",
        }
        for index, (name_en, name_zh, price, description, category, taste, cautions, tags) in enumerate(rows, start=1)
    ]


def chatswood_menu_extension_rows(slug):
    extensions = {
        "cw-kazuma": [
            ("Tiger Tempura Prawn Roll", "老虎虾天妇罗寿司卷", "", "公开内容提到的寿司卷类菜，通常是炸虾配寿司饭和酱汁，适合想吃熟海鲜寿司的人。", "寿司/熟海鲜", ["酥脆", "鲜味", "酱汁味"], ["含虾", "可能含麸质"], ["寿司", "熟食", "海鲜"]),
            ("Sashimi Teishoku", "刺身定食", "", "Kazuma 官方介绍有 teishoku 午餐盘和新鲜刺身；这类套餐通常配主菜、米饭和小菜。", "定食/刺身", ["鲜味", "清爽"], ["生食", "鱼类过敏者避免"], ["午餐", "定食"]),
            ("Sushi Teishoku", "寿司定食", "", "寿司配定食小菜的午餐形式，适合想一次吃到寿司和配菜的人。", "定食/寿司", ["米醋香", "鲜味"], ["可能含生鱼", "酱油含麸质"], ["午餐", "寿司"]),
            ("Kurobuta Pork Katsu Set", "黑豚炸猪排定食", "", "黑豚炸猪排做成定食，适合不吃生食、想点稳妥热食的人。", "定食/猪肉", ["酥脆", "肉香"], ["含猪肉", "油炸", "可能含麸质"], ["定食", "相对安全"]),
        ],
        "cw-bistro-kai": [
            ("Seasoned Fries", "调味薯条", "", "公开评价和菜单信息提到的配菜，适合搭配牛排或分享菜。", "配菜", ["咸香", "酥脆"], ["油炸"], ["配菜", "适合分享"]),
            ("Beef Tartare", "生拌牛肉塔塔", "", "公开评价中提到的 Bistro Kai 菜品。通常是调味生牛肉，适合能接受生食的人。", "前菜/牛肉", ["肉香", "酸咸", "清爽"], ["生食", "含牛肉"], ["前菜", "特色"]),
            ("Lychee Granita", "荔枝冰沙 Granita", "", "公开报道提到的荔枝 granita，通常是清爽冰沙甜品，适合饭后解腻。", "甜品/冰品", ["荔枝香", "清爽", "甜"], ["冰品", "甜度需确认"], ["甜品", "清爽"]),
            ("Pandan Irish Coffee", "班兰爱尔兰咖啡", "", "公开评价提到的创意饮品，咖啡和酒香更明显，适合成年人饭后饮用。", "饮品/酒精", ["咖啡香", "班兰香", "酒香"], ["含酒精", "含咖啡因"], ["饮品", "特色"]),
        ],
        "cw-manpuku": [
            ("Shio Tonkotsu", "盐味豚骨拉面", "$21", "盐味猪骨汤底，配炙烧叉烧、白菜、笋干和葱。比酱油豚骨更清一点。", "拉面/豚骨", ["豚骨香", "咸香"], ["含猪肉", "含麸质"], ["拉面", "经典"]),
            ("Miso Ramen", "味噌拉面", "$17", "味噌猪鸡混合汤底，味道比盐味和酱油更浓厚，有发酵豆香。", "拉面/味噌", ["味噌香", "浓郁"], ["可能含猪肉", "含麸质"], ["拉面", "浓汤"]),
            ("Tsukemen", "日式蘸面", "$17.50", "面和浓汤分开，蘸着吃。汤底偏浓、微酸，适合想试不同吃法的人。", "拉面/蘸面", ["浓郁", "酸咸"], ["可能含猪肉", "含麸质"], ["蘸面", "特色"]),
            ("Aburi Chashu Ramen", "炙烧叉烧拉面", "$19.50", "炙烧叉烧、木耳、鸡蛋、芝麻、海苔和大量豆芽的拉面，肉香明显。", "拉面/猪肉", ["肉香", "浓郁", "炙烤香"], ["含猪肉", "含麸质"], ["叉烧", "拉面"]),
            ("Ramen Salad", "冷拉面沙拉", "$14.50", "冷面配蔬菜，可选芝麻酱或柚子味噌酱。适合天气热或想吃清爽一点的人。", "冷面/沙拉", ["清爽", "芝麻香", "微酸"], ["含麸质", "酱汁过敏需确认"], ["冷面", "清爽"]),
            ("Vegetable Ramen", "蔬菜拉面", "$15.50", "海鲜和蔬菜汤底加少量豆乳，配豆芽、玉米、南瓜和炸豆腐。适合不想吃肉的人。", "拉面/蔬菜", ["蔬菜甜味", "清淡"], ["可能含海鲜汤底", "含麸质"], ["蔬菜", "素食需确认"]),
            ("Yuzu Shio Coriander Ramen", "柚子盐味香菜拉面", "$17.50", "柚子盐味汤底加香菜，味道清香但香菜存在感强。", "拉面/清汤", ["柚子香", "清爽", "香菜味"], ["不吃香菜者避免", "含麸质"], ["清爽", "香菜"]),
            ("Chilli Bomb Add-on", "辣椒球加料", "", "给拉面加辣用，适合能吃辣的人；不吃辣或老人小孩不要加。", "加料/辣味", ["辣", "香料味"], ["明显增加辣度"], ["加料", "辣味"]),
        ],
        "cw-cafe-markus": [
            ("Toast and Regular Coffee Deal", "吐司配普通咖啡套餐", "", "公开页面提到的早餐特价，适合只想简单吃一点、配一杯咖啡的人。", "早餐/套餐", ["面包香", "咖啡香"], ["含麸质", "咖啡因"], ["早餐", "简单"]),
            ("Bacon Egg Roll and Regular Coffee Deal", "培根鸡蛋卷配咖啡套餐", "", "公开页面提到的早餐组合，比单点吐司更顶饱。", "早餐/套餐", ["咸香", "蛋香", "咖啡香"], ["含猪肉", "含鸡蛋", "含麸质"], ["早餐", "套餐"]),
            ("Chicken Schnitzel Wrap", "炸鸡排卷饼", "", "点评中提到鸡排卷/三明治份量大。卷饼版适合午餐打包。", "卷饼/鸡肉", ["酥脆", "咸香"], ["含鸡肉", "油炸", "含麸质"], ["午餐", "打包"]),
            ("French Fries", "薯条", "", "点评中提到薯条酥脆，适合配三明治或给小孩点。", "配菜", ["咸香", "酥脆"], ["油炸"], ["配菜", "儿童友好"]),
        ],
        "cw-chimichuri": [
            ("Bacon And Egg Cheese Burger", "培根鸡蛋芝士汉堡", "$10", "全天早餐菜单里的简单汉堡，适合早餐或快速午餐。", "早餐/汉堡", ["咸香", "芝士香", "蛋香"], ["含猪肉", "含鸡蛋", "含奶制品"], ["早餐", "简单"]),
            ("Breaky Burger", "早餐汉堡", "$15", "早餐风格汉堡，通常比培根蛋卷更丰富，适合想吃饱的人。", "早餐/汉堡", ["咸香", "丰富"], ["配料需确认", "含麸质"], ["早餐", "主食"]),
            ("Eggs On Toasted", "吐司配鸡蛋", "$12", "吐司配鸡蛋，口味最简单，适合老人或不想冒险的人。", "早餐/鸡蛋", ["蛋香", "面包香"], ["含鸡蛋", "含麸质"], ["简单", "早餐"]),
            ("Golden Poached Eggs On Red Velvet Croissant", "红丝绒牛角包水波蛋", "$25", "特色红丝绒牛角包配水波蛋，摆盘感强，口味偏创意。", "早午餐/特色", ["蛋香", "黄油香", "微甜"], ["含鸡蛋", "含奶制品", "含麸质"], ["特色", "早午餐"]),
            ("Seafood Tom Yum Pasta", "冬阴功海鲜意面", "$26", "官方菜单里的海鲜冬阴功意面，酸辣奶香，适合能接受重口味的人。", "意面/海鲜", ["酸辣", "海鲜味", "浓郁"], ["海鲜过敏者避免", "可能偏辣"], ["特色", "海鲜"]),
            ("Rich Beef Briskets Burger", "慢炖牛腩汉堡", "$25", "牛腩汉堡，肉味重、份量感强，适合午餐。", "汉堡/牛肉", ["肉香", "浓郁"], ["含牛肉", "含麸质"], ["主食", "午餐"]),
            ("Prawn Salad", "鲜虾沙拉", "$25", "虾和蔬菜沙拉，比汉堡和意面更清爽。", "沙拉/海鲜", ["清爽", "虾鲜味"], ["虾过敏者避免", "酱汁需确认"], ["沙拉", "清爽"]),
            ("Tropical Churro Sundae", "热带吉拿棒圣代", "$23", "吉拿棒配圣代，甜度较高，适合饭后分享或下午茶。", "甜品", ["甜", "酥脆", "奶香"], ["含奶制品", "含麸质"], ["甜品", "分享"]),
            ("Side Churro", "吉拿棒小食", "$10", "单点吉拿棒，外脆内软，适合想吃一点甜食的人。", "甜品/小吃", ["甜", "肉桂香", "酥脆"], ["含麸质", "油炸"], ["甜品", "小食"]),
            ("Sun-Kissed Salmon", "阳光三文鱼早午餐", "", "社媒菜单提到的三文鱼菜，通常偏清爽，适合喜欢鱼类早午餐的人。", "早午餐/鱼类", ["鱼香", "清爽"], ["鱼类过敏者避免"], ["早午餐", "鱼类"]),
            ("Scallops and Sunshine", "扇贝 Sunshine 早午餐", "", "新菜单社媒提到的扇贝菜，适合想尝试海鲜创意菜的人。", "海鲜/特色", ["鲜味", "清爽"], ["贝类过敏者避免"], ["海鲜", "特色"]),
            ("Raspberry Green Dream", "覆盆子绿色特饮", "", "社媒提到的饮品，偏果香清爽，适合不想喝咖啡的人。", "饮品", ["莓果香", "清爽"], ["糖分需确认"], ["饮品", "冷饮"]),
            ("Iced Long Black", "冰长黑咖啡", "", "不加奶的冰黑咖啡，咖啡味更直接。", "咖啡/饮品", ["咖啡香", "微苦"], ["含咖啡因"], ["咖啡", "冷饮"]),
        ],
        "cw-ooshman": [
            ("Zaatar & Cheese", "百里香芝士薄饼", "", "Ooshman 常见薄饼组合，香草味和芝士味都明显。", "薄饼/芝士", ["香草味", "芝士香", "咸香"], ["含奶制品", "含麸质", "芝麻过敏需确认"], ["薄饼", "经典"]),
            ("Deluxe Falafel Wrap", "豪华鹰嘴豆丸卷饼", "", "素食卷饼升级版，通常配更多蔬菜和酱汁。", "卷饼/素食", ["豆香", "酱汁味", "清爽"], ["油炸", "芝麻酱需确认"], ["素食友好", "打包"]),
            ("Garlic Goddess Wrap", "蒜香女神卷饼", "", "公开新菜单提到的卷饼，蒜香味会比较明显。", "卷饼/鸡肉", ["蒜香", "咸香"], ["蒜味明显", "酱汁需确认"], ["卷饼", "新菜单"]),
            ("Chicken & Mushroom Boat", "鸡肉蘑菇船形薄饼", "", "新菜单提到的 boat 类薄饼，鸡肉和蘑菇组合，适合热食打包。", "薄饼/鸡肉", ["鸡肉香", "菌菇香"], ["含鸡肉", "含麸质"], ["热食", "打包"]),
            ("Pistachio Delight", "开心果甜点", "", "新菜单提到的开心果甜点，坚果香明显。", "甜品/坚果", ["开心果香", "甜"], ["含坚果", "可能含奶制品"], ["甜品", "坚果"]),
            ("Tiramisu", "提拉米苏", "", "新菜单提到的甜点，咖啡和奶香明显，适合饭后。", "甜品", ["咖啡香", "奶香", "甜"], ["含奶制品", "含咖啡因"], ["甜品", "饭后"]),
            ("Pepperoni Burst", "意式辣香肠披萨", "", "披萨类菜单项，肉香和咸香明显，适合想点熟悉口味的人。", "披萨/肉类", ["肉香", "咸香", "可能微辣"], ["含肉类", "含麸质"], ["披萨", "快餐"]),
            ("Super Supreme", "至尊披萨", "", "配料更丰富的披萨，适合分享。", "披萨/分享", ["咸香", "丰富"], ["配料需确认", "含麸质"], ["披萨", "分享"]),
            ("Habibi Yiros", "中东烤肉卷/盘", "", "Yiros 风格肉类主食，酱汁和肉味明显。", "主食/肉类", ["肉香", "酱汁味"], ["肉类需确认", "含麸质"], ["主食", "打包"]),
            ("Spinach Pie", "菠菜派", "", "菠菜馅烤点，适合想吃素食或轻食的人。", "烘焙/素食", ["菠菜香", "面香"], ["含麸质", "可能含奶制品"], ["素食友好", "轻食"]),
            ("Crispy Chicken", "脆皮鸡", "", "炸/脆皮鸡类小食或主食，适合小孩和想吃稳妥肉类的人。", "鸡肉/小吃", ["酥脆", "鸡肉香"], ["含鸡肉", "油炸"], ["鸡肉", "简单"]),
            ("Lebo Fries", "黎巴嫩风味薯条", "", "Ooshman 风格薯条，通常会加酱汁或调味，适合分享。", "配菜", ["咸香", "酥脆", "酱汁味"], ["油炸", "酱汁需确认"], ["配菜", "分享"]),
            ("Big Mix Breakfast", "大份混合早餐薄饼", "", "早餐菜单提到的 Big Mix，通常配料更丰富，适合想吃饱的人。", "早餐/薄饼", ["丰富", "咸香"], ["配料需确认", "含麸质"], ["早餐", "份量大"]),
        ],
        "cw-gondola": [
            ("Fresh Crepes", "现做可丽饼", "", "官网评价提到店里也做 fresh crepes，可搭配 gelato 或甜酱。", "甜品/可丽饼", ["甜", "面香"], ["含麸质", "可能含奶制品"], ["甜品", "现做"]),
            ("Baked Apples Cinnamon Spice & Pastry Gelato", "烤苹果肉桂酥皮口味 Gelato", "", "官网提到的特殊口味，像苹果派风味，肉桂香明显。", "甜品/特色口味", ["苹果香", "肉桂香", "甜"], ["可能含奶制品", "可能含麸质"], ["特色", "季节口味"]),
            ("Tahini Black Sesame Gelato", "黑芝麻芝麻酱 Gelato", "", "官方社媒提到的特别口味，芝麻和坚果感明显。", "甜品/芝麻", ["芝麻香", "浓郁"], ["芝麻过敏者避免", "可能含奶制品"], ["特色", "芝麻"]),
            ("Chocolate Orange Gelato", "巧克力橙子 Gelato", "", "官方社媒提到的特别口味，巧克力浓郁，带橙子清香。", "甜品/巧克力", ["巧克力香", "橙香", "甜"], ["可能含奶制品"], ["特色", "巧克力"]),
            ("Vegan Sorbet Special", "纯素雪葩特别口味", "", "官方社媒提到会为乳糖不耐和纯素客人做 sorbet 特别口味。", "甜品/纯素", ["水果香", "清爽"], ["具体水果过敏需确认"], ["纯素友好", "可能无奶"]),
            ("Hot Chocolate", "热巧克力", "", "官方 Facebook 提到小杯热巧克力，适合小孩或不喝咖啡的人。", "饮品", ["巧克力香", "甜"], ["可能含奶制品"], ["饮品", "儿童友好"]),
            ("Dulce de Leche Gelato", "焦糖牛奶口味 Gelato", "", "公开内容提到的口味，奶香和焦糖味明显。", "甜品/焦糖", ["焦糖香", "奶香", "甜"], ["含奶制品"], ["甜品", "经典"]),
            ("Stracciatella Gelato", "巧克力碎片奶香 Gelato", "", "意式经典口味，奶底配巧克力碎片，适合第一次尝试。", "甜品/经典", ["奶香", "巧克力香", "甜"], ["含奶制品"], ["经典", "甜品"]),
            ("Fresh Strawberry Gelato", "新鲜草莓口味 Gelato", "", "公开内容提到的水果口味，草莓香和甜酸感明显。", "甜品/水果", ["草莓香", "甜酸"], ["水果过敏需确认"], ["水果", "清爽"]),
            ("Cremino", "巧克力榛子 Cremino", "", "公开内容提到的巧克力榛子风味，通常较浓郁。", "甜品/坚果", ["巧克力香", "榛子香", "浓郁"], ["含坚果", "可能含奶制品"], ["坚果", "浓郁"]),
            ("Tiramisu Affogato", "提拉米苏风味 Affogato", "", "公开内容提到的提拉米苏风味咖啡甜品，咖啡、奶香和可可味明显。", "甜品/咖啡", ["咖啡香", "奶香", "可可味"], ["含咖啡因", "可能含奶制品"], ["咖啡", "甜品"]),
            ("Dubai Chocolate Gelato", "迪拜巧克力口味 Gelato", "", "公开内容提到的热门巧克力口味，通常更浓郁、甜度较高。", "甜品/巧克力", ["巧克力香", "浓郁", "甜"], ["可能含奶制品", "坚果需确认"], ["热门", "巧克力"]),
        ],
    }
    return extensions.get(slug, [])


def kazuma_structured_dishes():
    rows = [
        ("Fresh Sashimi", "新鲜刺身", "", "生鱼片，重点是鱼的新鲜度和切片口感。适合能接受生食的人。", "刺身/海鲜", ["鲜味", "清爽"], ["生食", "鱼类过敏者避免"], ["日餐", "海鲜", "生食"]),
        ("Sushi Platter", "寿司拼盘", "", "多款寿司组合，适合第一次去时分享，也方便看懂不同鱼类和配料。", "寿司/分享", ["鲜味", "米醋香"], ["可能含生鱼", "酱油含麸质"], ["寿司", "适合分享"]),
        ("Teishoku Lunch Tray", "日式定食套餐", "", "日式套餐，一般包含主菜、米饭和小菜。适合老人或不想研究菜单的人。", "定食/午餐", ["咸香", "均衡"], ["配菜每日可能变化"], ["午餐", "相对安全"]),
        ("Donburi Rice Bowl", "日式盖饭", "", "主菜盖在米饭上，点餐简单，适合快速吃正餐。", "米饭/主食", ["咸香", "酱汁味"], ["具体肉类需确认"], ["主食", "简单"]),
        ("Kurobuta Pork Donkatsu", "黑豚炸猪排", "", "黑豚猪肉炸猪排，外层酥脆、肉味更浓。适合想吃稳妥肉类主菜的人。", "猪肉/炸物", ["酥脆", "肉香"], ["含猪肉", "油炸", "可能含麸质"], ["招牌", "猪肉", "炸物"]),
        ("Wagyu Beef Steak with Bone Marrow", "和牛牛排配牛骨髓", "$56", "和牛牛排配骨髓，肉味和油脂香会比较重。适合想吃高级肉类主菜的人。", "牛肉/主菜", ["肉香", "油脂香", "浓郁"], ["含牛肉", "价格较高"], ["牛肉", "推荐分享"]),
        ("Beef Sukiyaki", "牛肉寿喜烧", "$26", "日式甜咸酱汁煮牛肉和配菜，通常口味温和，适合不想吃生食的人。", "锅物/牛肉", ["甜咸", "牛肉香", "温和"], ["含牛肉", "可能含鸡蛋"], ["热菜", "相对安全"]),
        ("12pc Sushi Platter with Scallop", "12 件扇贝寿司拼盘", "$56", "12 件寿司拼盘，包含扇贝元素。适合两人分享或想一次试多款寿司。", "寿司/分享", ["鲜味", "米醋香", "贝类鲜味"], ["可能含生食", "贝类过敏者避免"], ["寿司", "分享"]),
        ("12pc Sashimi Platter", "12 件刺身拼盘", "", "多种生鱼片拼盘，重点是新鲜度。适合能接受生食的人，不适合孕妇或怕生食的人。", "刺身/分享", ["鲜味", "清爽"], ["生食", "鱼类过敏者避免"], ["刺身", "分享"]),
        ("Matcha Cheesecake", "抹茶芝士蛋糕", "", "抹茶味芝士蛋糕，通常奶香浓、微苦微甜，适合饭后分享。", "甜点", ["抹茶香", "奶香", "甜"], ["含奶制品", "可能含麸质"], ["甜点", "饭后"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-kazuma"), "Kazuma 官网 + OpenTable/Chatswood Chase 菜单信息")


def bistro_kai_structured_dishes():
    rows = [
        ("Mussel Pasta", "青口贝番茄海鲜意面", "", "青口贝、贝类高汤、番茄和香草做的意面。海鲜味明显，适合喜欢贝类的人。", "意面/海鲜", ["鲜味", "番茄味", "香草味"], ["贝类过敏者避免", "含麸质"], ["海鲜", "意面"]),
        ("Chicken Maryland", "香草酱鸡腿排", "", "鸡腿排配 chimichurri 和酸奶。比牛排更温和，酱汁带草本香。", "鸡肉/主菜", ["鸡肉香", "草本香", "微酸"], ["含鸡肉", "含奶制品"], ["鸡肉", "相对安全"]),
        ("Wagyu Chuck Tail Flap", "和牛牛排配第戎酱汁", "", "MBS 6-7 和牛部位，配土耳其辣椒、第戎芥末和肉汁。肉味重，适合吃牛排。", "牛肉/主菜", ["肉香", "浓郁", "微辣"], ["含牛肉", "芥末味"], ["牛肉", "主菜"]),
        ("Pork Tomahawk", "叉烧风味猪战斧", "", "500g 猪战斧，配叉烧风味和柠檬。份量大，适合两人以上分享。", "猪肉/分享", ["肉香", "甜咸", "柠檬清爽"], ["含猪肉", "份量大"], ["分享菜", "猪肉"]),
        ("Koshihikari Risotto", "越光米蘑菇橄榄烩饭", "", "用越光米做的烩饭，配腌橄榄和蘑菇。适合不想吃肉的人。", "素食/主菜", ["菌菇香", "咸香", "浓郁"], ["可能含奶制品"], ["素食友好", "米饭"]),
        ("Carbonara", "培根蛋黄芝士意面 Carbonara", "", "经典 carbonara 风格，官网写有 Pecorino Romano 和 guanciale。奶酪香和咸香明显。", "意面/猪肉", ["芝士香", "咸香", "浓郁"], ["含猪肉", "含奶制品", "含麸质"], ["意面", "经典"]),
        ("Short Ribs", "慢煮牛小排", "", "500g 牛小排，配苦菊/菊苣和肉汁。份量大，适合两人分享。", "牛肉/分享", ["肉香", "浓郁"], ["含牛肉", "份量大"], ["分享菜", "牛肉"]),
        ("Westholme Wagyu T-bone", "Westholme 和牛 T 骨牛排", "", "600g MBS 6-7 和牛 T 骨，配肉汁和柠檬。价格和份量都偏高，适合分享。", "牛排/分享", ["肉香", "油脂香", "浓郁"], ["含牛肉", "价格较高", "份量大"], ["牛排", "分享"]),
        ("Sydney Rock Oysters", "悉尼岩蚝", "", "生蚝，味道鲜甜带海水感。适合喜欢生食海鲜的人。", "海鲜/生蚝", ["鲜味", "海水味", "清爽"], ["生食", "贝类过敏者避免"], ["海鲜", "生食"]),
        ("Tiramisu", "提拉米苏", "", "咖啡和奶酪风味甜点，口感柔软，适合饭后分享。", "甜点", ["咖啡香", "奶香", "甜"], ["含奶制品", "含咖啡因"], ["甜点", "饭后"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-bistro-kai"), "Bistro Kai 官网 dinner menu")


def manpuku_structured_dishes():
    rows = [
        ("Long Name Ramen", "招牌 Long Name 拉面", "$26", "Manpuku 招牌拉面，外卖平台显示点赞很高。适合第一次去不知道点什么的人。", "拉面/招牌", ["浓郁", "咸香", "豚骨感"], ["可能含猪肉", "含麸质"], ["招牌", "拉面"]),
        ("Manpuku Red Ramen", "Manpuku 红汤辣拉面", "$29", "红汤辣味拉面，适合能接受辣味和浓汤的人。", "拉面/辣味", ["辣", "浓郁"], ["可能偏辣", "可能含猪肉"], ["辣味", "热门"]),
        ("Tonkotsu Shoyu Ramen", "豚骨酱油拉面", "$24.50", "经典豚骨酱油汤底，咸香浓郁，比辣拉面更稳。", "拉面/豚骨", ["豚骨香", "酱油咸香"], ["含猪肉", "含麸质"], ["经典", "相对安全"]),
        ("Gyokai Black Ramen", "鱼介黑蒜油拉面", "$28", "鱼介风味加黑蒜油，味道比普通豚骨更重，适合喜欢浓香的人。", "拉面/鱼介", ["鱼介鲜味", "蒜香", "浓郁"], ["鱼类/海鲜成分需确认"], ["特色", "浓汤"]),
        ("Karaage Chicken", "日式炸鸡块", "$14.50", "日式炸鸡，外脆里嫩，适合配拉面分享。", "小吃/鸡肉", ["酥脆", "咸香"], ["含鸡肉", "油炸"], ["小吃", "适合分享"]),
        ("Pork Gyoza", "猪肉煎饺", "$6.50", "日式煎饺，外皮煎香，里面是猪肉馅。适合配拉面。", "小吃/猪肉", ["咸香", "煎香"], ["含猪肉", "含麸质"], ["小吃", "适合分享"]),
        ("Octopus Karaage", "炸章鱼块", "$8", "章鱼裹粉油炸，有嚼劲，适合喜欢海鲜小吃的人。", "小吃/海鲜", ["酥脆", "海鲜味"], ["海鲜过敏者避免", "油炸"], ["海鲜", "小吃"]),
        ("Agedashi Tofu", "日式炸豆腐", "$7", "炸豆腐浸在日式酱汁里，外软内嫩，适合不想吃肉的人。", "豆腐/小吃", ["豆香", "酱汁咸香"], ["可能含酱油/麸质"], ["豆腐", "素食友好"]),
        ("Unagi Donburi", "鳗鱼盖饭", "$31", "烤鳗鱼配照烧酱盖在米饭上，甜咸鲜香，适合作为正餐。", "米饭/鱼类", ["甜咸", "鱼香", "酱香"], ["鱼类过敏者避免"], ["盖饭", "鱼类"]),
        ("Pumpkin Croquette", "南瓜可乐饼", "$11.50", "南瓜泥裹粉油炸，口感软糯微甜，适合不吃肉的人。", "小吃/素食", ["微甜", "酥脆", "软糯"], ["油炸", "可能含麸质"], ["素食友好", "小吃"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-manpuku"), "Manpuku 官网 + OpenTable/Uber Eats 菜单信息")


def cafe_markus_structured_dishes():
    rows = [
        ("Eggs Benedict", "班尼迪克蛋", "", "水波蛋配荷兰酱，常见澳洲早午餐。口感 creamy，适合不想吃重口的人。", "早午餐/鸡蛋", ["蛋香", "奶油感"], ["含鸡蛋", "含奶制品"], ["早午餐", "经典"]),
        ("Big Breakfast", "澳式大早餐", "", "通常包含鸡蛋、培根/香肠、吐司和配菜。份量大，适合早午餐当正餐。", "早午餐/拼盘", ["咸香", "丰富"], ["可能含猪肉", "含麸质"], ["份量大", "简单"]),
        ("Bacon Egg Roll", "培根鸡蛋卷/汉堡", "", "培根和鸡蛋夹在面包里，点餐最简单，适合赶时间。", "早餐/简餐", ["咸香", "蛋香"], ["含猪肉", "含鸡蛋"], ["简单", "早餐"]),
        ("Croissant", "牛角包", "", "法式酥皮面包，可配咖啡。适合只想吃一点的人。", "烘焙/轻食", ["黄油香", "酥脆"], ["含奶制品", "含麸质"], ["轻食", "咖啡搭配"]),
        ("Flat White", "澳式奶咖 Flat White", "", "澳洲常见奶咖，奶泡比 cappuccino 更细腻，咖啡味和奶香平衡。", "咖啡/饮品", ["咖啡香", "奶香"], ["含奶制品，可问植物奶"], ["咖啡", "澳洲常见"]),
        ("Smashed Avocado", "牛油果吐司", "", "牛油果压成泥放在吐司上，澳洲 cafe 很常见。口味清爽，适合不想吃肉的人。", "早午餐/吐司", ["清爽", "牛油果香"], ["含麸质", "配料需确认"], ["素食友好", "早午餐"]),
        ("Pancakes", "松饼/煎饼", "", "偏甜的早午餐，通常配水果、糖浆或奶油。适合小孩或想吃甜的人。", "甜口早午餐", ["甜", "松软"], ["含鸡蛋", "含奶制品", "含麸质"], ["儿童友好", "甜口"]),
        ("Chicken Schnitzel Sandwich", "炸鸡排三明治", "", "炸鸡排夹面包，份量比普通吐司更大，适合作为午餐。", "三明治/鸡肉", ["酥脆", "咸香"], ["含鸡肉", "油炸", "含麸质"], ["午餐", "简单"]),
        ("Salmon Bagel", "烟熏三文鱼贝果", "", "贝果夹烟熏三文鱼和奶油芝士类配料，适合喜欢清爽咸香口味的人。", "贝果/鱼类", ["烟熏香", "咸香", "奶香"], ["鱼类过敏者避免", "含奶制品", "含麸质"], ["鱼类", "早午餐"]),
        ("Iced Latte", "冰拿铁", "", "冰咖啡加牛奶，夏天常点。咖啡味比 flat white 更淡一些。", "咖啡/饮品", ["咖啡香", "奶香", "冰凉"], ["含咖啡因", "含奶制品，可问植物奶"], ["咖啡", "冷饮"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-cafe-markus"), "Cafe Markus 公开菜单/点评信息")


def chimichuri_structured_dishes():
    rows = [
        ("Chimichuri Egg", "Chimichuri 招牌蛋", "$20", "店名同款鸡蛋早午餐，通常是比较安全的 brunch 选择。", "早午餐/鸡蛋", ["蛋香", "咸香"], ["含鸡蛋"], ["招牌", "早午餐"]),
        ("Black Benedict", "黑色班尼迪克蛋", "$25", "创意版班尼迪克蛋，适合想尝试特色摆盘的人。", "早午餐/鸡蛋", ["蛋香", "浓郁"], ["含鸡蛋", "含奶制品"], ["特色", "早午餐"]),
        ("Big Khahuna", "Big Khahuna 大份早午餐", "$28", "大份量 brunch 菜，适合当正餐，不适合只想轻食的人。", "早午餐/主食", ["丰富", "咸香"], ["配料需现场确认"], ["份量大", "主食"]),
        ("Seafood Tom Yum Linguine", "冬阴功海鲜扁意面", "", "海鲜意面加冬阴功酸辣风味，味道比普通意面更重。", "意面/海鲜", ["酸辣", "海鲜味"], ["海鲜过敏者避免", "可能偏辣"], ["特色", "海鲜"]),
        ("Matcha Green Tea Waffle", "抹茶华夫饼", "", "抹茶味华夫饼，偏甜，适合饭后或下午茶。", "甜品/早午餐", ["甜", "抹茶香"], ["含麸质", "可能含奶制品"], ["甜品", "下午茶"]),
        ("Smashed Avocado", "牛油果吐司", "", "牛油果吐司是 cafe 常见安全菜，适合不想吃肉或想点清爽早餐的人。", "早午餐/吐司", ["清爽", "牛油果香"], ["含麸质", "配料需确认"], ["素食友好", "简单"]),
        ("French Toast", "法式吐司", "", "吐司裹蛋奶煎制，通常偏甜、口感柔软，适合下午茶。", "甜口早午餐", ["甜", "蛋奶香", "柔软"], ["含鸡蛋", "含奶制品", "含麸质"], ["甜口", "下午茶"]),
        ("Soft Shell Crab Burger", "软壳蟹汉堡", "", "炸软壳蟹夹汉堡，海鲜味和酥脆口感明显。", "汉堡/海鲜", ["酥脆", "海鲜味"], ["蟹类过敏者避免", "油炸", "含麸质"], ["海鲜", "特色"]),
        ("Smoked Salmon Toast", "烟熏三文鱼吐司", "", "烟熏三文鱼配吐司类底，咸香清爽，适合不想吃油炸的人。", "早午餐/鱼类", ["烟熏香", "咸香"], ["鱼类过敏者避免", "含麸质"], ["鱼类", "清爽"]),
        ("Cold Brew Coffee", "冷萃咖啡", "", "冷泡咖啡，酸苦感比普通冰咖啡更柔和，适合喜欢咖啡味的人。", "咖啡/饮品", ["咖啡香", "冰凉"], ["含咖啡因"], ["咖啡", "冷饮"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-chimichuri"), "Chimichuri 公开菜单页 + 社媒菜单信息")


def ooshman_structured_dishes():
    rows = [
        ("Lahem w Jibne", "牛羊肉芝士黎巴嫩披萨", "", "黎巴嫩风格肉馅加芝士薄饼，味道咸香，适合打包。", "披萨/肉类", ["肉香", "芝士香"], ["含肉类", "含奶制品", "含麸质"], ["招牌", "快餐"]),
        ("Manoush", "黎巴嫩薄饼 Manoush", "", "黎巴嫩薄饼，可做芝士、肉或香料口味。适合想点简单主食。", "薄饼/主食", ["面香", "咸香"], ["含麸质", "具体馅料需确认"], ["主食", "简单"]),
        ("Wrap", "黎巴嫩卷饼", "", "肉类或素菜卷进饼里，吃起来方便，适合边走边吃或打包。", "卷饼/主食", ["咸香", "酱汁味"], ["酱汁和肉类需选择"], ["打包", "简单"]),
        ("Garlic Chicken Pizza", "蒜香鸡肉披萨", "", "鸡肉和蒜香酱的薄饼/披萨，味道直接，适合不想冒险的人。", "披萨/鸡肉", ["蒜香", "鸡肉香"], ["含鸡肉", "含麸质"], ["鸡肉", "相对安全"]),
        ("Chips", "薯条", "", "炸薯条，适合小孩或配卷饼一起点。", "配菜", ["咸香", "酥脆"], ["油炸"], ["小孩友好", "配菜"]),
        ("Zaatar Manoush", "百里香芝麻薄饼", "", "黎巴嫩香料 zaatar 薄饼，味道像香草、芝麻和橄榄油。适合想吃素食轻食的人。", "薄饼/素食", ["香草味", "芝麻香", "咸香"], ["含麸质", "芝麻过敏者避免"], ["素食友好", "经典"]),
        ("Cheese Manoush", "芝士黎巴嫩薄饼", "", "芝士薄饼，口味简单，适合小孩或不想吃肉的人。", "薄饼/芝士", ["芝士香", "咸香"], ["含奶制品", "含麸质"], ["儿童友好", "简单"]),
        ("Sujuk Pizza", "辣香肠黎巴嫩披萨", "", "sujuk 是中东风味辣香肠，味道比普通肉馅更重。", "披萨/肉类", ["肉香", "香料味", "可能微辣"], ["含肉类", "辣度需确认", "含麸质"], ["重口味", "快餐"]),
        ("Falafel Wrap", "鹰嘴豆丸卷饼", "", "炸鹰嘴豆丸配蔬菜和酱料卷起来，适合不吃肉的人。", "卷饼/素食", ["豆香", "酱汁味", "咸香"], ["油炸", "芝麻酱/过敏需确认"], ["素食友好", "打包"]),
        ("Chicken Tawouk Wrap", "中东烤鸡卷饼", "", "烤鸡肉卷饼，通常配蒜酱和蔬菜。比牛羊肉更温和。", "卷饼/鸡肉", ["鸡肉香", "蒜香", "咸香"], ["含鸡肉", "蒜味明显"], ["鸡肉", "相对安全"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-ooshman"), "Ooshman 官网分店页 + 公开菜单信息")


def gondola_structured_dishes():
    rows = [
        ("Gelato", "意式冰淇淋 Gelato", "", "意式冰淇淋，口感比普通冰淇淋更绵密。可以直接指口味点。", "甜品/冰淇淋", ["甜", "奶香", "绵密"], ["多数口味含奶制品"], ["招牌", "甜品"]),
        ("Sorbetti", "水果雪葩 Sorbetti", "", "水果型冰品，通常没有奶，口感清爽，适合不想吃奶制品的人。", "甜品/水果", ["水果香", "清爽", "甜酸"], ["过敏需确认具体水果"], ["清爽", "可能无奶"]),
        ("Cocco Pandan", "椰子班兰口味 gelato", "", "椰子和班兰香，带东南亚甜品风味。适合喜欢椰香的人。", "甜品/特色口味", ["椰香", "班兰香", "甜"], ["可能含奶制品"], ["特色", "椰香"]),
        ("Lychee Lampone", "荔枝覆盆子口味", "", "荔枝和覆盆子组合，通常果香明显、甜酸清爽。", "甜品/水果", ["荔枝香", "莓果酸甜"], ["水果过敏需确认"], ["水果", "清爽"]),
        ("Coffee", "咖啡", "", "可搭配 gelato 的咖啡，适合下午茶。", "饮品", ["咖啡香"], ["含咖啡因"], ["饮品", "下午茶"]),
        ("Pistachio Gelato", "开心果意式冰淇淋", "", "开心果口味通常坚果香明显、甜度适中，是 gelato 店常见热门口味。", "甜品/坚果", ["坚果香", "奶香", "甜"], ["含坚果", "可能含奶制品"], ["热门", "坚果"]),
        ("Dark Chocolate Gelato", "黑巧克力意式冰淇淋", "", "巧克力味更浓，甜度通常比普通巧克力口味低一点。", "甜品/巧克力", ["巧克力香", "微苦", "甜"], ["可能含奶制品"], ["经典", "巧克力"]),
        ("Hazelnut Gelato", "榛子意式冰淇淋", "", "榛子味香浓，适合喜欢 Nutella 风味的人。", "甜品/坚果", ["榛子香", "奶香", "甜"], ["含坚果", "可能含奶制品"], ["坚果", "经典"]),
        ("Lemon Sorbet", "柠檬雪葩", "", "柠檬味雪葩，酸甜清爽，适合饭后解腻。", "甜品/水果", ["酸", "甜", "清爽"], ["酸味明显"], ["清爽", "可能无奶"]),
        ("Affogato", "咖啡浇冰淇淋 Affogato", "", "热 espresso 淋在冰淇淋上，咖啡苦味和冰淇淋甜味混合。", "甜品/咖啡", ["咖啡香", "甜", "微苦"], ["含咖啡因", "含奶制品"], ["饭后", "咖啡"]),
    ]
    return simple_structured_dishes(rows + chatswood_menu_extension_rows("cw-gondola"), "Gelateria Gondola 官网 + Tripadvisor/Broadsheet")


def known_restaurants(area_name=""):
    key = re.sub(r"[^a-z0-9]+", "", (area_name or "").lower())
    if key in {"cw", "chatswood"}:
        khao_pla_menu = "\n".join([
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
        ])
        restaurants = [
            (
                "cw-khao-pla",
                "Khao Pla Chatswood",
                "Shop 7/370-374 Victoria Avenue, Chatswood NSW 2067",
                "本地评价强，官网 PDF 菜单已整理，泰餐选择多，适合先看懂辣度、花生、海鲜和招牌菜。",
                ["泰餐", "本地好评", "官网菜单", "真实菜单"],
                "https://khaopla.com.au/",
                khao_pla_menu,
                "官网 PDF 菜单（Khao Pla）",
                True,
                "4.6",
                "2000+",
                "入选原因：本地订单平台约 4.6 分、2000+ 评分；Tripadvisor 也长期排在 Chatswood 前列。",
                "中文备注：Khao Pla，泰式餐厅。主打泰式咖喱、炒河粉、海鲜和招牌猪肋排。",
            ),
            (
                "cw-mamak",
                "Mamak Chatswood",
                "P9 & P10/1-5 Railway Street, Chatswood NSW 2067",
                "本地老牌马来西亚餐，官网菜单和 Chatswood 点餐页可核验；适合练习 roti、咖喱、炒面和椰浆饭。",
                ["马来西亚餐", "本地老牌", "官网菜单", "真实菜单"],
                "https://mamak.com.au/mamakmenu",
                "\n".join([dish["name_en"] for dish in mamak_structured_dishes()]),
                "Mamak 官网菜单 + Chatswood 点餐页",
                True,
                "4.1",
                "400+",
                "入选原因：评价量大、Tripadvisor 约 4.1 分且曾列 Chatswood 前排；不是最高分餐厅，后续可被更高评分餐厅替换。",
                "中文备注：Mamak，马来西亚餐。主打 roti 印度煎饼、咖喱、沙爹、椰浆饭和炒面。",
            ),
            (
                "cw-sunday-seoul",
                "Sunday Seoul",
                "Shop 2, 7 Help Street, Chatswood NSW 2067",
                "本地评价强的韩式 casual bar & dining，官网和官网 PDF 菜单可核验；适合看懂韩式汤锅、煎饼、炸鸡和分享菜。",
                ["韩餐", "本地好评", "官网菜单", "真实菜单"],
                "https://sundayseoul.com.au/",
                "\n".join([dish["name_en"] for dish in sunday_seoul_structured_dishes()]),
                "Sunday Seoul 官网菜单 PDF",
                True,
                "4.6",
                "440+",
                "入选原因：本地外卖平台约 4.6 分、440+ 评分；第三方页面也显示 Google 约 4.5 分。",
                "中文备注：Sunday Seoul，韩式小酒馆/餐厅。主打韩式汤锅、煎饼、炸鸡和分享菜。",
            ),
            (
                "cw-kazuma",
                "Kazuma Chatswood",
                "Shop 2-001A, 345 Victoria Avenue, Chatswood NSW 2067",
                "新开的日餐，OpenTable 评价好，官网确认有刺身、寿司、Teishoku 定食、Donburi 和黑豚猪排。",
                ["日餐", "本地好评", "官网菜单", "真实菜单"],
                "https://www.kazuma.com.au/",
                "\n".join([dish["name_en"] for dish in kazuma_structured_dishes()]),
                "Kazuma 官网 + OpenTable/Chatswood Chase 菜单信息",
                True,
                "4.7",
                "19+",
                "入选原因：OpenTable 约 4.7 分；官网和 Chatswood Chase 页面确认菜单方向和地址。",
                "中文备注：Kazuma，现代日餐。主打刺身、寿司、定食、盖饭和黑豚炸猪排。",
            ),
            (
                "cw-bistro-kai",
                "Bistro Kai",
                "316 Victoria Avenue, Chatswood NSW 2067",
                "现代 bistro，OpenTable 评价好，官网晚餐菜单可核验，适合想吃西式/日式融合餐的人。",
                ["Bistro", "本地好评", "官网菜单", "真实菜单"],
                "https://www.kaiandmore.com.au/dinner-menu",
                "\n".join([dish["name_en"] for dish in bistro_kai_structured_dishes()]),
                "Bistro Kai 官网 dinner menu",
                True,
                "4.6",
                "130+",
                "入选原因：OpenTable 约 4.6 分、132 人评价；官网菜单列出晚餐主菜和分享菜。",
                "中文备注：Bistro Kai，现代西式/日式融合餐。主打意面、牛排、猪战斧、海鲜和甜点。",
            ),
            (
                "cw-manpuku",
                "Manpuku Chatswood",
                "226 Victoria Avenue, Chatswood NSW 2067",
                "拉面店，本地评价稳定，官方站点确认 Chatswood 分店，外卖菜单有高点赞招牌拉面。",
                ["日式拉面", "本地好评", "菜单可核验", "真实菜单"],
                "https://www.ramenmanpuku.com/",
                "\n".join([dish["name_en"] for dish in manpuku_structured_dishes()]),
                "Manpuku 官网 + OpenTable/Uber Eats 菜单信息",
                True,
                "4.4",
                "90+",
                "入选原因：Tripadvisor 约 4.4 分；Uber Eats 显示多款拉面有 96%+ 点赞。",
                "中文备注：Manpuku，日式拉面店。主打豚骨拉面、辣拉面、日式小吃和盖饭。",
            ),
            (
                "cw-cafe-markus",
                "Cafe Markus",
                "Shop 16/9 Spring Street, Chatswood NSW 2067",
                "本地高分咖啡早午餐，适合老人、游客和刚来的学生先从简单英文菜单开始。",
                ["咖啡", "本地好评", "早午餐", "菜单可核验"],
                "https://www.tripadvisor.com/Restaurant_Review-g261607-d10353560-Reviews-Cafe_Markus-Chatswood_Willoughby_Greater_Sydney_New_South_Wales.html",
                "\n".join([dish["name_en"] for dish in cafe_markus_structured_dishes()]),
                "Cafe Markus 公开菜单/点评信息",
                True,
                "4.8",
                "570+",
                "入选原因：Fantuan 约 4.8 分、571 条评价；Tripadvisor 也列在 Chatswood 前排。",
                "中文备注：Cafe Markus，咖啡早午餐。主打澳式早餐、吐司、三明治、贝果和咖啡。",
            ),
            (
                "cw-chimichuri",
                "Chimichuri",
                "1/6 Help Street, Chatswood NSW 2067",
                "Chatswood 本地热门 cafe，菜单有创意，适合想尝试澳式早午餐但怕看不懂菜名的人。",
                ["咖啡", "本地好评", "早午餐", "菜单可核验"],
                "https://chimichuri-chatswood.hey-restaurants.com/menu",
                "\n".join([dish["name_en"] for dish in chimichuri_structured_dishes()]),
                "Chimichuri 公开菜单页 + 社媒菜单信息",
                True,
                "4.5",
                "50+",
                "入选原因：Tripadvisor 约 4.5 分；公开菜单页和社媒可核验多款 brunch 菜。",
                "中文备注：Chimichuri，创意咖啡早午餐。主打班尼迪克蛋、特色吐司、海鲜意面和甜品。",
            ),
            (
                "cw-ooshman",
                "Ooshman Chatswood",
                "Chatswood, NSW",
                "黎巴嫩披萨/卷饼快餐，本地评价好，适合想吃简单、便宜、可打包的用户。",
                ["黎巴嫩", "本地好评", "快餐", "菜单可核验"],
                "https://ooshman.au/locations/chatswood/",
                "\n".join([dish["name_en"] for dish in ooshman_structured_dishes()]),
                "Ooshman 官网分店页 + 公开菜单信息",
                True,
                "4.6",
                "340+",
                "入选原因：EatClub 约 4.6 分、345 人评价；官网 Chatswood 分店页面有本地评价。",
                "中文备注：Ooshman，黎巴嫩快餐。主打黎巴嫩薄饼、披萨、卷饼、烤鸡和素食鹰嘴豆丸。",
            ),
            (
                "cw-gondola",
                "Gelateria Gondola",
                "2/77 Archer Street, Chatswood NSW 2067",
                "本地高分意式 gelato，适合饭后、老人小孩和游客，不需要复杂英文交流。",
                ["甜品", "本地好评", "官网菜单", "真实菜单"],
                "https://gelateriagondola.com.au/",
                "\n".join([dish["name_en"] for dish in gondola_structured_dishes()]),
                "Gelateria Gondola 官网 + Tripadvisor/Broadsheet",
                True,
                "4.7",
                "90+",
                "入选原因：Tripadvisor 约 4.7 分、96 条评价；Broadsheet 和官网都强调手工意式 gelato。",
                "中文备注：Gelateria Gondola，意式冰淇淋/甜品。主打 gelato、雪葩、开心果、巧克力和咖啡甜品。",
            ),
        ]
        return {
            "source": "known_local",
            "message": "Chatswood 只显示本地好评、非中文环境、菜单可核验的真实餐厅。",
            "restaurants": [
                {
                    "id": f"known-{slug}",
                    "name": name,
                    "nameNote": name_note,
                    "area": "Chatswood",
                    "address": address,
                    "rating": rating,
                    "userRatingCount": user_rating_count,
                    "priceLevel": "",
                    "note": note,
                    "curationReason": curation_reason,
                    "tags": tags,
                    "googleMapsUri": "",
                    "websiteUri": website,
                    "hasMenu": True,
                    "menuText": menu_text,
                    "menuSource": menu_source,
                    "menuVerified": menu_verified,
                    "menuDishes": (
                        khao_pla_structured_dishes() if slug == "cw-khao-pla"
                        else mamak_structured_dishes() if slug == "cw-mamak"
                        else sunday_seoul_structured_dishes() if slug == "cw-sunday-seoul"
                        else kazuma_structured_dishes() if slug == "cw-kazuma"
                        else bistro_kai_structured_dishes() if slug == "cw-bistro-kai"
                        else manpuku_structured_dishes() if slug == "cw-manpuku"
                        else cafe_markus_structured_dishes() if slug == "cw-cafe-markus"
                        else chimichuri_structured_dishes() if slug == "cw-chimichuri"
                        else ooshman_structured_dishes() if slug == "cw-ooshman"
                        else gondola_structured_dishes() if slug == "cw-gondola"
                        else []
                    ),
                }
                for (
                    slug,
                    name,
                    address,
                    note,
                    tags,
                    website,
                    menu_text,
                    menu_source,
                    menu_verified,
                    rating,
                    user_rating_count,
                    curation_reason,
                    name_note,
                ) in restaurants
            ],
        }
    if key in {"stives", "stlves"}:
        restaurants = [
            ("stives-archies-cafe", "Archies Cafe Co", "Archies Cafe Co，现代早午餐咖啡馆。主打地中海/中东风味 brunch、三明治、tacos 和彩色健康碗。", "St Ives Shopping Village, 166 Mona Vale Road, St Ives", "官方商场页列出 Turkish eggs、burrata、power bowl、fried chicken sandwich、corn fritters 和 flathead tacos。", ["咖啡早午餐", "官方商场页", "真实菜单线索"], "https://stivesvillage.com.au/stores/archies-cafe-co/", "Archie's Style Turkish Eggs\nBurrata\nArchie's Power Bowl\nFried Chicken Sandwich\nCorn fritters with aburi miso salmon\nFlathead tacos", "St Ives Shopping Village 官方页面", True, "St Ives Shopping Village 官方页面；非中餐环境。"),
            ("stives-living-room-cafe", "The Living Room Café", "The Living Room Café，持牌咖啡餐厅。适合早餐、轻食、沙拉和家庭午餐。", "Level 1 Shop 16, St Ives Shopping Village", "官方商场页说明有 bacon and eggs、omelettes、French toast、salads、light lunch options、world-flavour meals、quick bite 和 long lunch 场景。", ["咖啡早午餐", "官方商场页", "老人友好"], "https://stivesvillage.com.au/stores/the-living-room-cafe/", "Bacon and eggs\nOmelette\nFrench toast\nSalads\nLight lunch meals\nMeals inspired by flavours from around the world\nQuick bite\nLong lunch", "St Ives Shopping Village 官方页面", True, "St Ives Shopping Village 官方页面；适合不会英文用户先看懂早餐轻食。"),
            ("stives-jjs-eatery", "JJ's Eatery", "JJ's Eatery，现代澳式 cafe restaurant。适合早餐、午餐、risotto、osso bucco、pot pie、pasta、三明治和汉堡。", "Level 1 Shop 95, St Ives Shopping Village", "官方商场页明确提及 risotto、osso bucco、pot pies、pasta、sandwich、wrap、burger。", ["澳式咖啡餐厅", "官方商场页", "真实菜单线索"], "https://stivesvillage.com.au/stores/jjs-cafe-restaurant/", "Risotto\nOsso bucco\nPot pies\nPasta\nTakeaway sandwich\nWrap\nBurger", "St Ives Shopping Village 官方页面", True, "St Ives Shopping Village 官方页面；现代澳式 cafe restaurant。"),
            ("stives-oscars-chargrill", "Oscar's Chargrill", "Oscar's Chargrill，中东/Turkish 风味快餐。适合 kebab、shish、pide、沙拉和外带。", "Level 1 Shop 15, St Ives Shopping Village", "官方商场页明确写有 kebabs、shish、pides、fresh salads、sides、sweets。", ["Turkish", "快餐/轻食", "官方商场页"], "https://stivesvillage.com.au/stores/oscars-chargrill/", "Kebabs\nShish\nPides\nFresh salads\nSides\nSweets", "St Ives Shopping Village 官方页面", True, "St Ives Shopping Village 官方页面；土耳其风味非中餐。"),
            ("stives-cafe-milligram", "Café Milligram", "Café Milligram，咖啡早午餐店。适合咖啡、brunch、甜点、全天菜单、下午茶和健康午餐。", "Level 1 Shop 25, St Ives Shopping Village", "官方商场页说明有 brunch favourites、house-made sweet treats、healthy affordable lunch options、diverse all-day menu、quick bite、leisurely lunch、afternoon tea 和 signature mocha。", ["咖啡早午餐", "甜点", "官方商场页"], "https://stivesvillage.com.au/stores/cafe-milligram/", "Brunch favourites\nHouse-made sweet treats\nHealthy lunch options\nCoffee\nAll-day menu\nQuick bite\nLeisurely lunch\nAfternoon tea\nSignature mocha", "St Ives Shopping Village 官方页面", True, "St Ives Shopping Village 官方页面；适合轻食和下午茶。"),
            ("stives-sushiru", "Sushiru", "Sushiru，日式寿司火车/日餐。适合寿司、刺身、nigiri、maki、tempura、udon、teriyaki。", "Shop 117, 166 Mona Vale Road, St Ives", "官方商场页明确列出 sushi、sashimi、nigiri、maki、tempura、udon、teriyaki。", ["日餐", "寿司", "官方商场页"], "https://stivesvillage.com.au/stores/sushiru/", "Sushi\nSashimi\nNigiri\nMaki\nTempura\nUdon\nTeriyaki", "St Ives Shopping Village 官方页面", True, "St Ives Shopping Village 官方页面和 AGFG 地址信息；非中餐。"),
            ("stives-karoo", "Karoo & Co The Old School", "Karoo & Co The Old School，意式/融合餐厅。适合披萨、意面、burrata、calamari 和分享菜单。", "205 Mona Vale Road, St Ives", "官网确认 St Ives 分店和 dinner menu；OpenTable 提到 burrata、calamari、polenta fries、pizzas、seasonal pastas。", ["意式/融合", "本地好评", "菜单可核验"], "https://www.karooandco.com/st-ives-1", "Burrata\nCalamari\nPolenta fries\nPizzas\nSeasonal pastas\nRocket and pear salad\nGrilled greens", "Karoo 官网 + OpenTable 菜单描述", True, "OpenTable 约 4.3；官网确认 St Ives 地址和菜单入口。"),
            ("stives-chargrill-charlies", "Chargrill Charlie's St Ives", "Chargrill Charlie's，澳式炭烤鸡和沙拉连锁。适合烤鸡、汉堡、卷、沙拉和家庭外带。", "213 Mona Vale Road, St Ives", "品牌官网确认主打 chargrilled chicken、burgers & rolls、salads，社媒提到 Old Fashioned Roll、Schnitzel Roll。", ["澳式烤鸡", "外带", "菜单可核验"], "https://chargrillcharlies.com/our-food", "Chargrilled chicken\nWhole chicken\nHalf chicken\nChicken roll\nOld Fashioned Roll\nSchnitzel Roll\nBurgers\nSalads\nSides\nGourmet catering", "Chargrill Charlie's 官网菜单方向 + 社媒菜名", True, "连锁品牌官网菜单方向明确；St Ives 门店官网数据可核验。"),
            ("stives-resunga", "Resunga Indian Curry Restaurant & Bar", "Resunga Indian Curry，印度餐厅。适合咖喱、samosa、tandoori、素食、海鲜和米饭。", "Shop 2, 235 Mona Vale Road, St Ives", "Quandoo 结构化菜单列出 samosa、tandoori lamb cutlet、tandoori tiger prawn、korma、vindaloo、kadai cosht、prawns malabar、mole fish、mango chicken、chicken tikka masala、chicken jalfrezi 和 hariyali goat。", ["印度餐", "菜单可核验", "素食可选"], "https://www.quandoo.com.au/place/resunga-indian-curry-restaurant-bar-53622/menu", "Vegetable Samosa\nTandoori Lamb Cutlet\nTandoori Tiger Prawn\nKorma Beef/Lamb/Chicken\nVindaloo Beef/Lamb/Chicken\nKadai Cosht\nPrawns Malabar\nMole Fish\nMango Chicken\nChicken Tikka Masala\nChicken Jalfrezi\nHariyali Goat", "Quandoo 结构化菜单 + AGFG 地址信息", True, "第三方菜单页和 AGFG 地址信息可核验；非中餐。"),
            ("stives-charmed-thai", "Charmed by Hanuman Thai", "Charmed by Hanuman Thai，St Ives 泰餐。适合咖喱、炒河粉、炒饭和家庭分享菜。", "Shop 2-3, 198A Mona Vale Road, St Ives", "官网确认 St Ives 店、午餐/晚餐营业；菜单图片页已整理前菜、午餐盒、午餐主菜和部分晚餐肉类主菜。", ["泰餐", "官网菜单图片", "真实菜单"], "https://www.charmedthai.com.au/stives/", "Charmed sampler\nSpring roll\nCurry puff\nThai fish cake\nDuck spring roll\nGolden bag\nCrab prawns roll\nSteamed dumpling\nChicken satay\nEasy Fried Prawn Stick\nSear bay scallops\nDelicious crispy Thai's devil wing\nGreen papaya salad\nGrilled prawn satay\nMild hot & sour coconut soup\nHot & sour soup local prawn\nLunch box\nPad kana moo krob w/rice\nPad ka praw gai sub w/rice\nPrik khing moo krob\nMassaman beef w/rice\nGang phed ped yang w/rice\nYellow curry chicken w/rice\nPad ka praw gai krob w/rice\nPineapple fried rice\nCharmed crispy chicken w/rice\nHokkien mee w/sambal chilli\nKoo wa gai noodles\nPad Thai gai krob\nBBQ chicken salad\nBBQ chicken green papaya salad\nBanana blossom salad\nDuck salad\nMassaman lamb cutlets\nBasil moo grob\nWok toss marinade beef slice", "Charmed Thai St Ives 官网菜单图片", True, "独立官网确认地址、营业时间和菜单图片；非中餐。"),
            ("stives-st-ives-club", "The St Ives Club", "The St Ives Club，本地 club/pub 餐厅。适合家庭聚餐、酒吧餐和外带。", "100 Killeaton Street, St Ives", "官网 2026 Brasserie 菜单页确认 Starters、Club Favourites、Burgers、Pizza & Pasta、From the Ocean、Sides、Kids、Desserts、Gluten Free、Vegetarian 等分类。", ["Club 餐", "官网菜单页", "分类已整理"], "https://www.thestivesclub.online/menu", "Starters\nClub Favourites\nBurgers\nPizza & Pasta\nFrom the Ocean\nSides\nKids\nDesserts\nCombo Deals\nGluten Free\nVegetarian", "The St Ives Club 2026 Brasserie 官网菜单页", True, "官网菜单页确认 St Ives 地址、2026 菜单和餐厅服务；本地 club 场景适合家庭。"),
        ]
        return {
            "source": "known_local",
            "message": "St Ives 先显示 11 家真实候选；中餐默认不放，菜单来源不足的店已标注待补。",
            "restaurants": [
                {
                    "id": f"known-{slug}",
                    "name": name,
                    "nameNote": name_note,
                    "area": "St Ives",
                    "address": address,
                    "rating": "本地",
                    "userRatingCount": "",
                    "priceLevel": "",
                    "note": note,
                    "curationReason": curation_reason,
                    "tags": tags,
                    "googleMapsUri": "",
                    "websiteUri": website,
                    "hasMenu": bool(website or menu_text),
                    "menuText": menu_text,
                    "menuSource": menu_source,
                    "menuVerified": menu_verified,
                    "menuDishes": fallback_analyze({"menuText": menu_text}).get("dishes", []) if menu_text else [],
                }
                for slug, name, name_note, address, note, tags, website, menu_text, menu_source, menu_verified, curation_reason in restaurants
            ],
        }
    if key not in {"teagarden", "teagardens"}:
        return None
    hook_menu = "\n".join([
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
    ])
    tea_gardens_hotel_menu = "\n".join([
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
    ])
    mumms_menu = "\n".join([
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
    ])
    restaurants = [
        ("tea-gardens-hotel", "Tea Gardens Hotel", "Tea Gardens Hotel，本地河边 pub/hotel 餐厅。适合炸鱼薯条、汉堡、鸡排、披萨和家庭聚餐。", "Cnr Maxwell Street & Marine Drive, Tea Gardens", "官网 Food + Drinks 菜单完整可查，是 Tea Gardens 区域优先样板店。", ["澳洲酒吧餐", "官网菜单", "真实菜单"], "https://teagardenshotel.com/food-drinks", tea_gardens_hotel_menu, "官网 Food + Drinks 菜单", True, "OpenStreetMap 本地餐饮点；官网菜单可核验。"),
        ("mumms-seafood", "Mumm's Seafood", "Mumm's Seafood，河边海鲜餐厅。适合海鲜拼盘、当日鱼、炸鱼薯条和甜点。", "Tea Gardens", "官网可找到菜单入口；当前先整理官网确认代表菜和菜单页线索。", ["Seafood", "官网菜单", "真实菜单"], "https://mummsonthemyall.com.au", mumms_menu, "官网菜单页 + 已知菜单文件", True, "OpenStreetMap 本地 seafood 餐厅；用户已确认官网有菜单页。"),
        ("hook-n-cook", "Hook'n Cook", "Hook'n Cook，本地 fish and chips 外带店。适合炸鱼薯条、汉堡、炸鱿鱼和多人套餐。", "Tea Gardens", "Google Maps 菜单照片可见大量外带菜，适合先选好炸鱼薯条、汉堡和分享套餐。", ["Fish And Chips", "快餐", "地图照片菜单", "真实菜单"], "", hook_menu, "Google Maps 菜单照片（约9个月前）", True, "OpenStreetMap 本地 fish and chips；用户提供的 Google Maps 菜单照片可读到主要售卖项。"),
        ("tillermans", "Tillermans Cafe - Restaurant", "Tillermans，Tea Gardens 咖啡/餐厅。适合咖啡、早午餐和轻食。", "Tea Gardens", "本地 cafe restaurant，暂无可靠线上菜单，不展示编造菜品。", ["咖啡早午餐", "本地餐厅", "菜单待补"], "", "", "", False, "OpenStreetMap 本地 cafe/restaurant 点；菜单待核验。"),
        ("nicoles-art-gallery-cafe", "Nicole's Art Gallery and Cafe", "Nicole's Art Gallery and Cafe，艺术画廊咖啡馆。适合咖啡、蛋糕和轻食。", "Tea Gardens", "Tea Gardens 河边附近 cafe，适合老人或游客轻松尝试；暂无可靠线上菜单。", ["咖啡", "轻食", "菜单待补"], "", "", "", False, "OpenStreetMap 本地 cafe 点；菜单待核验。"),
        ("mangrove-cafe", "Mangrove Cafe", "Mangrove Cafe，本地咖啡轻食店。适合早餐、咖啡和简单午餐。", "83 Marine Drive, Tea Gardens", "咖啡和轻食，适合先从简单菜单开始；暂无可靠线上菜单。", ["咖啡/轻食", "本地餐厅", "菜单待补"], "", "", "", False, "OpenStreetMap 记录了具体地址；菜单待核验。"),
        ("jayz-myall", "Jayz At The Myall", "Jayz At The Myall，本地咖啡轻食店。适合早上咖啡和简餐。", "Tea Gardens", "OpenStreetMap 显示平日和周六营业时段；暂无可靠线上菜单。", ["咖啡", "轻食", "菜单待补"], "", "", "", False, "OpenStreetMap 本地 cafe 点；菜单待核验。"),
        ("hawks-nest-golf-club-bistro", "Hawks Nest Golf Club Bistro", "Hawks Nest Golf Club Bistro，桥对面高尔夫俱乐部 bistro。适合家庭式西餐和本地 club 餐。", "Sanderling Avenue, Hawks Nest", "Hawks Nest 与 Tea Gardens 隔桥相连，适合作为同一区域候选；暂无可靠线上菜单。", ["Bistro", "俱乐部餐", "菜单待补"], "", "", "", False, "OpenStreetMap 本地 pub/bistro 点；距离 Tea Gardens 约几公里内。"),
        ("benchmark-on-booner", "Benchmark on Booner", "Benchmark on Booner，Hawks Nest 本地餐厅。适合西式餐和度假区晚餐。", "100 Booner Street, Hawks Nest", "桥对面 Hawks Nest 餐厅，适合 Tea Gardens 周边一起推荐；暂无可靠线上菜单。", ["西式/融合", "本地餐厅", "菜单待补"], "", "", "", False, "OpenStreetMap 本地 restaurant 点；菜单待核验。"),
        ("hawks-nest-takeaway", "Hawks Nest Takeaway", "Hawks Nest Takeaway，桥对面 seafood/fish and chips 外带店。适合炸鱼薯条和简单外带。", "34 Tuloa Avenue, Hawks Nest", "OpenStreetMap 标注 seafood takeaway；暂无可靠线上菜单。", ["Fish And Chips", "外带", "菜单待补"], "", "", "", False, "OpenStreetMap 本地 seafood takeaway 点；同属 Tea Gardens 近邻可达范围。"),
    ]
    return {
        "source": "known_local",
        "message": "真实地图服务暂时不稳定。下面使用本地真实餐厅库，不是演示餐厅。",
        "restaurants": [
            {
                "id": f"known-{slug}",
                "name": name,
                "nameNote": name_note,
                "area": "Tea Gardens",
                "address": address,
                "rating": "本地",
                "userRatingCount": "",
                "priceLevel": "",
                "note": note,
                "curationReason": curation_reason,
                "tags": tags,
                "googleMapsUri": "",
                "websiteUri": website,
                "hasMenu": bool(website or menu_text),
                "menuText": menu_text,
                "menuSource": menu_source,
                "menuVerified": menu_verified,
                "menuDishes": fallback_analyze({"menuText": menu_text}).get("dishes", []) if menu_text else [],
            }
            for slug, name, name_note, address, note, tags, website, menu_text, menu_source, menu_verified, curation_reason in restaurants
        ],
    }


def extract_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def call_openai_json(system, user, fallback):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return fallback

    body = {
        "model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
        "input": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = data.get("output_text")
        if not text:
            parts = []
            for item in data.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") in {"output_text", "text"}:
                        parts.append(content.get("text", ""))
            text = "\n".join(parts)
        return extract_json(text)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError):
        return fallback


def normalize_analyzed_dishes(data, source="菜单原文"):
    for idx, dish in enumerate(data["dishes"], start=1):
        name_en = str(dish.get("name_en") or dish.get("original_text") or "").strip()
        lower = name_en.lower()
        tags = dish.get("tags") if isinstance(dish.get("tags"), list) else []
        category, taste, cautions, assumptions, confidence = infer_menu_details(lower, name_en, tags)
        dish["id"] = str(dish.get("id") or idx)
        dish["name_en"] = name_en
        dish["name_zh"] = str(dish.get("name_zh") or translate_menu_name(lower, name_en) or name_en).strip()
        dish["original_text"] = str(dish.get("original_text") or name_en).strip()
        dish["price"] = str(dish.get("price") or "").strip()
        dish["category"] = str(dish.get("category") or category).strip()
        dish["taste"] = dish.get("taste") if isinstance(dish.get("taste"), list) else taste
        dish["cautions"] = dish.get("cautions") if isinstance(dish.get("cautions"), list) else cautions
        dish["assumptions"] = dish.get("assumptions") if isinstance(dish.get("assumptions"), list) else assumptions
        dish["confidence"] = str(dish.get("confidence") or confidence).strip()
        dish["source"] = str(dish.get("source") or source).strip()
        dish["description_zh"] = str(dish.get("description_zh") or describe_menu_item(lower, name_en)[0]).strip()
        dish["tags"] = tags or describe_menu_item(lower, name_en)[1] or ["可询问服务员"]


def call_openai_vision_json(system, text, image_data_url, fallback):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return fallback

    body = {
        "model": os.environ.get("OPENAI_VISION_MODEL", os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")),
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": system + "\n\n" + text},
                    {"type": "input_image", "image_url": image_data_url},
                ],
            }
        ],
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
        text_out = data.get("output_text")
        if not text_out:
            parts = []
            for item in data.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") in {"output_text", "text"}:
                        parts.append(content.get("text", ""))
            text_out = "\n".join(parts)
        return extract_json(text_out)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError):
        return fallback


def call_google_places(path, body, field_mask):
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured")
    req = urllib.request.Request(
        f"https://places.googleapis.com/v1/{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def http_json(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "AnxinRestaurantMVP/0.1 local-test",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def known_area_coords(area_name):
    key = re.sub(r"[^a-z0-9]+", "", (area_name or "").lower())
    known = {
        "teagarden": (-32.6671, 152.1609, "Tea Gardens"),
        "teagardens": (-32.6671, 152.1609, "Tea Gardens"),
        "chatswood": (-33.7969, 151.1803, "Chatswood"),
        "stives": (-33.7293, 151.1595, "St Ives"),
        "stlves": (-33.7293, 151.1595, "St Ives"),
        "hurstville": (-33.9667, 151.1020, "Hurstville"),
        "sydneycbd": (-33.8688, 151.2093, "Sydney CBD"),
        "sydney": (-33.8688, 151.2093, "Sydney CBD"),
        "parramatta": (-33.8150, 151.0011, "Parramatta"),
    }
    return known.get(key)


def known_area_from_coords(lat, lng):
    known = [
        (-32.6671, 152.1609, "Tea Gardens"),
        (-33.7969, 151.1803, "Chatswood"),
        (-33.7293, 151.1595, "St Ives"),
        (-33.9667, 151.1020, "Hurstville"),
        (-33.8688, 151.2093, "Sydney CBD"),
        (-33.8150, 151.0011, "Parramatta"),
    ]
    closest = min(
        (
            {
                "latitude": item_lat,
                "longitude": item_lng,
                "areaName": name,
                "distanceKm": haversine_km(lat, lng, item_lat, item_lng),
            }
            for item_lat, item_lng, name in known
        ),
        key=lambda item: item["distanceKm"],
    )
    return closest


def area_from_address(address):
    if not isinstance(address, dict):
        return ""
    for key in ("suburb", "city_district", "neighbourhood", "town", "village", "city", "municipality"):
        value = (address.get(key) or "").strip()
        if value:
            return value
    return ""


def reverse_location_google(lat, lng):
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return None
    params = urllib.parse.urlencode(
        {
            "latlng": f"{lat},{lng}",
            "key": api_key,
            "result_type": "locality|sublocality|neighborhood|administrative_area_level_2",
        }
    )
    data = http_json(f"https://maps.googleapis.com/maps/api/geocode/json?{params}", timeout=15)
    if data.get("status") != "OK":
        return None
    for result in data.get("results", []):
        components = result.get("address_components", [])
        for preferred in ("locality", "sublocality", "neighborhood", "administrative_area_level_2"):
            for component in components:
                if preferred in component.get("types", []):
                    name = component.get("long_name", "").strip()
                    if name:
                        return {
                            "source": "google_geocoding",
                            "areaName": name,
                            "displayName": result.get("formatted_address", name),
                        }
    return None


def reverse_location_osm(lat, lng):
    params = urllib.parse.urlencode(
        {
            "lat": lat,
            "lon": lng,
            "format": "jsonv2",
            "zoom": 14,
            "addressdetails": 1,
        }
    )
    data = http_json(f"https://nominatim.openstreetmap.org/reverse?{params}", timeout=15)
    area = area_from_address(data.get("address", {}))
    if not area:
        return None
    return {
        "source": "nominatim",
        "areaName": area,
        "displayName": data.get("display_name", area),
    }


def reverse_location(payload):
    try:
        lat = float(payload.get("latitude"))
        lng = float(payload.get("longitude"))
    except (TypeError, ValueError):
        return {"source": "invalid", "areaName": "", "displayName": "无法识别当前位置"}
    nearest = known_area_from_coords(lat, lng)
    if nearest and nearest["distanceKm"] <= 8:
        return {
            "source": "known_area",
            "areaName": nearest["areaName"],
            "displayName": f"{nearest['areaName']} 附近",
            "distanceKm": round(nearest["distanceKm"], 2),
        }
    try:
        resolved = reverse_location_google(lat, lng)
        if resolved:
            return resolved
    except (RuntimeError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError):
        pass
    try:
        resolved = reverse_location_osm(lat, lng)
        if resolved:
            return resolved
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError):
        pass
    return {
        "source": "nearest_known_area",
        "areaName": nearest["areaName"],
        "displayName": f"{nearest['areaName']} 附近",
        "distanceKm": round(nearest["distanceKm"], 2),
    }


def geocode_area_osm(area_name):
    known = known_area_coords(area_name)
    if known:
        return known
    query = area_name or "Sydney NSW Australia"
    params = urllib.parse.urlencode(
        {
            "q": f"{query}, Australia",
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "au",
        }
    )
    data = http_json(f"https://nominatim.openstreetmap.org/search?{params}", timeout=15)
    if not data:
        return None
    first = data[0]
    return float(first["lat"]), float(first["lon"]), first.get("display_name", query)


def osm_restaurant_tags(tags):
    cuisine = (tags.get("cuisine") or "").replace("_", " ")
    amenity = tags.get("amenity", "")
    result = []
    if cuisine:
        result.append(cuisine.title())
    if amenity == "cafe":
        result.append("咖啡/轻食")
    elif amenity == "pub":
        result.append("澳洲酒吧餐")
    elif amenity == "fast_food":
        result.append("快餐")
    else:
        result.append("餐厅")
    if tags.get("outdoor_seating") == "yes":
        result.append("可户外座位")
    if tags.get("takeaway") == "yes":
        result.append("可外带")
    return result[:4]


def osm_note(tags, distance):
    parts = []
    cuisine = (tags.get("cuisine") or "").replace("_", " ")
    if cuisine:
        parts.append(f"{cuisine.title()} 类型")
    if distance is not None:
        parts.append(f"约 {distance:.1f} km")
    if tags.get("opening_hours"):
        parts.append("有营业时间信息")
    return "，".join(parts) or "OpenStreetMap 附近餐厅。"


def normalize_osm_element(element, center_lat, center_lng, area_name):
    tags = element.get("tags") or {}
    name = tags.get("name")
    if not name:
        return None
    lat = element.get("lat") or element.get("center", {}).get("lat")
    lng = element.get("lon") or element.get("center", {}).get("lon")
    distance = None
    if center_lat is not None and center_lng is not None and lat is not None and lng is not None:
        distance = haversine_km(center_lat, center_lng, float(lat), float(lng))
    address_bits = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb") or area_name,
    ]
    address = " ".join(bit for bit in address_bits if bit) or f"{area_name}, NSW"
    return {
        "id": f"osm-{element.get('type')}-{element.get('id')}",
        "name": name,
        "area": area_name,
        "address": address,
        "rating": "",
        "userRatingCount": "",
        "priceLevel": "",
        "note": osm_note(tags, distance),
        "tags": osm_restaurant_tags(tags),
        "googleMapsUri": "",
        "websiteUri": tags.get("website") or tags.get("contact:website") or "",
        "hasMenu": False,
        "menuText": "",
        "lat": lat,
        "lng": lng,
    }


def nearby_restaurants_osm(area_name="", lat=None, lng=None):
    area_label = area_name or "当前位置"
    if lat is None and lng is None and area_name:
        geocoded = geocode_area_osm(area_name)
        if geocoded:
            lat, lng, display_name = geocoded
            area_label = display_name.split(",")[0] or area_name

    if lat is not None and lng is not None:
        lat, lng = float(lat), float(lng)
        query = f"""
        [out:json][timeout:20];
        (
          node["amenity"~"^(restaurant|cafe|fast_food|pub)$"](around:6000,{lat},{lng});
          way["amenity"~"^(restaurant|cafe|fast_food|pub)$"](around:6000,{lat},{lng});
          relation["amenity"~"^(restaurant|cafe|fast_food|pub)$"](around:6000,{lat},{lng});
        );
        out center tags 50;
        """
        center_lat, center_lng = lat, lng
    else:
        safe_area = (area_name or "Sydney").replace('"', '\\"')
        query = f"""
        [out:json][timeout:25];
        area["name"="{safe_area}"]["place"]->.searchArea;
        (
          node["amenity"~"^(restaurant|cafe|fast_food|pub)$"](area.searchArea);
          way["amenity"~"^(restaurant|cafe|fast_food|pub)$"](area.searchArea);
          relation["amenity"~"^(restaurant|cafe|fast_food|pub)$"](area.searchArea);
        );
        out center tags 30;
        """
        center_lat, center_lng = None, None
    params = urllib.parse.urlencode({"data": query})
    data = http_json(f"https://overpass-api.de/api/interpreter?{params}", timeout=30)
    restaurants = []
    seen_names = set()
    for element in data.get("elements", []):
        normalized = normalize_osm_element(element, center_lat, center_lng, area_label)
        if not normalized:
            continue
        key = normalized["name"].strip().lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        restaurants.append(normalized)
    if not restaurants:
        raise RuntimeError("OSM restaurants empty")
    return {
        "source": "openstreetmap",
        "message": "当前使用 OpenStreetMap 免费数据源。餐厅是真实地点，但评分和菜单可能不完整。",
        "restaurants": restaurants[:12],
    }


def place_price_level(value):
    if not value:
        return ""
    mapping = {
        "PRICE_LEVEL_FREE": "免费",
        "PRICE_LEVEL_INEXPENSIVE": "$",
        "PRICE_LEVEL_MODERATE": "$$",
        "PRICE_LEVEL_EXPENSIVE": "$$$",
        "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
    }
    return mapping.get(value, "")


def place_tags(place):
    types = place.get("types") or []
    tags = []
    if "cafe" in types:
        tags.append("咖啡/早午餐")
    if "italian_restaurant" in types:
        tags.append("意餐")
    if "seafood_restaurant" in types:
        tags.append("海鲜")
    if "chinese_restaurant" in types:
        tags.append("中餐")
    if place.get("rating", 0) >= 4.4:
        tags.append("评分较高")
    if place.get("userRatingCount", 0) >= 200:
        tags.append("评论较多")
    return tags[:4] or ["餐厅"]


def place_note(place):
    tags = place_tags(place)
    rating = place.get("rating")
    count = place.get("userRatingCount")
    parts = []
    if rating:
        parts.append(f"Google 评分 {rating}")
    if count:
        parts.append(f"{count} 条评论")
    if tags:
        parts.append(" / ".join(tags))
    return "，".join(parts) or "附近餐厅。"


def place_menu_hint(place):
    return ""


def normalize_place(place):
    display_name = place.get("displayName", {}).get("text", "Unnamed restaurant")
    address = place.get("shortFormattedAddress") or place.get("formattedAddress") or ""
    return {
        "id": place.get("id") or place.get("name") or display_name,
        "name": display_name,
        "area": address.split(",")[0] if address else "",
        "address": address,
        "rating": str(place.get("rating", "")),
        "userRatingCount": str(place.get("userRatingCount", "")),
        "priceLevel": place_price_level(place.get("priceLevel")),
        "note": place_note(place),
        "tags": place_tags(place),
        "googleMapsUri": place.get("googleMapsUri", ""),
        "websiteUri": place.get("websiteUri", ""),
        "hasMenu": False,
        "menuText": place_menu_hint(place),
    }


def nearby_restaurants(payload):
    area_name = payload.get("areaName", "").strip()
    lat = payload.get("latitude")
    lng = payload.get("longitude")
    if not area_name and lat is not None and lng is not None:
        area_name = reverse_location(payload).get("areaName", "")
    known = known_restaurants(area_name)
    if known:
        return known
    field_mask = ",".join(
        [
            "places.id",
            "places.displayName",
            "places.shortFormattedAddress",
            "places.formattedAddress",
            "places.rating",
            "places.userRatingCount",
            "places.priceLevel",
            "places.types",
            "places.googleMapsUri",
            "places.websiteUri",
        ]
    )
    if not os.environ.get("GOOGLE_MAPS_API_KEY"):
        try:
            return nearby_restaurants_osm(area_name, lat, lng)
        except (RuntimeError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError):
            return fallback_restaurants(area_name)

    try:
        if lat is not None and lng is not None:
            data = call_google_places(
                "places:searchNearby",
                {
                    "includedTypes": ["restaurant"],
                    "maxResultCount": 8,
                    "rankPreference": "POPULARITY",
                    "locationRestriction": {
                        "circle": {
                            "center": {"latitude": float(lat), "longitude": float(lng)},
                            "radius": 1500.0,
                        }
                    },
                },
                field_mask,
            )
        else:
            query = f"restaurants in {area_name or 'Sydney NSW Australia'}"
            data = call_google_places(
                "places:searchText",
                {
                    "textQuery": query,
                    "includedType": "restaurant",
                    "strictTypeFiltering": True,
                    "regionCode": "AU",
                    "languageCode": "en",
                    "maxResultCount": 8,
                },
                field_mask,
            )
        restaurants = [normalize_place(place) for place in data.get("places", [])]
        if not restaurants:
            return fallback_restaurants(area_name)
        return {"source": "google_places", "message": "", "restaurants": restaurants}
    except (RuntimeError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError):
        return fallback_restaurants(area_name)


def analyze_menu(payload):
    fallback = fallback_analyze(payload)
    system = (
        "You help Chinese-speaking people in Australia use restaurants without needing live English conversation. "
        "Explain menus in simple Chinese. Preserve the exact menu wording as evidence. "
        "Do not invent ingredients, prices, allergens, or spice levels. If something is inferred from common restaurant practice, "
        "put it in assumptions and lower confidence. Return only valid JSON."
    )
    user = json.dumps(
        {
            "task": "Analyze this restaurant menu for a Chinese-speaking user in Australia.",
            "restaurantName": payload.get("restaurantName", ""),
            "partySize": payload.get("partySize", ""),
            "bookingTime": payload.get("bookingTime", ""),
            "specialNotes": payload.get("specialNotes", ""),
            "menuText": payload.get("menuText", ""),
            "required_json_shape": {
                "summary": "short Chinese overview",
                "dishes": [
                    {
                        "id": "string id",
                        "name_en": "English dish name",
                        "name_zh": "simple Chinese name",
                        "original_text": "exact original menu line",
                        "price": "price exactly if visible, otherwise empty string",
                        "category": "breakfast/main/dessert/drink/side/unknown in Chinese",
                        "taste": ["甜/咸/奶香/清淡/辣 etc, only if supported or clearly inferred"],
                        "cautions": ["contains dairy/nuts/seafood/gluten/spicy/raw etc in Chinese, only if visible or common inference"],
                        "assumptions": ["Chinese notes for inferred uncertain details that need staff confirmation"],
                        "confidence": "高/中/低",
                        "source": "菜单原文/官网/PDF/照片",
                        "description_zh": "plain Chinese explanation, include taste and caution",
                        "tags": ["招牌/安全/偏辣/海鲜/适合老人 etc"],
                    }
                ],
            },
        },
        ensure_ascii=False,
    )
    data = call_openai_json(system, user, fallback)
    if not isinstance(data, dict) or not isinstance(data.get("dishes"), list):
        return fallback
    normalize_analyzed_dishes(data, "菜单原文")
    return data


def analyze_menu_photo(payload):
    fallback = {
        "summary": "菜单照片识别需要 OpenAI API 有可用额度。当前无法识别图片，请先使用示例菜单或文字菜单测试流程。",
        "dishes": [],
        "needsApi": True,
    }
    image_data_url = payload.get("imageDataUrl", "")
    if not image_data_url.startswith("data:image/"):
        return {
            "summary": "没有收到可识别的菜单照片，请重新拍照或选择图片。",
            "dishes": [],
        }

    system = (
        "You are helping Chinese-speaking people in Australia understand a restaurant menu photo. "
        "Read visible menu items from the image. Explain each item in simple Chinese, including taste, likely ingredients, "
        "allergen/diet cautions, whether it may be spicy, and whether it is suitable for older parents or children. "
        "Return only valid JSON. Do not invent prices or dishes that are not visible. Preserve exact readable menu wording. "
        "If OCR/vision is uncertain, use low confidence or omit the item."
    )
    user = json.dumps(
        {
            "restaurantName": payload.get("restaurantName", ""),
            "specialNotes": payload.get("specialNotes", ""),
            "required_json_shape": {
                "summary": "short Chinese overview of the menu photo and any uncertainty",
                "dishes": [
                    {
                        "id": "string id",
                        "name_en": "dish name as seen, or best readable English name",
                        "name_zh": "simple Chinese name",
                        "original_text": "exact visible text if readable",
                        "price": "price exactly if visible, otherwise empty string",
                        "category": "早餐/主菜/甜点/饮品/配菜/未知",
                        "taste": ["口味标签"],
                        "cautions": ["过敏或饮食注意"],
                        "assumptions": ["推测内容和需要现场确认的内容"],
                        "confidence": "高/中/低",
                        "source": "照片",
                        "description_zh": "plain Chinese explanation, taste, ingredients, caution",
                        "tags": ["安全/偏辣/海鲜/含奶/适合小孩/适合老人 etc"],
                    }
                ],
            },
        },
        ensure_ascii=False,
    )
    data = call_openai_vision_json(system, user, image_data_url, fallback)
    if not isinstance(data, dict) or not isinstance(data.get("dishes"), list):
        return fallback
    if not data["dishes"]:
        return {
            "summary": "没有从照片里清楚识别出菜单菜品。请靠近一点、保持菜单平整、光线更亮后重新拍。",
            "dishes": [],
        }
    normalize_analyzed_dishes(data, "照片")
    return data


def generate_card(payload):
    fallback = fallback_card(payload)
    system = (
        "You create practical English booking messages and order cards for Chinese-speaking people in Australia. "
        "The user may not understand spoken English replies, so the output must reduce live conversation. "
        "Return only valid JSON."
    )
    user = json.dumps(
        {
            "task": "Generate an English booking message, a staff-facing order card, and a fallback card.",
            "restaurantName": payload.get("restaurantName", ""),
            "partySize": payload.get("partySize", ""),
            "bookingTime": payload.get("bookingTime", ""),
            "specialNotes": payload.get("specialNotes", ""),
            "restrictions": payload.get("restrictions", []),
            "selectedDishes": payload.get("dishes", []),
            "required_json_shape": {
                "bookingMessage": "short polite English SMS/email",
                "orderCard": "large clear English text for restaurant staff",
                "fallbackCard": "English text asking staff to point/write because user's English is limited",
            },
        },
        ensure_ascii=False,
    )
    data = call_openai_json(system, user, fallback)
    if not isinstance(data, dict) or not all(key in data for key in ["bookingMessage", "orderCard", "fallbackCard"]):
        return fallback
    return data


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            self.respond_json({"ok": True, "service": "anxin-restaurant"})
            return
        super().do_GET()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if self.path == "/api/analyze-menu":
                self.respond_json(analyze_menu(payload))
            elif self.path == "/api/analyze-menu-photo":
                self.respond_json(analyze_menu_photo(payload))
            elif self.path == "/api/extract-menu-url":
                self.respond_json(extract_menu_from_url(payload))
            elif self.path == "/api/discover-menu":
                self.respond_json(discover_menu(payload))
            elif self.path == "/api/menu-file-data-url":
                self.respond_json(menu_file_data_url(payload))
            elif self.path == "/api/generate-card":
                self.respond_json(generate_card(payload))
            elif self.path == "/api/reverse-location":
                self.respond_json(reverse_location(payload))
            elif self.path == "/api/nearby-restaurants":
                self.respond_json(nearby_restaurants(payload))
            else:
                self.send_error(404)
        except Exception:
            if self.path == "/api/analyze-menu":
                self.respond_json(fallback_analyze({}))
            elif self.path == "/api/analyze-menu-photo":
                self.respond_json({"summary": "菜单照片识别暂时失败，请重新拍照或使用文字菜单。", "dishes": []})
            elif self.path == "/api/extract-menu-url":
                self.respond_json({"summary": "菜单网址提取失败，请换一个菜单页或截图识别。", "menuText": "", "dishes": []})
            elif self.path == "/api/discover-menu":
                self.respond_json({"summary": "自动查找菜单失败，可以换一家餐厅或到店拍菜单。", "menuText": "", "dishes": [], "menuLinks": []})
            elif self.path == "/api/menu-file-data-url":
                self.respond_json({"error": "fetch_failed"})
            elif self.path == "/api/generate-card":
                self.respond_json(fallback_card({}))
            elif self.path == "/api/reverse-location":
                self.respond_json({"source": "fallback", "areaName": "", "displayName": "当前位置识别失败"})
            elif self.path == "/api/nearby-restaurants":
                self.respond_json(fallback_restaurants(""))
            else:
                self.send_error(500)

    def respond_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    load_env()
    os.chdir(ROOT)
    lan_ip = local_ip()
    print(f"Serving locally: http://localhost:{PORT}")
    print(f"Serving on your network: http://{lan_ip}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
