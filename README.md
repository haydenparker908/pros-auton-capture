# PROS Auton Capture (Cursor / VS Code)

Toolbar buttons + shortcuts to **build, upload, and capture** VEX PROS brain serial logs until your auton prints a done marker.

This is the right layout for an editor extension:
- **Robot code** stays in your PROS project repo
- **This extension** is a separate repo you install into Cursor/VS Code

## What you get

| Control | Action |
|--|--|
| Play button (editor title) / **Ctrl+Alt+A** | Match auton → slot 5, stop on `[auton] done`, press **X** |
| Rocket button / **Ctrl+Alt+S** | Skills auton → slot 6, stop on `[skills] done`, press **Y** |

Logs land in your project’s `brain-logs/latest.txt`.

## Install (development)

1. Clone this repo
2. In Cursor/VS Code: **Extensions: Install from Location…** and pick this folder  
   - or open the folder and press **F5** (Extension Development Host)
3. Open a workspace that contains `project.pros`
4. Use the title-bar buttons or shortcuts

## Install (packed)

```powershell
npx @vscode/vsce package
cursor --install-extension .\pros-auton-capture-0.1.0.vsix
# or: code --install-extension .\pros-auton-capture-0.1.0.vsix
```

## Requirements

- [PROS VS Code extension](https://marketplace.visualstudio.com/items?itemName=sigbots.pros) (provides the CLI/toolchain)
- Windows PowerShell (the capture script is `.ps1`)
- Brain/controller connected for upload + serial

## Project hook (optional)

If your PROS project has `scripts/capture-auton.ps1`, that script is used.  
Otherwise the extension runs its bundled copy under `scripts/capture-auton.ps1`.

Your robot code should print:

```text
[auton] done    // match
[skills] done   // skills
```

## Settings

- `prosAutonCapture.matchSlot` (default 5)
- `prosAutonCapture.skillsSlot` (default 6)
- `prosAutonCapture.matchStopPattern` / `skillsStopPattern`
- `prosAutonCapture.timeoutSec`
