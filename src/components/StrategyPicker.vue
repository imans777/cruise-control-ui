<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Ordered pick of replica movement strategies; v-model is the list of names in chain order. -->
<template>
  <div>
    <div class="mb-1">
      <span v-if="!value.length" class="text-muted small">(CC Default: default.replica.movement.strategies)</span>
      <span v-for="(s, i) in value" :key="s" class="badge badge-info mr-1 mb-1 strategy" :title="describe(s)">
        {{ i + 1 }}. {{ s }}
        <a href="#" class="text-white ml-1" title="Remove" @click.prevent="remove(i)">&times;</a>
      </span>
    </div>
    <select class="form-control form-control-sm" v-model="picked" @change="add">
      <option value="">+ Add strategy (in chain order) ...</option>
      <option v-for="s in available" :key="s.name" :value="s.name" :title="s.description">{{ s.name }}</option>
    </select>
  </div>
</template>

<script>
import { REPLICA_MOVEMENT_STRATEGIES } from '@/ccOptions'

export default {
  name: 'StrategyPicker',
  props: {
    value: { type: Array, default: () => [] }
  },
  data () {
    return {
      picked: ''
    }
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
    add () {
      if (this.picked) {
        this.$emit('input', this.value.concat([this.picked]))
      }
      this.picked = ''
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
