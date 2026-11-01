<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <span v-if='cell.unit === "brokerstate"'>
    <broker-state :state="cell.after" />
  </span>
  <span v-else-if="cell.unit === 'logdir'">
    <code>{{ before }}</code>
  </span>
  <span v-else-if="!beforeExists" class="diff">
    <span :class="['diff-values', { 'badge badge-danger': after === 'DEAD' }]"><value-cell :text="shown(after)" /></span>
    <span class="diff-delta none" aria-hidden="true">0%</span>
  </span>
  <!-- before -> after on one line; the change as a share of before: red when it grows, green when it shrinks -->
  <!-- line 1: before -> after; line 2: the change (kept, empty, when there is none, so every cell has the same height) -->
  <span v-else class="diff">
    <span class="diff-values">
      <span class="diff-before"><value-cell :text="shown(before)" /></span>
      <template v-if="changed">
        <i class="bi bi-arrow-right diff-arrow"></i>
        <span :class="['diff-after', cell.before < cell.after ? 'text-danger' : 'text-success']"><value-cell :text="shown(after)" /></span>
      </template>
    </span>
    <span v-if="changed && change !== null" :class="['diff-delta', cell.before < cell.after ? 'up' : 'down']">{{ change }}</span>
    <span v-else class="diff-delta none" aria-hidden="true">0%</span>
  </span>
</template>

<script>
import BrokerState from '@/components/BrokerState'

export default {
  name: 'DiffCell',
  components: {
    BrokerState
  },
  props: {
    cell: Object
  },
  data () {
    return {
      precision: 1
    }
  },
  methods: {
    // a value with the cell's unit
    shown (v) {
      if (this.cell.unit === 'network') return this.$options.filters.formatNetworkUnits(v)
      if (this.cell.unit === 'disk') return this.$options.filters.formatUnits(v)
      return v
    }
  },
  computed: {
    // after relative to before, signed ("+8.3%"); null when there is no base to compare with
    change () {
      const b = Number(this.cell.before)
      const a = Number(this.cell.after)
      if (!this.numeric || !isFinite(b) || !isFinite(a) || b === 0) return null
      const v = (a - b) / b * 100
      return (v > 0 ? '+' : '') + v.toFixed(this.precision) + '%'
    },
    changed () {
      return this.after !== null && this.shown(this.before) !== this.shown(this.after)
    },
    beforeExists () {
      return this.cell.before !== undefined && this.cell.before !== null && this.cell.before !== ''
    },
    before () {
      if (!this.numeric || this.cell.unit === 'number') return this.cell.before
      if (this.cell.before === 'DEAD') return 'DEAD'
      return Number(this.cell.before).toFixed(this.precision)
    },
    after () {
      if (!this.numeric || this.cell.unit === 'number') return this.cell.after
      if (this.cell.after === 'DEAD') return 'DEAD'
      if (this.cell.after === undefined || this.cell.after === null) return null
      return Number(this.cell.after).toFixed(this.precision)
    },
    numeric () {
      return ['number', 'disk', 'pct', 'network'].includes(this.cell.unit)
    }
  }
}
</script>

<style scoped>
.diff { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.diff-values { display: inline-flex; align-items: baseline; gap: 6px; }
.diff-arrow { color: var(--muted); font-size: 0.75em; }
.diff-after { font-weight: 600; }
.diff-delta { padding: 0 6px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; line-height: 1.5; }
.diff-delta.none { visibility: hidden; }
.diff-delta.up { background: var(--danger-soft); color: var(--danger); }
.diff-delta.down { background: var(--success-soft); color: var(--success); }
</style>
