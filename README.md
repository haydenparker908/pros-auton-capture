# PROS Auton Capture (Cursor / VS Code)

Pinned sidebar (like PROS) with **Quick Actions**, plus editor buttons and shortcuts to capture match/skills auton logs into `brain-logs/latest.txt`.

## Layout (recommended)

| Repo | Role |
|--|--|
| Your PROS project | Robot code (`project.pros`, auton routines) |
| **This extension** | Editor UI: pin, Quick Actions, settings |

## Features

- **Activity bar “H” icon** — pin Auton Capture like the PROS sidebar
- **Quick Actions**
  - Capture Match Auton
  - Capture Skills Auton
  - Open Latest Log
  - Settings
- Writes **`brain-logs/latest.txt`** every run (+ timestamped archive)
- **Single-slot or two-slot** mode in settings
- Editor title buttons + **Ctrl+Alt+A** / **Ctrl+Alt+S**

## Develop / try

**Open this folder** in Cursor (File → Open Folder → `pros-auton-capture`), then press **F5**.  
Point the Extension Development Host at your `prosproj` workspace (or open prosproj in that window).

You do **not** need a forever-separate Cursor install — just open this repo when editing the extension, and your robot repo when editing auton code. A multi-root workspace with both folders also works.

## Install from Location

Extensions → `…` → **Install from Location…** → this folder.

## Settings (search `prosAutonCapture`)

| Setting | Purpose |
|--|--|
| `singleSlotMode` | One slot for both match + skills |
| `sharedSlot` | Slot when single-slot mode is on |
| `matchSlot` / `skillsSlot` | Slots when using two programs |
| `logDir` | Default `brain-logs` (`latest.txt` always updated) |
| `openLatestOnStart` | Open the log beside the editor when capture starts |
| Stop patterns / bench buttons / timeout | Match your robot `printf` markers |

## Robot markers

```text
[auton] done
[skills] done
```
