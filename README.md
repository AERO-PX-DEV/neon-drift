# NEON DRIFT

A cozy cyberpunk flying-car cruising sim in the browser. Rainy neon megacity, no combat, no fail states.
Everything is procedural (geometry, windows, rain, later audio), so a missing asset can never crash it.

## Setup

Requires Node.js 18+.

```powershell
npm install
npm run dev
```

Open http://localhost:5173 and click to start.

- Different city: `http://localhost:5173/?seed=1234` (same seed → same city).

**Desktop app (one click, fullscreen):** double-click **NEON DRIFT** on the desktop. It opens the game in its own
fullscreen window (Electron), with no browser. **F11** toggles fullscreen, **Settings → Quit game** (or Alt+F4) exits.
The shortcut runs the last build in `dist/`: after changing code, run `npm run app` (builds, then opens the app) or
`npm run build`. Your saves and music live separately in the desktop app and in the browser.
- Tests: `npm test`
- Production build: `npm run build` → `dist/`

## Controls

| Key | Action |
|---|---|
| W / S (↑ / ↓) | Thrust forward / reverse |
| A / D (← / →) | Turn (the car banks into turns) |
| Space / F (or Ctrl) | Climb / descend |
| Q / E | Strafe left / right |
| Shift | Boost |
| C | Camera: chase → cockpit → cinematic (click in cockpit to mouse-look, Esc to release) |
| T | Autopilot: scenic loop (or the destination picked on the map). Any flight key takes over |
| G | Land at a nearby pad (the autopilot sets you down) · in Sanctuary View: leave |
| B | World Builder mode · Enter places at the rooftop in the middle of the view |
| M | Map (pick an autopilot destination) |
| P | Photo mode (time stops; free camera; Enter saves a PNG) |
| V | Wipers: off → intermittent → low → high |
| R | Radio / full music player |
| N | Next track |
| H | Hide HUD |
| Esc | Menu drawer: City Director, World Builder, Map, Radio, City Log, Garage, Settings |

## Atmosphere

- **Weather:** Light Drizzle, Steady Rain, Heavy Downpour (lightning + thunder), Dense Fog, Ash/Snow Mix.
  Changes blend over ~30 s. "Auto" drifts between states every 2–5 minutes (ash is rare).
- **Time:** a slider from deep night to smoggy pre-dawn haze, or a slow 20-minute cycle.
- **Sound:** all synthesized with Web Audio: rain (muffled with roof drumming in cockpit), city hum, engine, thunder.

Every key can be rebound in **Settings → Controls** (Esc in the prompt cancels; "Reset controls" restores these).
Autopilot is on **T** because A is already "turn left" in WASD.

**Gamepad** (standard layout): left stick flies, right stick strafes, RT/LT climb/descend, A boost, B land/leave,
X wipers, Y camera, LB autopilot, RB next track, Back hide HUD, Start menu, L3 photo mode, D-pad ↑ radio · ↓ map · ← builder · → place.

## Cozy & building

- **Sky-pads:** about 14 per city: your **Home** in the Stacks near the start, noodle balconies, tea bars and public pads,
  each with a glowing deck, a tall light rod and a name board. Get close and press **G**: the car lands itself.
- **Sanctuary View:** docking takes you inside, sitting by a rain-streaked window over the city (the room faces the
  clearest view). Make tea or coffee (pour sound, steam), sip, cycle the room lights (warm lamp, blue or red neon,
  candle, off), open the City Log (district mood, population, weather, traffic, what's on the radio, places you've docked).
  Music sounds like it's in the room. **G** leaves.
- **Autopilot (T):** a scenic loop down the Spires' central avenue, out along the docks and back through the Market and
  Stacks. It climbs over anything in the way. Pick a pad on the **Map** (M) to fly there and dock. Leave it alone for
  30 s and the **cinematic camera** takes over (orbit, flyby, side track, high wide, low), and any key hands it back.
- **World Builder (B):** place sky-pads, outposts, neon signs (your text and colour) and holograms on rooftops.
  The **World Builder** tab lists and removes what you placed, renames districts and sets each district's traffic and neon.
  Placements are saved per seed in your browser; district settings are saved for every city.
- **City Director:** besides weather and lightning: **Blackout** a district (the power comes back block by block),
  **Traffic surge** (2 min), **Festival night** (extra holograms + fireworks with sound), and **Rebuild city** with a new seed.

## Garage, photos and the City Log

- **Garage** (Esc → Garage): name the car (it's on the dash), pick a body (sleek coupe, boxy cab, heavy cruiser),
  paint with a gloss, matte or iridescent finish, underglow and interior light colours, dashboard theme and engine hum tone.
  All three bodies share the detailed Blender cockpit.
- **Photo mode (P):** the city freezes mid-rain. Fly the camera with WASD/QE/Space/F (Shift = faster), drag to look,
  set the FOV, depth of field (focus distance, "Focus on car", blur) and a filter (Noir, Neon pop, Faded film, Cold steel, Dream),
  then **Save PNG** (or Enter). The filter is baked into the saved file.
- **Memory fragments:** 12 glowing shards hidden around each city, some above rooftops, some low in the street canyons.
  Fly through one to unlock a City Log story.
- **Photo spots:** 6 views worth a picture (the tallest spire, the sea wall, the Central Avenue…). Take a photo of
  one from close by and it's logged. The City Log gives a hint for each.
- **City Log** (Esc → City Log, or in a Sanctuary): the current district's mood, population, weather and traffic,
  your fragments and their stories, photo spots, and the places you've docked.

## Saving and settings

- Everything autosaves in your browser as you play: car, world edits, district settings, fragments and photos (per seed),
  controls, graphics, playlist edits and the radio.
- **Settings → Export save** downloads one `.json` file; **Import save** loads it on another browser or machine
  (it replaces the current save, then reloads). Music files are not in the save file: re-add them there.
- **Graphics presets:** Low (0.75× resolution, light rain, reflections captured once), Medium, High (default), Ultra
  (full resolution, reflections refreshed most often).

## The city

| District | Where | Feel |
|---|---|---|
| Corporate Spires | centre | 300–500 m towers, pyramids, beacons, giant dancer holograms, sky searchlights |
| Neon Market | patches around the core | low and dense, stacked signs, steam, food stalls, product holos, crowd murmur |
| Residential Stacks | patches around the core | slab blocks, lots of windows: flickering, TV glow, silhouettes |
| Industrial Docks | east edge | cranes, containers, sodium lamps, the sea wall and the ocean |
| The Outskirts | outer rim | sparse, dusty amber haze, quiet |

Plus:
- About 340 NPC hover cars, taxis and cargo haulers on stacked lanes, with lane changes and rooftop landings.
- 8 police drones sweeping searchlights (they never chase you).
- Koi holograms, ad blimps, 3 maglev lines, beacons, rooftop fans and repair-crew sparks.
- Passing cars whoosh past (panned, with a falling pitch), plus distant sirens and processed PA voices.

**Realism pass:**
- Towers step back in tiers, with ledges and antenna crowns, and collision follows the stepped shape.
- Facades have floor slabs, pilasters, rain-stain grime, wet bases and reflective glass.
- Lit windows are interior-mapped: real-looking rooms with ceiling lamps, blinds, furniture and the odd silhouette, with parallax.
- Rooftops carry about 5,500 props from a Blender kit.

**Blender assets** (editable sources in `blender/`, exported to `public/models/`):
- `car.blend` → `car.glb`: the RSQ-inspired hover car with sphere pods and a full cockpit.
- `kit.blend` → `kit.glb`: water tank, AC unit, dish, stair house, vent stack, antenna.

If a `.glb` is missing, the game falls back to the procedural car or bare roofs. It never crashes.

All brand names are invented. Debugging: `__nd.step(n)` in the console advances n frames even when the tab is hidden.

## Adding your music

The game ships **no songs**, only playlist and station metadata. Add your own files in either of these ways:

1. **Drag & drop** files or whole folders onto the game window, or use **+ Add files / + Add folder** in the radio (R).
   They're stored in your browser (IndexedDB) and are still there after a reload.
2. **The `/music` folder:** put mp3/ogg/wav/m4a/flac files in `music/` (subfolders OK) and restart `npm run dev`.

Name files `Artist - Title.ext` for the best matching. For example, `VØJ, Narvent - Memory Reboot (Over Slowed).mp3`
links to track 1 of the **Memory Reboot** playlist automatically. Every word of the title must be in the file name,
and artist and "(Over Slowed)"/"(Slowed)" words break ties. Unlinked playlist rows say *drop file to link*; drop a
file on that row to link it by hand. Click any title or artist to edit it.

**Stations.** Files are sorted onto a station by artist name, and you can move any track with its station picker:

| Station | Sound | Listen for |
|---|---|---|
| Over-Slowed Rain | slowed wave | VØJ, Narvent, GOLDKID$, Navjaxx, VXLLAIN, Lonely Lies, Skeler, Sidewalks and Skeletons |
| Cyber Nocturne | dark synth | Lorn, Gesaffelstein, Mareux, Perturbator |
| Cozy Skyline | dreamy synthwave | HOME, Kalax, Vacant, Kaito Shoma |
| Off-World Static | ambient score | Vangelis-style / 2049-score-style ambience |
| City Ambience | generative | always works, no files needed |

**Player:** a compact deck (bottom right) and a full player (**R**) with shuffle, repeat (all/one/off), crossfade 0–10 s,
**slowed + reverb** (works on any track), and a mixer (master/music/ambience/engine/SFX). **N** skips to the next track, and the keyboard
media keys work through the Media Session API. Neon signs and holograms pulse with the bass, the cockpit dash shows an EQ and
what's playing, and a late-night DJ sometimes cuts in between tracks.

## Contributing

Ideas and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Code is MIT ([LICENSE](LICENSE));
downloaded models, textures, sounds and fonts are listed with their licenses in [CREDITS.md](CREDITS.md).

## Project layout

```
src/main.js          renderer, scene, main loop
src/core/            input (keys + gamepad + rebinding), save/export, post-processing (bloom, DOF, grain, CA, vignette)
src/world/           seeded RNG, districts, city generator + soft collisions, signs atlas,
                     traffic + police drones, holograms + blimps, maglev trains
src/atmosphere/      height fog (shader chunk override), sky + time of day, weather state machine
src/fx/              GPU rain (slants with speed, ash mode), rooftop splashes
src/car/             flight physics + model + cockpit, camera rig (chase/cockpit/cinematic), windshield, autopilot
src/audio/           synthesized soundscape + buses, music player (2-deck crossfade, slowed+reverb),
                     IndexedDB library, playlist auto-linking, generative City Ambience station
src/ui/              menu drawer, Sanctuary View, World Builder, map, garage, photo mode, City Log
tests/               node:test checks for city, collisions, weather, playlist, pads, autopilot, fragments, saves, garage
```

## Build status

- [x] Phase 1: Core (city, fog, bloom, rain, flight, chase + cockpit)
- [x] Phase 2: Atmosphere (lens flare moves to Phase 3 with the big signs)
- [x] Phase 3: Living world
- [x] Phase 4: Music
- [x] Phase 5: Cozy & building
- [x] Phase 6: Polish
