.pragma library

// Who is up, from the Nextup position column. Names are display text only.
var STALE_MS = 150000
var NAME_MAX = 40
var TIME_MAX = 16
var ROW_MAX = 40

function plain(value, limit) {
  var cap = typeof limit === "number" ? limit : NAME_MAX
  var text = String(value == null ? "" : value)
  // A bracket means this is markup, not a person's name. Drop the whole value
  // so a stripped tag cannot leave a URL behind.
  if (/[<>]/.test(text)) return ""
  text = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, "")
  text = text.replace(/[&%]/g, "")
  text = text.replace(/\s+/g, " ").trim()
  if (text.length > cap) text = text.slice(0, cap)
  return text
}

function blank(status) {
  return { status: status, name: "", label: "", time: "", rows: [] }
}

function board(text, now) {
  var parsed
  try {
    parsed = JSON.parse(String(text || ""))
  } catch (e) {
    return blank("offline")
  }
  if (!parsed || typeof parsed !== "object") return blank("offline")
  var updated = Number(parsed.updated)
  var clock = typeof now === "number" ? now : Date.now()
  if (!isFinite(updated) || updated > clock + 5000 || clock - updated > STALE_MS)
    return blank("offline")
  if (parsed.open !== true) {
    var reason = String(parsed.reason || "")
    if (reason === "locked" || reason === "code" || reason === "signin" || reason === "item")
      return blank(reason)
    return blank("away")
  }

  var source = Array.isArray(parsed.rows) ? parsed.rows : []
  var rows = []
  for (var i = 0; i < source.length && rows.length < ROW_MAX; i++) {
    var row = source[i]
    if (!row || typeof row !== "object") continue
    var name = plain(row.name, NAME_MAX)
    if (!name) continue
    rows.push({ name: name, time: plain(row.time, TIME_MAX), point: row.point === true })
  }
  if (!rows.length) return blank("empty")
  // The bar is short. It shows the given name of the first two people only.
  // The panel still lists every full name.
  var shown = []
  for (var n = 0; n < rows.length && shown.length < 2; n++) {
    var given = rows[n].name.split(" ")[0]
    if (given) shown.push(given)
  }
  return {
    status: "up",
    name: rows[0].name,
    label: shown.join(" · "),
    time: rows[0].time,
    rows: rows
  }
}

if (typeof module !== "undefined") {
  module.exports = { STALE_MS: STALE_MS, board: board, plain: plain }
}
