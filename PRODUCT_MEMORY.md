# Product Memory

## Core Audience

This product is for Chinese-speaking people in Australia who struggle with English in real life, especially:

- Chinese migrants who have lived in Australia for many years but still cannot confidently read, write, speak, or handle formal English.
- Newly arrived international students who need help with rent, school, banking, medical, government, and daily communication.
- Chinese tourists visiting Australia who need simple help understanding signs, messages, bookings, transport, medical situations, and service conversations.
- Older parents visiting children in Australia who do not speak English and need very simple, reassuring guidance.

## Product Positioning

The first product is a restaurant-only app.

It is not an English-learning app and not a broad Australian life assistant in the first version.

The first commercial test product helps Chinese-speaking users in Australia go to local restaurants even when they cannot confidently use English.

Do not show user-facing language-difficulty ratings. Explain practical fit instead: what the restaurant is, who it suits, price/occasion, what to eat or drink, and what to avoid.

The product should reduce the need for live English conversation whenever possible. Many users may be able to show prepared information but cannot reliably understand spoken English replies. The app should therefore help users prepare choices, messages, booking details, order cards, and situation cards in advance, then let them show or send those structured outputs instead of improvising in English on the spot.

The product should not require users to do hard preparatory work such as finding, copying, and pasting restaurant menus. Users are using the app because they do not know what to do. The app should guide them from simple choices such as location, nearby restaurants, party size, time, taste preference, and dietary limits.

The restaurant product should help users:

- Find nearby restaurants.
- Understand menus in Chinese.
- Choose dishes before arriving or before ordering.
- Prepare booking messages.
- Generate a large staff-facing English order card.
- Show fallback cards when staff speak too fast or something is unavailable.
- Avoid obvious issues such as spicy food, allergens, raw/half-cooked food, pork, seafood, or dishes unsuitable for older parents or children.

## Design Standard

The UI should feel clean, calm, and Apple-like:

- Simple white or light grey surfaces.
- Large readable Chinese text.
- One primary action per screen.
- No clutter, feeds, ads, or unnecessary settings.
- Clear buttons and plain language.
- Designed for anxious users and older users, not just young tech users.

## Non-Negotiable Rule

Every product decision should be judged by this question:

Would this help a Chinese-speaking person in Australia who cannot confidently use English go to a local restaurant, choose food, and order with less fear and less confusion?

If not, it should not be in the first version.

## Restaurant Area Operating Experience

The app is now built area by area. Each area is treated like a small local product launch, not a loose restaurant list.

For every suburb:

- Start with the area identity: accepted spellings, common typo aliases, approximate GPS anchor, and fallback route.
- Choose at least 10 local, well-reviewed restaurants where possible.
- Prefer non-Chinese dining environments because the app solves English menu and ordering anxiety.
- Every restaurant must have a Chinese name note explaining what the restaurant is and what kind of food it serves.
- Every restaurant must have a usable address. A missing exact Google Maps place URL is acceptable only if the app can generate a Google Maps search and navigation URL from restaurant name plus address.
- Menu data must be restaurant-specific. Never reuse dishes from another restaurant to fill a thin menu.
- Source priority is official menu, ordering menu, Google/menu photo, then review/photo clues. The weaker the source, the more conservative the dish card should be.
- If exact dishes are not reliable, show category-level or `待核验` guidance instead of pretending the menu is complete.
- Before pushing an area, check restaurant count, menu count, address links, Chinese notes, category grouping, and obvious cross-restaurant contamination.

Current expansion pattern:

- Tea Gardens: real small-town sample; focus on seafood, fish and chips, hotel/pub dining, and cafe options.
- Tea Gardens rule after v56: only Tillermans, Mumm's, Hook'n Cook, Jayz, Hawks Nest Golf Club/Sando's, Benchmark, and Tea Gardens Hotel have usable menu cards. Nicole's, Mangrove, and Hawks Nest Takeaway still need stronger sources before adding dishes.
- Chatswood: dense city-area sample; 10 real non-Chinese-default restaurants with deeper menus.
- St Ives: suburb sample; real restaurants, Chinese restaurants excluded by default, menus being thickened from official and ordering sources.
- Sydney CBD: main-Sydney core area now targets a denser product-grade set, not a thin sample. After v57 it has 20 real restaurants and must continue toward broader CBD coverage with official menu sources first.
- Hurstville and Parramatta: still need the same area-by-area treatment before they are considered production-quality.
