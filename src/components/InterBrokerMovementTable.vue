<template>
  <!-- the title, then (when there are movements) the filter and the download, then the table -->
  <div class="movement-table" v-if="!hideEmpty || movements.length">
    <!-- the title and the tools float over a long table -->
    <div v-sticky class="movement-head">
      <h4 v-if="title">{{ title }} <span class="count-pill">{{ movements.length }}</span></h4>
      <div v-if="movements.length" class="movement-tools">
        <span v-if="!filter.empty" class="small text-muted">{{ filteredMovements.length }} of {{ movements.length }}</span>
        <input type="text" class="form-control form-control-sm filter-input" v-model="filterTopic" placeholder="Filter: broker ids (e.g. 1, 3) or topic" title="Comma- or space-separated: a number matches the movements with a broker id containing it among the old or new replicas, any other text a part of the topic">
        <button class="btn btn-sm btn-outline-secondary" @click='toReassignmentJson' title="The movements shown (after the filter) as a kafka-reassign-partitions.sh file, to start from and adjust. Disk moves are in log_dirs."><i class="bi bi-download"></i> reassignment.json</button>
      </div>
    </div>
    <div v-if="!movements.length" class="movement-none">None.</div>
    <table v-else :class="tableClass">
      <thead :class="theadClass">
        <tr>
          <th>Topic</th>
          <th>Partition</th>
          <th v-if="intraBrokerOnly" title="The partition's replicas (they stay the same: only the disk of a replica changes)">Replicas <i class="bi bi-question-circle help-icon"></i></th>
          <th v-if="!intraBrokerOnly">Old Replica</th>
          <th v-if="!intraBrokerOnly">New Replica</th>
          <th v-if="hasLogdirs" :title="intraBrokerOnly ? 'The broker whose replica moves to another disk: disk before → after' : 'Brokers whose replica logdir changes: before → after'">{{ intraBrokerOnly ? 'Disk Moves' : 'Logdir Moves' }} <i class="bi bi-question-circle help-icon"></i></th>
          <th v-if="hasProgress">Data Movement Progress</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(h, idx) in filteredMovements" :key="idx">
          <td><hit-text :text="h.proposal.topicPartition.topic" :filter="filter" /></td>
          <td>{{ h.proposal.topicPartition.partition }}</td>
          <!-- the replicas as broker pills; red: leaves the partition, green: joins it (data-ids: the list as text) -->
          <td v-if="intraBrokerOnly" :data-ids="h.proposal.newReplicas.join(', ')">
            <span class="id-list"><span v-for="(r, idx) in h.proposal.newReplicas" :key="idx" :class="['id-pill', { hit: filter.hitId(r) }]">{{ r }}</span></span>
          </td>
          <td v-if="!intraBrokerOnly" :data-ids="h.proposal.oldReplicas.join(', ')">
            <span class="id-list"><span v-for="(r, idx) in h.proposal.oldReplicas" :key="idx" :class="['id-pill', { out: !h.proposal.newReplicas.includes(r), hit: filter.hitId(r) }]" :title="h.proposal.newReplicas.includes(r) ? null : 'Leaves the partition'">{{ r }}</span></span>
          </td>
          <td v-if="!intraBrokerOnly" :data-ids="h.proposal.newReplicas.join(', ')">
            <span class="id-list"><span v-for="(r, idx) in h.proposal.newReplicas" :key="idx" :class="['id-pill', { in: !h.proposal.oldReplicas.includes(r), hit: filter.hitId(r) }]" :title="h.proposal.oldReplicas.includes(r) ? null : 'Joins the partition'">{{ r }}</span></span>
          </td>
          <td v-if="hasLogdirs">
            <logdir-moves v-if="h.proposal.newReplicaLogdirs" :proposal="h.proposal" :filter="filter" />
          </td>
          <td v-if="hasProgress"><task-progress :task="h" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'
import LogdirMoves from '@/components/LogdirMoves'
import TaskProgress from '@/components/TaskProgress'

export default {
  name: 'InterBrokerMovementTable',
  components: {
    LogdirMoves,
    TaskProgress
  },
  props: {
    title: { type: String, required: true },
    movements: { type: Array, default: () => [] },
    hideEmpty: { type: Boolean, default: false },
    tableClass: { type: String, default: 'table table-sm table-bordered' },
    theadClass: { type: String, default: 'thead-light' }
  },
  data () {
    return {
      filterTopic: ''
    }
  },
  methods: {
    toReassignmentJson () {
      const partitions = this.filteredMovements.map(m => {
        const p = {
          topic: m.proposal.topicPartition.topic,
          partition: m.proposal.topicPartition.partition,
          replicas: m.proposal.newReplicas
        }
        if (m.proposal.newReplicaLogdirs) {
          p.log_dirs = m.proposal.newReplicas.map(b => m.proposal.newReplicaLogdirs[b] || 'any')
        }
        return p
      })
      // downloaded as a file
      const blob = new Blob([JSON.stringify({ version: 1, partitions }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'reassignment.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }
  },
  computed: {
    filter () {
      return parseFilter(this.filterTopic)
    },
    filteredMovements () {
      // a broker matches the movements it is a replica of, before or after
      return this.movements.filter(m => matchesFilter(this.filter, (m.proposal.oldReplicas || []).concat(m.proposal.newReplicas || []), [m.proposal.topicPartition.topic]))
    },
    hasLogdirs () {
      return this.movements.some(m => m.proposal && m.proposal.newReplicaLogdirs)
    },
    // every movement keeps its replicas (and their order): disk moves only, so one Replicas column instead of old/new
    intraBrokerOnly () {
      return this.hasLogdirs && this.movements.length > 0 &&
        this.movements.every(m => JSON.stringify(m.proposal.oldReplicas) === JSON.stringify(m.proposal.newReplicas))
    },
    hasProgress () {
      return this.movements.some(m => m.movedDataInMB !== undefined && m.movedDataInMB !== null)
    }
  }
}
</script>

<style scoped>
.filter-input { min-width: 300px; }
</style>
