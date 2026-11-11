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
  const linkWatch = startLinkWatch(() => actionsProvider.refresh());

  context.subscriptions.push(
    linkWatch,
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

/** @type {{ kind: "checking"|"controller"|"brain"|"none", port: string }} */
let linkStatus = { kind: "checking", port: "" };

class LinkItem extends vscode.TreeItem {
  constructor() {
    const connected = linkStatus.kind === "controller" || linkStatus.kind === "brain";
    const label =
      linkStatus.kind === "controller"
        ? "Controller connected"
        : linkStatus.kind === "brain"
          ? "Brain connected"
          : linkStatus.kind === "checking"
            ? "Checking USB..."
            : "Controller not connected";
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = linkStatus.port;
    this.tooltip = connected
      ? `${label} on ${linkStatus.port}. Upload can see this USB device.`
      : "The computer does not see a controller USB device. Reseat the cable until this turns on.";
    this.iconPath = new vscode.ThemeIcon(
      linkStatus.kind === "checking" ? "sync" : connected ? "pass-filled" : "error"
    );
    this.contextValue = "prosLinkStatus";
  }
}

function startLinkWatch(onChange) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = "V5 controller USB";
  item.show();
  applyLinkVisual(item);

  let running = false;
  let timer;
  const poll = () => {
    if (running) {
      return;
    }
    running = true;
    execFile(
      "powershell",
      ["-NoProfile", "-Command", linkProbeCommand()],
      { windowsHide: true, timeout: 20000 },
      (error, stdout) => {
        running = false;
        const next = parseLinkProbe(String(stdout || ""), error);
        const changed = next.kind !== linkStatus.kind || next.port !== linkStatus.port;
        linkStatus = next;
        applyLinkVisual(item);
        if (changed) {
          onChange();
        }
        timer = setTimeout(poll, 2500);
      }
    );
  };
  poll();

  return new vscode.Disposable(() => {
    clearTimeout(timer);
    item.dispose();
  });
}

function linkProbeCommand() {
  // No double quotes: Windows passes those to PowerShell in a way that breaks -Command.
  return [
    "$rows = @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction SilentlyContinue |",
    "Where-Object { $_.InstanceId -match 'VID_2888&PID_050[13]' } |",
    "ForEach-Object { $_.InstanceId + ' ' + $_.FriendlyName });",
    "if ($rows.Count -eq 0) { 'none' } else { $rows }",
  ].join(" ");
}

function parseLinkProbe(text, error) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const controller = lines.find((line) => line.includes("PID_0503"));
  const brain = lines.find((line) => line.includes("PID_0501") && line.includes("MI_00"));
  const portOf = (line) => {
    const match = line && line.match(/COM\d+/i);
    return match ? match[0].toUpperCase() : "";
  };
  if (controller) {
    return { kind: "controller", port: portOf(controller) };
  }
  if (brain) {
    return { kind: "brain", port: portOf(brain) };
  }
  if (error && lines.length === 0) {
    return { kind: "checking", port: "" };
  }
  return { kind: "none", port: "" };
}

function applyLinkVisual(item) {
  if (linkStatus.kind === "controller") {
    item.text = `$(pass-filled) Controller ${linkStatus.port}`.trim();
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
    item.tooltip = "Controller USB is connected. Uploads can use this.";
  } else if (linkStatus.kind === "brain") {
    item.text = `$(pass-filled) Brain ${linkStatus.port}`.trim();
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
    item.tooltip = "Brain USB is connected. The controller cable is not the device the computer sees.";
  } else if (linkStatus.kind === "checking") {
    item.text = "$(sync) Checking controller";
    item.backgroundColor = undefined;
    item.tooltip = "Looking for a V5 controller on USB.";
  } else {
    item.text = "$(error) Controller unplugged";
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    item.tooltip = "The computer does not see the controller. Reseat the USB cable until this changes.";
  }
}

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
      new LinkItem(),
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

  const saved = await vscode.workspace.saveAll(false);
  if (!saved) {
    vscode.window.showWarningMessage(
      "Capture cancelled: save your files, then try again."
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
