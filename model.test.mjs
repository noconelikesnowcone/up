import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"

const source = readFileSync(new URL("./Model.js", import.meta.url), "utf8")
  .replace(/^\.pragma library\n/, "")

function load() {
  const sandbox = { module: { exports: {} } }
  vm.runInNewContext(source, sandbox, { filename: "Model.js" })
  return sandbox.module.exports
}

const now = 1_700_000_000_000
const tracker = '<img src="https://example.invalid/tracker">'

function fresh(body) {
  return JSON.stringify({ updated: now, open: true, ...body })
}

test("the turn end can be printed as 1501, 15:01, or 3:01pm", () => {
  const model = load()
  assert.equal(model.formatTime("15:01", "HHmm"), "1501")
  assert.equal(model.formatTime("15:01", "HH:mm"), "15:01")
  assert.equal(model.formatTime("15:01", "h:mma"), "3:01pm")
  assert.equal(model.formatTime("00:05", "HHmm"), "0005")
  assert.equal(model.formatTime("12:00", "h:mma"), "12:00pm")
  assert.equal(model.formatTime("09:05", "H:mm"), "9:05")
  assert.equal(model.formatTime("1:20pm", "HHmm"), "")
  assert.equal(model.formatTime("", "HHmm"), "")
  assert.equal(model.formatTime("15:01", ""), "1501")
})

test("plain text drops markup, controls, and placeholders", () => {
  const model = load()
  const cleaned = model.plain(tracker + "\nAlex&amp; 100%")
  assert.equal(cleaned.includes("<"), false)
  assert.equal(cleaned.includes(">"), false)
  assert.equal(cleaned.includes("&"), false)
  assert.equal(cleaned.includes("\n"), false)
  assert.equal(cleaned.includes("%"), false)
  assert.equal(model.plain("Alex Kim"), "Alex Kim")
})

test("the bar shows the first names of the top two, and the panel keeps everyone", () => {
  const model = load()
  const view = model.board(fresh({
    rows: [
      { name: "Alex Kim", time: "11:40am", point: true },
      { name: "Blair Chen", time: "", point: true },
      { name: "Casey Diaz", time: "3:10pm", point: false }
    ]
  }), now)
  assert.equal(view.status, "up")
  assert.equal(view.name, "Alex Kim")
  assert.equal(view.label, "Alex · Blair")
  assert.equal(view.time, "11:40am")
  assert.equal(view.rows.map((row) => row.name).join("|"), "Alex Kim|Blair Chen|Casey Diaz")
  assert.equal(view.rows.map((row) => row.point).join("|"), "true|true|false")
})

test("one person on the bar is just their first name", () => {
  const model = load()
  const view = model.board(fresh({
    rows: [{ name: "Blair Chen", time: "", point: false }]
  }), now)
  assert.equal(view.status, "up")
  assert.equal(view.name, "Blair Chen")
  assert.equal(view.label, "Blair")
  assert.equal(view.rows.length, 1)
})

test("a single-word name stays whole on the bar", () => {
  const model = load()
  const view = model.board(fresh({
    rows: [
      { name: "Casey", time: "1:20pm", point: true },
      { name: "Drew Lane", time: "", point: false }
    ]
  }), now)
  assert.equal(view.label, "Casey · Drew")
})

test("markup in a name is not shown", () => {
  const model = load()
  const view = model.board(fresh({
    rows: [
      { name: tracker, time: "<b>11:40</b>", point: true },
      { name: "Alex Kim", time: "11:40am", point: true }
    ]
  }), now)
  assert.equal(view.rows.some((row) => row.name.includes("<")), false)
  assert.equal(view.rows.some((row) => row.time.includes("<")), false)
  assert.equal(view.name, "Alex Kim")
})

test("an open board with nobody waiting is empty, not offline", () => {
  const model = load()
  const view = model.board(fresh({ rows: [] }), now)
  assert.equal(view.status, "empty")
  assert.equal(view.rows.length, 0)
})

test("a locked or missing 1Password login is not shown as the queue", () => {
  const model = load()
  const locked = model.board(JSON.stringify({
    updated: now,
    open: false,
    reason: "locked",
    rows: [{ name: "Alex Kim", time: "11:40am", point: true }]
  }), now)
  assert.equal(locked.status, "locked")
  assert.equal(locked.rows.length, 0)
  assert.equal(model.board(JSON.stringify({ updated: now, open: false, reason: "item" }), now).status, "item")
  assert.equal(model.board(JSON.stringify({ updated: now, open: false, reason: "code" }), now).status, "code")
})

test("the site without the board is away", () => {
  const model = load()
  const view = model.board(JSON.stringify({ updated: now, open: false, rows: [] }), now)
  assert.equal(view.status, "away")
})

test("a stale or broken reading is offline and drops the names", () => {
  const model = load()
  const stale = model.board(fresh({
    rows: [{ name: "Alex Kim", time: "", point: true }]
  }), now + model.STALE_MS + 1)
  assert.equal(stale.status, "offline")
  assert.equal(stale.rows.length, 0)
  assert.equal(model.board("not json", now).status, "offline")
  assert.equal(model.board("", now).status, "offline")
})
