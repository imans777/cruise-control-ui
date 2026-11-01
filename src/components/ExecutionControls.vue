<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Throttles and concurrency of the ongoing execution, and live controls for them and for their adjusters (POST admin).
     Collapsed by default: the header summarizes them. -->
<template>
  <div class="card mb-3">
    <div class="card-header pointer" @click="open = !open">
      {{ open ? '▼' : '▶' }} Throttles, Concurrency &amp; Live Controls
      <small class="ml-2 header-summary">
        Replication: <b>{{ replicationSummary }}</b>
        <template v-if="logDirRows.length"> &middot; Log dir: <b>{{ logDirSummary }}</b></template>
        <template v-if="concurrencySummary"> &middot; Concurrency: <b>{{ concurrencySummary }}</b></template>
      </small>
    </div>
    <div class="card-body" v-show="open">
      <h6>Throttles</h6>
      <table class="table table-sm table-bordered mb-3">
        <tbody>
          <tr>
            <th style="width: 30%">Replication Throttle (inter-broker)</th>
            <td>
              <!-- the rates the brokers run at: per broker once the concurrency adjuster has adjusted them -->
              <template v-if="replicationRows.length">
                <per-broker-rates :rows="replicationRows" :columns="leaderFollower" />
                <span v-if="replicationPaused" class="badge badge-warning ml-1">paused</span>
                <div v-if="replicationThrottle !== null && replicationThrottle !== undefined" class="small text-muted" title="The rate of the brokers the adjuster has not adjusted (yet). In an execution started without replication_throttle, the adjuster's maximum.">
                  base rate: {{ replicationThrottle | formatBytesRate }} ❓
                </div>
              </template>
              <template v-else-if="replicationThrottle !== null && replicationThrottle !== undefined">
                <b>{{ replicationThrottle | formatBytesRate }}</b> <small class="text-muted">({{ replicationThrottle | formatNumber }} bytes/s)</small>
                <span v-if="Number(replicationThrottle) === 0" class="badge badge-warning ml-1">paused</span>
              </template>
              <span v-else class="text-muted">not throttled</span>
            </td>
          </tr>
          <tr>
            <th>Log Dir Throttle (intra-broker)</th>
            <td>
              <!-- one value per broker with intra-broker movements: one execution sets one rate, so odd brokers stand out -->
              <per-broker-rates v-if="logDirRows.length" :rows="logDirRows" :columns="[{ key: 'rate', label: 'Log Dir Throttle' }]" :highlight-odd="true" />
              <span v-else class="text-muted">not throttled</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="form-row align-items-start mb-2">
        <label class="col-md-3 col-form-label-sm" title="The replication throttle of this execution's inter-broker movements. Pause sets it to 0: throttled moves halt until it is changed again. Remove is refused while the throttle adjuster is on.">Replication Throttle ❓</label>
        <div class="col-md-3"><throttle-input v-model="replicationThrottleInput" placeholder="new rate" /></div>
        <div class="col-md-6">
          <button class="btn btn-sm btn-primary" :disabled="busy || replicationThrottleInput === null" @click="send({ replication_throttle: replicationThrottleInput })">Set</button>
          <button class="btn btn-sm btn-warning ml-1" :disabled="busy" @click="send({ replication_throttle: 0 })">Pause (0)</button>
          <button class="btn btn-sm btn-outline-danger ml-1" :disabled="busy" @click="send({ replication_throttle: 'null' })">Remove</button>
        </div>
      </div>
      <div class="form-row align-items-start mb-2">
        <label class="col-md-3 col-form-label-sm" title="The log-dir throttle of this execution's intra-broker movements, on every broker with such movements. Remove restores the value each broker had before.">Log Dir Throttle ❓</label>
        <div class="col-md-3"><throttle-input v-model="logDirThrottleInput" :min="1" placeholder="new rate" /></div>
        <div class="col-md-6">
          <button class="btn btn-sm btn-primary" :disabled="busy || !logDirThrottleInput" @click="send({ log_dir_throttle: logDirThrottleInput })">Set</button>
          <button class="btn btn-sm btn-outline-danger ml-1" :disabled="busy" @click="send({ log_dir_throttle: 'null' })">Remove</button>
        </div>
      </div>
      <div class="form-row align-items-start mb-3">
        <label class="col-md-3 col-form-label-sm" title="Global switch of the concurrency adjuster's replication throttle adjustment (a restart reverts it to concurrency.adjuster.replication.throttle.enabled). Turning it off keeps the throttle at its last value, or the one you set, for the rest of the execution. CC does not report whether it is on; the response shows before/after.">Throttle Adjuster ❓</label>
        <div class="col-md-9">
          <button class="btn btn-sm btn-success" :disabled="busy" @click="send({ replication_throttle_adjustment: true })">Enable</button>
          <button class="btn btn-sm btn-outline-secondary ml-1" :disabled="busy" @click="send({ replication_throttle_adjustment: false })">Disable</button>
        </div>
      </div>

      <h6 title="CC reports the current concurrency only while that kind of movement runs, and never whether an adjuster is on: the responses show before/after.">Concurrency ❓</h6>
      <table class="table table-sm table-bordered mb-2 concurrency">
        <thead class="thead-light">
          <tr>
            <th>Movements</th>
            <th title="Per broker: one value when every broker has the same, otherwise min to max (avg)">Now ❓</th>
            <th>Change To</th>
            <th title="The concurrency adjuster raises or lowers this concurrency by broker metrics during the execution">Adjuster ❓</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in concurrencyRows" :key="c.key">
            <th :title="c.help">{{ c.label }}<template v-if="c.help"> ❓</template></th>
            <td>
              <span v-if="c.now !== null">{{ c.now }}</span>
              <span v-else class="text-muted" :title="c.reported ? 'Reported only while such movements run' : 'CC does not report it'">{{ c.reported ? '—' : 'not reported' }}</span>
            </td>
            <td>
              <div class="input-group input-group-sm concurrency-input">
                <input v-model.number="concurrencyInput[c.key]" type="number" min="1" class="form-control" placeholder="new value">
                <div class="input-group-append">
                  <button class="btn btn-primary" :disabled="busy || !(concurrencyInput[c.key] > 0)" @click="setConcurrency(c)">Set</button>
                </div>
              </div>
            </td>
            <td>
              <template v-if="c.adjuster">
                <button class="btn btn-sm btn-success" :disabled="busy" @click="send({ enable_concurrency_adjuster_for: c.adjuster })">Enable</button>
                <button class="btn btn-sm btn-outline-secondary ml-1" :disabled="busy" @click="send({ disable_concurrency_adjuster_for: c.adjuster })">Disable</button>
              </template>
              <span v-else class="small text-muted">{{ c.noAdjuster }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="form-row align-items-start mb-2">
        <label class="col-md-3 col-form-label-sm" title="min_isr_based_concurrency_adjustment: the adjuster also lowers the concurrency when partitions are (At/Under)MinISR">MinISR-Based Adjustment ❓</label>
        <div class="col-md-9">
          <button class="btn btn-sm btn-success" :disabled="busy" @click="send({ min_isr_based_concurrency_adjustment: true })">Enable</button>
          <button class="btn btn-sm btn-outline-secondary ml-1" :disabled="busy" @click="send({ min_isr_based_concurrency_adjustment: false })">Disable</button>
        </div>
      </div>
      <div class="form-row align-items-start mb-2">
        <label class="col-md-3 col-form-label-sm" title="execution_progress_check_interval_ms: how often the executor checks the movements, which is also how often the adjusters act. The floor is min.execution.progress.check.interval.ms (5000 by default).">Progress Check Interval ❓</label>
        <div class="col-md-3">
          <div class="input-group input-group-sm">
            <input v-model.number="progressCheckIntervalInput" type="number" min="1" class="form-control" placeholder="new value">
            <div class="input-group-append"><span class="input-group-text">ms</span></div>
          </div>
        </div>
        <div class="col-md-6">
          <button class="btn btn-sm btn-primary" :disabled="busy || !(progressCheckIntervalInput > 0)" @click="send({ execution_progress_check_interval_ms: progressCheckIntervalInput })">Set</button>
        </div>
      </div>

      <div v-if="busy" class="alert alert-info mb-0">
        <div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div>
        Applying <code>{{ lastRequest }}</code> ... (a throttle change is answered once the new rate is verified on every broker, which can take tens of seconds)
      </div>
      <div v-else-if="error" class="mb-0">
        <exception :exception="response"></exception>
      </div>
      <div v-else-if="response" class="alert alert-success mb-0">
        <div class="small text-muted mb-1">{{ lastRequest }}</div>
        <div v-for="(v, k) in responseMessages" :key="k" class="response-value"><b>{{ k }}:</b> {{ v }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import ThrottleInput from '@/components/ThrottleInput'
import PerBrokerRates from '@/components/PerBrokerRates'
import { summarizeRates } from '@/throttles'

const LEADER_FOLLOWER = [{ key: 'leader', label: 'Leader' }, { key: 'follower', label: 'Follower' }]
const byBrokerId = (a, b) => Number(a) - Number(b)

// the concurrency of each kind of movement: the admin parameter that changes it, the /state fields that report it (per
// broker: max, min, avg; or one cluster value), and the concurrency adjuster type, if CC has one
const CONCURRENCY = [
  { key: 'inter', label: 'Inter-broker, per broker', param: 'concurrent_partition_movements_per_broker', perBroker: 'ConcurrentPartitionMovementsPerBroker', adjuster: 'INTER_BROKER_REPLICA' },
  { key: 'cluster', label: 'Inter-broker, in the cluster', param: 'max_partition_movements_in_cluster', help: 'max_partition_movements_in_cluster: the cap on inter-broker movements in progress at once', noAdjuster: '—' },
  { key: 'intra', label: 'Intra-broker, per broker', param: 'concurrent_intra_broker_partition_movements', perBroker: 'ConcurrentIntraBrokerPartitionMovementsPerBroker', noAdjuster: 'not adjustable (CC has no adjuster for it)' },
  { key: 'leaderCluster', label: 'Leadership, in the cluster', param: 'concurrent_leader_movements', cluster: 'clusterLeaderMovementConcurrency', adjuster: 'LEADERSHIP_CLUSTER' },
  { key: 'leaderBroker', label: 'Leadership, per broker', param: 'broker_concurrent_leader_movements', perBrokerLeader: 'BrokerLeaderMovementConcurrency', adjuster: 'LEADERSHIP_BROKER' }
]

export default {
  name: 'ExecutionControls',
  components: {
    ThrottleInput,
    PerBrokerRates
  },
  props: {
    // ExecutorState of /state
    state: { type: Object, required: true }
  },
  data () {
    return {
      open: false,
      leaderFollower: LEADER_FOLLOWER,
      replicationThrottleInput: null,
      logDirThrottleInput: null,
      concurrencyInput: { inter: null, cluster: null, intra: null, leaderCluster: null, leaderBroker: null },
      progressCheckIntervalInput: null,
      busy: false,
      error: false,
      response: null,
      lastRequest: ''
    }
  },
  computed: {
    replicationThrottle () {
      return this.state.ongoingReplicationThrottle
    },
    // ongoingReplicationThrottleByBroker: { broker: { leader, follower } } (a plain rate per broker is read as both)
    replicationRows () {
      const m = this.state.ongoingReplicationThrottleByBroker || {}
      return Object.keys(m).sort(byBrokerId).map(b => {
        const v = m[b]
        const leader = Number(v !== null && typeof v === 'object' ? v.leader : v)
        const follower = Number(v !== null && typeof v === 'object' ? v.follower : v)
        return { broker: b, values: { leader, follower } }
      })
    },
    replicationPaused () {
      return this.replicationRows.length > 0 && this.replicationRows.every(r => r.values.leader === 0 && r.values.follower === 0)
    },
    logDirRows () {
      const m = this.state.ongoingLogDirThrottleByBroker || {}
      return Object.keys(m).sort(byBrokerId).map(b => ({ broker: b, values: { rate: Number(m[b]) } }))
    },
    logDirSummary () {
      return summarizeRates(this.logDirRows, [{ key: 'rate', label: 'Log Dir Throttle' }])
    },
    replicationSummary () {
      if (this.replicationRows.length) return this.replicationPaused ? 'paused (0)' : summarizeRates(this.replicationRows, LEADER_FOLLOWER)
      const r = this.replicationThrottle
      if (r === null || r === undefined) return 'not throttled'
      return Number(r) === 0 ? 'paused (0)' : this.$options.filters.formatBytesRate(r)
    },
    concurrencyRows () {
      const s = this.state
      const has = (v) => v !== null && v !== undefined
      const trio = (max, min, avg) => {
        if (!has(max) && !has(min)) return null
        if (max === min) return String(max)
        return min + ' to ' + max + (has(avg) ? ' (avg ' + Number(avg).toFixed(1) + ')' : '')
      }
      return CONCURRENCY.map(c => {
        let now = null
        if (c.perBroker) now = trio(s['maximum' + c.perBroker], s['minimum' + c.perBroker], s['average' + c.perBroker])
        if (c.perBrokerLeader) now = trio(s['maximum' + c.perBrokerLeader], s['minimum' + c.perBrokerLeader], s['average' + c.perBrokerLeader])
        if (c.cluster && has(s[c.cluster])) now = String(s[c.cluster])
        return Object.assign({ now, reported: !!(c.perBroker || c.perBrokerLeader || c.cluster) }, c)
      })
    },
    // the concurrency of the movements that run now
    concurrencySummary () {
      const now = (key) => (this.concurrencyRows.find(c => c.key === key) || {}).now
      if (now('inter') !== null) return now('inter') + ' per broker'
      if (now('intra') !== null) return now('intra') + ' per broker'
      if (now('leaderBroker') !== null) return now('leaderBroker') + ' per broker' + (now('leaderCluster') !== null ? ', ' + now('leaderCluster') + ' in the cluster' : '')
      return null
    },
    responseMessages () {
      if (!this.response || typeof this.response !== 'object') return { response: this.response }
      const out = {}
      Object.keys(this.response).forEach(k => {
        const v = this.response[k]
        if (k === 'version' || v === null || v === undefined || v === '') return
        out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v).trim()
      })
      return out
    }
  },
  methods: {
    setConcurrency (c) {
      const params = {}
      params[c.param] = this.concurrencyInput[c.key]
      this.send(params)
    },
    send (params) {
      const vm = this
      const url = vm.$helpers.getURL('admin', Object.assign({}, params))
      vm.lastRequest = Object.keys(params).map(k => k + '=' + params[k]).join('&')
      vm.busy = true
      vm.error = false
      vm.response = null
      vm.$http.post(url, null, { withCredentials: true }).then((r) => {
        vm.busy = false
        vm.response = r.data
        vm.$emit('changed')
      }, (e) => {
        vm.busy = false
        vm.error = true
        vm.response = e && e.response ? e.response.data : (e.message || e)
        vm.$emit('changed')
      })
    }
  }
}
</script>

<style scoped>
.response-value { white-space: pre-wrap; }
.pointer { cursor: pointer; }
.header-summary { font-weight: normal; }
.concurrency-input { max-width: 220px; }
.concurrency th, .concurrency td { vertical-align: middle; }
</style>
