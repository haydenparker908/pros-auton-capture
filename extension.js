const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  refreshProsContext();
  const actionsProvider = new ActionsTreeProvider();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => refreshProsContext()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("prosAutonCapture")) {
        actionsProvider.refresh();
      }
    }),
    vscode.window.registerTreeDataProvider(
      "haydenProsHelper.actions",
      actionsProvider
    ),
    vscode.commands.registerCommand("prosAutonCapture.captureMatch", () =>
      runCapture(context, "match")
    ),
    vscode.commands.registerCommand("prosAutonCapture.captureSkills", () =>
      runCapture(context, "skills")
    ),
    vscode.commands.registerCommand("prosAutonCapture.openLatestLog", () =>
      openLatestLog()
    ),
    vscode.commands.registerCommand("prosAutonCapture.deleteLogs", () =>
      deleteAllLogFiles()
    ),
    vscode.commands.registerCommand("prosAutonCapture.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "prosAutonCapture"
      )
    )
  );
}

function deactivate() {}

class ActionItem extends vscode.TreeItem {
  /**
   * @param {string} label
   * @param {string} commandId
   * @param {string} description
   * @param {string} iconId
   */
  constructor(label, commandId, description, iconId) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = description;
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.command = { command: commandId, title: label };
    this.contextValue = "prosAutonCaptureAction";
  }
}

class ActionsTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const config = vscode.workspace.getConfiguration("prosAutonCapture");
    const single = config.get("singleSlotMode", false);
    const shared = config.get("sharedSlot", 5);
    const matchSlot = single ? shared : config.get("matchSlot", 5);
    const skillsSlot = single ? shared : config.get("skillsSlot", 6);
    const logDir = config.get("logDir", "brain-logs");

    return [
      new ActionItem(
        "Capture Match Auton",
        "prosAutonCapture.captureMatch",
        single ? `slot ${matchSlot} (shared)` : `slot ${matchSlot}`,
        "play"
      ),
      new ActionItem(
        "Capture Skills Auton",
        "prosAutonCapture.captureSkills",
        single ? `slot ${skillsSlot} (shared)` : `slot ${skillsSlot}`,
        "rocket"
      ),
      new ActionItem(
        "Open Latest Log",
        "prosAutonCapture.openLatestLog",
        `${logDir}/latest.txt`,
        "file-text"
      ),
      new ActionItem(
        "Delete all log files",
        "prosAutonCapture.deleteLogs",
        `clear ${logDir}/ + close brain terminals`,
        "trash"
      ),
      new ActionItem(
        "Settings",
        "prosAutonCapture.openSettings",
        single ? "1-slot mode" : "2-slot mode",
        "gear"
      ),
    ];
  }
}

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
  const single = config.get("singleSlotMode", false);
  const slot = single
    ? config.get("sharedSlot", 5)
    : isSkills
      ? config.get("skillsSlot", 6)
      : config.get("matchSlot", 5);
  const stopPattern = isSkills
    ? config.get("skillsStopPattern", "[skills] done")
    : config.get("matchStopPattern", "[auton] done");
  const timeoutSec = config.get("timeoutSec", 180);
  const benchButton = isSkills
    ? config.get("skillsBenchButton", "Y")
    : config.get("matchBenchButton", "X");
  const benchLabel = isSkills ? "skills auton" : "match auton";
  const logDir = config.get("logDir", "brain-logs");
  const makeExtra = isSkills
    ? config.get("skillsMakeExtra", "EXTRA_CXXFLAGS=-DAUTON_SKILLS")
    : "";

  const scriptPath = resolveCaptureScript(context, projectRoot);
  if (!scriptPath) {
    vscode.window.showErrorMessage(
      "capture-auton.ps1 not found in the project or extension."
    );
    return;
  }

  const absLogDir = path.join(projectRoot, logDir);
  fs.mkdirSync(absLogDir, { recursive: true });
  const latestPath = path.join(absLogDir, "latest.txt");

  vscode.window.terminals
    .filter(
      (t) =>
        t.name === "Hayden Robotics PROS Helper" ||
        t.name === "PROS Auton Capture" ||
        t.name === "PROS Terminal"
    )
    .forEach((t) => t.dispose());

  const term = vscode.window.createTerminal({
    name: "Hayden Robotics PROS Helper",
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
  if (makeExtra && String(makeExtra).trim()) {
    args.push("-MakeExtra", quote(String(makeExtra).trim()));
  }
  args.push("-LogDir", quote(logDir));

  term.sendText(`powershell ${args.join(" ")}`);

  if (config.get("openLatestOnStart", true)) {
    if (!fs.existsSync(latestPath)) {
      fs.writeFileSync(latestPath, "");
    }
    const doc = await vscode.workspace.openTextDocument(latestPath);
    await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside,
    });
  }

  vscode.window.showInformationMessage(
    `${benchLabel}: slot ${slot} → ${logDir}/latest.txt. Press ${benchButton} when prompted.`
  );
}

async function openLatestLog() {
  const projectRoot = findProsProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage("No PROS project found.");
    return;
  }
  const logDir = vscode.workspace
    .getConfiguration("prosAutonCapture")
    .get("logDir", "brain-logs");
  const latestPath = path.join(projectRoot, logDir, "latest.txt");
  if (!fs.existsSync(latestPath)) {
    vscode.window.showWarningMessage(
      `No log yet at ${logDir}/latest.txt — run a capture first.`
    );
    return;
  }
  const doc = await vscode.workspace.openTextDocument(latestPath);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function deleteAllLogFiles() {
  const projectRoot = findProsProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage(
      "No PROS project found (looking for project.pros)."
    );
    return;
  }

  const logDirName = vscode.workspace
    .getConfiguration("prosAutonCapture")
    .get("logDir", "brain-logs");
  const logDir = path.join(projectRoot, logDirName);

  await closeProsTerminals();

  if (!fs.existsSync(logDir)) {
    vscode.window.showInformationMessage(
      `No ${logDirName}/ folder to clear. Closed brain terminals.`
    );
    return;
  }

  let removed = 0;
  for (const name of fs.readdirSync(logDir)) {
    const full = path.join(logDir, name);
    try {
      if (fs.statSync(full).isFile()) {
        fs.unlinkSync(full);
        removed += 1;
      }
    } catch {
      /* ignore locked files */
    }
  }

  vscode.window.showInformationMessage(
    `Deleted ${removed} log file(s) from ${logDirName}/ and closed brain terminals.`
  );
}

async function closeProsTerminals() {
  const terminals = vscode.window.terminals.filter(
    (t) =>
      t.name === "Hayden Robotics PROS Helper" ||
      t.name === "PROS Auton Capture" ||
      t.name === "PROS Terminal" ||
      /brain|pros.*terminal/i.test(t.name)
  );
  for (const t of terminals) {
    t.dispose();
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      execFile(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'pros' -and $_.CommandLine -match 'terminal' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        () => resolve()
      );
    });
  }
}

/**
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
      for (const ent of fs.readdirSync(folder.uri.fsPath, {
        withFileTypes: true,
      })) {
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
