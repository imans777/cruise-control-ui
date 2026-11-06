<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-if='!loading && !detectedUserTaskId' class='alert alert-danger'>
      <strong>User-Task-ID</strong> header is not found in the response from the server. If you are using <a target=_blank href='https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'>CORS</a>, please add necessary configuration to your Cruise Control as described <a target=_blank href='https://github.com/linkedin/cruise-control-ui/wiki/CORS-Method'>in this wiki.</a>
    </div>

    <div class="card card-body py-2 mb-3 proposals-bar">
      <div class="d-flex flex-wrap align-items-center">
        <!-- inter-broker proposals (brokers) or intra-broker ones (the disks inside brokers) -->
        <segmented-control :value="rebalanceDisk" :options="kindOptions" :disabled="loading" aria-label="Proposal kind" @input="setKind">Proposals for</segmented-control>
        <button type="button" :class="['btn', 'btn-sm', 'ml-2', showOptions ? 'btn-primary' : 'btn-outline-secondary']" :aria-expanded="showOptions ? 'true' : 'false'" @click="showOptions = !showOptions">
          <i class="bi bi-sliders"></i> Options<template v-if="appliedCount"> &middot; {{ appliedCount }} set</template>
        </button>
        <small class="text-muted ml-3">{{ rebalanceDisk ? 'Moves replicas between the disks of each broker; can take minutes on a big cluster.' : 'Moves replicas and leadership between brokers.' }}</small>
      </div>
      <form v-if="showOptions" class="mt-3 proposal-options" @submit.prevent="applyOptions">
        <h6>Goals <small class="text-muted">({{ rebalanceDisk ? 'intra-broker goals; none = intra.broker.goals' : 'none = CC default goals' }})</small></h6>
        <goal-picker v-model="options.goals" :goals="pickableGoals" />
        <div class="form-row mt-3">
          <div class="form-group col-md-4">
            <label :title="rebalanceDisk ? 'destination_broker_ids: limits the disk rebalance (and the disk statistics) to these brokers (none = every broker)' : 'destination_broker_ids: the brokers replicas may move to (none = any broker)'">{{ rebalanceDisk ? 'Brokers' : 'Destination Brokers' }} <i class="bi bi-question-circle help-icon"></i></label>
            <broker-picker v-model="options.destination_broker_ids" :brokers="knownBrokers" :empty-text="rebalanceDisk ? 'none: every broker' : 'none: any broker'" />
          </div>
          <div class="form-group col-md-4">
            <label title="Only these topics may move (full-match regex). Overrides the configured topic exclusion, so __.* topics can be included explicitly. Mutually exclusive with Excluded Topics.">Included Topics <i class="bi bi-question-circle help-icon"></i></label>
            <topic-input v-model="options.included_topics" :disabled="!!options.excluded_topics" placeholder="(none) regex, e.g. topic1|topic2" />
          </div>
          <div class="form-group col-md-4">
            <label title="These topics may not move (regex). Mutually exclusive with Included Topics.">Excluded Topics <i class="bi bi-question-circle help-icon"></i></label>
            <topic-input v-model="options.excluded_topics" :disabled="!!options.included_topics" placeholder="(CC Default) regex" />
          </div>
        </div>
        <div class="text-right">
          <button type="button" class="btn btn-sm btn-outline-secondary mr-1" @click="resetOptions" :disabled="loading">Reset</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="loading">Get Proposals</button>
        </div>
      </form>
    </div>

    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData' :task-id="taskId">
        <button v-if='showAsyncRefreshButton' class="btn btn-sm btn-outline-secondary" @click='getProposals()'><i class="bi bi-arrow-clockwise"></i> Check now</button>
      </async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <loading-state />
    </div>
    <div v-else-if='loaded'>
      <p class="small text-muted mb-2"><i class="bi bi-info-circle"></i> The cluster as Cruise Control would leave it after these proposals: the values show before and after the optimization.</p>
      <optimization-result :result="result" :title="(rebalanceDisk ? 'Intra Broker Rebalance Disk ' : '') + 'Proposal Changes Summary'" :show-host-load="true" :goals-open="true" :brokers="rebalanceDisk && applied.destination_broker_ids.length ? applied.destination_broker_ids : null" />
    </div>
  </div>
</template>

<script>
import goals from '@/goals'
import OptimizationResult from '@/components/OptimizationResult'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'
import BrokerPicker from '@/components/BrokerPicker'
import SegmentedControl from '@/components/SegmentedControl'
import GoalPicker from '@/components/GoalPicker'

const EMPTY_OPTIONS = () => ({ goals: [], destination_broker_ids: [], included_topics: '', excluded_topics: '' })

export default {
  name: 'Proposals',
  props: {
    group: String,
    cluster: String
  },
  components: {
    OptimizationResult,
    BrokerPicker,
    SegmentedControl,
    GoalPicker
  },
  data () {
    return {
      loading: false,
      loaded: false,
      error: false,
      errorData: null,
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      rebalanceDisk: false,
      showOptions: false,
      kindOptions: [{ value: false, label: 'Brokers', title: 'Inter-broker proposals' }, { value: true, label: 'Disks', title: 'Intra Broker Rebalance Disk Proposal: between the disks of each broker' }],
      options: EMPTY_OPTIONS(), // being edited
      applied: EMPTY_OPTIONS(), // part of the URL
      result: {},
      knownBrokers: [], // [{ id, host, rack }] for the broker picker: from the broker load of the results, else kafka_cluster_state
      showAsyncRefreshButton: false,
      detectedUserTaskId: false // true in case the response has user-task-id
    }
  },
  created () {
    this.argsChanged()
  },
  beforeDestroy () {
    if (this.argsRetryTimer) {
      clearTimeout(this.argsRetryTimer)
    }
    if (this.asyncRetryTimer) {
      clearTimeout(this.asyncRetryTimer)
    }
  },
  watch: {
    showOptions (shown) {
      if (shown && !this.knownBrokers.length) this.fetchBrokers()
    },
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    }
  },
  computed: {
    // how many options the shown proposals were asked with
    appliedCount () {
      const a = this.applied
      return (a.goals.length ? 1 : 0) + (a.destination_broker_ids.length ? 1 : 0) + (a.included_topics ? 1 : 0) + (a.excluded_topics ? 1 : 0)
    },
    taskId () {
      return this.$store.getters.getTaskId(this.url)
    },
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    },
    pickableGoals () {
      const group = this.rebalanceDisk ? 3 : 1
      return goals.goals.filter(g => !g.skip && g.group === group)
    },
    url () {
      // loadBeforeOptimization is removed and is available only when
      // we pass verbose=true flag
      const params = { rebalance_disk: this.rebalanceDisk, verbose: true }
      // goals run in the order they were ticked (their priority)
      const picked = this.applied.goals.filter(g => this.pickableGoals.some(x => x.goal === g))
      if (picked.length) params.goals = picked
      if (this.applied.destination_broker_ids.length) params.destination_broker_ids = this.applied.destination_broker_ids.join(',')
      if (this.applied.included_topics) params.included_topics = this.applied.included_topics
      if (this.applied.excluded_topics) params.excluded_topics = this.applied.excluded_topics
      return this.$helpers.getURL('proposals', params)
    }
  },
  methods: {
    setKind (disk) {
      if (disk === this.rebalanceDisk) return
      this.rebalanceDisk = disk
      this.onRebalanceDisk()
    },
    onRebalanceDisk () {
      // goals of the other mode are not accepted
      this.options.goals = []
      this.applied.goals = []
      this.loaded = false
      this.argsChanged()
    },
    // the brokers of a result's broker load (every broker, also when the request is limited to some)
    rememberBrokers (data) {
      const brokers = ((data && (data.loadAfterOptimization || data.loadBeforeOptimization)) || {}).brokers || []
      const byId = {}
      this.knownBrokers.concat(brokers.map(b => ({ id: b.Broker, host: b.Host, rack: b.Rack && b.Rack !== b.Host ? b.Rack : '' })))
        .forEach(b => { byId[b.id] = b })
      this.knownBrokers = Object.values(byId).sort((a, b) => a.id - b.id)
    },
    // no result yet: the broker ids of kafka_cluster_state
    fetchBrokers () {
      fetchCC(this.$helpers.getURL('kafka_cluster_state')).then((r) => {
        const ids = Object.keys(((r.data || {}).KafkaBrokerState || {}).ReplicaCountByBrokerId || {})
        if (!this.knownBrokers.length) this.knownBrokers = ids.map(id => ({ id: Number(id), host: '', rack: '' })).sort((a, b) => a.id - b.id)
      }).catch(() => {})
    },
    applyOptions () {
      this.applied = JSON.parse(JSON.stringify(this.options))
      this.loaded = false
      this.argsChanged()
    },
    resetOptions () {
      this.options = EMPTY_OPTIONS()
      this.applyOptions()
    },
    argsChanged (retries) {
      retries = retries || 0
      const newurl = this.$store.getters.getnewurl(this.group, this.cluster)
      if (!newurl) {
        if (retries < ARGS_RETRY_MAX) {
          this.argsRetryTimer = setTimeout(() => this.argsChanged(retries + 1), ARGS_RETRY_DELAY)
        }
        return
      }
      this.$store.commit('seturl', newurl)
      this.loaded = false
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getProposals()
    },
    getProposals () {
      const vm = this
      vm.error = false
      vm.async = false
      vm.loading = true
      const fetchOptions = {}
      const task = this.taskId
      if (task) {
        fetchOptions.headers = { 'User-Task-ID': task }
      }
      fetchCC(vm.url, fetchOptions).then((result) => {
        vm.detectedUserTaskId = result.headers.has('user-task-id')
        if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with 200-OK status code. Please file a bug here https://github.com/linkedin/cruise-control/issues'
        } else if (result.type === 'async') {
          vm.loading = false
          const taskId = result.headers.has('user-task-id') ? result.headers.get('user-task-id') : null
          vm.$store.commit('setTaskId', { url: vm.url, taskid: taskId })
          vm.async = true
          vm.asyncData = result.data
          vm.showAsyncRefreshButton = true
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          // Only auto-retry if we have a task ID to poll; without one, each
          // retry starts a new expensive proposal computation on CC.
          if (taskId) {
            vm.asyncRetryTimer = setTimeout(() => vm.getProposals(), ASYNC_RETRY_DELAY)
          }
        } else if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.error = true
          vm.errorData = result.data
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.loading = false
          vm.error = false
          vm.result = result.data
          vm.rememberBrokers(result.data)
          vm.errorData = null
          vm.loaded = true
          // Clear the cached task ID so the next refresh fetches fresh data
          vm.$store.commit('setTaskId', { url: vm.url, taskid: null })
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.error = true
        vm.loading = false
        vm.errorData = e.message || e
      })
    }
  }
}
</script>
