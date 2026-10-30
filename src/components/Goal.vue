<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- The cluster model stats after one goal of an optimization, colored by how they changed since the previous goal -->
<template>
  <div v-if="goal.clusterModelStats">
  <!-- intra-broker goals leave the load of every broker unchanged: only their disk-level stats are relevant (as in CC's text view) -->
  <template v-if="!diskLevelOnly">
  <table class="table table-sm table-bordered table-fixed">
    <thead class='thead-light'>
      <tr>
        <th>Brokers</th>
        <th>Replicas</th>
        <th>Topics</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th>{{ goal.clusterModelStats.metadata.brokers }}</th>
        <th>{{ goal.clusterModelStats.metadata.replicas }}</th>
        <th>{{ goal.clusterModelStats.metadata.topics }}</th>
      </tr>
    </tbody>
  </table>
  <table class="table table-sm table-fixed">
    <thead class='thead-light'>
      <tr>
        <th></th>
        <th>Disk</th>
        <th>Replicas</th>
        <th>Cpu</th>
        <th>Network Outbound</th>
        <th>Network Inbound</th>
        <th>Topic Replicas</th>
        <th>Potential Network Out</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for='(v, k) in goal.clusterModelStats.statistics' :key="k">
        <th>{{ k }}</th>
        <td :class="changeClass(k, 'disk')" :title="previousTitle(k, 'disk', 'formatUnits')">{{ v.disk | formatUnits }}</td>
        <td :class="changeClass(k, 'replicas')" :title="previousTitle(k, 'replicas')">{{ count(v.replicas) }}</td>
        <td :class="changeClass(k, 'cpu')" :title="previousTitle(k, 'cpu')">{{ count(v.cpu) }}</td>
        <td :class="changeClass(k, 'networkOutbound')" :title="previousTitle(k, 'networkOutbound', 'formatNetworkUnits')">{{ v.networkOutbound | formatNetworkUnits }}</td>
        <td :class="changeClass(k, 'networkInbound')" :title="previousTitle(k, 'networkInbound', 'formatNetworkUnits')">{{ v.networkInbound | formatNetworkUnits }}</td>
        <td :class="changeClass(k, 'topicReplicas')" :title="previousTitle(k, 'topicReplicas')">{{ count(v.topicReplicas) }}</td>
        <td :class="changeClass(k, 'potentialNwOut')" :title="previousTitle(k, 'potentialNwOut', 'formatNetworkUnits')">{{ v.potentialNwOut | formatNetworkUnits }}</td>
      </tr>
    </tbody>
  </table>
  </template>
  <p v-else class="small text-muted mb-1">Broker-level statistics are not shown: an intra-broker goal moves replicas between the disks of a broker, so the load of every broker stays the same.</p>
  <disk-balance-stats v-if="goal.clusterModelStats.diskStatistics" :before="goal.clusterModelStats.diskStatistics" :reference="diskReference" :side-by-side="true" title="Disk Balance After This Goal" />
  </div>
  <div v-else class="text-muted">No cluster model stats available.</div>
</template>

<script>
import Vue from 'vue'
import DiskBalanceStats from '@/components/DiskBalanceStats'
import goals from '@/goals'

// which way is better, by statistic: a balanced cluster has a lower max and std, and a higher min (the average does not move)
const BETTER = { MAX: 'lower', STD: 'lower', MIN: 'higher' }

export default {
  name: 'Goal',
  components: {
    DiskBalanceStats
  },
  props: {
    goal: Object,
    // the clusterModelStats after the previous goal, if any
    previous: { type: Object, default: null },
    // the disk statistics to compare this goal's with: the previous goal's, or the ones before the optimization
    diskReference: { type: Object, default: null }
  },
  computed: {
    diskLevelOnly () {
      const name = this.goal.goal || ''
      const known = goals.goals.find(g => g.goal === name)
      const intraBroker = known ? known.group === 3 : name.startsWith('IntraBroker')
      return intraBroker && !!this.goal.clusterModelStats.diskStatistics
    }
  },
  methods: {
    // whole numbers as they are, others (averages, std, cpu) with 2 decimals, so a colored change shows in the number
    count (v) {
      return Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(2)
    },
    previousValue (stat, resource) {
      const p = this.previous && this.previous.statistics && this.previous.statistics[stat]
      return p && p[resource] !== undefined && p[resource] !== null ? Number(p[resource]) : null
    },
    changeClass (stat, resource) {
      const better = BETTER[stat]
      const b = this.previousValue(stat, resource)
      if (!better || b === null) return null
      const a = Number(this.goal.clusterModelStats.statistics[stat][resource])
      if (Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))) return null
      return (better === 'lower' ? a < b : a > b) ? 'text-success font-weight-bold' : 'text-danger font-weight-bold'
    },
    previousTitle (stat, resource, filter) {
      const b = this.previousValue(stat, resource)
      if (b === null) return null
      const format = (v) => filter ? Vue.filter(filter)(v) : Number(v).toFixed(2)
      return 'After the previous goal: ' + format(b) + ', now: ' + format(this.goal.clusterModelStats.statistics[stat][resource])
    }
  }
}
</script>
