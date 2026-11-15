# ✈️ SkyDeck 737 Pro

**SkyDeck 737 Pro** is a browser-based Boeing 737-800 flight simulator featuring global satellite imagery, realistic flight physics, dynamic weather, failure simulation, and multiple control options.

🌐 **Live Demo:** [https://milottc.github.io/skydeck](https://milottc.github.io/skydeck)

---

## ✨ Key Features

* **Global Terrain:** ESRI satellite imagery with configurable resolution and optional Google Maps API key support.
* **Airports & Landmarks:** Fly from 200+ preset global hubs and scenic landmarks (e.g., Mount Everest, Grand Canyon) or custom coordinates.
* **Flight Setup:** Select start states (Cruise, Takeoff, Short Final), time of day, weather conditions, or the 28-kt Crosswind Challenge.
* **Flight Audio:** Aircraft-specific GPWS callouts and warning sounds for Airbus, MD, Boeing, and 747 aircraft, with repeating sustained alerts plus engine, wind, and landing-gear ambience.
* **Failure System:** Trigger over 30 mid-flight system, engine, and sensor failures, or enable Chaos Mode.
* **Replay & Views:** 60-second instant replay with multi-camera angles (cockpit, chase, wing) and touch/keyboard/Wii Remote support.

---

## 🔊 Warning Audio Profiles

The warning audio paths are centralized in `AVIATION_AUDIO_CONFIG` in `game.js`. Edit its `basePath`, shared `alerts`, or profile-specific `alerts` and `callouts` entries to point to your existing audio files; no asset folders need to be moved or created. Filenames are relative to `assets/` by default. Boeing altitude callouts use number-only filenames (for example `100.wav`); MD callouts use the existing `100-ft-over-the-ground.mp3` style; Airbus callouts use the existing `airbus-gpws-callout-v2-100-ft.mp3` style.

Some TCAS phrases share the closest available local recording: `climb`, `climbNow`, and `increaseClimb` use `tcas-increase-climb.mp3`, while `levelOff` uses `maintain-vertical-speed.mp3`. There is no separate “100 Above” recording, so that callout maps to each profile's existing 100-foot recording. Replace those config values if you have dedicated clips.

Choose **Match selected aircraft**, **Boeing**, **McDonnell Douglas (MD)**, or **Airbus** under the home-screen Options to switch voice profiles. In the browser console, `window.setAviationAudioProfile('airbus')` switches profiles programmatically; use `'auto'` to follow the selected aircraft again.

Detected TCAS and GPWS alerts repeat with a profile-configured sound until their simulated conditions clear. Pull Up, Terrain, Windshear, and TCAS RAs interrupt lower-priority cautions; lower-priority active alerts resume when the warning clears. A resolved TCAS alert stops its loop and plays Clear of Conflict once. The ATC readback mute does not silence warning alerts; use the global sound mute to silence them. Failed or autoplay-blocked warning playback retries promptly and is retried after the next user interaction. The alert interface is also available for triggering and resolving any configured alert:

```js
window.aviationAlerts.trigger('demo-pull-up', 'pullUp', 0, 1800);
window.aviationAlerts.resolve('demo-pull-up');
window.aviationAlerts.silence(); // resume() to re-enable active alerts
```

`trigger(id, alertKey, priority, repeatMs)` uses lower numbers for higher priority. Alert keys include `trafficTraffic`, `climb`, `climbNow`, `increaseClimb`, `descend`, `descendNow`, `increaseDescent`, `monitorVerticalSpeed`, `maintainVerticalSpeed`, `adjustVerticalSpeed`, `levelOff`, `clearOfConflict`, `sinkRate`, `pullUp`, `terrain`, `terrainAhead`, `tooLowTerrain`, `tooLowGear`, `tooLowFlaps`, `glideslope`, `bankAngle`, `dontSink`, `windshear`, `minimums`, and `approachingMinimums`. Airbus `retard` and `hundredAbove` profile callouts are available with `window.aviationAlerts.callout('retard')` and `window.aviationAlerts.callout('hundredAbove')`.

---

## 🎮 Basic Controls

* **Pitch / Roll / Rudder:** `W`/`S`, `A`/`D`, `Q`/`E`
* **Throttle & Engines:** `Shift`/`Ctrl`, `T` (Autothrottle), `I` (Start Engines), `N` (Thrust Reversers)
* **Aircraft Systems:** `F` (Flaps), `G` (Landing Gear), `B` (Spoilers), `Space` (Brakes), `P` (Autopilot)
* **Camera & Replay:** `C`/`V` (Camera), `R` (Respawn), `F9` (60s Instant Replay)
* **Cockpit Controls:** In cockpit view, hover and click the MCP, EFIS, display-select, and overhead controls. The on-screen **MASTER WARNING** and **MASTER CAUTION** buttons acknowledge active alerts; matching controls are also available on the instrument panel. Use the wheel or click either side of MCP value windows to adjust targets. Arm the autothrottle before engaging speed/N1 modes; lowering the disengage bar inhibits autopilot re-engagement until raised.
* **Flight Displays:** PFD controls set minimums, baro, FPV, and meters; ND controls set mode, range, traffic, bearing pointers, and overlays. DSP buttons switch EICAS pages, while master-alert and CANC/RCL controls acknowledge, cancel, and recall messages.
* **Aircraft Systems:** A **SYSTEMS** panel is available in every cockpit view, with the same fuel/hydraulic, electrical, anti-ice, air/pressurization, cabin, GPWS, lighting, and engine controls across the fleet. On the 737/787, these controls are also available on the 3D overhead/pedestal. GPWS mode is selected with the flight-control overhead rotary and toggled with its adjacent GPWS switch. Selected effects are simulated; other controls provide state/indications rather than aircraft-specific system dynamics.

---

## 🚀 Getting Started

1. Open the live app at {Link: SkyDeck 737 https://milottc.github.io/skydeck}.
2. Configure your departure location, weather, and start state.
3. Click **Start Flight** and press **`I`** to start engines.
