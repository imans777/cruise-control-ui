<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <div class="alert alert-info" v-if='!hideHelperURL'>
      <b>URL ({{group}}, {{cluster}}):</b> <a target=_blank :href='url'>{{ url }}</a>
    </div>
    <div v-if='!loading && !detectedUserTaskId' class='alert alert-danger'>
      <strong>User-Task-ID</strong> header is not found in the response from the server. If you are using <a target=_blank href='https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'>CORS</a>, please add necessary configuration to your Cruise Control as described <a target=_blank href='https://github.com/linkedin/cruise-control-ui/wiki/CORS-Method'>in this wiki.</a>
    </div>

    <div class="alert alert-secondary">
      <div class="form-check">
        <input class="form-check-input" type="checkbox" v-model='rebalanceDisk' @change="onRebalanceDisk" :disabled="loading">
        <label class="form-check-label" title="In large clusters, this can take minutes to respond, so please be patient and don't overload the server by repeatingly switching this checkbox or moving between tabs"> Switch to "Intra Broker Rebalance Disk Proposal" ❓</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" v-model='showOptions'>
        <label class="form-check-label">Show Proposal Options</label>
      </div>
      <form v-if="showOptions" class="mt-2" @submit.prevent="applyOptions">
        <div class="row">
          <div class="col-md-4">
            <h6>Goals <small class="text-muted">({{ rebalanceDisk ? 'intra-broker goals; none = intra.broker.goals' : 'none = CC default goals' }})</small></h6>
            <p class="small text-muted mb-1">The selected goals run in the listed order, highest priority first. <b>Bold</b>: hard goals. <span class="text-muted">Gray</span>: goals only some clusters use (hover for why).</p>
            <div class="small mb-1">
              Select: <a href="#" title="Every goal except the gray ones: those fail the request on clusters that are not set up for them (Broker Set Aware without broker sets, for one)" @click.prevent="options.goals = pickableGoals.filter(g => !g.situational).map(g => g.goal)">all</a>
              &middot; <a href="#" @click.prevent="options.goals = []">none</a>
            </div>
            <div class="form-check" v-for="g in pickableGoals" :key="g.goal">
              <input class="form-check-input" type="checkbox" :value="g.goal" v-model="options.goals">
              <label class="form-check-label" :title="g.description" :class="{ 'text-muted': g.situational }">
                <b v-if='g.hardGoal'>{{ g.goal.replace(/Goal/, '') | splitCamelCase }}</b>
                <template v-else>{{ g.goal.replace(/Goal/, '') | splitCamelCase }}</template>
              </label>
            </div>
          </div>
          <div class="col-md-8">
            <div class="form-row mb-2">
              <label class="col-sm-4" :title="rebalanceDisk ? 'destination_broker_ids: limits the disk rebalance (and the disk statistics) to these brokers (none = every broker)' : 'destination_broker_ids: the brokers replicas may move to (none = any broker)'">{{ rebalanceDisk ? 'Brokers' : 'Destination Brokers' }} ❓</label>
              <div class="col-sm-8">
                <broker-picker v-model="options.destination_broker_ids" :brokers="knownBrokers" :empty-text="rebalanceDisk ? 'none: every broker' : 'none: any broker'" />
              </div>
            </div>
            <div class="form-row mb-2">
              <label class="col-sm-4" title="Only these topics may move (full-match regex). Overrides the configured topic exclusion, so __.* topics can be included explicitly. Mutually exclusive with Excluded Topics.">Included Topics ❓</label>
              <div class="col-sm-8">
                <input type="text" class="form-control form-control-sm" v-model="options.included_topics" :disabled="!!options.excluded_topics" placeholder="(none) regex, e.g. topic1|topic2">
              </div>
            </div>
            <div class="form-row mb-2">
              <label class="col-sm-4" title="These topics may not move (regex). Mutually exclusive with Included Topics.">Excluded Topics ❓</label>
              <div class="col-sm-8">
                <input type="text" class="form-control form-control-sm" v-model="options.excluded_topics" :disabled="!!options.included_topics" placeholder="(CC Default) regex">
              </div>
            </div>
            <div class="text-right">
              <button type="button" class="btn btn-sm btn-outline-secondary mr-1" @click="resetOptions" :disabled="loading">Reset</button>
              <button type="submit" class="btn btn-sm btn-primary" :disabled="loading">Get Proposals</button>
            </div>
          </div>
        </div>
      </form>
    </div>

    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <div class="alert alert-info text-center" v-if='showAsyncRefreshButton'>
        <button class="btn btn-sm btn-secondary" @click='getProposals()'>⟳ Refresh View Now (Task-Id: {{ taskId }} )</button>
      </div>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div> Loading ...</div>
    </div>
    <div v-else-if='loaded'>
      <div class="alert alert-info">
        <b>Help:</b>This page shows the state of the kafka cluster based on the optimized load calculation. Values before and after optimized load are shown respectively.
      </div>
      <optimization-result :result="result" :title="(rebalanceDisk ? 'Intra Broker Rebalance Disk ' : '') + 'Proposal Changes Summary'" :show-host-load="true" :goals-open="true" />
    </div>
  </div>
</template>

<script>
import goals from '@/goals'
import OptimizationResult from '@/components/OptimizationResult'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'
import BrokerPicker from '@/components/BrokerPicker'

const EMPTY_OPTIONS = () => ({ goals: [], destination_broker_ids: [], included_topics: '', excluded_topics: '' })

export default {
  name: 'Proposals',
  props: {
    group: String,
    cluster: String
  },
  components: {
    OptimizationResult,
    BrokerPicker
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
      // goals run in the listed order (their priority), not in the order they were ticked
      if (this.applied.goals.length) params.goals = this.pickableGoals.map(g => g.goal).filter(g => this.applied.goals.includes(g))
      if (this.applied.destination_broker_ids.length) params.destination_broker_ids = this.applied.destination_broker_ids.join(',')
      if (this.applied.included_topics) params.included_topics = this.applied.included_topics
      if (this.applied.excluded_topics) params.excluded_topics = this.applied.excluded_topics
      return this.$helpers.getURL('proposals', params)
    }
  },
  methods: {
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
