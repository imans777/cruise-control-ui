// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// The filter of the tables with brokers in them: comma- or space-separated tokens; a number is a broker id (exact), any
// other text a part of a name (a host, a rack, a topic ...). A row matches if any token matches.

export function parseFilter (text) {
  const tokens = String(text || '').trim().toLowerCase().split(/[\s,]+/).filter(Boolean)
  return {
    empty: tokens.length === 0,
    ids: tokens.filter(t => /^\d+$/.test(t)),
    words: tokens.filter(t => !/^\d+$/.test(t))
  }
}

// brokerIds: the brokers of the row (a broker, or the replicas of a partition); texts: its names
export function matchesFilter (filter, brokerIds, texts) {
  if (filter.empty) return true
  const ids = (brokerIds || []).map(String)
  if (filter.ids.some(id => ids.includes(id))) return true
  const names = (texts || []).filter(t => t !== null && t !== undefined).map(t => String(t).toLowerCase())
  return filter.words.some(w => names.some(n => n.includes(w)))
}
