<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Ordered pick of replica movement strategies; v-model is the list of names in chain order. -->
<template>
  <!-- the chain (numbered, in order) and the strategies left to add; the full names and descriptions are in the tooltips -->
  <div class="strategy-picker">
    <div class="strategy-chain">
      <span v-if="!value.length" class="text-muted small">none: Cruise Control's default.replica.movement.strategies</span>
      <span v-for="(s, i) in value" :key="s" class="strategy-chip" :data-name="s" :title="s + ': ' + describe(s)">
        <span class="strategy-no">{{ i + 1 }}</span>{{ short(s) }}
        <button type="button" class="strategy-remove" :aria-label="'Remove ' + s" title="Remove" @click="remove(i)"><i class="bi bi-x"></i></button>
      </span>
    </div>
    <div v-if="available.length" class="strategy-options">
      <button v-for="s in available" :key="s.name" type="button" class="strategy-add" :data-name="s.name" :title="s.name + ': ' + s.description" @click="add(s.name)"><i class="bi bi-plus"></i>{{ short(s.name) }}</button>
    </div>
  </div>
</template>

<script>
import { REPLICA_MOVEMENT_STRATEGIES } from '@/ccOptions'

export default {
  name: 'StrategyPicker',
  props: {
    value: { type: Array, default: () => [] }
  },
  computed: {
    available () {
      return REPLICA_MOVEMENT_STRATEGIES.filter(s => !this.value.includes(s.name))
    }
  },
  methods: {
    describe (name) {
      const s = REPLICA_MOVEMENT_STRATEGIES.find(x => x.name === name)
      return s ? s.description : ''
    },
    // "ThrottleAwareReplicaMovementStrategy" -> "Throttle Aware"
    short (name) {
      return name.replace(/(Replica)?(Movement)?Strategy$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
    },
    add (name) {
      this.$emit('input', this.value.concat([name]))
    },
    remove (i) {
      const next = this.value.slice()
      next.splice(i, 1)
      this.$emit('input', next)
    }
  }
}
</script>

<style scoped>
.strategy { font-size: 85%; font-weight: normal; }
</style>

<style scoped>
.strategy-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 26px; margin-bottom: 6px; }
.strategy-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px 2px 3px; border: 1px solid rgba(129, 140, 248, 0.5); border-radius: 999px; background: var(--primary-soft); color: var(--text-strong); font-size: 0.8rem; }
.strategy-no { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--primary-strong); color: #fff; font-size: 0.7rem; font-weight: 700; }
.strategy-remove { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); }
.strategy-remove:hover, .strategy-remove:focus { outline: none; background: var(--danger-soft); color: var(--danger); }
.strategy-options { display: flex; flex-wrap: wrap; gap: 6px; }
.strategy-add { display: inline-flex; align-items: center; gap: 3px; padding: 2px 10px 2px 7px; border: 1px dashed var(--input-border); border-radius: 999px; background: transparent; color: var(--muted); font-size: 0.78rem; }
.strategy-add:hover, .strategy-add:focus { outline: none; border-color: var(--primary); color: var(--text-strong); }
</style>
