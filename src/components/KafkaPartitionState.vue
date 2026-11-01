<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <!-- none: one compact line (several of them sit side by side); some: the title and the table -->
  <div v-if='partitions && partitions.length <= 0' class="health-ok"><i class="bi bi-check-circle-fill"></i> {{ successTitle }}</div>
  <div v-else-if='partitions' class="pstate-full">
    <h4><i class="bi bi-exclamation-octagon-fill text-danger"></i> {{ title }} <span class="badge badge-danger">{{ partitions.length }}</span></h4>
    <p class="small text-muted" v-if='!filtered.length'><i class="bi bi-funnel"></i> None of the {{ partitions.length }} matches the filter.</p>
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
          <td><hit-text :text="part.topic" :filter="parsed" /></td>
          <td>{{ part.partition }}</td>
          <td :data-ids="ids(part.replicas)"><span class="id-list"><span v-for="r in part.replicas" :key="r" :class="['id-pill', { hit: parsed.hitId(r) }]">{{ r }}</span></span></td>
          <td><span v-if="part.leader != null && part.leader !== -1" :class="['id-pill', { hit: parsed.hitId(part.leader) }]">{{ part.leader }}</span><span v-else class="text-danger">none</span></td>
          <td :data-ids="ids(part['in-sync'])"><span class="id-list"><span v-for="r in part['in-sync']" :key="r" :class="['id-pill', { hit: parsed.hitId(r) }]">{{ r }}</span></span></td>
          <td :data-ids="ids(part['out-of-sync'])" :class='part["out-of-sync"] && part["out-of-sync"].length ? "table-danger" : null'><span class="id-list"><span v-for="r in part['out-of-sync']" :key="r" :class="['id-pill', { hit: parsed.hitId(r) }]">{{ r }}</span></span></td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan=6>
            <div class="pager">
              <span class="text-muted">{{ filtered.length ? (pageNumber - 1) * perpage + 1 : 0 }}–{{ Math.min(pageNumber * perpage, filtered.length) }} of {{ filtered.length }}<template v-if="filtered.length !== partitions.length"> (filtered from {{ partitions.length }})</template></span>
              <span class="ml-auto text-muted">Rows</span>
              <select v-model.number='perpage' class="custom-select custom-select-sm pager-size" aria-label="Rows per page">
                <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option>
              </select>
              <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="pageNumber <= 1" aria-label="Previous page" @click="pageNumber--"><i class="bi bi-chevron-left"></i></button>
              <span>Page {{ pageNumber }} of {{ Math.max(1, pages.length) }}</span>
              <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="pageNumber >= pages.length" aria-label="Next page" @click="pageNumber++"><i class="bi bi-chevron-right"></i></button>
            </div>
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
    perpage () {
      this.pageNumber = 1
    },
    filter () {
      this.pageNumber = 1
    }
  },
  computed: {
    parsed () {
      return parseFilter(this.filter)
    },
    filtered () {
      const rows = this.partitions.filter(p => matchesFilter(this.parsed, p.replicas, [p.topic]))
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
    // a broker id list as "[1,2]" (as it was shown before the pills)
    ids (list) {
      return JSON.stringify(list || [])
    },
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
.pager { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.82rem; }
.pager-size { width: auto; }
.pointer { cursor: pointer; }
</style>
