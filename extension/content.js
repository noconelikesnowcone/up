// Asks Nextup for the position list once a minute. The on-screen board is
// left alone: it is the copy that sits still until someone refreshes it.

const BOARD_ORIGIN = "https://login.thenextup.com"
const FRESH_MS = 15000

let pending = null
let lastDone = 0

function valueOf(doc, id) {
  const node = doc.querySelector("#" + id)
  if (!node || node.value == null) return ""
  return String(node.value)
}

function findBoard(doc) {
  if (!doc) return null
  if (doc.querySelector("#UplistConfigId")) return doc
  const frames = doc.querySelectorAll("iframe")
  for (const frame of frames) {
    try {
      const inner = findBoard(frame.contentDocument)
      if (inner) return inner
    } catch (error) {
      // A cross-origin frame is not the board.
    }
  }
  return null
}

async function fetchBoard(doc) {
  const configId = valueOf(doc, "UplistConfigId").trim()
  if (!configId) return { open: false, rows: [] }
  const url = new URL("/Dv/GetDisplayViewUpListConfig", BOARD_ORIGIN)
  url.searchParams.set("upListConfigId", configId)
  url.searchParams.set("timeOffset", valueOf(doc, "TimeOffset") || valueOf(doc, "txbTimeOffset"))
  url.searchParams.set("isShowNonOpp", valueOf(doc, "IsShowNonOpp") === "True" ? "true" : "false")
  url.searchParams.set("deviceTypeId", valueOf(doc, "txbDeviceType"))
  url.searchParams.set("selViewType", "1")
  url.searchParams.set("strDate", "")
  url.searchParams.set("viewId", String(parseInt(valueOf(doc, "ViewId"), 10) || 0))
  url.searchParams.set("cache", "false")
  const response = await fetch(url.href, {
    credentials: "include",
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest"
    }
  })
  if (!response.ok) return { keep: true }
  const declared = Number(response.headers.get("content-length"))
  if (declared > 1000000) return { keep: true }
  const text = await response.text()
  if (!text || text.length > 1000000) return { keep: true }
  const rows = peopleFromPayload(
    text,
    valueOf(doc, "RepsOnPoint"),
    valueOf(doc, "ShiftTypeId")
  )
  if (!rows) return { keep: true }
  return { open: true, rows }
}

function loadBoard() {
  const doc = findBoard(document)
  if (!doc || !valueOf(doc, "UplistConfigId").trim()) return Promise.resolve({ open: false, rows: [] })
  if (pending) return pending
  if (Date.now() - lastDone < FRESH_MS) return Promise.resolve({ keep: true })
  pending = fetchBoard(doc)
    .catch(() => ({ keep: true }))
    .finally(() => {
      pending = null
      lastDone = Date.now()
    })
  return pending
}

function publish(board) {
  if (!board || board.keep) return
  chrome.runtime.sendMessage({ type: "up", board }).catch(() => {})
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "read") return false
  loadBoard().then(sendResponse)
  return true
})

loadBoard().then(publish)
