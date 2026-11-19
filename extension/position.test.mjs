import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"

const source = readFileSync(new URL("./position.js", import.meta.url), "utf8")

function load() {
  const sandbox = { module: { exports: {} } }
  vm.runInNewContext(source, sandbox, { filename: "position.js" })
  return sandbox.module.exports
}

function person(name, extra) {
  return { FriendlyName: name, StatusId: 1, LeapFrogTypeId: 0, StatusDateLocal: "", ...extra }
}

test("the turn ends at the rotation clock, including midnight and noon", () => {
  const { endClock } = load()
  assert.equal(endClock("2026-11-19T15:01:18.5124752"), "15:01")
  assert.equal(endClock("2026-11-19T00:05:00"), "00:05")
  assert.equal(endClock("2026-11-19T12:00:00"), "12:00")
  assert.equal(endClock("15:01"), "15:01")
  assert.equal(endClock("1:20pm"), "")
  assert.equal(endClock(""), "")
})

test("only the top person's turn end is kept", () => {
  const { orderPosition } = load()
  const rows = orderPosition([
    person("Alex Kim", { StatusDateLocal: "2026-11-19T13:20:59", RotationTime: "2026-11-19T15:01:18" }),
    person("Blair Chen", { StatusDateLocal: "2026-11-19T11:55:00", RotationTime: "2026-11-19T16:00:00" }),
    person("Casey Diaz", { StatusId: 15, RotationTime: "2026-11-19T17:00:00" })
  ], 2, 0)
  assert.equal(rows.map((row) => row.name).join("|"), "Alex Kim|Blair Chen")
  assert.equal(rows.map((row) => row.time).join("|"), "15:01|")
  assert.equal(rows.every((row) => row.point), true)
})

test("a fixed place is inserted at its hold position", () => {
  const { orderPosition } = load()
  const rows = orderPosition([
    person("Alex Kim"),
    person("Blair Chen", { LeapFrogTypeId: 1, HoldPosition: 0 })
  ], 2, 0)
  assert.equal(rows.map((row) => row.name).join("|"), "Blair Chen|Alex Kim")
})

test("a floating person starts at the point boundary", () => {
  const { orderPosition } = load()
  const rows = orderPosition([
    person("Alex Kim"),
    person("Blair Chen", { LeapFrogTypeId: 2, HoldPosition: 9 })
  ], 1, 0)
  assert.equal(rows.map((row) => row.name).join("|"), "Alex Kim|Blair Chen")
  assert.equal(rows[0].point, true)
  assert.equal(rows[1].point, false)
})

test("a fixed shift keeps the down-band rows and marks nobody on point", () => {
  const { orderPosition } = load()
  const rows = orderPosition([
    person("Casey Diaz", { StatusId: 15 })
  ], 2, 1)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].point, false)
})

test("the payload's activity column is not part of the list", () => {
  const { peopleFromPayload } = load()
  const payload = JSON.stringify([{
    PositionList: [person("Alex Kim", { GuestFirstName: "Pat", RepMobNum: "555" })],
    ActivityList: [{ FriendlyName: "Blair Chen", GuestFirstName: "Pat", GuestComment: "hello" }]
  }])
  const rows = peopleFromPayload(JSON.stringify(payload), 2, 0)
  assert.equal(rows.map((row) => row.name).join("|"), "Alex Kim")
  const packed = JSON.stringify(rows)
  assert.equal(packed.includes("Blair"), false)
  assert.equal(packed.includes("Pat"), false)
  assert.equal(packed.includes("555"), false)
  assert.equal(packed.includes("hello"), false)
  assert.equal(peopleFromPayload("{\"nope\":true}", 1, 0), null)
})

test("a middle name is not shown, matching the board's first and last labels", () => {
  const { orderPosition } = load()
  const rows = orderPosition([person("Alex Quinn Kim")], 1, 0)
  assert.equal(rows[0].name, "Alex Kim")
})
