// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// The filter of the tables with brokers in them: comma- or space-separated tokens; a number is a part of a broker id (as
// typed: "21" matches 21, 210, 2195 ...) and a rack equal to it (racks are often numbers: "215"), any other text a part of a
// name (a host, a rack, a topic ...). A row matches if any token matches. What matched is highlighted: hitId for the broker
// pills, hitParts / <hit-text> for the names.

export function parseFilter (text) {
  const tokens = String(text || '').trim().toLowerCase().split(/[\s,]+/).filter(Boolean)
  const ids = tokens.filter(t => /^\d+$/.test(t))
  const words = tokens.filter(t => !/^\d+$/.test(t))
  // a name the filter picks
  const hitText = (s) => {
    const name = s === null || s === undefined ? '' : String(s).toLowerCase()
    return words.some(w => name.includes(w))
  }
  return {
    empty: tokens.length === 0,
    ids,
    words,
    // a broker the filter picks
    hitId (id) {
      return id !== null && id !== undefined && ids.some(t => String(id).includes(t))
    },
    hitText,
    // a rack the filter picks: a part of it, or all of it as a number
    hitRack (s) {
      return hitText(s) || (s !== null && s !== undefined && ids.includes(String(s).toLowerCase()))
    }
  }
}

// brokerIds: the brokers of the row (a broker, or the replicas of a partition); texts: its names; racks: its racks
export function matchesFilter (filter, brokerIds, texts, racks) {
  if (filter.empty) return true
  return (brokerIds || []).some(id => filter.hitId(id)) || (texts || []).some(t => filter.hitText(t)) ||
    (racks || []).some(r => filter.hitRack(r))
}

// a name cut into the parts the filter's words match and the rest: [{ text, hit }]; rack: a number of the filter equal to
// the name marks all of it
export function hitParts (filter, text, rack) {
  const s = text === null || text === undefined ? '' : String(text)
  if (rack && filter && !filter.empty && filter.ids.includes(s.toLowerCase())) return [{ text: s, hit: true }]
  const words = filter && !filter.empty ? filter.words : []
  if (!words.length || !s) return [{ text: s, hit: false }]
  const lower = s.toLowerCase()
  const marked = new Array(s.length).fill(false)
  words.forEach((w) => {
    for (let i = lower.indexOf(w); i !== -1; i = lower.indexOf(w, i + 1)) {
      for (let j = i; j < i + w.length; j++) marked[j] = true
    }
  })
  const parts = []
  for (let i = 0; i < s.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.hit === marked[i]) last.text += s[i]
    else parts.push({ text: s[i], hit: marked[i] })
  }
  return parts
}
