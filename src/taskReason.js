// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.

/**
 * Splits an executor's triggeredTaskReason into a prefix and key/value entries, e.g.
 * "Self healing for INTRA_BROKER_GOAL_VIOLATION: {Fixable goal violations: {G1, G2}, Brokers to heal: [1, 2]}".
 * Commas and colons inside braces, parentheses and brackets do not split.
 */
export default function parseTaskReason (reason) {
  reason = reason || ''
  const result = { prefix: '', entries: [] }
  // Format: "Self healing for GOAL_VIOLATION: {key1: val1, key2: [a, b]}"
  const match = reason.match(/^(.*?):\s*\{(.*)\}\s*$/)
  if (!match) return result
  result.prefix = match[1]
  const inner = match[2]
  // Split on top-level commas (not inside braces, parentheses or brackets)
  const pairs = []
  let depth = 0
  let current = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      pairs.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) pairs.push(current.trim())
  for (const pair of pairs) {
    // Find the first top-level colon (not inside parens/braces)
    let d = 0
    let colonIdx = -1
    for (let i = 0; i < pair.length; i++) {
      if (pair[i] === '{' || pair[i] === '(' || pair[i] === '[') d++
      else if (pair[i] === '}' || pair[i] === ')' || pair[i] === ']') d--
      else if (pair[i] === ':' && d === 0) { colonIdx = i; break }
    }
    if (colonIdx > 0) {
      result.entries.push({
        key: pair.substring(0, colonIdx).trim(),
        value: pair.substring(colonIdx + 1).trim()
      })
    } else if (pair) {
      result.entries.push({ key: pair, value: '' })
    }
  }
  return result
}
