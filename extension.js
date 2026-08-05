const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  refreshProsContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => refreshProsContext())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prosAutonCapture.captureMatch", () =>
      runCapture(context, "match")
    ),
    vscode.commands.registerCommand("prosAutonCapture.captureSkills", () =>
      runCapture(context, "skills")
    )
  );
}

function deactivate() {}

function refreshProsContext() {
  const hasPros = Boolean(findProsProjectRoot());
  vscode.commands.executeCommand(
    "setContext",
    "prosAutonCapture.isProsProject",
    hasPros
  );
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {"match"|"skills"} mode
 */
async function runCapture(context, mode) {
  const projectRoot = findProsProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage(
      "No PROS project found (looking for project.pros)."
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("prosAutonCapture");
  const isSkills = mode === "skills";
  const slot = isSkills
    ? config.get("skillsSlot", 6)
    : config.get("matchSlot", 5);
  const stopPattern = isSkills
    ? config.get("skillsStopPattern", "[skills] done")
    : config.get("matchStopPattern", "[auton] done");
  const timeoutSec = config.get("timeoutSec", 180);
  const benchButton = isSkills ? "Y" : "X";
  const benchLabel = isSkills ? "skills auton" : "match auton";
  const makeExtra = isSkills ? "EXTRA_CXXFLAGS=-DAUTON_SKILLS" : "";

  const scriptPath = resolveCaptureScript(context, projectRoot);
  if (!scriptPath) {
    vscode.window.showErrorMessage(
      "capture-auton.ps1 not found in the project or extension."
    );
    return;
  }

  // Dispose prior capture terminals so the serial port is free.
  vscode.window.terminals
    .filter((t) => t.name === "PROS Auton Capture" || t.name === "PROS Terminal")
    .forEach((t) => t.dispose());

  const term = vscode.window.createTerminal({
    name: "PROS Auton Capture",
    cwd: projectRoot,
  });
  term.show(true);

  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    quote(scriptPath),
    "-ProjectRoot",
    quote(projectRoot),
    "-StopPattern",
    quote(stopPattern),
    "-TimeoutSec",
    String(timeoutSec),
    "-BenchButton",
    quote(benchButton),
    "-BenchLabel",
    quote(benchLabel),
    "-Slot",
    String(slot),
  ];
  if (makeExtra) {
    args.push("-MakeExtra", quote(makeExtra));
  }

  term.sendText(`powershell ${args.join(" ")}`);
  vscode.window.showInformationMessage(
    `PROS ${benchLabel}: uploading to slot ${slot}. Press ${benchButton} when prompted.`
  );
}

/**
 * Prefer the project's script; otherwise use the copy shipped with the extension.
 * @param {vscode.ExtensionContext} context
 * @param {string} projectRoot
 */
function resolveCaptureScript(context, projectRoot) {
  const projectScript = path.join(projectRoot, "scripts", "capture-auton.ps1");
  if (fs.existsSync(projectScript)) {
    return projectScript;
  }
  const bundled = path.join(context.extensionPath, "scripts", "capture-auton.ps1");
  if (fs.existsSync(bundled)) {
    return bundled;
  }
  return null;
}

function findProsProjectRoot() {
  const folders = vscode.workspace.workspaceFolders || [];
  for (const folder of folders) {
    const direct = path.join(folder.uri.fsPath, "project.pros");
    if (fs.existsSync(direct)) {
      return folder.uri.fsPath;
    }
    try {
      for (const ent of fs.readdirSync(folder.uri.fsPath, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const nested = path.join(folder.uri.fsPath, ent.name, "project.pros");
        if (fs.existsSync(nested)) {
          return path.join(folder.uri.fsPath, ent.name);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

module.exports = { activate, deactivate };
