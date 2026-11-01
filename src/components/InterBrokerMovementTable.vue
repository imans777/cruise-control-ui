<template>
  <div class="card-deck mb-3" v-if="!hideEmpty || movements.length">
    <h4 v-if="title">{{ title }} ({{ movements.length }})</h4>
    <div class="form-inline mb-2">
      <input type="text" class="form-control form-control-sm filter-input" v-model="filterTopic" placeholder="Filter: broker ids (e.g. 1, 3) or topic" title="Comma- or space-separated: a number matches the movements with that broker among the old or new replicas, any other text a part of the topic">
      <button class="btn btn-sm btn-secondary ml-1" style="padding: 1px 2px;" @click='toReassignmentJson' title="Open Console Debug Panel and copy json object. Use this if you want a generic good proposal but you need additional modifications. Logdir moves are included as log_dirs.">Create reassignment.json ❓</button>
    </div>
    <table :class="tableClass">
      <thead :class="theadClass">
        <tr>
          <th>Topic</th>
          <th>Partition</th>
          <th v-if="intraBrokerOnly" title="The partition's replicas (they stay the same: only the disk of a replica changes)">Replicas ❓</th>
          <th v-if="!intraBrokerOnly">Old Replica</th>
          <th v-if="!intraBrokerOnly">New Replica</th>
          <th v-if="hasLogdirs" :title="intraBrokerOnly ? 'The broker whose replica moves to another disk: disk before → after' : 'Brokers whose replica logdir changes: before → after'">{{ intraBrokerOnly ? 'Disk Moves' : 'Logdir Moves' }} ❓</th>
          <th v-if="hasProgress">Data Movement Progress</th>
          <th v-if="filteredMovements[0]?.type">Movement Type</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(h, idx) in filteredMovements" :key="idx">
          <td>{{ h.proposal.topicPartition.topic }}</td>
          <td>{{ h.proposal.topicPartition.partition }}</td>
          <td v-if="intraBrokerOnly">{{ h.proposal.newReplicas.join(', ') }}</td>
          <td v-if="!intraBrokerOnly">
              <span v-for="(oldReplica, idx) in h.proposal.oldReplicas" :key="idx">
              <span v-if="idx !== 0">,</span>
              <span v-if="h.proposal.newReplicas.includes(oldReplica)">{{ oldReplica }}</span>
              <span v-else class="text-danger">{{ oldReplica }}</span>
            </span>
          </td>
          <td v-if="!intraBrokerOnly">
            <span v-for="(newReplica, idx) in h.proposal.newReplicas" :key="idx">
              <span v-if="idx !== 0">,</span>
              <span v-if="h.proposal.oldReplicas.includes(newReplica)">{{ newReplica }}</span>
              <span v-else class="text-success">{{ newReplica }}</span>
            </span>
          </td>
          <td v-if="hasLogdirs">
            <logdir-moves v-if="h.proposal.newReplicaLogdirs" :proposal="h.proposal" />
          </td>
          <td v-if="hasProgress"><task-progress :task="h" /></td>
          <td v-if="filteredMovements[0]?.type">{{ h.type }}</td>
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
      const obj = { version: 1, partitions }
      console.log('reassignment.json: ', obj)
    }
  },
  computed: {
    filteredMovements () {
      // a broker matches the movements it is a replica of, before or after
      const f = parseFilter(this.filterTopic)
      return this.movements.filter(m => matchesFilter(f, (m.proposal.oldReplicas || []).concat(m.proposal.newReplicas || []), [m.proposal.topicPartition.topic]))
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
