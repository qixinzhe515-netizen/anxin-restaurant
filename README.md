# Restaurant Order Card MVP

Mobile-first prototype for Chinese-speaking people in Australia who want to visit local restaurants without relying on live English conversation.

The product is intentionally restaurant-only for the first market test: find a restaurant, understand the menu, choose dishes, and show a staff-facing order card.

## Run

```bash
python3 server.py
```

Then open:

```text
http://localhost:8787
```

On another device in the same home Wi-Fi, open the network URL printed by the server, for example:

```text
http://192.168.1.4:8787
```

That address is only a local network test address. It will not work when the phone is outside the same Wi-Fi. For other people to test, deploy the app to a public HTTPS host.

## Public Test Deployment

Current public static test URL:

```text
https://qixinzhe515-netizen.github.io/anxin-restaurant/
```

This GitHub Pages version is a stable HTTPS entry for early phone testing. It uses browser-side fallback logic when `/api/*` is unavailable, including Tea Gardens known restaurant data, Mumm's Seafood trusted menu cache, local menu explanation, and order-card generation. Render is still the target for the full backend version with live restaurant search, website fetching, and AI vision.

This repo includes `render.yaml` for a minimal Render deployment.

1. Push this folder to a GitHub repository.
2. Create a new Render Blueprint from the repo.
3. Set environment variables if available:

```text
OPENAI_API_KEY=...
GOOGLE_MAPS_API_KEY=...
```

4. Render will run:

```bash
python3 server.py
```

The deployed `https://...onrender.com` URL can be shared with testers. On iPhone, testers can open it in Safari and use Share -> Add to Home Screen to install it like a simple app.

The app uses `OPENAI_API_KEY` from `.env.local` when available. If the API call fails, it falls back to local demo generation so the prototype still works.

For real nearby restaurant search, add a Google Places API key:

```text
GOOGLE_MAPS_API_KEY=your_google_places_key
```

Without this key, restaurant search first uses OpenStreetMap/Overpass as a no-key fallback, then falls back to demo data if OSM is unavailable.

Menu photo recognition first uses `OPENAI_API_KEY` vision. If the OpenAI project has no available quota, the browser tries no-key OCR through Tesseract.js, then sends the extracted text through the existing menu explanation flow.

For known restaurants, the app can use a local trusted menu cache before attempting OCR. This prevents low-confidence OCR fragments from appearing as dish cards.

## Current Menu Data Status

- v55 starts the main Sydney expansion pattern with a Sydney CBD core set: 10 real restaurants across CBD/Surry Hills/The Rocks/Redfern/Chippendale, each with Chinese notes, address/map fallback, and restaurant-specific menu clues from official pages or PDFs.
- v54 turns the repeated lessons into a fixed area-operation playbook: every area must go through address/map QA, restaurant-source QA, menu-source QA, dish-category QA, and cross-restaurant contamination checks before being treated as usable.
- v53 continues St Ives menu thickening: The Living Room Café, Café Milligram, and Resunga were expanded from source text/structured menu data, and a Sushiru data bug was fixed so it no longer shows Chargrill Charlie's dishes.
- v52 completes the first St Ives menu pass across all 11 candidates: Charmed Thai now has menu-image dishes, The St Ives Club has 2026 Brasserie menu categories, Chargrill Charlie's/Resunga/Café Milligram were thickened, and no St Ives restaurant is left with an empty menu card.
- v51 adds St Ives as the next area sample: 11 real St Ives candidates, no default Chinese restaurant, Chinese restaurant notes, GPS/typing aliases for `St Ives` and `st lves`, and first-pass structured dish explanations for restaurants with public menu clues.
- Sydney CBD core set currently includes NOMAD, AALIA, Restaurant Hubert, Le Foote, Alberto's Lounge, Bistecca, The Gidley, Kid Kyoto, Ester, and Mjølner.
- Chatswood real-menu sample set currently prioritizes non-Chinese-environment restaurants: Khao Pla, Mamak, Sunday Seoul, Kazuma, Bistro Kai, Manpuku, Cafe Markus, Chimichuri, Ooshman, and Gelateria Gondola.
- All 10 Chatswood real restaurants now have at least 10 structured dish explanations. Khao Pla, Mamak, and Sunday Seoul still have the deepest coverage and should be the pattern for expanding the others.
- Each real restaurant must keep its own source, address, menu text, and structured dish cards. Do not mix dishes between restaurants.

## Restaurant Selection Rules

- Real recommendations must be locally well-reviewed, not just easy to scrape.
- A restaurant needs a verifiable menu source before structured dishes are shown as real dishes.
- Non-Chinese-environment restaurants are prioritized because the product solves English menu and ordering anxiety.
- Older famous restaurants with mixed scores can stay only when clearly labelled as local staples; higher-rated restaurants should replace them when menu data is available.

## Area Operation Playbook

Use this sequence for every suburb. Do not skip around.

1. Area identity: add suburb aliases, GPS anchor, and local fallback route so typed search and location search land in the same area.
2. Restaurant set: choose at least 10 local well-reviewed, non-Chinese-default restaurants where possible. Chinese restaurants stay out unless there is a product reason.
3. Address operation: every restaurant needs a usable address. If an exact `googleMapsUri` is missing, the app must still generate Google Maps search and navigation links from name plus address.
4. Restaurant explanation: every restaurant needs a Chinese `nameNote` explaining what it is and what people usually eat there.
5. Menu source rank: official menu page/PDF first, ordering menu second, Google Maps/menu photo third, review/photo clues last. Low-confidence clues can only create category cards or `待核验` dishes.
6. Dish structure: dishes must be grouped by category, have Chinese name, original English name, simple explanation, taste, cautions, and tags.
7. Anti-mix check: every dish must belong to that restaurant only. Never copy another restaurant's menu into a new restaurant just to fill count.
8. Area QA: before deploy, check restaurant count, dish count, source labels, address/map links, left-swipe/back navigation, and version text.

Run the local audit before each area deploy:

```bash
python3 area_audit.py
```

The audit is allowed to print `TODO` for honest missing work, but it should not print cross-restaurant contamination errors.
