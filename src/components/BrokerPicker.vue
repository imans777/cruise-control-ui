<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Pick a set of brokers (v-model: an array of broker ids): chips for the picked ones, and a searchable list of the
     others, so that it stays usable with hundreds of brokers -->
<template>
  <div class="broker-picker">
    <div class="chips">
      <span v-for="id in value" :key="id" class="badge badge-primary mr-1 mb-1 chip">
        {{ id }} <a href="#" class="text-white ml-1" title="Remove" @click.prevent="remove(id)">&times;</a>
      </span>
      <span v-if="!value.length" class="small text-muted">{{ emptyText }}</span>
    </div>
    <div class="input-group input-group-sm">
      <input v-model="query" type="text" class="form-control" :placeholder="'Add: broker id, host or rack (' + offered.length + ' brokers)'"
        @focus="open = true" @keydown.enter.prevent="addFirst" @keydown.esc="open = false">
      <div class="input-group-append">
        <button type="button" class="btn btn-outline-secondary" :disabled="!offered.length" @click="all">all</button>
        <button type="button" class="btn btn-outline-secondary" :disabled="!value.length" @click="$emit('input', [])">none</button>
      </div>
    </div>
    <div v-if="open && matches.length" class="list-group options">
      <a v-for="b in matches" :key="b.id" href="#" class="list-group-item list-group-item-action py-1" @mousedown.prevent="add(b.id)">
        <b>{{ b.id }}</b> <small class="text-muted">{{ b.host }}<template v-if="b.rack"> &middot; {{ b.rack }}</template></small>
      </a>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BrokerPicker',
  props: {
    // the picked broker ids
    value: { type: Array, required: true },
    // [{ id, host, rack }]
    brokers: { type: Array, required: true },
    // broker ids that cannot be picked here (e.g. the brokers being removed)
    exclude: { type: Array, default: () => [] },
    emptyText: { type: String, default: 'none' }
  },
  data () {
    return {
      query: '',
      open: false
    }
  },
  computed: {
    // the brokers that can be picked and are not picked yet
    offered () {
      const out = new Set(this.exclude.map(Number).concat(this.value.map(Number)))
      return this.brokers.filter(b => !out.has(Number(b.id)))
    },
    matches () {
      const q = this.query.trim().toLowerCase()
      const list = q ? this.offered.filter(b => String(b.id).startsWith(q) || (b.host || '').toLowerCase().includes(q) || (b.rack || '').toLowerCase().includes(q)) : this.offered
      return list.slice(0, 50)
    }
  },
  watch: {
    // a broker that becomes excluded (e.g. selected for removal) is dropped from the picked ones
    exclude (ids) {
      const out = new Set(ids.map(Number))
      if (this.value.some(id => out.has(Number(id)))) this.$emit('input', this.value.filter(id => !out.has(Number(id))))
    }
  },
  methods: {
    emitSorted (ids) {
      this.$emit('input', Array.from(new Set(ids.map(Number))).sort((a, b) => a - b))
    },
    add (id) {
      this.emitSorted(this.value.concat([id]))
      this.query = ''
    },
    addFirst () {
      if (this.matches.length) this.add(this.matches[0].id)
    },
    remove (id) {
      this.$emit('input', this.value.filter(x => Number(x) !== Number(id)))
    },
    all () {
      this.emitSorted(this.value.concat(this.offered.map(b => b.id)))
    }
  },
  mounted () {
    this.closer = (e) => { if (!this.$el.contains(e.target)) this.open = false }
    document.addEventListener('click', this.closer)
  },
  beforeDestroy () {
    document.removeEventListener('click', this.closer)
  }
}
</script>

<style scoped>
.broker-picker { position: relative; }
.chips { max-height: 90px; overflow-y: auto; }
.chip { font-size: 90%; }
.options { position: absolute; z-index: 20; width: 100%; max-height: 240px; overflow-y: auto; box-shadow: 0 4px 10px rgba(0, 0, 0, .15); }
</style>
