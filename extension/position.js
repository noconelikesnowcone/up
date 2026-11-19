// Turns a Nextup position payload into the ordered list the board shows
// after a manual refresh. Activity, guests, and phone numbers are ignored.

var POSITION_ROW_MAX = 40
var LEAP_NORMAL = 0
var LEAP_FIXED = 1
var LEAP_FLOATING = 2

function bookmark(value) {
  return value === true || value === 1 || value === "1" || value === "True" || value === "true"
}

function personName(value) {
  var parts = String(value == null ? "" : value).trim().split(/\s+/)
  var kept = []
  for (var i = 0; i < parts.length; i++) {
    if (parts[i]) kept.push(parts[i])
  }
  if (!kept.length) return ""
  if (kept.length === 1) return kept[0]
  return kept[0] + " " + kept[kept.length - 1]
}

function clockOf(value) {
  if (value == null || value === "") return ""
  var text = String(value).trim()
  var shown = text.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i)
  if (shown) {
    var hour = Number(shown[1])
    if (hour < 1 || hour > 12) return ""
    return String(hour) + ":" + shown[2] + shown[3].toLowerCase()
  }
  var date = null
  if (typeof value === "number" && isFinite(value)) {
    date = new Date(value)
  } else {
    var stamped = text.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/)
    if (stamped) date = new Date(Number(stamped[1]))
    else {
      var parsed = Date.parse(text)
      if (!isNaN(parsed)) date = new Date(parsed)
    }
  }
  if (!date || isNaN(date.getTime())) return ""
  var h = date.getHours()
  var suffix = h < 12 ? "am" : "pm"
  var h12 = h % 12
  if (h12 === 0) h12 = 12
  var minute = date.getMinutes()
  var mm = minute < 10 ? "0" + minute : String(minute)
  return String(h12) + ":" + mm + suffix
}

function copyPerson(row) {
  return {
    FriendlyName: row.FriendlyName,
    StatusId: row.StatusId,
    LeapFrogTypeId: row.LeapFrogTypeId,
    HoldPosition: row.HoldPosition,
    IsBookMark: row.IsBookMark,
    StatusDateLocal: row.StatusDateLocal
  }
}

function orderPosition(list, repsOnPoint, shiftTypeId) {
  var reps = parseInt(repsOnPoint, 10)
  if (!isFinite(reps) || reps < 0) reps = 1
  var shift = parseInt(shiftTypeId, 10)
  if (!isFinite(shift)) shift = 0
  var incoming = Array.isArray(list) ? list : []
  var source = []
  for (var i = 0; i < incoming.length; i++) {
    var row = incoming[i]
    if (!row || typeof row !== "object") continue
    var status = Number(row.StatusId)
    var leap = Number(row.LeapFrogTypeId)
    if (!isFinite(leap)) leap = 0
    var marked = bookmark(row.IsBookMark)
    var downBand = status > 10 && status < 21
    var special = (status === 43 || status === 44 || marked) && leap > 0
    if (downBand || special) {
      if (!(status === 43 || status === 44 || marked || shift === 1)) continue
      var kept = copyPerson(row)
      if (leap === LEAP_FLOATING) kept.HoldPosition = reps
      source.push(kept)
    } else {
      source.push(copyPerson(row))
    }
  }

  var maxLen = 0
  for (var a = 0; a < source.length; a++) {
    var leapA = Number(source[a].LeapFrogTypeId) || 0
    var holdA = Number(source[a].HoldPosition)
    if ((leapA === LEAP_FIXED || leapA === LEAP_FLOATING) && holdA > maxLen) maxLen = holdA
  }
  if (source.length > maxLen) maxLen = source.length
  if (reps + 1 > maxLen) maxLen = reps + 1
  maxLen += 1
  if (maxLen > 80) maxLen = 80

  var display = []
  for (var s = 0; s < maxLen; s++) display.push({ blank: true, avail: true, row: null })

  for (var f = 0; f < source.length; f++) {
    if ((Number(source[f].LeapFrogTypeId) || 0) !== LEAP_FIXED) continue
    var at = Number(source[f].HoldPosition)
    if (!isFinite(at) || at < 0 || at >= display.length) {
      source[f].LeapFrogTypeId = LEAP_NORMAL
      continue
    }
    display[at].blank = false
    display[at].avail = false
    display[at].row = source[f]
  }

  var start = 0
  for (var n = 0; n < source.length; n++) {
    var leapN = Number(source[n].LeapFrogTypeId) || 0
    if (leapN !== LEAP_NORMAL && leapN !== LEAP_FLOATING) continue
    if (leapN === LEAP_FLOATING) start = reps
    var seat = null
    for (var d = start; d < display.length; d++) {
      if (display[d].avail) {
        seat = display[d]
        break
      }
    }
    start = 0
    if (!seat) continue
    seat.blank = false
    seat.avail = false
    seat.row = source[n]
  }

  var last = display.length ? display[display.length - 1] : null
  var endCount = 0
  for (var end = display.length - 1; end > 0; end--) {
    var tail = display[end]
    if (tail.row == null && last && last.avail && tail.blank) endCount += 1
    else break
  }

  var fixedOn = shift === 1
  var rows = []
  var limit = display.length - endCount
  for (var r = 0; r < limit; r++) {
    var item = display[r].row
    if (!item) continue
    var name = personName(item.FriendlyName)
    if (!name) continue
    rows.push({
      name: name.slice(0, 80),
      time: clockOf(item.StatusDateLocal).slice(0, 24),
      point: !fixedOn && r + 1 <= reps
    })
    if (rows.length >= POSITION_ROW_MAX) break
  }
  return rows
}

function peopleFromPayload(payload, repsOnPoint, shiftTypeId) {
  var data = payload
  if (typeof data === "string") {
    var text = data.trim()
    if (!text) return []
    data = JSON.parse(text)
    if (typeof data === "string") data = JSON.parse(data)
  }
  var board = Array.isArray(data) ? data[0] : data
  if (!board || typeof board !== "object" || !Array.isArray(board.PositionList)) return null
  return orderPosition(board.PositionList, repsOnPoint, shiftTypeId)
}

if (typeof module !== "undefined") {
  module.exports = {
    POSITION_ROW_MAX: POSITION_ROW_MAX,
    orderPosition: orderPosition,
    peopleFromPayload: peopleFromPayload,
    clockOf: clockOf
  }
}
