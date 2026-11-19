import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// The position queue. The first person is up. Nothing here changes Nextup.
Panel {
  id: root
  moduleName: "giaodn.up"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var host: hostWidget
  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string status: host ? host.status : "offline"
  readonly property string detail: {
    if (status === "empty") return strings.t("panel.nobody")
    if (status === "locked") return strings.t("panel.locked")
    if (status === "code") return strings.t("panel.code")
    if (status === "signin") return strings.t("panel.signin")
    if (status === "item") return strings.t("panel.item")
    if (status === "away") return strings.t("panel.away")
    if (status !== "up") return strings.t("panel.offline")
    return strings.t("panel.fresh")
  }

  function submitCode() {
    if (!host) return
    host.submitCode(codeField.text)
    codeField.text = ""
  }

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: codeField.activeFocus
      onCloseRequested: root.close()

      ColumnLayout {
        id: content
        anchors.fill: parent
        spacing: Style.space(8)

        PanelHero {
          Layout.fillWidth: true
          title: strings.t("title")
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        // The hero's subtitle is one uppercase line and cuts the rest off.
        PlainText {
          Layout.fillWidth: true
          wrapMode: Text.WordWrap
          text: root.detail
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }

        TextField {
          id: codeField
          Layout.fillWidth: true
          visible: root.status === "code"
          password: true
          placeholderText: strings.t("panel.codeHint")
          foreground: root.foreground
          font.family: root.fontFamily
          onAccepted: root.submitCode()
        }

        Flickable {
          id: list
          Layout.fillWidth: true
          visible: root.status === "up"
          implicitHeight: Math.min(listCol.implicitHeight, Style.space(520))
          contentWidth: width
          contentHeight: listCol.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          interactive: contentHeight > height + 1

          ColumnLayout {
            id: listCol
            width: list.width
            spacing: Style.space(8)

            Repeater {
              model: root.status === "up" && root.host ? root.host.rows : []

              RowLayout {
                id: person
                required property var modelData
                Layout.fillWidth: true
                spacing: Style.space(8)

                PlainText {
                  Layout.fillWidth: true
                  text: person.modelData.name
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: person.modelData.point === true
                  elide: Text.ElideRight
                }

                PlainText {
                  text: person.modelData.time
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  visible: text.length > 0
                }
              }
            }
          }
        }
      }
    }
  }
}
