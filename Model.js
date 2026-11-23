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

// HH:mm from the reader. The pattern uses HH, H, hh, h, mm, a, and A.
function formatTime(value, pattern) {
  var text = plain(value, 5)
  var match = /^(\d{2}):(\d{2})$/.exec(text)
  if (!match) return ""
  var hour = Number(match[1])
  var minute = Number(match[2])
  if (hour > 23 || minute > 59) return ""
  var form = plain(pattern, 24)
  if (!form) form = "HHmm"
  var h12 = hour % 12
  if (h12 === 0) h12 = 12
  var hour24 = match[1]
  var minutes = match[2]
  var pad12 = (h12 < 10 ? "0" : "") + h12
  return form.replace(/HH|hh|mm|H|h|a|A/g, function (token) {
    if (token === "HH") return hour24
    if (token === "H") return String(hour)
    if (token === "hh") return pad12
    if (token === "h") return String(h12)
    if (token === "mm") return minutes
    if (token === "a") return hour < 12 ? "am" : "pm"
    return hour < 12 ? "AM" : "PM"
  })
}

function blank(status) {
  return { status: status, name: "", label: "", time: "", rows: [] }
}

function topName(view) {
  if (!view || view.status !== "up" || !view.rows || !view.rows.length) return ""
  var name = view.rows[0].name
  return typeof name === "string" ? name : ""
}

// A rotation is a new person at the top. The first list, an empty board, and
// a clock-only update are not rotations.
function rotated(previousTop, nextTop) {
  if (!previousTop || !nextTop) return false
  return previousTop !== nextTop
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
  module.exports = {
    STALE_MS: STALE_MS,
    board: board,
    plain: plain,
    formatTime: formatTime,
    topName: topName,
    rotated: rotated
  }
}
