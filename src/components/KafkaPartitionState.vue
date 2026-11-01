<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <!-- none: one compact line (several of them sit side by side); some: the title and the table -->
  <div v-if='partitions && partitions.length <= 0' class="health-ok"><i class="bi bi-check-circle-fill"></i> {{ successTitle }}</div>
  <div v-else-if='partitions' class="pstate-full">
    <h4><i class="bi bi-exclamation-octagon-fill text-danger"></i> {{ title }} <span class="badge badge-danger">{{ partitions.length }}</span></h4>
    <p class="small text-muted" v-if='!filtered.length'><i class="bi bi-funnel"></i> None of the {{ partitions.length }} matches the filter.</p>
    <!-- more rows than fit: the table scrolls in a box of its own (its header floats at the box's top), the pager stays below -->
    <div v-else ref="box" class="pstate-scroll">
    <table class="table table-sm table-bordered mb-0">
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
    </table>
    </div>
    <div v-if="filtered.length" class="pager">
      <span class="text-muted">{{ (pageNumber - 1) * perpage + 1 }}–{{ Math.min(pageNumber * perpage, filtered.length) }} of {{ filtered.length }}<template v-if="filtered.length !== partitions.length"> (filtered from {{ partitions.length }})</template></span>
      <segmented-control v-model="perpage" :options="perpageOptions" aria-label="Rows per page" class="ml-auto">Rows</segmented-control>
      <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="pageNumber <= 1" aria-label="Previous page" @click="pageNumber--"><i class="bi bi-chevron-left"></i></button>
      <span>Page {{ pageNumber }} of {{ Math.max(1, pages.length) }}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="pageNumber >= pages.length" aria-label="Next page" @click="pageNumber++"><i class="bi bi-chevron-right"></i></button>
    </div>
  </div>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'
import SegmentedControl from '@/components/SegmentedControl'

export default {
  name: 'KafkaPartitionState',
  components: {
    SegmentedControl
  },
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
      perpage: 10, // total number of partitions to show in one page
      perpageOptions: [10, 25, 50, 100].map(n => ({ value: n, label: String(n) }))
    }
  },
  watch: {
    perpage () {
      this.pageNumber = 1
    },
    filter () {
      this.pageNumber = 1
    },
    // another page starts at the top of the box
    pageNumber () {
      if (this.$refs.box) this.$refs.box.scrollTop = 0
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
.pstate-scroll { --sticky-top: 0px; max-height: 70vh; overflow-y: auto; border-radius: var(--radius-sm); }
.pager { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; font-size: 0.82rem; }
.pointer { cursor: pointer; }
</style>
