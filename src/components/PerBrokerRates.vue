<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Per-broker throttle rates: one summary line, and a scrolling per-broker table on demand -->
<template>
  <span>
    <b>{{ summary }}</b>
    <small v-if="uniformRate !== null" class="text-muted">({{ uniformRate | formatNumber }} bytes/s)</small>
    <button v-if="rows.length > 1" type="button" class="btn btn-sm btn-link py-0" @click="open = !open">{{ open ? 'Hide' : 'Show' }} per broker</button>
    <div v-if="open && rows.length > 1" class="mt-2">
      <input v-if="rows.length > 10" v-model="filter" type="text" class="form-control form-control-sm mb-1 broker-filter" placeholder="Filter: broker ids (e.g. 1, 3)">
      <div class="per-broker">
        <table class="table table-sm table-bordered mb-0">
          <thead class="thead-light"><tr><th>Broker</th><th v-for="c in columns" :key="c.key">{{ c.label }}</th></tr></thead>
          <tbody>
            <tr v-for="r in filteredRows" :key="r.broker" :class="isOdd(r) ? 'table-warning' : null">
              <td>{{ r.broker }}</td>
              <td v-for="c in columns" :key="c.key" :title="Number(r.values[c.key]).toLocaleString() + ' bytes/s'">{{ r.values[c.key] | formatBytesRate }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </span>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'
import { summarizeRates } from '@/throttles'

export default {
  name: 'PerBrokerRates',
  props: {
    // [{ broker, values: { <column key>: bytes/s } }], sorted by broker
    rows: { type: Array, required: true },
    // [{ key, label }]
    columns: { type: Array, required: true },
    // highlight the brokers off the most common rate (for throttles that should agree, like the log-dir throttle)
    highlightOdd: { type: Boolean, default: false }
  },
  data () {
    return {
      open: false,
      filter: ''
    }
  },
  computed: {
    summary () {
      return summarizeRates(this.rows, this.columns)
    },
    allValues () {
      return this.rows.reduce((all, r) => all.concat(this.columns.map(c => r.values[c.key])), [])
    },
    // the one rate every broker has, if they all agree
    uniformRate () {
      const v = this.allValues
      return v.length && v.every(x => x === v[0]) ? v[0] : null
    },
    mode () {
      const count = {}
      this.allValues.forEach(r => { count[r] = (count[r] || 0) + 1 })
      return Number(Object.keys(count).sort((a, b) => count[b] - count[a])[0])
    },
    filteredRows () {
      const f = parseFilter(this.filter)
      return this.rows.filter(r => matchesFilter(f, [r.broker], []))
    }
  },
  methods: {
    isOdd (r) {
      return this.highlightOdd && this.uniformRate === null && this.columns.some(c => r.values[c.key] !== this.mode)
    }
  }
}
</script>

<style scoped>
.per-broker { max-height: 300px; overflow-y: auto; max-width: 560px; }
.broker-filter { max-width: 240px; }
</style>
