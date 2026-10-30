<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div v-if='partitions'>
    <h4>{{ title }}</h4>
    <div class="alert alert-success" v-if='partitions.length <= 0'>{{ successTitle }}</div>
    <div class="alert alert-secondary" v-else-if='!filtered.length'>None of the {{ partitions.length }} matches the filter.</div>
    <table class="table table-sm table-bordered" v-else>
      <thead class="thead-light">
        <tr>
          <th class="pointer" @click="sortBy('topic')">Kafka Topic {{ arrow('topic') }}</th>
          <th class="pointer" @click="sortBy('partition')">Partition {{ arrow('partition') }}</th>
          <th>Replicas</th>
          <th class="pointer" @click="sortBy('leader')">Leader {{ arrow('leader') }}</th>
          <th>In-Sync</th>
          <th>Out-Of-Sync</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for='part in pagepartitions' :key='part.topic + "-" + part.partition'>
          <td>{{ part.topic }}</td>
          <td>{{ part.partition }}</td>
          <td>{{ part.replicas }}</td>
          <td>{{ part.leader }}</td>
          <td>{{ part['in-sync'] }}</td>
          <td :class='part["out-of-sync"] && part["out-of-sync"].length ? "table-danger" : null'>{{ part['out-of-sync'] }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan=3>
            Found {{ filtered.length }}<template v-if="filtered.length !== partitions.length"> of {{ partitions.length }}</template> Records
          </td>
          <td colspan=3 class='text-right'>
            <label> #Records Per Page:</label>
            <input v-model.number='perpage' type='number' min='1'>
            <label> Page #</label>
            <select v-model='pageNumber'>
              <option v-for='p in pages' :key='p' :value='p'>{{ p }}</option>
            </select>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'

export default {
  name: 'KafkaPartitionState',
  props: {
    title: String,
    successTitle: String,
    partitions: Array,
    // a broker matches the partitions it is a replica of; other text a part of the topic
    filter: { type: String, default: '' }
  },
  data () {
    return {
      sortKey: 'leader',
      ascending: true,
      pageNumber: 1, // default page number data to be shown when initialized for first time
      perpage: 10 // total number of partitions to show in one page
    }
  },
  watch: {
    filter () {
      this.pageNumber = 1
    }
  },
  computed: {
    filtered () {
      const f = parseFilter(this.filter)
      const rows = this.partitions.filter(p => matchesFilter(f, p.replicas, [p.topic]))
      // the chosen column, then topic and partition
      const key = this.sortKey
      const cmp = (a, b) => key === 'topic' ? String(a.topic).localeCompare(String(b.topic)) : Number(a[key]) - Number(b[key])
      const sign = this.ascending ? 1 : -1
      return rows.slice().sort((a, b) => sign * cmp(a, b) || String(a.topic).localeCompare(String(b.topic)) || a.partition - b.partition)
    },
    pages () {
      const list = []
      for (let i = 0; i < this.filtered.length / Math.max(1, this.perpage); i++) {
        list.push(i + 1)
      }
      return list
    },
    pagepartitions () {
      const start = (this.pageNumber - 1) * this.perpage
      return this.filtered.slice(start, start + Math.max(1, this.perpage))
    }
  },
  methods: {
    arrow (key) {
      return this.sortKey === key ? (this.ascending ? '▲' : '▼') : ''
    },
    sortBy (key) {
      this.ascending = this.sortKey === key ? !this.ascending : true
      this.sortKey = key
      this.pageNumber = 1
    }
  }
}
</script>

<style scoped>
.pointer { cursor: pointer; }
</style>
