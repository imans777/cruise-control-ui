// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// Per-broker throttle rates (bytes/s) summarized in one line, so that hundreds of brokers stay readable.
import Vue from 'vue'

const rate = (v) => Vue.filter('formatBytesRate')(v)

// "X" when every value is the same, otherwise "avg X (min to max)"
export function summarizeValues (values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return rate(min)
  return 'avg ' + rate(values.reduce((a, b) => a + b, 0) / values.length) + ' (' + rate(min) + ' to ' + rate(max) + ')'
}

// rows: [{ broker, values: { <column key>: bytes/s } }]; columns: [{ key, label }]
export function summarizeRates (rows, columns) {
  if (!rows.length) return 'not throttled'
  const where = rows.length === 1 ? 'on broker ' + rows[0].broker : 'on ' + rows.length + ' brokers'
  // leader and follower rates that agree on every broker read as one rate
  const same = columns.length > 1 && rows.every(r => columns.every(c => r.values[c.key] === r.values[columns[0].key]))
  if (columns.length === 1 || same) return summarizeValues(rows.map(r => r.values[columns[0].key])) + ' ' + where
  return columns.map(c => c.label.toLowerCase() + ' ' + summarizeValues(rows.map(r => r.values[c.key]))).join(', ') + ' ' + where
}
