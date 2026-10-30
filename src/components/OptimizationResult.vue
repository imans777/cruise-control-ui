<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- An OptimizationResult (proposals, rebalance, add/remove/demote broker, remove_disks, fix_offline_replicas, topic_configuration) -->
<template>
  <div>
    <h4 v-if="title">{{ title }}</h4>
    <table class="table table-sm table-bordered">
      <thead class="thead-light">
        <tr>
          <th>Inter-Broker Replica Movements</th>
          <th>Intra-Broker Replica Movements</th>
          <th>Leader Movements</th>
          <th>Inter-Broker Data To Move</th>
          <th>Intra-Broker Data To Move</th>
          <th>Recent Windows</th>
          <th>Monitored Partitions</th>
          <th>Balancedness Score</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{{ summary.numReplicaMovements | formatNumber }}</td>
          <td>{{ summary.numIntraBrokerReplicaMovements | formatNumber }}</td>
          <td>{{ summary.numLeaderMovements | formatNumber }}</td>
          <td>{{ summary.dataToMoveMB | formatUnits }}</td>
          <td>{{ summary.intraBrokerDataToMoveMB | formatUnits }}</td>
          <td>{{ summary.recentWindows | formatNumber }}</td>
          <td>{{ summary.monitoredPartitionsPercentage | formatDecimal }} %</td>
          <td :class="scoreAfter - scoreBefore > 0 ? 'text-success' : null">{{ scoreBefore }}% → {{ scoreAfter }}%</td>
        </tr>
      </tbody>
    </table>
    <p v-if="summary.excludedTopics" class="small">
      <b>Excluded Topics:</b>
      <span v-if="!summary.excludedTopics.length" class="text-muted">none</span>
      <template v-for="(t, i) in summary.excludedTopics"><code :key="t">{{ t }}</code><template v-if="i < summary.excludedTopics.length - 1">, </template></template>
      <template v-if="summary.provisionStatus">&nbsp; <b>Provision Status:</b> {{ summary.provisionStatus }}</template>
      <template v-if="summary.provisionRecommendation"> ({{ summary.provisionRecommendation }})</template>
    </p>

    <template v-if="summary.diskStatisticsBefore || summary.diskStatisticsAfter">
      <h4 class="pointer" @click="showDiskStats = !showDiskStats">
        Disk Balance
        <small class="text-muted">{{ showDiskStats ? '(click to hide)' : '(click to show)' }}</small>
      </h4>
      <disk-balance-stats v-if="showDiskStats" :before="summary.diskStatisticsBefore" :after="summary.diskStatisticsAfter" />
    </template>

    <load-diff-table v-if="result.loadAfterOptimization" :per="'broker'" :loadBefore="result.loadBeforeOptimization || {}" :loadAfter="result.loadAfterOptimization"></load-diff-table>
    <load-diff-table v-if="showHostLoad && result.loadAfterOptimization" :per="'host'" :loadBefore="result.loadBeforeOptimization || {}" :loadAfter="result.loadAfterOptimization"></load-diff-table>

    <h4 class="pointer" @click="showMovements = !showMovements">
      Proposed Partition Movements ({{ movements.length }})
      <small class="text-muted">{{ showMovements ? '(click to hide)' : '(click to show)' }}</small>
    </h4>
    <inter-broker-movement-table v-if="showMovements && movements.length" title="" :movements="movements"></inter-broker-movement-table>
    <p v-if="!result.proposals" class="small text-muted">The response has no proposals (they are returned with verbose=true only).</p>

    <h4 class="pointer" @click="showGoals = !showGoals">
      Goals
      <small class="text-muted">{{ showGoals ? '(click to hide)' : '(click to show)' }}</small>
    </h4>
    <p v-if="showGoals && goals.length > 1" class="small text-muted mb-1">
      Each goal's statistics are compared with the ones after the previous goal:
      <span class="text-success font-weight-bold">green</span> = better, <span class="text-danger font-weight-bold">red</span> = worse
      (a lower max and std, a higher min, fewer unbalanced disks); hover a value for the previous one.
      The first goal's disk statistics are compared with the ones before the optimization.
    </p>
    <table v-if="showGoals && goals.length" class="table table-sm table-bordered">
      <thead class="thead-light">
        <tr>
          <th>Goal &amp; Goal Violation Details</th>
          <th>Metadata</th>
        </tr>
      </thead>
      <tbody>
        <tr :key='goal.goal' v-for='(goal, i) in goals'>
          <td>
            <strong>{{ goal.goal }}</strong>
            <br>
            <!-- property renamed from goalViolated -> status upstream -->
            <span v-if='goal.hasOwnProperty("goalViolated")'>{{ goal.goalViolated }}</span>
            <span v-else>{{ goal.status }}</span>
          </td>
          <td>
            <goal :goal='goal' :previous='i > 0 ? goals[i - 1].clusterModelStats : null' :disk-reference='diskReference(i)' />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import Goal from '@/components/Goal'
import LoadDiffTable from '@/components/LoadDiffTable'
import DiskBalanceStats from '@/components/DiskBalanceStats'
import InterBrokerMovementTable from '@/components/InterBrokerMovementTable'

export default {
  name: 'OptimizationResult',
  components: {
    Goal,
    LoadDiffTable,
    DiskBalanceStats,
    InterBrokerMovementTable
  },
  props: {
    result: { type: Object, required: true },
    title: { type: String, default: '' },
    showHostLoad: { type: Boolean, default: false },
    goalsOpen: { type: Boolean, default: false }
  },
  data () {
    return {
      showDiskStats: true,
      showMovements: false,
      showGoals: this.goalsOpen
    }
  },
  computed: {
    summary () {
      // Newer CC versions nest under summary; older versions put fields at top level
      return this.result.summary || this.result
    },
    scoreBefore () {
      return Number(this.summary.onDemandBalancednessScoreBefore).toFixed(0)
    },
    scoreAfter () {
      return Number(this.summary.onDemandBalancednessScoreAfter).toFixed(0)
    },
    movements () {
      return (this.result.proposals || []).map(item => ({ proposal: item }))
    },
    goals () {
      return this.result.goalSummary || this.result.goals || []
    }
  },
  methods: {
    // the disk statistics a goal's are compared with: the previous goal's, or (first goal) the ones before the optimization
    diskReference (i) {
      if (i === 0) return this.summary.diskStatisticsBefore || null
      const prev = this.goals[i - 1].clusterModelStats
      return (prev && prev.diskStatistics) || null
    }
  }
}
</script>

<style scoped>
.pointer { cursor: pointer; }
</style>
