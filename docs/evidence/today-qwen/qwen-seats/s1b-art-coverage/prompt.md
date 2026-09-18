# Task: art-id coverage audit (analyst seat)

A web app loads original placeholder art by id. Below are (1) the loader rules copied from source, (2) the ids the game content uses, (3) the files that exist in the public art folder. For EACH content id say whether its image file EXISTS (OK) or would fall back to the CSS/glyph fallback (MISSING). Then list every file in the folder that no loader rule can ever request (ORPHAN). Be exact; name each id.

## 1. Loader rules (verbatim from source)
- SceneArt: `<img src={`/etr/${sceneId}-640.webp`}>` where sceneId is a scene id.
- PortraitImage size="card": `/etr/${characterId}-512.webp`; size="token": `/etr/${characterId}-token-128.webp`.
- ThreatToken: threat id lower-cased; first matching substring in this ordered table picks imageId, then `/etr/${imageId}-128.webp`:
  enforcer->threat-enforcer, warden->threat-warden, patrol->threat-patrol, rifle-squad->threat-rifle-squad, plated-squad->threat-plated-squad, marksman-nest->threat-marksman-nest, armoured-truck->threat-armoured-truck. No match => glyph fallback.

## 2. Content ids
- scene ids: drop-forecourt, metro-platform, printworks, signal-mast
- character ids: rook, vesper, halloran, orsolya, delphine, tallow
- threat ids: drop-forecourt-patrol-a, drop-forecourt-patrol-b, metro-platform-plated-squad, metro-platform-enforcer, printworks-rifle-squad, printworks-marksman-nest, signal-mast-armoured-truck, signal-mast-warden

## 3. Files in apps/web/public/etr/
- delphine-256.webp
- delphine-512.webp
- delphine-token-128.webp
- drop-forecourt-640.webp
- halloran-256.webp
- halloran-512.webp
- halloran-token-128.webp
- hero-1000.webp
- hero-1600.webp
- hero-600.webp
- metro-platform-640.webp
- orsolya-256.webp
- orsolya-512.webp
- orsolya-token-128.webp
- printworks-640.webp
- rook-256.webp
- rook-512.webp
- rook-token-128.webp
- scene-drop-forecourt-1024.webp
- scene-drop-forecourt-1536.webp
- scene-metro-platform-1024.webp
- scene-metro-platform-1536.webp
- scene-printworks-1024.webp
- scene-printworks-1536.webp
- scene-signal-mast-1024.webp
- scene-signal-mast-1536.webp
- signal-mast-640.webp
- tallow-256.webp
- tallow-512.webp
- tallow-token-128.webp
- threat-armoured-truck-128.webp
- threat-armoured-truck-256.webp
- threat-enforcer-128.webp
- threat-enforcer-256.webp
- threat-marksman-nest-128.webp
- threat-marksman-nest-256.webp
- threat-patrol-128.webp
- threat-patrol-256.webp
- threat-plated-squad-128.webp
- threat-plated-squad-256.webp
- threat-rifle-squad-128.webp
- threat-rifle-squad-256.webp
- threat-warden-128.webp
- threat-warden-256.webp
- vesper-256.webp
- vesper-512.webp
- vesper-token-128.webp
