# Battle Array: Collapse — Product Roadmap

## Product shape

Battle Array: Collapse is built around three official modes and one player-creation ecosystem:

- **Classic** — fixed board, fixed symmetric armies, deterministic competitive play.
- **Arena** — generated battlefield, tiered Draft, asymmetric armies, deterministic resolution.
- **Puzzles** — named fixed challenges plus an individualized random challenge generator.
- **Workshop** — custom pieces, custom puzzles, saved Replays, and portable Share Codes.

Official content must meet a high quality bar. Workshop content only needs to be structurally valid, safe to load, and reproducible; it does not need to be balanced, optimal, or even solvable.

## Guiding rules

- English is the source language for player-facing names and explanations. Localization comes later.
- Game rules remain deterministic. Randomness creates the battlefield, Draft, or puzzle; it does not decide attacks or damage after placement.
- New abilities are expressed through safe, declarative rule modules rather than custom executable code.
- Mobile layout remains responsive to the available container and device size.
- Saved data and Share Codes are versioned. Invalid or retired content must fail safely instead of crashing.
- Features are delivered in small, playable slices. Each phase should be usable before the next phase begins.

## Phase 1 — Rules and interaction foundation

- Stabilize all existing piece rules and Collapse ordering.
- Finish directional presentation using upright icons and a separate facing indicator.
- Make Rulebook content change with Classic, Arena, Puzzles, and Workshop context.
- Resolve remaining UI consistency issues, including the Settings icon alignment.
- Keep the Piece Lab and web generator available as development tools.

**Done when:** Classic and current Arena pieces behave consistently in play, preview, inspection, Replay, puzzle validation, and exported data.

## Phase 2 — Mason and dynamic Obstacles

Add **Mason** as the first board-construction piece.

- After placement, choose an orthogonally adjacent empty tile.
- Place a neutral **Obstacle** on that tile immediately.
- The Mason controls the three other orthogonal tiles around its constructed Obstacle. Its own tile is excluded, and destroying that Obstacle removes this range.
- The new Obstacle can become a Cannon screen, block a Crossbow or Musket ray, stop a Lancer charge, provide a Sentry strongpoint, or be destroyed by a Battering Ram.
- An Mason placement is illegal when it has no legal adjacent construction tile.
- Start in the Advanced tier and initially limit it to one copy per army while balance is evaluated.
- Define and test placement-order interactions, especially Mason versus Battering Ram.

**Done when:** Mason works in placement, previews, inspection, Collapse, Replay, Arena Draft, Puzzle Editor, solver evaluation, and serialization.

## Phase 3 — Theme-aware puzzle generation

Replace the single freeform generator with multiple generation routes:

- **Themed Formation** — a readable formation built from a structural grammar.
- **Free Formation** — more open and spatially varied positions, subject to quality filters.
- **Combined Formation** — exactly two compatible motifs, avoiding uncontrolled mechanic piles.

Initial theme families:

- **Weak Points** — bridge pieces, low-survival nodes, sacrifices, and layered collapse.
- **Lines of Fire** — Cannon screens, Crossbow first targets, and Musket lanes.
- **Breach** — Obstacles and meaningful Battering Ram destruction.
- **Charge** — Lancer movement, blockers, and renewed advances after pieces disappear.
- **Fieldworks** — Mason construction and Sentry strongpoints.
- **Rescue** — fixed allied pieces, relief forces, protection, and encirclement.

Sharpshooter and facing are tools used inside other themes, not standalone theme families.

Every candidate must pass automated quality checks:

- legal initial state and legal solution placements;
- no solution piece placed on an initial Obstacle tile, even if that Obstacle is destroyed;
- every answer piece is necessary under single-piece removal testing;
- advanced pieces are downgraded when a lower-tier replacement preserves the result;
- special mechanics are causally necessary, not merely present;
- enemy formation is stable before the player acts;
- meaningful Collapse depth;
- limited Sharpshooter use;
- no wasted Battering Ram or idle high-tier piece;
- canonical similarity checking across translation, rotation, reflection, composition, and collapse signature;
- bounded attempts and a safe failure result.

**Done when:** each route can repeatedly produce varied legal candidates worth human review without hanging.

## Phase 4 — Official puzzle campaign

Ship approximately **50 fixed puzzles**.

- Generate a large offline candidate pool, then curate the final set manually.
- Mix hand-authored tutorials, themed formations, free formations, combined formations, and a few large finales.
- Give every fixed puzzle a unique English title and stable ID.
- Display both progression number and title, for example `12 · Behind the Screen`.
- Preserve a verified reference answer, but allow alternate solutions.
- Store campaign progress independently from generated and Workshop puzzles.

Suggested content balance:

- 6 hand-authored tutorials;
- 20 clear themed puzzles;
- 12 Free Formation puzzles;
- 10 Combined Formation puzzles;
- 2 large finale puzzles.

**Done when:** the campaign has a deliberate difficulty curve, no duplicate IDs, no obvious redundant answers, and no near-duplicate formations.

## Phase 5 — Random Challenge

Add one player-facing **Random Challenge** generator alongside the fixed campaign.

- Generate only when the player explicitly requests a challenge.
- Persist the generated puzzle until the player requests **New Challenge**.
- Use cryptographically random per-generation seeds rather than a shared default or date-only seed.
- Include installation identity, generation counter, and rules version in generation metadata.
- Choose among multiple qualifying top candidates instead of always selecting one global optimum.
- Avoid the fixed 50 and the player's recent generated-history signatures.
- Show a short reproducible Seed for sharing.
- Use a strict time/attempt budget and fall back to a pre-generated verified puzzle if generation fails.

Random Challenge is distinct from a possible future **Daily Challenge**, where every player intentionally receives the same dated puzzle.

**Done when:** different players normally receive structurally different puzzles, current challenges survive app restarts, and generation cannot hang.

## Phase 6 — Replay Library

- Save the initial state, player actions, facing choices, Sentry anchor, Sharpshooter targets, construction/destruction choices, and rules version.
- Recompute deterministic Collapse frames during playback rather than storing animation frames.
- Allow naming, replaying, deleting, and exporting saved Replays.
- Keep imported and Workshop Replays separate from official progress.

**Done when:** a saved Replay reproduces the same board states and Collapse order after restarting the app.

## Phase 7 — Piece Workshop

Allow players to create custom pieces from safe rule modules.

Possible modules include:

- fixed Attack or Support offsets;
- orthogonal or diagonal rays;
- first-target and single-screen behavior;
- Obstacle blocking;
- facing;
- Charge movement;
- select-N targets;
- place or destroy an Obstacle.

Players may choose:

- English name and description;
- icon from an approved icon set;
- rule modules and parameters;
- Draft tier: Core, Advanced, or Elite.

Custom pieces cannot contain scripts or arbitrary code. Hard limits apply to board reach, selected targets, spawned objects, movement distance, and evaluation cost.

**Done when:** a custom piece can be created, previewed, validated structurally, saved locally, exported, imported, and simulated by the normal rules engine.

## Phase 8 — Custom pieces in Arena

Custom pieces become optional members of the Arena Draft pools.

- The creator-assigned tier determines which Draft rounds may offer the piece.
- Both player and AI see candidates from the same pool.
- A custom Arena setup records the exact custom-piece definitions it uses.
- Official Arena remains available with only the official roster.

AI must move away from hard-coded piece-name logic and evaluate abilities through the shared rules engine:

- immediate attack and support contribution;
- survival and exposure;
- controlled-area value;
- ray, screen, Obstacle, construction, and destruction interactions;
- Charge simulation across Collapse stages;
- Draft synergy with the current roster and battlefield;
- cost-aware search limits for complex custom abilities.

The AI does not need to discover perfect strategy for every player invention. It must make legal choices, understand the declared mechanics, recognize obvious synergy, and avoid plainly useless placements.

**Done when:** AI can draft and place previously unseen declarative custom pieces without special-case code or crashes.

## Phase 9 — Puzzle Editor and Share Codes

Expand the current web editor into the player-facing **Puzzle Editor**.

- Place enemy pieces, fixed allied pieces, Obstacles, official pieces, and custom pieces.
- Configure the player hand and supported victory conditions.
- Optionally record a verified solution by completing the puzzle once.
- Allow both **Verified** and **Unverified** puzzles to be saved and shared.

Create compact, versioned Share Codes for:

- Puzzles;
- Replays;
- Custom Pieces;
- Custom Arena setups.

Share Codes must contain a data type, schema version, rules version, compressed payload, and checksum. Import validates bounds, counts, coordinates, rule modules, and retired types before loading. Imported content never changes official campaign progress.

**Done when:** one player can copy a text code to another device, import it offline, and reproduce the same content safely.

## Phase 10 — Release completion

- Final mobile UI and physical-device verification.
- Mode-specific onboarding and Rulebook.
- Save migration and recovery testing.
- Performance budgets for AI, random generation, custom pieces, and Replay.
- Accessibility, audio, haptics, localization hooks, and store presentation.
- Curated Featured Puzzles may be added later, but require explicit human review before entering official content.

## Long-term definition of complete

The game is complete when it supports:

1. a rigorous symmetric abstract game in Classic;
2. replayable asymmetric construction in Arena;
3. a named 50-puzzle official campaign;
4. individualized Random Challenges;
5. saved and shareable Replays;
6. safe custom pieces usable by both players and AI in Arena;
7. player-designed, importable puzzles and custom setups.

At that point, official design supplies the trusted core while Workshop content gives players an open-ended sandbox.
