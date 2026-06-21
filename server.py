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

    if "fish cake" in lower:
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
    r"bibimbap|bulgogi|kimchi|korean fried chicken|seafood pancake|japchae|pad thai|curry|tom yum|papaya salad|mango sticky rice|mango"
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
            "Mumm's Seafood Platter",
            "Seafood Mornay",
            "Fresh catch of the day",
            "Takeaway fish and chips",
            "Turkish delight panna cotta",
            "Persian fairy floss and pistachio",
        ]
    )
    result = fallback_analyze({"menuText": menu_text})
    result["menuText"] = menu_text
    result["websiteUrl"] = "https://mummsonthemyall.com.au"
    result["source"] = "known_menu_cache"
    result["summary"] = "已先整理官网确认的代表菜，不是完整菜单。包含招牌海鲜、当日鱼、外带炸鱼薯条和甜点；完整菜单仍可打开原文核对。"
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

    if "flat white" in lower:
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
        ("local-bistro", f"{area} Local Bistro", "4.6", "适合第一次尝试本地西餐，选择比较稳。", ["西餐", "适合老人", "英文压力低"], "bistro", "$$"),
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


def known_restaurants(area_name=""):
    key = re.sub(r"[^a-z0-9]+", "", (area_name or "").lower())
    if key in {"cw", "chatswood"}:
        restaurants = [
            (
                "cw-dumpling",
                "Chatswood 菜系练习：点心/小笼包",
                "Chatswood, NSW",
                "菜系练习，不是某家餐厅真实菜单。用于先看懂常见菜名。",
                ["中餐", "点心", "练习菜单"],
                "",
                "\n".join([
                    "Xiao long bao",
                    "Pan fried pork buns",
                    "Prawn wonton noodle soup",
                    "Shanghai fried noodles",
                    "Salt and pepper calamari",
                    "Mango pancakes",
                ]),
            ),
            (
                "cw-thai",
                "Chatswood 菜系练习：泰餐",
                "Chatswood, NSW",
                "菜系练习，不是某家餐厅真实菜单。重点解释辣度、花生和海鲜风险。",
                ["泰餐", "需确认辣度", "练习菜单"],
                "",
                "\n".join([
                    "Chicken pad thai",
                    "Green curry with beef",
                    "Massaman lamb curry",
                    "Tom yum prawns",
                    "Papaya salad",
                    "Mango sticky rice",
                ]),
            ),
            (
                "cw-ramen",
                "Chatswood 菜系练习：日式拉面",
                "Chatswood, NSW",
                "菜系练习，不是某家餐厅真实菜单。适合快速判断汤底、猪肉和油炸小吃。",
                ["日餐", "拉面", "练习菜单"],
                "",
                "\n".join([
                    "Tonkotsu ramen",
                    "Miso ramen",
                    "Chicken karaage",
                    "Pork gyoza",
                    "Teriyaki chicken don",
                    "Green tea ice cream",
                ]),
            ),
            (
                "cw-korean",
                "Chatswood 菜系练习：韩餐",
                "Chatswood, NSW",
                "菜系练习，不是某家餐厅真实菜单。覆盖常见主食、汤和分享菜。",
                ["韩餐", "可能偏辣", "练习菜单"],
                "",
                "\n".join([
                    "Beef bulgogi",
                    "Bibimbap",
                    "Kimchi stew",
                    "Korean fried chicken",
                    "Seafood pancake",
                    "Japchae glass noodles",
                ]),
            ),
            (
                "cw-cafe",
                "Chatswood 菜系练习：咖啡早午餐",
                "Chatswood, NSW",
                "菜系练习，不是某家咖啡店真实菜单。适合老人、游客和学生先练习使用。",
                ["咖啡", "早午餐", "练习菜单"],
                "",
                "\n".join([
                    "Flat white",
                    "Long black",
                    "Avocado toast with poached eggs",
                    "Eggs benedict",
                    "Chicken schnitzel sandwich",
                    "Banana bread",
                ]),
            ),
        ]
        return {
            "source": "known_local",
            "message": "当前没有后端 Google Places key，Chatswood 先显示菜系练习菜单，不冒充真实餐厅菜单。真实餐厅需要接 Google Places/OSM 或人工确认库。",
            "restaurants": [
                {
                    "id": f"known-{slug}",
                    "name": name,
                    "area": "Chatswood",
                    "address": address,
                    "rating": "",
                    "userRatingCount": "",
                    "priceLevel": "",
                    "note": note,
                    "tags": tags,
                    "googleMapsUri": "",
                    "websiteUri": website,
                    "hasMenu": True,
                    "menuText": menu_text,
                    "menuSource": "菜系练习",
                    "menuVerified": False,
                }
                for slug, name, address, note, tags, website, menu_text in restaurants
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
    restaurants = [
        ("tea-gardens-hotel", "Tea Gardens Hotel", "Cnr Maxwell Street & Marine Drive, Tea Gardens", "澳洲酒吧餐，有官网菜单，适合体验本地 pub food。", ["澳洲酒吧餐", "官网菜单", "适合家庭"], "https://teagardenshotel.com/food-drinks", tea_gardens_hotel_menu, "官网 Food + Drinks 菜单", True),
        ("tillermans", "Tillermans Cafe - Restaurant", "Tea Gardens", "咖啡和餐厅，适合轻食", ["咖啡/轻食", "餐厅"], "", "", "", False),
        ("waterfront-bistro", "Waterfront Restaurant & Bistro", "Cnr Maxwell Street & Marine Drive, Tea Gardens", "海边餐厅/小酒馆类型", ["Bistro", "本地餐厅"], "", "", "", False),
        ("hook-n-cook", "Hook'n Cook", "Tea Gardens", "Google Maps 菜单照片可见大量外带菜，适合先选好炸鱼薯条、汉堡和分享套餐。", ["Fish And Chips", "快餐", "地图照片菜单"], "", hook_menu, "Google Maps 菜单照片（约9个月前）", True),
        ("mumms-seafood", "Mumm's Seafood", "Tea Gardens", "海鲜餐厅，已知官网可找到菜单", ["Seafood", "有官网菜单"], "https://mummsonthemyall.com.au", "", "", False),
        ("mangrove-cafe", "Mangrove Cafe", "83 Marine Drive, Tea Gardens", "咖啡和轻食", ["咖啡/轻食"], "", "", "", False),
        ("jayz-myall", "Jayz At The Myall", "Tea Gardens", "咖啡/轻食，本地餐厅", ["咖啡/轻食"], "", "", "", False),
    ]
    return {
        "source": "known_local",
        "message": "真实地图服务暂时不稳定。下面使用本地真实餐厅库，不是演示餐厅。",
        "restaurants": [
            {
                "id": f"known-{slug}",
                "name": name,
                "area": "Tea Gardens",
                "address": address,
                "rating": "",
                "userRatingCount": "",
                "priceLevel": "",
                "note": note,
                "tags": tags,
                "googleMapsUri": "",
                "websiteUri": website,
                "hasMenu": bool(website or menu_text),
                "menuText": menu_text,
                "menuSource": menu_source,
                "menuVerified": menu_verified,
            }
            for slug, name, address, note, tags, website, menu_text, menu_source, menu_verified in restaurants
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
            "User-Agent": "AnxinRestaurantMVP/0.1 local-test contact@example.com",
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
        "hurstville": (-33.9667, 151.1020, "Hurstville"),
        "sydneycbd": (-33.8688, 151.2093, "Sydney CBD"),
        "sydney": (-33.8688, 151.2093, "Sydney CBD"),
        "parramatta": (-33.8150, 151.0011, "Parramatta"),
    }
    return known.get(key)


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
