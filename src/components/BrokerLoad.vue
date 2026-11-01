<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if="loading && sortedBrokers.length === 0">
      <loading-state />
    </div>
    <div v-else-if='sortedBrokers.length > 0'>
    <!-- what is past a limit, at a glance (the same rules as the flagged cells, whatever the columns shown): folded, one chip
         per limit with its brokers (a chip keeps only them in the table); open, one row per broker with all its problems -->
    <div :class="['limit-summary', limitGroups.length ? 'has-issues' : 'all-ok', { open: limitOpen }]">
      <template v-if="limitGroups.length">
        <div class="limit-head">
          <button type="button" class="limit-toggle" :aria-expanded="limitOpen ? 'true' : 'false'" :title="limitOpen ? 'Fold the list' : 'List the brokers and their problems'" @click="limitOpen = !limitOpen">
            <i class="bi bi-chevron-right chev"></i><i class="bi bi-exclamation-triangle-fill warn"></i>
            <b>{{ flaggedIds.length }} of {{ brokers.length }} broker{{ brokers.length === 1 ? '' : 's' }} past a limit</b>
          </button>
          <!-- each limit: its chip, and "Fix" opening the action that fixes it in Cluster Administration, dry run done -->
          <span v-for="g in limitGroups" :key="g.key" class="limit-cat-group">
            <button type="button" :class="['limit-cat', 'tone-' + g.tone, { active: onlyLimit === g.key }]" :data-limit="g.key"
              :aria-pressed="onlyLimit === g.key ? 'true' : 'false'" :title="(onlyLimit === g.key ? 'Show every broker again' : 'Show only these brokers in the table') + ' (' + g.items.length + ' ' + (g.perDisk ? 'disks' : 'brokers') + ')'"
              @click="onlyLimit = onlyLimit === g.key ? '' : g.key">{{ g.label }} <span class="count-pill">{{ g.ids.length }}</span></button>
            <button v-if="limitFixes[g.key]" type="button" class="limit-fix" :data-fix="limitFixes[g.key].action" :title="limitFixes[g.key].title" @click="fixLimit(g)"><i class="bi bi-tools"></i> Fix</button>
          </span>
          <label class="chip-check ml-auto" title="The table keeps only the brokers past a limit"><input type="checkbox" :checked="onlyLimit !== ''" @change="onlyLimit = $event.target.checked ? 'all' : ''"> Only these brokers</label>
        </div>
        <div v-if="limitOpen" class="limit-brokers">
          <div class="limit-legend">Usage above {{ limitPct }} % of capacity, disk I/O (a disk's share of its broker's network rates) above {{ skewFactor }}x the broker's average, no leaders or replicas, empty or dead disks, brokers not alive. Click a broker to filter the table.</div>
          <div v-for="b in limitByBroker" :key="b.id" class="limit-broker" :data-broker="b.id">
            <button type="button" class="limit-id" :title="'Filter the table to broker ' + b.id" @click="filterText = String(b.id)"><span class="id-pill">{{ b.id }}</span></button>
            <span class="limit-issues">
              <span v-for="(it, i) in b.issues" :key="i" :class="['limit-issue', 'tone-' + it.tone]"><b>{{ it.short }}</b> {{ it.text }}</span>
            </span>
          </div>
        </div>
      </template>
      <div v-else class="limit-ok"><i class="bi bi-check-circle-fill"></i> Every broker is within limits: usage at most {{ limitPct }} % of capacity, disk I/O at most {{ skewFactor }}x the average, leaders and replicas on each, no empty or dead disk.</div>
    </div>
    <div v-sticky class="form-inline mb-2">
      <input type="text" class="form-control form-control-sm filter-input" v-model="filterText" placeholder="Filter: broker ids (e.g. 1, 3) or host / rack" title="Comma- or space-separated: a number matches the broker ids containing it and the rack equal to it, any other text a part of the host or rack">
      <span v-if="filteredBrokers.length !== brokers.length" class="small text-muted ml-2">{{ filteredBrokers.length }} of {{ brokers.length }}</span>
      <label class="chip-check ml-3"><input type="checkbox" v-model="showStateHost"> Show State &amp; Host</label>
      <label class="chip-check ml-2" title="Calculated based on user-provided capacity"><input type="checkbox" v-model="showPct"> Show Usage Percentages <i class="bi bi-question-circle help-icon"></i></label>
      <label v-if="diskDetailsExist" class="chip-check ml-2"><input type="checkbox" v-model="showPerDiskUsage"> Show Per Disk Usage</label>
    </div>
    <table class="table table-sm table-bordered">
      <thead class="thead-light">
        <tr>
          <th :colspan="showStateHost ? 4 : 2" class="text-center">Broker</th>
          <th colspan="2" class="text-center">Topic/Partition</th>
          <th :colspan="showDiskDetails ? 2 : 1" class="text-center">Disk</th>
          <th v-if="showPct" colspan="1" class="text-center">CPU</th>
          <th colspan="6" class="text-center">Network Rate</th>
          <th rowspan="2" class="go-col"><span class="sr-only">Partition Load</span></th>
        </tr>
        <tr>
          <th @click='sort("Broker")' style="cursor:pointer">ID</th>
          <th v-if="showStateHost" @click='sort("BrokerState")' style="cursor:pointer">State</th>
          <th v-if="showStateHost" @click='sort("Host")' style="cursor:pointer">Host</th>
          <th @click='sort("Rack")' style="cursor:pointer">Rack</th>

          <th @click='sort("Replicas")' style="cursor:pointer">#Replicas</th>
          <th @click='sort("Leaders")' style="cursor:pointer">#Leaders</th>

          <th v-if="showDiskDetails">Log Dir</th>
          <th @click='showPct ? sort("DiskPct") : sort("DiskMB")' style="cursor:pointer">Used</th>

          <th v-if="showPct" @click='sort("CpuPct")' style="cursor:pointer">Used</th>

          <th v-if="!showPct" @click='sort("LeaderNwInRate")' style="cursor:pointer">Leader In</th><th v-else :title="diskNetworkRows ? diskShareHelp : null">Leader In<template v-if="diskNetworkRows"> <i class="bi bi-question-circle help-icon"></i></template></th>
          <th v-if="!showPct" @click='sort("FollowerNwInRate")' style="cursor:pointer">Follower In</th><th v-else :title="diskNetworkRows ? diskShareHelp : null">Follower In<template v-if="diskNetworkRows"> <i class="bi bi-question-circle help-icon"></i></template></th>
          <th v-if='apiMinorVersion === 2 && !showPct' @click='sort("NwOutRate")' style="cursor:pointer">Network Out</th><th v-if='apiMinorVersion === 2 && showPct' :title="diskNetworkRows ? diskShareHelp : null">Network Out<template v-if="diskNetworkRows"> <i class="bi bi-question-circle help-icon"></i></template></th>
          <th v-if='apiMinorVersion === 1 && !showPct' @click='sort("NnwOutRate")' style="cursor:pointer">Net Network Out</th><th v-if='apiMinorVersion === 1 && showPct'>Net Network Out</th>
          <th v-if="!showPct" @click='sort("PnwOutRate")' style="cursor:pointer">Potential Out</th><th v-else :title="diskNetworkRows ? diskShareHelp : null">Potential Out<template v-if="diskNetworkRows"> <i class="bi bi-question-circle help-icon"></i></template></th>
          <th title="Leader to Follower Incoming Traffic Ratio">LF Ratio <i class="bi bi-question-circle help-icon"></i></th>
          <th title="Leader Incoming to Outgoing Traffic Ratio">IO Ratio <i class="bi bi-question-circle help-icon"></i></th>
        </tr>
      </thead>
      <!-- one tbody per broker: its rows (one per disk) hover as one -->
      <tbody v-for="e in filteredBrokers" :key="'broker-' + e.Broker" class="row-group">
          <tr v-for="([path, disk], i) in brokerDisks(e)" :key="e.Broker + '-' + i">
            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle"><span :class="['id-pill', { hit: filter.hitId(e.Broker) }]">{{ e.Broker }}</span></td>

            <td v-if="showStateHost && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <BrokerState :state="e.BrokerState" />
            </td>

            <td v-if="showStateHost && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <hit-text :text="$options.filters.formatHost(e.Host)" :filter="filter" />
            </td>

            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <hit-text v-if="e.Rack && e.Rack !== e.Host" :text="e.Rack" :filter="filter" rack /><template v-else>N/A</template>
            </td>

            <td :class="['align-middle', (disk ? disk.NumReplicas : e.Replicas) < 1 ? 'table-info' : null]">
              <value-cell :value="disk ? disk.NumReplicas : e.Replicas" />
            </td>

            <td :class="['align-middle', (disk ? disk.NumLeaderReplicas : e.Leaders) < 1 ? 'table-warning' : null]">
              <value-cell :value="disk ? disk.NumLeaderReplicas : e.Leaders" />
            </td>

            <td v-if="disk" class="align-middle">
              <code>{{ path }}</code>
            </td>

            <td class="align-middle">
              <div v-if="showPct" :class="[(disk ? disk.DiskPct : e.DiskPct) > 70 ? 'table-warning' : null]">
                <value-cell :value="disk ? (disk.DiskPct === 'DEAD' ? 0 : disk.DiskPct) : e.DiskPct"
                  :text="(disk ? (disk.DiskPct === 'DEAD' ? 0 : disk.DiskPct) : e.DiskPct).toFixed(2) + ' %'" />
              </div>
              <div v-else><value-cell :value="disk ? disk.DiskMB : e.DiskMB" :text="$options.filters.formatUnits(disk ? disk.DiskMB : e.DiskMB)" /></div>
            </td>

            <td v-if="showPct && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <div :class="warnClass(e.CpuPct != null ? e.CpuPct : null)"><value-cell :value="e.CpuPct" :text="e.CpuPct != null ? e.CpuPct.toFixed(2) + ' %' : 'N/A %'" /></div>
            </td>

            <!-- per-disk network rates (load?populate_disk_info=true): each disk row shows its own rates. A disk has no
                 network capacity, so its percentage is its share of the broker's rate (a broker's disks add up to 100 %). -->
            <template v-if="diskNetworkRows">
              <td v-for="col in diskNetworkColumns" :key="col.key" class="align-middle" :class="deadClass((disk || e)[col.key])">
                <div v-if="showPct" :class="disk ? skewClass(e, disk, col.key) : warnClass(capacityPct(e[col.key], e[col.capacity]))" :title="disk ? shareTitle(e, disk, col) : null">
                  <value-cell :value="disk ? sharePct(disk[col.key], e[col.key]) : capacityPct(e[col.key], e[col.capacity])" :text="disk ? shareOf(disk[col.key], e[col.key]) : pctOf(e[col.key], e[col.capacity])" />
                </div>
                <div v-else><value-cell :value="(disk || e)[col.key]" :text="$options.filters.formatNetworkUnits((disk || e)[col.key])" /></div>
              </td>
              <td class="align-middle">{{ ratio((disk || e).LeaderNwInRate, (disk || e).FollowerNwInRate) }}</td>
              <td class="align-middle">{{ ratio((disk || e).LeaderNwInRate, (disk || e).NwOutRate) }}</td>
            </template>
            <template v-else>
            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <div v-if="showPct" :class="warnClass(capacityPct(e.LeaderNwInRate, e.NetworkInCapacity))"><value-cell :value="capacityPct(e.LeaderNwInRate, e.NetworkInCapacity)" :text="Number(e.LeaderNwInRate / e.NetworkInCapacity * 100).toFixed(2) + ' %'" /></div>
              <div v-else><value-cell :value="e.LeaderNwInRate" :text="$options.filters.formatNetworkUnits(e.LeaderNwInRate)" /></div>
            </td>

            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <div v-if="showPct" :class="warnClass(capacityPct(e.FollowerNwInRate, e.NetworkInCapacity))"><value-cell :value="capacityPct(e.FollowerNwInRate, e.NetworkInCapacity)" :text="Number(e.FollowerNwInRate / e.NetworkInCapacity * 100).toFixed(2) + ' %'" /></div>
              <div v-else><value-cell :value="e.FollowerNwInRate" :text="$options.filters.formatNetworkUnits(e.FollowerNwInRate)" /></div>
            </td>

            <td v-if="apiMinorVersion === 2 && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <div v-if="showPct" :class="warnClass(capacityPct(e.NwOutRate, e.NetworkOutCapacity))"><value-cell :value="capacityPct(e.NwOutRate, e.NetworkOutCapacity)" :text="Number(e.NwOutRate / e.NetworkOutCapacity * 100).toFixed(2) + ' %'" /></div>
              <div v-else><value-cell :value="e.NwOutRate" :text="$options.filters.formatNetworkUnits(e.NwOutRate)" /></div>
            </td>

            <td v-if="apiMinorVersion === 1 && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <div v-if="showPct" :class="warnClass(capacityPct(e.NnwOutRate, e.NetworkOutCapacity))"><value-cell :value="capacityPct(e.NnwOutRate, e.NetworkOutCapacity)" :text="Number(e.NnwOutRate / e.NetworkOutCapacity * 100).toFixed(2) + ' %'" /></div>
              <div v-else><value-cell :value="e.NnwOutRate" :text="$options.filters.formatNetworkUnits(e.NnwOutRate)" /></div>
            </td>

            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              <div v-if="showPct" :class="warnClass(capacityPct(e.PnwOutRate, e.NetworkOutCapacity))"><value-cell :value="capacityPct(e.PnwOutRate, e.NetworkOutCapacity)" :text="Number(e.PnwOutRate / e.NetworkOutCapacity * 100).toFixed(2) + ' %'" /></div>
              <div v-else><value-cell :value="e.PnwOutRate" :text="$options.filters.formatNetworkUnits(e.PnwOutRate)" /></div>
            </td>

            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              {{ e.FollowerNwInRate > 0 ? Number(e.LeaderNwInRate / e.FollowerNwInRate).toFixed(3) : null }}
            </td>

            <td v-if="apiMinorVersion === 2 && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              {{ e.NwOutRate > 0 ? Number(e.LeaderNwInRate / e.NwOutRate).toFixed(3) : null }}
            </td>

            <td v-if="apiMinorVersion === 1 && i === 0" :rowspan="brokerDisks(e).length" class="align-middle border-bottom-0">
              {{ e.NnwOutRate > 0 ? Number(e.LeaderNwInRate / e.NnwOutRate).toFixed(3) : null }}
            </td>
            </template>

            <!-- the broker's replicas, disk by disk, on Partition Load -->
            <td v-if="i === 0" :rowspan="brokerDisks(e).length" class="align-middle go-col">
              <router-link class="btn btn-sm btn-outline-secondary go-btn" :to="partitionLoadLink(e.Broker)" :title="'Partition Load: the replicas of broker ' + e.Broker + ', disk by disk'" :data-broker="e.Broker">
                <i class="bi bi-grid-3x3-gap"></i> Replicas <i class="bi bi-chevron-right"></i>
              </router-link>
            </td>
          </tr>
      </tbody>
    </table>
    </div>
    <div v-else>No Brokers Found.</div>
  </div>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'
import BrokerState from '@/components/BrokerState'
import { LIMIT_PCT, DISK_IO_SKEW, diskIoLimit } from '@/limits'
const sortBy = require('lodash.sortby')

export default {
  name: 'BrokerLoad',
  props: {
    brokers: Array,
    loading: Boolean,
    error: Boolean,
    errorData: Object
  },
  components: {
    BrokerState
  },
  data () {
    return {
      showStateHost: false,
      showPct: false,
      showPerDiskUsage: false,
      diskNetworkColumns: [
        { key: 'LeaderNwInRate', capacity: 'NetworkInCapacity' },
        { key: 'FollowerNwInRate', capacity: 'NetworkInCapacity' },
        { key: 'NwOutRate', capacity: 'NetworkOutCapacity' },
        { key: 'PnwOutRate', capacity: 'NetworkOutCapacity' }
      ],
      diskShareHelp: 'On a disk row: the share of its broker\'s rate carried by the replicas on that disk (the disks of a broker add up to 100 %). It is flagged above ' + DISK_IO_SKEW + ' x the average share of the broker\'s disks (100 % / its number of disks). A disk has no network capacity of its own; hover a cell for its rate as a share of the broker\'s network capacity.',
      sortColumn: 'Replicas',
      ascending: true,
      filterText: '',
      // the limit summary
      limitPct: LIMIT_PCT,
      skewFactor: DISK_IO_SKEW,
      limitOpen: false,
      // the table keeps only the brokers past a limit: '' (off), 'all', or one limit (its key)
      onlyLimit: ''
    }
  },
  methods: {
    sort (col) {
      if (this.sortColumn === col) {
        this.ascending = !this.ascending
      } else {
        this.sortColumn = col
        this.ascending = true
      }
    },
    brokerDisks (e) {
      if (!this.showPerDiskUsage) {
        return [[null, null]]
      }

      const disks = Object.entries(e.DiskState || {})
        .sort(([a], [b]) => a.localeCompare(b))
      return disks.length ? disks : [[null, null]]
    },
    deadClass (v) {
      return v === 'DEAD' ? 'table-danger' : null
    },
    pctOf (v, capacity) {
      if (v === 'DEAD' || v === undefined || v === null) return 'N/A'
      return Number(v / capacity * 100).toFixed(2) + ' %'
    },
    // a disk's rate as a share of its broker's rate
    shareOf (v, brokerRate) {
      if (v === 'DEAD' || v === undefined || v === null) return 'N/A'
      if (!(Number(brokerRate) > 0)) return Number(v) > 0 ? 'N/A' : '0.00 %'
      return Number(v / brokerRate * 100).toFixed(2) + ' %'
    },
    capacityPct (v, capacity) {
      return v === 'DEAD' || v === undefined || v === null || !(Number(capacity) > 0) ? null : Number(v) / Number(capacity) * 100
    },
    sharePct (v, brokerRate) {
      return v === 'DEAD' || v === undefined || v === null || !(Number(brokerRate) > 0) ? null : Number(v) / Number(brokerRate) * 100
    },
    // the same highlight as the disk usage: above 70 %
    warnClass (pct) {
      return pct !== null && pct > LIMIT_PCT ? 'table-warning' : null
    },
    // a disk's share of its broker's rate: flagged above DISK_IO_SKEW x the average share of the broker's disks (a disk has no
    // network capacity of its own, so the capacity limit means nothing there)
    skewLimit (broker, key) {
      return diskIoLimit(Object.values(broker.DiskState || {}).filter(d => d[key] !== 'DEAD' && d[key] !== undefined && d[key] !== null).length)
    },
    skewClass (broker, disk, key) {
      const share = this.sharePct(disk[key], broker[key])
      const limit = this.skewLimit(broker, key)
      return share !== null && limit !== null && share > limit ? 'table-warning' : null
    },
    shareTitle (broker, disk, col) {
      const limit = this.skewLimit(broker, col.key)
      const capacity = this.capacityTitle(disk[col.key], broker[col.capacity])
      return [capacity, limit !== null ? 'flagged above ' + limit.toFixed(1) + ' % (' + DISK_IO_SKEW + ' x the average share)' : null].filter(Boolean).join(' · ') || null
    },
    // Cluster Administration with the action that fixes this limit chosen, its brokers selected and a dry run started
    fixLimit (g) {
      const fix = this.limitFixes[g.key]
      this.$router.push({ name: 'page.admin_broker', params: { group: this.$route.params.group, cluster: this.$route.params.cluster }, query: { fix: fix.action, brokers: fix.brokers.join(','), limit: g.label } })
    },
    // Partition Load by broker, this broker picked (it shows its replicas at once)
    partitionLoadLink (id) {
      return { name: 'page.partitionload', params: { group: this.$route.params.group, cluster: this.$route.params.cluster }, query: { broker: String(id) } }
    },
    capacityTitle (v, capacity) {
      return v === 'DEAD' || !(Number(capacity) > 0) ? null : this.pctOf(v, capacity) + ' of the broker\'s network capacity'
    },
    ratio (a, b) {
      if (a === 'DEAD' || b === 'DEAD' || !(Number(b) > 0)) return null
      return Number(a / b).toFixed(3)
    }
  },
  computed: {
    sortedBrokers () {
      if (this.ascending) {
        return sortBy(this.brokers, this.sortColumn)
      }
      return sortBy(this.brokers, this.sortColumn).reverse()
    },
    filter () {
      return parseFilter(this.filterText)
    },
    filteredBrokers () {
      const only = this.onlyIds
      return this.sortedBrokers.filter(b => matchesFilter(this.filter, [b.Broker], [b.Host], [b.Rack]) && (!only || only.has(b.Broker)))
    },
    // the brokers "only these" keeps (null: every broker), and a limit that no broker passes any more keeps them all
    onlyIds () {
      if (this.onlyLimit === 'all') return new Set(this.flaggedIds)
      const g = this.limitGroups.find(x => x.key === this.onlyLimit)
      return g ? new Set(g.ids) : null
    },
    // the brokers past a limit, by limit: [{ key, label, short, tone, perDisk, items: [{ id, text }], ids }], the worst first
    limitGroups () {
      const brokers = this.brokers || []
      const pct = (v, cap) => v === 'DEAD' || v === null || v === undefined || !(Number(cap) > 0) ? null : Number(v) / Number(cap) * 100
      const groups = []
      // short: the problem's name next to the broker; perDisk: one item per disk
      const add = (key, label, short, tone, items, perDisk) => {
        if (!items.length) return
        items.sort((a, b) => (b.sort || 0) - (a.sort || 0))
        groups.push({ key, label, short, tone, perDisk: !!perDisk, items, ids: Array.from(new Set(items.map(it => it.id))) })
      }
      const over = (list) => list.filter(x => x.sort !== null && x.sort > LIMIT_PCT).map(x => Object.assign(x, { text: x.sort.toFixed(1) + ' %' }))
      const disks = []
      brokers.forEach(b => Object.entries(b.DiskState || {}).forEach(([path, d]) => disks.push({ b, path, d })))
      add('state', 'Not alive', 'Not alive', 'danger', brokers.filter(b => b.BrokerState && b.BrokerState !== 'ALIVE').map(b => ({ id: b.Broker, text: b.BrokerState })))
      add('deadDisk', 'Dead disks', 'Dead disk', 'danger', disks.filter(x => x.d.DiskPct === 'DEAD' || x.d.DiskMB === 'DEAD').map(x => ({ id: x.b.Broker, text: x.path })), true)
      add('disk', 'Disk usage > ' + LIMIT_PCT + ' %', 'Disk usage', 'warning', over(brokers.map(b => ({ id: b.Broker, sort: typeof b.DiskPct === 'number' ? b.DiskPct : pct(b.DiskMB, b.DiskCapacityMB) }))))
      add('diskOfBroker', 'One disk > ' + LIMIT_PCT + ' %', 'Disk', 'warning', disks.filter(x => typeof x.d.DiskPct === 'number' && x.d.DiskPct > LIMIT_PCT)
        .map(x => ({ id: x.b.Broker, sort: x.d.DiskPct, text: x.path + ' ' + x.d.DiskPct.toFixed(1) + ' %' })), true)
      // a disk's share of a network rate of its broker above DISK_IO_SKEW x the average share (the rule of the disk cells)
      const names = { LeaderNwInRate: 'leader in', FollowerNwInRate: 'follower in', NwOutRate: 'out', PnwOutRate: 'potential out' }
      add('diskIo', 'Disk I/O > ' + DISK_IO_SKEW + 'x average', 'Disk I/O', 'warning', disks.map((x) => {
        const over = Object.keys(names).map((key) => {
          const share = this.sharePct(x.d[key], x.b[key])
          const limit = this.skewLimit(x.b, key)
          return share !== null && limit !== null && share > limit ? { key, share } : null
        }).filter(Boolean)
        return over.length ? { id: x.b.Broker, sort: Math.max(...over.map(o => o.share)), text: x.path + ' ' + over.map(o => names[o.key] + ' ' + o.share.toFixed(1) + ' %').join(', ') } : null
      }).filter(Boolean), true)
      add('cpu', 'CPU > ' + LIMIT_PCT + ' %', 'CPU', 'warning', over(brokers.map(b => ({ id: b.Broker, sort: typeof b.CpuPct === 'number' ? b.CpuPct : null }))))
      add('nwIn', 'Network in > ' + LIMIT_PCT + ' %', 'Network in', 'warning', over(brokers.map(b => ({ id: b.Broker, sort: pct(Number(b.LeaderNwInRate) + Number(b.FollowerNwInRate), b.NetworkInCapacity) }))))
      add('nwOut', 'Network out > ' + LIMIT_PCT + ' %', 'Network out', 'warning', over(brokers.map(b => ({ id: b.Broker, sort: pct(b.NwOutRate !== undefined ? b.NwOutRate : b.NnwOutRate, b.NetworkOutCapacity) }))))
      add('pnwOut', 'Potential out > ' + LIMIT_PCT + ' %', 'Potential out', 'info', over(brokers.map(b => ({ id: b.Broker, sort: pct(b.PnwOutRate, b.NetworkOutCapacity) }))))
      add('leaders', 'No leaders', 'No leaders', 'warning', brokers.filter(b => b.Replicas > 0 && b.Leaders < 1).map(b => ({ id: b.Broker, text: b.Replicas + ' replicas' })))
      add('replicas', 'No replicas', 'No replicas', 'info', brokers.filter(b => b.Replicas < 1).map(b => ({ id: b.Broker, text: '' })))
      add('emptyDisk', 'Empty disks', 'Empty disk', 'info', disks.filter(x => x.d.DiskPct !== 'DEAD' && x.d.NumReplicas < 1).map(x => ({ id: x.b.Broker, text: x.path })), true)
      return groups
    },
    flaggedIds () {
      return Array.from(new Set([].concat(...this.limitGroups.map(g => g.ids))))
    },
    // the Cluster Administration action that fixes each limit, by limit key: { action, brokers (its targets), title }. A load past
    // a broker's capacity, or no leaders: Rebalance Cluster; a disk (one over the limit, its I/O, empty): Rebalance Broker Disks of
    // those brokers; no replicas (new brokers): Add Brokers; dead brokers or disks: Fix Offline Replicas
    limitFixes () {
      const titles = { rebalance: 'Rebalance Cluster', rebalance_disk: 'Rebalance Broker Disks', add: 'Add Brokers', fix_offline_replicas: 'Fix Offline Replicas' }
      const actions = { deadDisk: 'fix_offline_replicas', disk: 'rebalance', diskOfBroker: 'rebalance_disk', diskIo: 'rebalance_disk', emptyDisk: 'rebalance_disk', cpu: 'rebalance', nwIn: 'rebalance', nwOut: 'rebalance', pnwOut: 'rebalance', leaders: 'rebalance', replicas: 'add' }
      const fixes = {}
      this.limitGroups.forEach((g) => {
        let action = actions[g.key]
        let ids = g.ids
        if (g.key === 'state') {
          // dead or with bad disks: their replicas are offline; new: brokers to add; demoted on purpose: nothing to fix
          const offline = g.items.filter(it => it.text === 'DEAD' || it.text === 'BAD_DISKS')
          const added = g.items.filter(it => it.text === 'NEW')
          action = offline.length ? 'fix_offline_replicas' : added.length ? 'add' : null
          ids = action === 'add' ? added.map(it => it.id) : []
        }
        if (!action) return
        const brokers = action === 'rebalance_disk' || action === 'add' ? ids.slice().sort((a, b) => a - b) : []
        fixes[g.key] = { action, brokers, title: 'Open ' + titles[action] + (brokers.length ? ' for broker' + (brokers.length > 1 ? 's ' : ' ') + brokers.join(', ') : '') + ' in Cluster Administration and run a dry run' }
      })
      return fixes
    },
    // the brokers past a limit with their problems (in the order of the limits), by broker id
    limitByBroker () {
      const byId = {}
      this.limitGroups.forEach(g => g.items.forEach((it) => {
        const b = byId[it.id] || (byId[it.id] = { id: it.id, issues: [] })
        b.issues.push({ tone: g.tone, short: g.short, text: it.text })
      }))
      return Object.values(byId).sort((a, b) => Number(a.id) - Number(b.id))
    },
    apiMinorVersion () {
      // NnwOutRate has been changed to NwOutRate and Upstream
      // API does not expose this correctly.
      if (this.brokers && this.brokers.length > 0 && Object.prototype.hasOwnProperty.call(this.brokers[0], 'NwOutRate')) {
        return 2
      } else {
        return 1
      }
    },
    diskDetailsExist () {
      return this.brokers && this.brokers.length > 0 && this.brokers[0].DiskState
    },
    showDiskDetails () {
      return this.showPerDiskUsage && this.brokers && this.brokers.length > 0 && this.brokers[0].DiskState
    },
    // per-disk network rates are reported (newer CC with populate_disk_info=true)
    diskNetworkRows () {
      if (!this.showDiskDetails || this.apiMinorVersion !== 2) return false
      const disks = Object.values(this.brokers[0].DiskState || {})
      return disks.length > 0 && disks[0].LeaderNwInRate !== undefined
    }
  }
}
</script>

<style scoped>
.filter-input { min-width: 300px; }
.go-col { width: 1%; white-space: nowrap; }
.go-btn { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; font-size: 0.78rem; }
.go-btn .bi-chevron-right { font-size: 0.7em; }
.limit-summary { margin-bottom: 12px; padding: 8px 12px; border: 1px solid var(--glass-border); border-left: 3px solid var(--warning); border-radius: var(--radius-sm); background: var(--warning-soft); }
.limit-summary.all-ok { padding: 10px 14px; border-left-color: var(--success); background: var(--success-soft); }
.limit-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.limit-toggle { display: inline-flex; align-items: center; gap: 8px; margin-right: 6px; padding: 3px 6px 3px 2px; border: 0; border-radius: 8px; background: transparent; color: var(--text-strong); }
.limit-toggle:hover { background: var(--row-hover); }
.limit-toggle .chev { color: var(--muted); transition: transform 0.15s; }
.limit-summary.open .limit-toggle .chev { transform: rotate(90deg); }
.limit-toggle .warn { color: var(--warning); }
.tone-danger { --tone: var(--danger); --tone-soft: var(--danger-soft); }
.tone-warning { --tone: var(--warning); --tone-soft: var(--warning-soft); }
.tone-info { --tone: var(--info); --tone-soft: var(--info-soft); }
.limit-cat { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 9px; border: 1px solid var(--input-border); border-radius: 999px; background: var(--input-bg); color: var(--text); font-size: 0.8rem; }
.limit-cat::before, .limit-issue::before { content: ''; display: inline-block; flex: none; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--tone); box-shadow: 0 0 0 3px var(--tone-soft); }
.limit-cat:hover { border-color: var(--tone); color: var(--text-strong); }
.limit-cat.active { border-color: var(--tone); background: var(--tone-soft); color: var(--text-strong); font-weight: 600; }
.limit-cat:focus { outline: none; box-shadow: 0 0 0 2px var(--primary-soft); }
.limit-cat-group { display: inline-flex; align-items: stretch; }
.limit-cat-group .limit-cat:not(:last-child) { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.limit-fix { display: inline-flex; align-items: center; gap: 4px; margin-left: -1px; padding: 2px 9px 2px 7px; border: 1px solid var(--input-border); border-radius: 0 999px 999px 0; background: var(--input-bg); color: var(--primary); font-size: 0.78rem; font-weight: 600; }
.limit-fix:hover { border-color: var(--primary); background: var(--primary-soft); color: var(--text-strong); }
.limit-fix:focus { outline: none; box-shadow: 0 0 0 2px var(--primary-soft); }
.limit-brokers { max-height: 50vh; margin-top: 8px; overflow-y: auto; border-top: 1px solid var(--line); }
.limit-legend { padding: 6px 0 4px; color: var(--muted); font-size: 0.78rem; }
.limit-broker { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-top: 1px solid var(--line-faint); }
.limit-id { flex: 0 0 76px; padding: 0; border: 0; background: transparent; text-align: left; }
.limit-id:hover .id-pill { border-color: var(--primary); color: var(--primary); }
.limit-issues { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; }
.limit-issue { display: inline-flex; align-items: center; color: var(--text); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.limit-issue b { margin-right: 5px; color: var(--text-strong); font-weight: 600; }
.limit-ok { color: var(--text); font-size: 0.86rem; }
.limit-ok .bi { color: var(--success); margin-right: 4px; }
</style>
