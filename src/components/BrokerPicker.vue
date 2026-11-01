<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Pick a set of brokers (v-model: an array of broker ids): chips for the picked ones, and a searchable list of the
     others, so that it stays usable with hundreds of brokers -->
<template>
  <div :class="['broker-picker', { 'popup-open': open }]">
    <div class="chips">
      <span v-for="id in value" :key="id" class="chip" :data-id="id">
        <i class="bi bi-hdd-stack"></i> Broker {{ id }}
        <button type="button" class="chip-remove" :title="'Remove broker ' + id" :aria-label="'Remove broker ' + id" @click="remove(id)"><i class="bi bi-x"></i></button>
      </span>
      <span v-if="!value.length" class="small text-muted">{{ emptyText }}</span>
    </div>
    <div class="input-group input-group-sm">
      <input v-model="query" type="text" class="form-control" :placeholder="'Add: broker id, host or rack (' + offered.length + ' brokers)'"
        role="combobox" :aria-expanded="open ? 'true' : 'false'"
        @focus="open = true" @click="open = true" @blur="open = false" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="addActive" @keydown.esc="open = false">
      <div class="input-group-append">
        <button type="button" class="btn btn-outline-secondary" title="Pick every broker offered" :disabled="!offered.length" @click="all">all</button>
        <button type="button" class="btn btn-outline-secondary" title="Clear the picked brokers" :disabled="!value.length" @click="$emit('input', [])">none</button>
      </div>
    </div>
    <!-- the brokers not picked yet; mousedown keeps the focus in the field, so several can be added in a row -->
    <div v-if="open" class="options" role="listbox">
      <div class="options-head">{{ query ? matches.length + ' of ' + offered.length + ' brokers match' : offered.length + ' brokers to add' }} &middot; click, or Enter</div>
      <button v-for="(b, i) in matches" :key="b.id" type="button" role="option" tabindex="-1" :aria-selected="i === active ? 'true' : 'false'"
        :class="['option', { active: i === active }]" @mousedown.prevent="add(b.id)" @mouseenter="active = i">
        <span class="option-id">Broker <b>{{ b.id }}</b></span>
        <span class="option-meta">{{ b.host }}<template v-if="b.rack"> &middot; rack {{ b.rack }}</template><template v-if="b.meta">{{ b.host || b.rack ? ' · ' : '' }}{{ b.meta }}</template></span>
        <i class="bi bi-plus-lg option-add"></i>
      </button>
      <div v-if="!matches.length" class="options-empty">{{ loading ? 'Loading the brokers ...' : offered.length ? 'No broker matches "' + query + '"' : 'Every broker is picked' }}</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BrokerPicker',
  props: {
    // the picked broker ids
    value: { type: Array, required: true },
    // [{ id, host, rack, meta? }]
    brokers: { type: Array, required: true },
    // broker ids that cannot be picked here (e.g. the brokers being removed)
    exclude: { type: Array, default: () => [] },
    emptyText: { type: String, default: 'none' },
    // the brokers are still being fetched
    loading: Boolean
  },
  data () {
    return {
      query: '',
      open: false,
      active: 0 // the highlighted option (arrow keys, mouse)
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
    query () {
      this.active = 0
    },
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
    addActive () {
      const b = this.matches[Math.min(this.active, this.matches.length - 1)]
      if (b) this.add(b.id)
    },
    move (step) {
      this.open = true
      if (this.matches.length) this.active = (this.active + step + this.matches.length) % this.matches.length
    },
    remove (id) {
      this.$emit('input', this.value.filter(x => Number(x) !== Number(id)))
    },
    all () {
      this.emitSorted(this.value.concat(this.offered.map(b => b.id)))
    }
  }
}
</script>

<style scoped>
.broker-picker { position: relative; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 96px; margin-bottom: 6px; overflow-y: auto; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 10px; border: 1px solid rgba(129, 140, 248, 0.5); border-radius: 999px; background: var(--primary-soft); color: var(--text-strong); font-size: 0.82rem; font-weight: 500; }
.chip .bi-hdd-stack { color: var(--primary); }
.chip-remove { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); }
.chip-remove:hover, .chip-remove:focus { outline: none; background: var(--danger-soft); color: var(--danger); }
/* an opaque popup: the page must not show through the brokers */
.options { position: absolute; z-index: 30; left: 0; right: 0; max-height: 280px; margin-top: 4px; padding: 4px; overflow-y: auto; border: 1px solid var(--input-border); border-radius: 10px; background: var(--popover); box-shadow: var(--shadow); }
.options-head { padding: 4px 10px 6px; color: var(--muted); font-size: 0.72rem; }
.option { display: flex; align-items: center; gap: 12px; width: 100%; padding: 7px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--text); text-align: left; }
.option.active { background: var(--primary-soft); }
.option-id { min-width: 84px; color: var(--text-strong); }
.option-meta { color: var(--muted); font-size: 0.82rem; }
.option-add { margin-left: auto; color: var(--primary); opacity: 0; }
.option.active .option-add { opacity: 1; }
.options-empty { padding: 8px 10px; color: var(--muted); font-size: 0.82rem; }
</style>
