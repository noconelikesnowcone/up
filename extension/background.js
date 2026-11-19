// Keeps one native-messaging port and writes the latest position list.

let port = null
let writing = false

function connect() {
  if (port) return port
  port = chrome.runtime.connectNative("com.giaodn.up")
  port.onDisconnect.addListener(() => {
    port = null
  })
  return port
}

function post(board) {
  if (!board || board.keep) return
  const message = {
    open: board.open === true,
    rows: Array.isArray(board.rows) ? board.rows.slice(0, 40) : [],
  }
  try {
    connect().postMessage(message)
  } catch (error) {
    port = null
  }
}

async function readOpenTabs() {
  const tabs = await chrome.tabs.query({ url: "https://login.thenextup.com/*" })
  if (!tabs.length) return { open: false, rows: [] }
  let away = false
  let sawReader = false
  for (const tab of tabs) {
    try {
      const board = await chrome.tabs.sendMessage(tab.id, { type: "read" })
      sawReader = true
      if (board && board.open) return board
      if (board && board.keep) continue
      if (board && board.open === false) away = true
    } catch (error) {
      // The tab has no reader yet, or it was discarded.
    }
  }
  if (away) return { open: false, rows: [] }
  return sawReader ? { keep: true } : { open: false, rows: [] }
}

async function refresh() {
  if (writing) return
  writing = true
  try {
    post(await readOpenTabs())
  } finally {
    writing = false
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab || !message || message.type !== "up") return
  if (message.board && message.board.keep) return
  if (message.board && message.board.open) post(message.board)
  else refresh()
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("up", { periodInMinutes: 1 })
  refresh()
})

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("up", { periodInMinutes: 1 })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "up") refresh()
})

chrome.alarms.create("up", { periodInMinutes: 1 })
