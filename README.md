# Restaurant Order Card MVP

Mobile-first prototype for Chinese-speaking people in Australia who want to visit local restaurants without relying on live English conversation.

The product is intentionally restaurant-only for the first market test: find a restaurant, understand the menu, choose dishes, generate a booking message, and show a staff-facing order card.

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
