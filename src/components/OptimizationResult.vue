<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- An OptimizationResult (proposals, rebalance, add/remove/demote broker, remove_disks, fix_offline_replicas, topic_configuration) -->
<template>
  <div>
    <h4 v-if="title">{{ title }}</h4>
    <div class="stat-grid cols-4">
      <stat-tile label="Inter-Broker Replica Movements" icon="bi-arrow-left-right" :tone="summary.numReplicaMovements > 0 ? 'primary' : null" :value="summary.numReplicaMovements | formatNumber" :sub="$options.filters.formatUnits(summary.dataToMoveMB) + ' to move'" />
      <stat-tile label="Intra-Broker Replica Movements" icon="bi-device-hdd" :tone="summary.numIntraBrokerReplicaMovements > 0 ? 'primary' : null" :value="summary.numIntraBrokerReplicaMovements | formatNumber" :sub="$options.filters.formatUnits(summary.intraBrokerDataToMoveMB) + ' to move'" />
      <stat-tile label="Leader Movements" icon="bi-star" :tone="summary.numLeaderMovements > 0 ? 'primary' : null" :value="summary.numLeaderMovements | formatNumber" />
      <stat-tile label="Balancedness Score" icon="bi-speedometer2" :tone="scoreAfter - scoreBefore > 0 ? 'success' : null">
        {{ scoreBefore }}% <i class="bi bi-arrow-right score-arrow"></i> <span :class="scoreAfter - scoreBefore > 0 ? 'text-success' : null">{{ scoreAfter }}%</span>
        <template #sub>{{ summary.recentWindows | formatNumber }} recent windows &middot; {{ summary.monitoredPartitionsPercentage | formatDecimal }} % of the partitions monitored</template>
      </stat-tile>
    </div>
    <p v-if="summary.excludedTopics" class="small">
      <b>Excluded Topics:</b>
      <span v-if="!summary.excludedTopics.length" class="text-muted">none</span>
      <template v-for="(t, i) in summary.excludedTopics"><code :key="t">{{ t }}</code><template v-if="i < summary.excludedTopics.length - 1">, </template></template>
      <template v-if="summary.provisionStatus">&nbsp; <b>Provision Status:</b> {{ summary.provisionStatus }}</template>
      <template v-if="summary.provisionRecommendation"> ({{ summary.provisionRecommendation }})</template>
    </p>

    <template v-if="summary.diskStatisticsBefore || summary.diskStatisticsAfter">
      <h4 :class="['collapse-title', { open: showDiskStats }]" @click="showDiskStats = !showDiskStats">
        <i class="bi bi-chevron-right chev"></i> Disk Balance
      </h4>
      <disk-balance-stats v-if="showDiskStats" :before="summary.diskStatisticsBefore" :after="summary.diskStatisticsAfter" />
    </template>

    <load-diff-table v-if="result.loadAfterOptimization" :per="'broker'" :loadBefore="result.loadBeforeOptimization || {}" :loadAfter="result.loadAfterOptimization" :brokers="brokers"></load-diff-table>
    <load-diff-table v-if="showHostLoad && result.loadAfterOptimization" :per="'host'" :loadBefore="result.loadBeforeOptimization || {}" :loadAfter="result.loadAfterOptimization" :brokers="brokers"></load-diff-table>

    <h4 :class="['collapse-title', { open: showMovements }]" @click="showMovements = !showMovements">
      <i class="bi bi-chevron-right chev"></i> Proposed Partition Movements ({{ movements.length }})
    </h4>
    <inter-broker-movement-table v-if="showMovements && movements.length" title="" :movements="movements"></inter-broker-movement-table>
    <p v-if="!result.proposals" class="small text-muted">The response has no proposals (they are returned with verbose=true only).</p>

    <h4 :class="['collapse-title', { open: showGoals }]" @click="showGoals = !showGoals">
      <i class="bi bi-chevron-right chev"></i> Goals
    </h4>
    <p v-if="showGoals && goals.length > 1" class="small text-muted mb-1">
      Each goal's statistics are compared with the ones after the previous goal:
      <span class="text-success font-weight-bold">green</span> = better, <span class="text-danger font-weight-bold">red</span> = worse
      (a lower max and std, a higher min, fewer unbalanced disks); hover a value for the previous one.
      The first goal's disk statistics are compared with the ones before the optimization.
    </p>
    <!-- one row per goal, in the order they ran: the goals that changed something are open; the cluster model's size once -->
    <div v-if="showGoals && goals.length" class="goal-results">
      <div class="goal-results-meta">
        <span v-if="modelMeta">The cluster model: <b>{{ modelMeta.brokers }}</b> brokers &middot; <b>{{ modelMeta.replicas }}</b> replicas &middot; <b>{{ modelMeta.topics }}</b> topics</span>
        <span class="ml-auto"><a href="#" @click.prevent="setAllGoals(true)">expand all</a> &middot; <a href="#" @click.prevent="setAllGoals(false)">collapse all</a></span>
      </div>
      <div v-for='(goal, i) in goals' :key='goal.goal' :class="['goal-result', 'status-' + goalTone(goal)]">
        <div :class="['goal-result-head', 'collapse-title', { open: goalOpen(goal) }]" @click="toggleGoal(goal)">
          <i class="bi bi-chevron-right chev"></i>
          <span class="goal-no">{{ i + 1 }}</span>
          <strong class="goal-name">{{ goal.goal }}</strong>
          <!-- property renamed from goalViolated -> status upstream -->
          <span :class="['badge', 'badge-' + goalTone(goal)]">{{ goalStatus(goal) }}</span>
        </div>
        <div v-show="goalOpen(goal)" class="goal-result-body">
          <goal :goal='goal' :previous='i > 0 ? goals[i - 1].clusterModelStats : null' :disk-reference='diskReference(i)' :hide-metadata="true" />
        </div>
      </div>
    </div>
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
    // the brokers the request acts on when the others' load does not change (a disk rebalance with destination_broker_ids, removed disks)
    brokers: { type: Array, default: null },
    goalsOpen: { type: Boolean, default: true }
  },
  data () {
    return {
      showDiskStats: true,
      showMovements: false,
      showGoals: this.goalsOpen,
      openGoals: {} // goal name -> open, once toggled (every goal is open by default)
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
    },
    // the brokers / replicas / topics of the model (the same for every goal)
    modelMeta () {
      const g = this.goals.find(x => x.clusterModelStats && x.clusterModelStats.metadata)
      return g ? g.clusterModelStats.metadata : null
    }
  },
  methods: {
    goalStatus (goal) {
      if (Object.prototype.hasOwnProperty.call(goal, 'goalViolated')) return goal.goalViolated ? 'VIOLATED' : 'NOT VIOLATED'
      return goal.status
    },
    goalTone (goal) {
      const s = this.goalStatus(goal) || ''
      if (s === 'FIXED') return 'success'
      if (s === 'VIOLATED') return 'danger'
      return 'secondary'
    },
    goalOpen (goal) {
      return Object.prototype.hasOwnProperty.call(this.openGoals, goal.goal) ? this.openGoals[goal.goal] : true
    },
    toggleGoal (goal) {
      this.$set(this.openGoals, goal.goal, !this.goalOpen(goal))
    },
    setAllGoals (open) {
      this.goals.forEach(g => this.$set(this.openGoals, g.goal, open))
    },
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
.goal-results-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--muted); font-size: 0.84rem; }
.goal-results-meta b { color: var(--text-strong); }
.goal-result { margin-bottom: 6px; border: 1px solid var(--line); border-left: 3px solid var(--glass-border); border-radius: var(--radius-sm); background: var(--row-alt); }
.goal-result.status-success { border-left-color: var(--success); }
.goal-result.status-danger { border-left-color: var(--danger); }
.goal-result-head { margin: 0; padding: 8px 12px; font-size: 0.9rem; }
.goal-no { color: var(--muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.goal-name { color: var(--text-strong); font-weight: 600; }
.goal-result-body { padding: 4px 12px 10px; }
.score-arrow { font-size: 0.7em; color: var(--muted); vertical-align: middle; }
.pointer { cursor: pointer; }
</style>
