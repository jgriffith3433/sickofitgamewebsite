# Sick Of It — world bible (website)

Canon for this site mirrors `sickofitgame-unity` `Docs/Story.md` and the Floor JSON under
`Assets/GameConfig/levels/`. The descent asset pack below is the landing-story slice for the Shaft and
Floors 1000–997; `js/descent.js` scrolls it on the landing page (sticky floors, counting number, sound toggle off by default).

## The descent (Shaft → 997)

Package: `data/descent.json` with media under `data/descent/{shaft,1000,999,998,997}/`.

| Id | Place | Hero quip (voiced) | Beat |
|---|---|---|---|
| shaft | The Shaft | "...Great." (`vo_shaft_great`) | The fall from the meadow into Hell. |
| 1000 | The Landing | "Floor one thousand. Of course it's a thousand." (`vo_landing_intro`) | The bottom of Hell. He is already sick of it. |
| 999 | Only 999 To Go | "You said that already." (`vo_landing_999`) | One floor up. Hell is counting along. |
| 998 | The Spill | "Oh, sure. Take the rocket launcher. Take it." (`vo_f998_taken`) | They took the village. Now they take the gun. |
| 997 | Imp Run | "Those are ours." (`vo_imprun_ours`) | Imps haul his village's diamonds. Same sack, every loop. |

Quips are the hero's opening voiced line from each floor's Unity level JSON, not the warm-grey Story.md beats
(those stay unvoiced narration in-game). Every floor in this pack has a mono hero voice clip (Unity
`Assets/Audio/Generated/` VO ids, compressed to 24 kHz 48 kbps); `voiceText` mirrors the caption exactly.
Hero voice: ElevenLabs `DzkD7I4tf5i3KSaB4cz5` ("Sick Of It - player") — tired, dry, deadpan. `captionOnly`
stays empty until a later floor lacks VO. Landing playtest: `?playtest=descent`. Preview:
`data/descent/preview.html?playtest=descent-assets`.

## Landing hero (site)

The landing hero is a one-screen taste of Floor 1000 before the fall: shaft walls, a ledge, heat embers, falling
village diamonds to snag, bullets to dodge, hold to rewind. A first-second hint ("Drag to dodge. Hold to rewind.")
fades once the visitor moves; a near-miss dodge counter ticks while they play. After a short bout the payoff card
speaks in the hero's sardonic register — "Now do it for 1,000 floors." — with PLAY NOW into `Game/` (optional VO at
`sounds/toy-payoff.wav` when Gen has imported it). With prefers-reduced-motion or no canvas, the looping rewind clip
stands in for the toy.

## Game page load (site)

Opening `Game/` puts the visitor straight into the same Floor 1000 taste as a full-viewport load toy while the Unity
build downloads: dodge and rewind with no menu text, a thin "Descending N%" ledge bar, and — when Hawkes Net is up —
"N climbing right now" from the page spectator. When the build is ready, Play sits in the thumb zone; one tap tears
the toy down, unlocks sound, and drops into the real game with no second Tap to play. If the load fails or stalls,
Retry stays on the running toy. The page spectator closes the moment Play starts so the game's own chip owns the count.
