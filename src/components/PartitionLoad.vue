<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-if='!loading && loaded && !detectedUserTaskId' class='alert alert-danger'>
      <strong>User-Task-ID</strong> header is not found in the response from the server. If you are using <a target=_blank href='https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'>CORS</a>, please add necessary configuration to your Cruise Control as described <a target=_blank href='https://github.com/linkedin/cruise-control-ui/wiki/CORS-Method'>in this wiki.</a>
    </div>
    <div class="card card-body mb-3 pl-form">
      <form @submit.prevent='acceptTos()'>
        <!-- by topic: the partitions and their load; by broker: the replicas of the picked brokers, disk by disk -->
        <div class="mb-3 pl-switches">
          <segmented-control :value="mode" :options="modeOptions" aria-label="Partition load of" @input="setMode">Partitions of</segmented-control>
          <segmented-control v-if="mode === 'topic'" v-model="resource" :options="resourceOptions" aria-label="Sort by resource" title="resource: the partitions come sorted by their load of this resource, the heaviest first">Sort by</segmented-control>
        </div>
        <div v-if="mode === 'topic'" class="form-row">
          <div class="form-group col-md-2">
            <label># Entries</label>
            <input type="number" class="form-control form-control-sm" v-model='numRecords'>
          </div>
          <div class="form-group col-md-6">
            <label>Topic Regex</label>
            <topic-input v-model='topicName' placeholder="(all topics)" />
          </div>
          <div class="form-group col-md-2">
            <label>Min Partition #</label>
            <input type="number" min="-1" class="form-control form-control-sm" v-model='partitionRangeMin' @change="onPartitionMinChanged">
          </div>
          <div class="form-group col-md-2">
            <label>Max Partition #</label>
            <input type="number" min="-1" class="form-control form-control-sm" v-model='partitionRangeMax' @change="onPartitionMaxChanged">
          </div>
        </div>
        <div v-else class="form-row">
          <!-- brokerid; the brokers are fetched (kafka_cluster_state, Kafka metadata) when the field is first used -->
          <div class="form-group col-md-8" @focusin="loadBrokers">
            <label title="brokerid with populate_disk_info: every partition with a replica on these brokers, and the disk of each replica">Brokers <i class="bi bi-question-circle help-icon"></i></label>
            <broker-picker v-model="brokerIds" :brokers="knownBrokers" :loading="brokersLoading" empty-text="pick the brokers to see their disks" />
          </div>
        </div>
        <!-- TODO: Use date/time picker which requies jquery
        <div class="form-row">
          <div class="form-group col-md-6">
            <label for="inputAddress">Start Time</label>
            <input type="number" min=0 class="form-control" v-model='startTimestamp'>
          </div>
          <div class="form-group col-md-6">
            <label for="inputAddress">End Time</label>
            <input type="number" min=0 class="form-control" v-model='endTimestamp'>
          </div>
        </div>
        -->
        <div class="d-flex flex-wrap align-items-center pl-actions">
          <label class="chip-check"><input type="checkbox" v-model='allowCapacityEstimation'> Allow Capacity Estimation</label>
          <label class="chip-check"><input type="checkbox" v-model='maxLoad'> Max Load</label>
          <label v-if="mode === 'topic'" class="chip-check" title="populate_disk_info: adds the logdir of the leader and of each follower (JBOD)"><input type="checkbox" v-model='populateDiskInfo'> Show Logdirs <i class="bi bi-question-circle help-icon"></i></label>
          <label class="chip-check"><input type="checkbox" v-model='showURL'> Show URL (Debug)</label>
          <button type="submit" class="btn btn-primary ml-auto" :disabled="mode === 'broker' && !brokerIds.length">{{ mode === 'broker' ? 'Show Replicas by Disk' : 'Show Partition Load' }}</button>
        </div>
        <code v-if='showURL' class="d-block mt-2">{{ url }}</code>
      </form>
      <!--
        GET /kafkacruisecontrol/partition_load?
        resource=[RESOURCE]&
        start=[START_TIMESTAMP]&
        end=[END_TIMESTAMP]&
        json=[true/false]&
        entries=[MAX_NUMBER_OF_PARTITION_LOAD_ENTRIES_TO_RETURN]&
        topic=[TOPIC]&
        partition=[START_PARTITION_INDEX-END_PARTITION_INDEX]&
        allow_capacity_estimation=[true/false]&
        min_valid_partition_ratio=[PERCENTAGE]&
        max_load=[true/false]
      -->
    </div>
    <div v-if="error">
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData' :task-id="taskId">
        <button v-if='showAsyncRefreshButton' class="btn btn-sm btn-outline-secondary" @click='getPartitionLoad()'><i class="bi bi-arrow-clockwise"></i> Check now</button>
      </async-task>
    </div>
    <div v-else-if="!loaded && loading">
      <loading-state />
    </div>
    <!-- by broker: each picked broker, then its disks (the empty and offline ones too) -->
    <div v-else-if="loaded && shownMode === 'broker'" class="card card-body mb-3 by-disk">
      <h5 class="by-disk-title"><i class="bi bi-device-hdd"></i> Replicas by disk
        <small class="text-muted">click a disk for its replicas &middot; size: the partition's (its leader's)</small>
        <a href="#" class="small ml-auto" @click.prevent="toggleAllDisks">{{ allDisksOpen ? 'Collapse all' : 'Expand all' }}</a></h5>
      <table class="table table-sm table-bordered mb-0">
        <thead>
          <tr>
            <th rowspan="2">Disk</th><th rowspan="2">Replicas</th><th rowspan="2">Leaders</th><th rowspan="2">Size</th>
            <th rowspan="2" title="The disk's share of the broker's size">Share <i class="bi bi-question-circle help-icon"></i></th>
            <th colspan="3" class="text-center" :title="ioHelp">Disk I/O <i class="bi bi-question-circle help-icon"></i></th>
            <th rowspan="2"></th>
          </tr>
          <tr><th v-for="k in ioKeys" :key="k.key" :title="ioHelp">{{ k.label }}</th></tr>
        </thead>
        <tbody>
          <template v-for="b in brokerDisks">
            <tr :key="'broker-' + b.broker" class="broker-row" :data-broker="b.broker">
              <td colspan="9">
                <span class="id-pill">{{ b.broker }}</span>
                <span class="broker-sum">{{ b.disks.length }} disk{{ b.disks.length === 1 ? '' : 's' }} &middot; {{ b.replicas | formatNumber }} replicas &middot; {{ b.leaders | formatNumber }} leaders &middot; {{ b.sizeMB | formatUnits }} &middot; I/O in {{ b.leaderIn + b.followerIn | formatNetworkUnits }}, out {{ b.out | formatNetworkUnits }}</span>
                <span v-if="b.offline" class="text-danger"> &middot; {{ b.offline }} offline</span>
              </td>
            </tr>
            <template v-for="g in b.disks">
              <tr :key="g.key" :class="['disk-row', { pointer: g.replicas.length }]" :data-disk="b.broker + ':' + (g.logdir || 'unknown')" @click="g.replicas.length && $set(openDisks, g.key, !openDisks[g.key])">
                <td class="disk-cell"><code v-if="g.logdir">{{ g.logdir }}</code><span v-else class="text-muted">unknown</span>
                  <span v-if="g.offline" class="badge badge-danger ml-1">offline</span></td>
                <td><value-cell :value="g.replicas.length" /></td>
                <td><value-cell :value="g.leaders" /></td>
                <td><value-cell :value="g.sizeMB" :text="$options.filters.formatUnits(g.sizeMB)" /></td>
                <td><value-cell :value="g.share" :text="g.share.toFixed(1) + ' %'" /></td>
                <td v-for="k in ioKeys" :key="k.key" :data-io="k.key">
                  <div :class="{ 'table-warning': g.io[k.key].flagged }" :title="ioTitle(g, k)"><value-cell :value="g[k.key]" :text="$options.filters.formatNetworkUnits(g[k.key])" /></div>
                </td>
                <td class="text-right"><i v-if="g.replicas.length" :class="['bi', openDisks[g.key] ? 'bi-chevron-down' : 'bi-chevron-right']"></i></td>
              </tr>
              <tr v-if="openDisks[g.key] && g.replicas.length" :key="g.key + '-replicas'" class="disk-replicas">
                <td colspan="9">
                  <span v-for="rep in g.replicas" :key="rep.topic + '-' + rep.partition" :class="['replica-chip', { leader: rep.leader }]" :title="rep.leader ? 'Leader replica' : 'Follower replica'">
                    {{ rep.topic }}-{{ rep.partition }}<i v-if="rep.leader" class="bi bi-star-fill"></i> <small>{{ rep.sizeMB | formatUnits }}</small>
                  </span>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
    <template v-else-if='records.length > 0'>
    <p v-if="records.length >= Number(numRecords)" class="small text-muted mb-2"><i class="bi bi-info-circle"></i> The first {{ records.length }} partitions (# Entries): raise # Entries to see them all.</p>
    <table class="table table-sm table-bordered">
      <thead>
        <tr>
          <th :key='h' v-for="h in header">{{ headerLabel(h) }}</th>
        </tr>
      </thead>
      <transition-group name="fade" tag="tbody">
        <tr :key='r.topic + "-" + r.partition' v-for="r in records">
          <td v-for='(hv, hk) in header' :key="hk">
            <template v-if='colUnits[hk] === "disk"'>
              <value-cell :value="r[hv]" :text="$options.filters.formatUnits(r[hv] != null ? r[hv] : '')" />
            </template>
            <template v-else-if='colUnits[hk] === "pct"'>
              <value-cell :value="r[hv]" :text="(r[hv] != null ? Number(r[hv]).toFixed(2) : '') + '%'" />
            </template>
            <template v-else-if='colUnits[hk] === "network"'>
              <value-cell :value="r[hv]" :text="$options.filters.formatNetworkUnits(r[hv] != null ? r[hv] : '')" />
            </template>
            <!-- with populate_disk_info, each replica's logdir next to its broker -->
            <template v-else-if='hv === "leader" && r[hv] != null'>
              <span class="replica-dir"><span class="id-pill">{{ r[hv] }}</span><template v-if="hasLogdirs"><code v-if="r.leaderLogdir">{{ r.leaderLogdir }}</code><span v-else class="text-muted">unknown</span></template></span>
            </template>
            <template v-else-if='hv === "followers" && Array.isArray(r[hv])'>
              <template v-if="hasLogdirs">
                <div v-for="(f, fi) in r[hv]" :key="fi" class="replica-dir"><span class="id-pill">{{ f }}</span><code v-if="(r.followerLogdirs || [])[fi]">{{ r.followerLogdirs[fi] }}</code><span v-else class="text-muted">unknown</span></div>
              </template>
              <span v-else class="id-list"><span v-for="(f, fi) in r[hv]" :key="fi" class="id-pill">{{ f }}</span></span>
            </template>
            <template v-else-if='colUnits[hk] === "int"'>
              {{ r[hv] != null ? parseInt(r[hv], 10) : '' }}
            </template>
            <template v-else>
              {{ r[hv] }}
            </template>
          </td>
        </tr>
      </transition-group>
    </table>
    </template>
    <div class="card card-body text-center empty-state" v-if='loaded && records.length == 0 && shownMode !== "broker"'><i class="bi bi-search empty-icon"></i>No partition matches: try another topic regex or partition range.</div>
  </div>
</template>

<script>
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'
import BrokerPicker from '@/components/BrokerPicker'
import SegmentedControl from '@/components/SegmentedControl'
import { DISK_IO_SKEW, diskIoLimit } from '@/limits'

// the headers of the partition table (CC's record keys: API 2 and older)
const HEADER_LABELS = {
  topic: 'Topic',
  partition: 'Partition',
  leader: 'Leader',
  followers: 'Followers',
  cpu: 'CPU',
  CPU: 'CPU',
  disk: 'Disk',
  DISK: 'Disk',
  networkInbound: 'Network In',
  NW_IN: 'Network In',
  networkOutbound: 'Network Out',
  NW_OUT: 'Network Out',
  msg_in: 'Messages In',
  MSG_IN: 'Messages In'
}

export default {
  name: 'PartitionLoad',
  components: {
    BrokerPicker,
    SegmentedControl
  },
  props: {
    group: String,
    cluster: String
  },
  data () {
    return {
      title: 'Load',
      loaded: false,
      loading: false,
      tos: false,
      error: false,
      errorData: null,
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      // Form Elements
      resource: 'DISK',
      // resource: the partitions come sorted by their load of it, the heaviest first
      resourceOptions: [
        { value: 'CPU', label: 'CPU' },
        { value: 'NW_IN', label: 'Network In' },
        { value: 'NW_OUT', label: 'Network Out' },
        { value: 'DISK', label: 'Disk' }
      ],
      numRecords: 100,
      allowCapacityEstimation: true,
      maxLoad: false,
      populateDiskInfo: false,
      topicName: '',
      partitionRangeMin: -1,
      partitionRangeMax: -1,
      startTimestamp: 0,
      endTimestamp: 0,
      minValidPartitionRatio: 0,
      showURL: false,
      // by topic (the partitions) or by broker (the replicas of the picked brokers, disk by disk); the mode of the results
      mode: 'topic',
      modeOptions: [
        { value: 'topic', label: 'Topics', title: 'The partitions and their load, by topic regex and partition range' },
        { value: 'broker', label: 'Brokers', title: 'The replicas of the picked brokers, disk by disk' }
      ],
      shownMode: 'topic',
      // brokerid: the picked brokers, the brokers of the cluster for the picker (and their disks), the brokers shown
      brokerIds: [],
      knownBrokers: [],
      brokerDirs: {},
      brokersLoading: false,
      brokersUrl: null,
      shownBrokerIds: [],
      openDisks: {},
      // the disk I/O columns of the by-disk table
      ioKeys: [
        { key: 'leaderIn', label: 'Leader In', name: 'leader in' },
        { key: 'followerIn', label: 'Follower In', name: 'follower in' },
        { key: 'out', label: 'Network Out', name: 'network out' }
      ],
      ioHelp: 'The network rates of the replicas on the disk: a leader replica takes its partition\'s bytes in and out, a follower the bytes in it replicates. Flagged above ' + DISK_IO_SKEW + 'x the average share of the broker\'s online disks, as on Cluster Load.',
      // header & records
      records: [],
      header: [],
      colUnits: [],
      hasLogdirs: false, // the records carry leaderLogdir / followerLogdirs (populate_disk_info)
      showAsyncRefreshButton: false,
      detectedUserTaskId: false // true in case the response has user-task-id
    }
  },
  created () {
    // ?broker=2195[,2169] (the Replicas button of Cluster Load): by broker, these brokers, shown at once
    this.applyBrokerQuery()
    // resolve the CC URL of this cluster (nothing else is fetched until "Show ...")
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
    '$route.query.broker' () {
      if (this.applyBrokerQuery() && this.$store.state.url) {
        this.loadBrokers()
        this.getPartitionLoad()
      }
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
    apiMinorVersion () {
      // NnwOutRate has been changed to NwOutRate and Upstream
      // API does not expose this correctly.
      if (this.records.length > 0 && Object.prototype.hasOwnProperty.call(this.records[0], 'networkInbound')) {
        return 2
      } else {
        return 1
      }
    },
    // each broker shown, with its disks (known from kafka_cluster_state, and from the replicas): [{ broker, disks, replicas,
    // leaders, sizeMB, offline }], a disk being { key, logdir, offline, replicas, leaders, sizeMB, share }
    brokerDisks () {
      return this.shownBrokerIds.map((broker) => {
        const byDir = {}
        const disk = (logdir, offline) => byDir[logdir || ''] || (byDir[logdir || ''] = { key: broker + '|' + (logdir || ''), logdir: logdir || null, offline: !!offline, replicas: [], leaders: 0, sizeMB: 0, share: 0, leaderIn: 0, followerIn: 0, out: 0, io: {} })
        const known = this.brokerDirs[broker] || { online: [], offline: [] }
        known.online.forEach(d => disk(d, false))
        known.offline.forEach(d => disk(d, true))
        const add = (b, logdir, r, leader) => {
          if (Number(b) !== broker) return
          const g = disk(logdir)
          const sizeMB = Number(r.disk !== undefined ? r.disk : r.DISK) || 0
          g.replicas.push({ topic: r.topic, partition: r.partition, leader, sizeMB })
          g.sizeMB += sizeMB
          // disk I/O: a leader takes its partition's bytes in and out, a follower the bytes in it replicates
          const nwIn = Number(r.networkInbound !== undefined ? r.networkInbound : r.NW_IN) || 0
          const nwOut = Number(r.networkOutbound !== undefined ? r.networkOutbound : r.NW_OUT) || 0
          if (leader) {
            g.leaders++
            g.leaderIn += nwIn
            g.out += nwOut
          } else {
            g.followerIn += nwIn
          }
        }
        this.records.forEach((r) => {
          add(r.leader, r.leaderLogdir, r, true)
          ;(r.followers || []).forEach((f, i) => add(f, (r.followerLogdirs || [])[i], r, false))
        })
        const disks = Object.values(byDir).sort((a, b) => a.logdir === null ? 1 : b.logdir === null ? -1 : a.logdir.localeCompare(b.logdir, undefined, { numeric: true }))
        const sizeMB = disks.reduce((sum, g) => sum + g.sizeMB, 0)
        disks.forEach((g) => {
          g.replicas.sort((a, b) => b.sizeMB - a.sizeMB)
          g.share = sizeMB > 0 ? g.sizeMB / sizeMB * 100 : 0
        })
        // each rate's share of the broker's, flagged above DISK_IO_SKEW x the average of its online disks (as on Cluster Load)
        const total = {}
        const limit = diskIoLimit(disks.filter(g => !g.offline).length)
        this.ioKeys.forEach(({ key }) => {
          total[key] = disks.reduce((sum, g) => sum + g[key], 0)
          disks.forEach((g) => {
            const share = total[key] > 0 ? g[key] / total[key] * 100 : null
            g.io[key] = { share, limit, flagged: share !== null && limit !== null && share > limit }
          })
        })
        return {
          broker,
          disks,
          leaderIn: total.leaderIn,
          followerIn: total.followerIn,
          out: total.out,
          replicas: disks.reduce((sum, g) => sum + g.replicas.length, 0),
          leaders: disks.reduce((sum, g) => sum + g.leaders, 0),
          sizeMB,
          offline: disks.filter(g => g.offline).length
        }
      })
    },
    diskGroups () {
      return [].concat(...this.brokerDisks.map(b => b.disks.filter(g => g.replicas.length)))
    },
    allDisksOpen () {
      return this.diskGroups.length > 0 && this.diskGroups.every(g => this.openDisks[g.key])
    },
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    },
    url () {
      // by broker: every partition on the brokers (no entries: CC's default is all), with the logdir of each replica
      if (this.mode === 'broker') {
        return this.$helpers.getURL('partitionload', {
          resource: this.resource,
          allow_capacity_estimation: this.allowCapacityEstimation,
          max_load: this.maxLoad,
          populate_disk_info: true,
          brokerid: this.brokerIds.join(',')
        })
      }
      const params = {
        resource: this.resource,
        entries: this.numRecords,
        allow_capacity_estimation: this.allowCapacityEstimation,
        max_load: this.maxLoad
      }
      if (this.populateDiskInfo) {
        params.populate_disk_info = true
      }
      // a regular expression: the URL encoding is all it needs (an HTML filter here turned "a|b" into "a%7Cb")
      if (this.topicName.trim()) {
        params.topic = this.topicName.trim()
      }
      if (this.partitionRangeMin >= 0 && this.partitionRangeMax >= this.partitionRangeMin) {
        params.partition = this.partitionRangeMin + '-' + this.partitionRangeMax
      }
      if (this.startTimestamp > 0 && this.endTimestamp > this.startTimestamp) {
        params.start = this.startTimestamp
        params.end = this.endTimestamp
      }
      if (this.minValidPartitionRatio > 0) {
        params.min_valid_partition_ratio = this.minValidPartitionRatio
      }
      return this.$helpers.getURL('partitionload', params)
    }
  },
  methods: {
    headerLabel (h) {
      if (this.hasLogdirs && (h === 'leader' || h === 'followers')) return HEADER_LABELS[h] + ' · Logdir' + (h === 'followers' ? 's' : '')
      return HEADER_LABELS[h] || this.$options.filters.splitCamelCase(h)
    },
    onPartitionMinChanged () {
      if (this.partitionRangeMax < this.partitionRangeMin) {
        this.partitionRangeMax = this.partitionRangeMin
      }
      return null
    },
    onPartitionMaxChanged () {
      if (this.partitionRangeMin > this.partitionRangeMax) {
        this.partitionRangeMin = this.partitionRangeMax
      }
      return null
    },
    // switching the mode drops the results of the other one
    setMode (mode) {
      if (mode === this.mode) return
      this.mode = mode
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.loaded = false
      this.error = false
      this.async = false
      this.records = []
      if (mode === 'broker') this.loadBrokers()
    },
    toggleAllDisks () {
      const open = !this.allDisksOpen
      this.openDisks = {}
      if (open) this.diskGroups.forEach(g => this.$set(this.openDisks, g.key, true))
    },
    // the brokers of the cluster for the picker, once per cluster
    loadBrokers () {
      const url = this.$helpers.getURL('kafka_cluster_state', {})
      if (this.brokersLoading || this.brokersUrl === url) return
      this.brokersLoading = true
      fetchCC(url).then((result) => {
        this.brokersLoading = false
        const state = result.type === 'success' && result.data && result.data.KafkaBrokerState
        if (!state) return
        const replicas = state.ReplicaCountByBrokerId || {}
        const dirs = state.OnlineLogDirsByBrokerId || {}
        const offline = state.OfflineLogDirsByBrokerId || {}
        this.knownBrokers = Object.keys(replicas).map(Number).sort((a, b) => a - b)
          .map(id => ({ id, meta: replicas[id] + ' replicas' + (dirs[id] ? ' · ' + dirs[id].length + ' disks' : '') + ((offline[id] || []).length ? ' · ' + offline[id].length + ' offline' : '') }))
        const brokerDirs = {}
        Object.keys(replicas).forEach((id) => { brokerDirs[id] = { online: dirs[id] || [], offline: offline[id] || [] } })
        this.brokerDirs = brokerDirs
        this.brokersUrl = url
      }).catch(() => {
        this.brokersLoading = false
      })
    },
    applyBrokerQuery () {
      const ids = String(this.$route.query.broker || '').split(',').map(x => parseInt(x, 10)).filter(x => !isNaN(x))
      if (!ids.length) return false
      this.mode = 'broker'
      this.brokerIds = Array.from(new Set(ids)).sort((a, b) => a - b)
      this.tos = true
      return true
    },
    ioTitle (g, k) {
      const io = g.io[k.key]
      if (!io || io.share === null) return null
      return io.share.toFixed(1) + ' % of the broker\'s ' + k.name + (io.limit !== null ? ' · flagged above ' + io.limit.toFixed(1) + ' % (' + DISK_IO_SKEW + 'x the average share)' : '')
    },
    acceptTos () {
      this.tos = true
      this.getPartitionLoad()
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
      if (this.mode === 'broker') this.loadBrokers()
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      if (this.tos) {
        this.getPartitionLoad()
      }
    },
    getPartitionLoad () {
      const vm = this
      vm.error = false
      vm.async = false
      vm.loaded = false
      vm.loading = true
      const fetchOptions = {}
      const task = this.$store.getters.getTaskId(vm.url)
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
          // retry starts a new expensive computation on CC.
          if (taskId) {
            vm.asyncRetryTimer = setTimeout(() => vm.getPartitionLoad(), ASYNC_RETRY_DELAY)
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
          vm.loaded = true
          vm.error = false
          vm.errorData = null
          vm.records = result.data.records || []
          vm.shownMode = vm.mode
          vm.shownBrokerIds = vm.mode === 'broker' ? vm.brokerIds.map(Number) : []
          vm.openDisks = {}
          if (vm.apiMinorVersion === 2) {
            vm.header = ['topic', 'partition', 'leader', 'followers', 'cpu', 'disk', 'networkInbound', 'networkOutbound', 'msg_in']
            vm.colUnits = ['str', 'int', 'int', 'list', 'pct', 'disk', 'network', 'network', 'int']
          } else {
            vm.header = ['topic', 'partition', 'leader', 'followers', 'CPU', 'DISK', 'NW_IN', 'NW_OUT', 'MSG_IN']
            vm.colUnits = ['str', 'int', 'int', 'list', 'pct', 'disk', 'network', 'network', 'int']
          }
          vm.hasLogdirs = vm.records.length > 0 && Object.prototype.hasOwnProperty.call(vm.records[0], 'leaderLogdir')
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

<style scoped>
.pl-actions { gap: 8px; }
.pl-switches { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
.by-disk-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 10px; }
.by-disk-title .bi { color: var(--primary); }
.broker-row td { padding-top: 10px; border-top: 2px solid var(--line); background: var(--row-alt); }
.broker-row .id-pill { margin-right: 8px; }
.replica-dir { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.replica-dir + .replica-dir { margin-top: 3px; }
.broker-sum { color: var(--muted); font-size: 0.84rem; }
.disk-cell { padding-left: 22px; }
.disk-replicas td { background: var(--row-alt); }
.replica-chip { display: inline-flex; align-items: center; gap: 5px; margin: 2px 4px 2px 0; padding: 1px 9px; border: 1px solid var(--input-border); border-radius: 999px; background: var(--row-hover); color: var(--text); font-size: 0.8rem; }
.replica-chip small { color: var(--muted); }
.replica-chip.leader { border-color: rgba(129, 140, 248, 0.5); background: var(--primary-soft); }
.replica-chip .bi-star-fill { color: var(--primary); font-size: 0.7em; }
.pointer { cursor: pointer; }
.text-none { text-transform: none; letter-spacing: 0; }
.fade-enter-active, .fade-leave-active {
  transition: opacity .5s
}
.fade-enter, .fade-leave-to  {
  opacity: 0
}
</style>
