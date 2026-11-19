import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// Who is up on the Nextup position list. A local reader writes the list.
// This widget only shows it.
BarWidget {
  id: root
  moduleName: "giaodn.up"

  property var board: ({ status: "offline", name: "", label: "", time: "", rows: [] })

  readonly property string statePath: {
    var home = Quickshell.env("HOME")
    var stateHome = Quickshell.env("XDG_STATE_HOME")
    var base = stateHome && stateHome.length > 0 ? stateHome : (home + "/.local/state")
    return base + "/omarchy/giaodn.up.json"
  }

  readonly property string codePath: {
    var home = Quickshell.env("HOME")
    var stateHome = Quickshell.env("XDG_STATE_HOME")
    var base = stateHome && stateHome.length > 0 ? stateHome : (home + "/.local/state")
    return base + "/omarchy/giaodn.up/code"
  }

  function submitCode(code) {
    if (!code || code.length < 4 || code.length > 12) return
    for (var i = 0; i < code.length; i++) {
      var letter = code.charAt(i)
      var ok = (letter >= "0" && letter <= "9") || (letter >= "A" && letter <= "Z") || (letter >= "a" && letter <= "z")
      if (!ok) return
    }
    codeFile.setText(code)
  }

  readonly property string status: board.status
  readonly property var rows: board.rows
  readonly property string barLabel: {
    if (status === "up") return strings.t("bar.name").arg(board.label)
    if (status === "empty") return strings.t("bar.nobody")
    if (status === "locked") return strings.t("bar.locked")
    if (status === "code") return strings.t("bar.code")
    if (status === "signin") return strings.t("bar.signin")
    if (status === "item") return strings.t("bar.item")
    return strings.t("bar.offline")
  }
  readonly property string tip: {
    if (opened) return ""
    if (status === "up") {
      var lines = []
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i]
        if (row.time.length > 0) lines.push(strings.t("tooltip.upTime").arg(row.name).arg(row.time))
        else lines.push(strings.t("tooltip.up").arg(row.name))
      }
      return lines.join("\n")
    }
    if (status === "empty") return strings.t("tooltip.nobody")
    if (status === "locked") return strings.t("tooltip.locked")
    if (status === "code") return strings.t("tooltip.code")
    if (status === "signin") return strings.t("tooltip.signin")
    if (status === "item") return strings.t("tooltip.item")
    if (status === "away") return strings.t("tooltip.away")
    return strings.t("tooltip.offline")
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function refresh() {
    board = Model.board(stateFile.text(), Date.now())
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  FileView {
    id: codeFile
    path: root.codePath
    watchChanges: false
    printErrors: false
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.refresh()
    onLoadFailed: root.refresh()
  }

  Timer {
    interval: 5000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\u{f007}"
    labelText: root.vertical ? "" : root.barLabel
    slotSize: root.vertical ? Style.bar.statusSlot : Style.bar.statusSlot + labelWidth.advanceWidth + Style.space(4)
    active: root.status === "up"
    dimmed: root.status !== "up"
    tooltipText: root.tip

    onPressed: function(b) {
      if (b === Qt.LeftButton && panelLoader.item) panelLoader.item.toggle()
    }

    TextMetrics {
      id: labelWidth
      font.family: root.bar ? root.bar.fontFamily : Style.font.family
      font.pixelSize: Style.bar.iconFont
      text: root.barLabel
    }
  }
}
