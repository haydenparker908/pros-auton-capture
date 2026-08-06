# Hayden Robotics PROS Helper

Pinned Activity Bar sidebar with **Quick Actions** to build/upload and capture PROS match or skills auton logs into `brain-logs/latest.txt`.

## The problem

Writing and debugging auton means hundreds of build → upload → run → read-terminal loops. This extension collapses that into one click or shortcut so you iterate faster.

## Quick Actions (H icon in the Activity Bar)

- Capture Match Auton (**Ctrl+Alt+A**)
- Capture Skills Auton (**Ctrl+Alt+S**)
- Open Latest Log
- Delete all log files (**Ctrl+Alt+D**) — clears logs and closes brain terminals
- Settings — slots, stop patterns, timeout, etc.

Also adds editor title buttons when a PROS project is open.

## Install (recommended): VSIX

```powershell
npm run package
```

Then **Ctrl+Shift+P** → **Extensions: Install from VSIX...** → choose `pros-auton-capture-0.2.1.vsix` → reload.

Open any PROS workspace (folder with `project.pros`, or a parent with one one level down).

## Settings

Search **Hayden Robotics PROS Helper** or `prosAutonCapture`:

| Setting | Purpose |
| --- | --- |
| `singleSlotMode` | One slot for both match + skills |
| `sharedSlot` | Slot when single-slot mode is on |
| `matchSlot` / `skillsSlot` | Slots when using two programs |
| `logDir` | Default `brain-logs` |
| `openLatestOnStart` | Open the log beside the editor when capture starts |
| Stop patterns / bench buttons / timeout | Match your robot `printf` markers |
| `skillsMakeExtra` | Extra make flags for skills builds |

## Robot markers

```text
[auton] done
[skills] done
```
