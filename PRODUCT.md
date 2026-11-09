# Product direction

Working site name: System Design (may change).

## Product

- System Design teaches system design to engineers who have no background in it.
- Each chapter covers one topic: what its terms mean, which tools exist for it, how it works, and what goes wrong in real systems.
- The home page is a plain list of chapters.
- The reader should leave able to explain each term in plain words and know which tools to look up.

## Chapter template

Every chapter has the same sections, in this order:

1. Situation. Two or three sentences about an everyday problem that has the same shape.
2. Terms and tools. What each term means, and the common tools that do it.
3. How it works. A browser simulation the reader can watch and change.
4. In practice. What real systems run into, taken from public sources.
5. Extreme cases. Settings the reader changes to push the system until it breaks.
6. Config or code (optional). A short snippet that matches the simulation.

## Simulations

- Simulations run in the browser only. There is no live backend.
- They are deterministic and seeded, so a result can be reproduced and tested.
- They have no score, timer or win condition. The reader changes settings and watches what happens.

## Sources

- The user's teaching material (`docs/`, kept out of git) decides which topics to cover.
- Claims about real systems come from official documentation or public engineering posts by companies such as Netflix, Meta or Amazon.
- Each chapter lists its sources with links.
- If no public source backs a claim, leave the claim out.

## Content rules

- Write everything in our own words. Do not copy source text or images.
- Write config and code snippets ourselves, following the official docs.
- Ship in two languages: English and Traditional Chinese.
- Each term has one agreed name in each language. Use that name every time.
- Chapter text lives in `src/content/`, not in this file.
- Keep sentences short and plain.

## Non-goals

- No games.
- No live backend or hosted demo servers.
- This is not an interview question bank.
- It does not cover every technical detail. Teach the core idea, then stop.
