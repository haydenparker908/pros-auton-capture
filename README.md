# Hayden Robotics PROS Helper

A Cursor / VS Code sidebar that makes PROS auton testing one click: **build**, **upload to a brain slot**, then **capture the serial log** until auton finishes.

## Install

In Cursor or VS Code:

1. Open **Extensions**
2. Search **Hayden Robotics PROS Helper**
3. Click **Install**
4. Open a PROS project (a folder with `project.pros`)
5. Click the **H** icon in the Activity Bar

That’s it — no extra setup for normal use.

## What “Capture” does

When you run **Capture Match Auton** or **Capture Skills Auton**, the extension:

1. Closes any stuck brain / PROS terminals (so the serial port is free)
2. **Builds** your project
3. **Uploads** the program to the V5 slot you configured (match slot, skills slot, or one shared slot)
4. Starts listening to the brain terminal and saves output to `brain-logs/latest.txt`
5. Stops when the brain prints a done marker (default `[auton] done` or `[skills] done`)
6. Optionally opens the log so you can watch it live

Then on the controller, press the bench button the prompt shows (default **X** for match, **Y** for skills) to start that auton.

So one click ≈ build + upload to slot + log. You don’t need to run `pros mu` and open a terminal by hand each time.

## Quick Actions (H icon)

| Action | Shortcut | What it does |
| --- | --- | --- |
| Capture Match Auton | **Ctrl+Alt+A** / **Cmd+Alt+A** | Build, upload to match slot, capture log |
| Capture Skills Auton | **Ctrl+Alt+S** / **Cmd+Alt+S** | Build, upload to skills slot, capture log |
| Open Latest Log | | Opens `brain-logs/latest.txt` |
| Delete all log files | **Ctrl+Alt+D** / **Cmd+Alt+D** | Clears logs and closes brain terminals |
| Settings | | Slots, stop patterns, timeout, and more |

Editor title buttons for match/skills also appear when a PROS project is open.

## Settings

Search **Hayden Robotics PROS Helper** or `prosAutonCapture`:

| Setting | Purpose |
| --- | --- |
| `singleSlotMode` | Use one slot for both match and skills |
| `sharedSlot` | Slot when single-slot mode is on |
| `matchSlot` / `skillsSlot` | Slots when using two programs on the brain |
| `logDir` | Folder for logs (default `brain-logs`) |
| `openLatestOnStart` | Open the log beside the editor when capture starts |
| Stop patterns / bench buttons / timeout | Match your robot `printf` markers and prompts |
| `skillsMakeExtra` | Extra make flags for skills builds |

## Robot markers

Your auton firmware should print one of these when finished:

```text
[auton] done
[skills] done
```

## Questions, bugs, and comments

Please use the GitHub repo so everyone can see and reply:

**https://github.com/haydenparker908/pros-auton-capture**

- Open an [Issue](https://github.com/haydenparker908/pros-auton-capture/issues) for questions, bugs, or feature ideas
- Comments on Issues / Discussions there are the best place for feedback

## Advanced: install from a VSIX (developers)

If you’re packaging from source or testing a build before it hits the marketplace, a `.vsix` may be attached on [GitHub Releases](https://github.com/haydenparker908/pros-auton-capture/releases) or built locally with `npm run package`, then installed via **Extensions: Install from VSIX...**. Most users should just click **Install** in Extensions instead.
