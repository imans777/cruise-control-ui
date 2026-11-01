<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- A topic regular expression (v-model) with a "Topics" button: it lists the cluster's topics (partitions, replication
     factor), searchable; clicking one adds it to the expression or removes it (picked topics are joined with "|"). An x
     button clears the field. The list comes from kafka_cluster_state?verbose=true (Kafka metadata, no cluster model), once per cluster. -->
<template>
  <div :class="['topic-input', { 'popup-open': open }]">
    <div class="input-group input-group-sm">
      <input :value="value" type="text" class="form-control" :placeholder="placeholder" :disabled="disabled"
        @input="$emit('input', $event.target.value)" @keydown.esc="open = false">
      <div class="input-group-append">
        <button v-if="value && !disabled" type="button" class="btn btn-outline-secondary clear-btn" title="Clear the field" aria-label="Clear the field" @click="clear"><i class="bi bi-x-lg"></i></button>
        <button type="button" class="btn btn-outline-secondary" :disabled="disabled" title="Pick topics of the cluster" @click="toggle">
          <i class="bi bi-list-ul"></i> Topics
        </button>
      </div>
    </div>
    <div v-if="open" class="topic-menu">
      <div class="topic-menu-head">
        <input ref="search" v-model="search" type="search" class="form-control form-control-sm" placeholder="Search topics" @keydown.esc="open = false">
      </div>
      <loading-state v-if="loadingTopics" label="Loading the topics ..." />
      <div v-else-if="loadError" class="topic-menu-note text-danger">{{ loadError }}</div>
      <div v-else class="topic-list" role="listbox" aria-multiselectable="true">
        <button v-for="t in shown" :key="t.name" type="button" role="option" :aria-selected="isPicked(t.name) ? 'true' : 'false'"
          :class="['topic-option', { picked: isPicked(t.name) }]" @click="togglePick(t.name)">
          <i :class="['bi', isPicked(t.name) ? 'bi-check-square-fill' : 'bi-square']"></i>
          <span class="topic-name">{{ t.name }}</span>
          <span class="topic-meta">{{ t.partitions }} partition{{ t.partitions === 1 ? '' : 's' }} &middot; RF {{ t.rf }}</span>
        </button>
        <div v-if="!shown.length" class="topic-menu-note">No topic matches "{{ search }}"</div>
      </div>
      <div class="topic-menu-foot">
        <span>{{ topics.length }} topics &middot; the field is a regular expression, picked topics are joined with |</span>
        <button type="button" class="btn btn-sm btn-primary" @click="open = false">Done</button>
      </div>
    </div>
  </div>
</template>

<script>
import fetchCC from '@/fetchCC'

// the topics of each cluster (by its REST URL), loaded once per page load
const cache = {}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export default {
  name: 'TopicInput',
  props: {
    value: String,
    placeholder: String,
    disabled: Boolean
  },
  data () {
    return {
      open: false,
      search: '',
      topics: [],
      loadingTopics: false,
      loadError: ''
    }
  },
  computed: {
    // the alternatives of the expression ("a|b\.c" -> ["a", "b\.c"])
    parts () {
      return String(this.value || '').split('|').map(p => p.trim()).filter(p => p)
    },
    shown () {
      const q = this.search.trim().toLowerCase()
      return q ? this.topics.filter(t => t.name.toLowerCase().includes(q)) : this.topics
    }
  },
  methods: {
    toggle () {
      this.open = !this.open
      if (this.open) {
        this.load()
        this.$nextTick(() => this.$refs.search && this.$refs.search.focus())
      }
    },
    load () {
      const key = this.$store.state.url
      if (cache[key]) {
        this.topics = cache[key]
        return
      }
      this.loadingTopics = true
      this.loadError = ''
      fetchCC(this.$helpers.getURL('kafka_cluster_state', { verbose: true })).then((result) => {
        this.loadingTopics = false
        const state = result.type === 'success' && result.data && result.data.KafkaPartitionState
        if (!state) {
          this.loadError = 'Cruise Control did not return the topics.'
          return
        }
        const byTopic = {}
        Object.values(state).forEach((list) => (list || []).forEach((p) => {
          const t = byTopic[p.topic] || (byTopic[p.topic] = { name: p.topic, partitions: 0, rf: 0 })
          t.partitions++
          t.rf = Math.max(t.rf, (p.replicas || []).length)
        }))
        this.topics = cache[key] = Object.values(byTopic).sort((a, b) => a.name.localeCompare(b.name))
      }).catch((e) => {
        this.loadingTopics = false
        this.loadError = 'The topics could not be loaded: ' + (e.message || e)
      })
    },
    clear () {
      this.$emit('input', '')
      this.open = false
    },
    isPicked (name) {
      return this.parts.includes(escapeRe(name)) || this.parts.includes(name)
    },
    togglePick (name) {
      const parts = this.isPicked(name) ? this.parts.filter(p => p !== escapeRe(name) && p !== name) : this.parts.concat([escapeRe(name)])
      this.$emit('input', parts.join('|'))
    }
  },
  mounted () {
    this.closer = (e) => { if (this.open && !this.$el.contains(e.target)) this.open = false }
    document.addEventListener('mousedown', this.closer)
  },
  beforeDestroy () {
    document.removeEventListener('mousedown', this.closer)
  }
}
</script>

<style scoped>
.topic-input { position: relative; }
.clear-btn { padding-left: 8px; padding-right: 8px; }
.topic-menu { position: absolute; z-index: 30; left: 0; right: 0; margin-top: 4px; overflow: hidden; border: 1px solid var(--input-border); border-radius: 10px; background: var(--popover); box-shadow: var(--shadow); }
.topic-menu-head { padding: 8px; border-bottom: 1px solid var(--line); }
.topic-list { max-height: 260px; padding: 4px; overflow-y: auto; }
.topic-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--text); text-align: left; }
.topic-option:hover { background: var(--row-hover); }
.topic-option.picked { background: var(--primary-soft); }
.topic-option .bi { color: var(--primary); }
.topic-name { color: var(--text-strong); font-weight: 500; word-break: break-all; }
.topic-meta { margin-left: auto; color: var(--muted); font-size: 0.78rem; white-space: nowrap; }
.topic-menu-note { padding: 10px 12px; color: var(--muted); font-size: 0.84rem; }
.topic-menu-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.76rem; }
</style>
