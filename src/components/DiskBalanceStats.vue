<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- DiskBalanceStats of an optimization (diskStatisticsBefore/After, or a goal's clusterModelStats.diskStatistics colored
     against a reference: the previous goal's) -->
<template>
  <div v-if="before || after">
    <h5 v-if="title">{{ title }}</h5>
    <!-- side by side: the usage and the I/O rate as two tables next to each other (the alive disks above them) -->
    <template v-if="sideBySide">
      <p class="small mb-1"><b>Alive Disks:</b> {{ get(before, 'numAliveDisks') }}<template v-if="after"> &rarr; {{ get(after, 'numAliveDisks') }}</template></p>
      <div class="row">
        <div v-for="sec in sections" :key="sec.key" class="col-xl-6">
          <table class="table table-sm table-bordered disk-stats">
            <thead class="thead-light">
              <tr>
                <th :title="sec.help">{{ sec.title }}<template v-if="sec.help"> ❓</template></th>
                <th v-if="before">{{ after ? 'Before' : 'Value' }}</th>
                <th v-if="after">After</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sec.rows" :key="sec.key + '-' + row.key">
                <th :title="row.help">{{ row.label }}</th>
                <td v-if="before" :class="beforeClass(sec, row)" :title="beforeTitle(sec, row)">{{ formatStat(before[sec.key], row) }}</td>
                <td v-if="after" :class="changeClass(before && before[sec.key], after[sec.key], row)">{{ formatStat(after[sec.key], row) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
    <table v-else class="table table-sm table-bordered disk-stats">
      <thead class="thead-light">
        <tr>
          <th>Metric</th>
          <th v-if="before">{{ after ? 'Before' : 'Value' }}</th>
          <th v-if="after">After</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Alive Disks</th>
          <td v-if="before">{{ get(before, 'numAliveDisks') }}</td>
          <td v-if="after">{{ get(after, 'numAliveDisks') }}</td>
        </tr>
        <template v-for="sec in sections">
          <tr :key="sec.key" class="table-secondary"><th :colspan="columns" :title="sec.help">{{ sec.title }}<template v-if="sec.help"> ❓</template></th></tr>
          <tr v-for="row in sec.rows" :key="sec.key + '-' + row.key">
            <th :title="row.help">{{ row.label }}</th>
            <td v-if="before" :class="beforeClass(sec, row)" :title="beforeTitle(sec, row)">{{ formatStat(before[sec.key], row) }}</td>
            <td v-if="after" :class="changeClass(before && before[sec.key], after[sec.key], row)">{{ formatStat(after[sec.key], row) }}</td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script>
import Vue from 'vue'

// value: which field of the stat object holds the number; lower / higher: true if a lower / higher value is better
const USAGE_ROWS = [
  { key: 'AVG', label: 'Average Utilization', value: 'utilizationPct', unit: 'pct' },
  { key: 'MAX', label: 'Max Utilization', value: 'utilizationPct', unit: 'pct', lower: true },
  { key: 'MIN', label: 'Min Utilization', value: 'utilizationPct', unit: 'pct', higher: true },
  { key: 'STD', label: 'Std. Deviation', value: 'utilizationPct', unit: 'pct', lower: true },
  { key: 'maxSpreadWithinBroker', label: 'Max Spread Within a Broker', value: 'utilizationPct', unit: 'pct', lower: true, help: 'Largest difference between the most and the least utilized disk of one broker' },
  { key: 'numUnbalancedDisks', label: 'Unbalanced Disks', unit: 'count', lower: true, help: 'Disks outside the balance band of their broker (intra.broker.disk.balance.threshold)' },
  { key: 'numDisksAboveCapacityLimit', label: 'Disks Above Capacity Limit', unit: 'count', lower: true }
]
const IO_ROWS = [
  { key: 'AVG', label: 'Average I/O Rate', value: 'rateKBps', unit: 'kbps' },
  { key: 'MAX', label: 'Max I/O Rate', value: 'rateKBps', unit: 'kbps', lower: true },
  { key: 'MIN', label: 'Min I/O Rate', value: 'rateKBps', unit: 'kbps', higher: true },
  { key: 'STD', label: 'Std. Deviation', value: 'rateKBps', unit: 'kbps', lower: true },
  { key: 'maxRatio', label: 'Max Ratio to Broker Average', value: 'ratioPct', unit: 'pct', lower: true, help: 'Highest I/O rate of a disk relative to the average of its broker\'s alive disks' },
  { key: 'maxSpreadWithinBroker', label: 'Max Spread Within a Broker', value: 'ratioPct', unit: 'pct', lower: true },
  { key: 'numUnbalancedDisks', label: 'Unbalanced Disks', unit: 'count', lower: true, help: 'Disks outside the I/O balance band of their broker (intra.broker.disk.io.balance.threshold)' }
]

export default {
  name: 'DiskBalanceStats',
  props: {
    before: Object,
    after: Object,
    // with a single column (no after): the stats it is colored against
    reference: { type: Object, default: null },
    // the usage and the I/O rate as two tables side by side
    sideBySide: { type: Boolean, default: false },
    title: { type: String, default: '' }
  },
  data () {
    return {
      usageRows: USAGE_ROWS,
      ioRows: IO_ROWS
    }
  },
  computed: {
    // the usage, then the I/O rate if any of the stats has it
    sections () {
      const sections = [{ key: 'usage', title: 'Disk Usage', rows: this.usageRows }]
      if ((this.before && this.before.ioRate) || (this.after && this.after.ioRate)) {
        sections.push({ key: 'ioRate', title: 'Disk I/O Rate (estimated)', rows: this.ioRows, help: 'Per-disk I/O cannot be measured; CC estimates it from the per-replica network rates (intra.broker.disk.io.read.weight weights the reads).' })
      }
      return sections
    },
    columns () {
      return 1 + (this.before ? 1 : 0) + (this.after ? 1 : 0)
    }
  },
  methods: {
    get (obj, key) {
      return obj && obj[key] !== undefined ? obj[key] : '—'
    },
    number (group, row) {
      if (!group) return null
      const stat = group[row.key]
      if (stat === undefined || stat === null) return null
      if (row.unit === 'count') return Number(stat)
      return stat[row.value] !== undefined ? Number(stat[row.value]) : null
    },
    formatStat (group, row) {
      const n = this.number(group, row)
      if (n === null) return '—'
      let text
      if (row.unit === 'count') {
        text = String(n)
      } else if (row.unit === 'pct') {
        text = n.toFixed(2) + ' %'
      } else {
        text = Vue.filter('formatNetworkUnits')(n)
      }
      const stat = group[row.key]
      if (stat && typeof stat === 'object') {
        const where = []
        if (stat.ratioPct !== undefined && row.value !== 'ratioPct') where.push(Number(stat.ratioPct).toFixed(1) + ' % of broker avg')
        if (stat.broker !== undefined) where.push('broker ' + stat.broker)
        if (stat.logdir !== undefined) where.push(stat.logdir)
        if (where.length) text += ' (' + where.join(', ') + ')'
      }
      return text
    },
    changeClass (beforeGroup, afterGroup, row) {
      if (!row.lower && !row.higher) return null
      const b = this.number(beforeGroup, row)
      const a = this.number(afterGroup, row)
      if (b === null || a === null || Math.abs(a - b) < 1e-9) return null
      return (row.lower ? a < b : a > b) ? 'text-success font-weight-bold' : 'text-danger font-weight-bold'
    },
    // a single column is colored against the reference
    beforeClass (sec, row) {
      return this.after ? null : this.changeClass(this.reference && this.reference[sec.key], this.before[sec.key], row)
    },
    beforeTitle (sec, row) {
      return this.after ? null : this.referenceTitle(this.reference && this.reference[sec.key], row)
    },
    referenceTitle (group, row) {
      return this.number(group, row) === null ? null : 'Before this goal: ' + this.formatStat(group, row)
    }
  }
}
</script>

<style scoped>
.disk-stats th { font-weight: 600; }
.disk-stats td { font-variant-numeric: tabular-nums; }
</style>
