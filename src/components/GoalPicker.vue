<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- The goals of a request. v-model: the picked goal names in the order they were ticked, which is the priority order sent to
     Cruise Control (the number next to a picked goal is its place). "all" adds every goal that is not situational after the
     picked ones; "none" unpicks them all. -->
<template>
  <div class="goal-picker">
    <p class="small text-muted mb-1">The picked goals run in the order you tick them, highest priority first (the number is the order). <b>Bold</b>: hard goals. <span class="text-muted">Gray</span>: situational goals (hover for why).</p>
    <div class="small mb-1">
      Select: <a href="#" :class="{ 'text-muted': disabled }" title="Adds every goal that is not situational (gray) after the ones already picked" @click.prevent="all">all</a>
      &middot; <a href="#" :class="{ 'text-muted': disabled }" title="Unpicks every goal" @click.prevent="!disabled && $emit('input', [])">none</a>
    </div>
    <!-- columns read top to bottom -->
    <div class="goal-list">
      <div v-for="g in goals" :key="g.goal" class="form-check">
        <input class="form-check-input" type="checkbox" :checked="picked.includes(g.goal)" :disabled="disabled" @change="toggle(g.goal)">
        <label class="form-check-label" :title="g.description" :class="{ 'text-muted': g.situational }">
          <b v-if="g.hardGoal">{{ g.goal.replace(/Goal/, '') | splitCamelCase }}</b>
          <template v-else>{{ g.goal.replace(/Goal/, '') | splitCamelCase }}</template>
          <span v-if="picked.includes(g.goal)" class="goal-rank" :title="'Priority ' + (picked.indexOf(g.goal) + 1)">{{ picked.indexOf(g.goal) + 1 }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'GoalPicker',
  props: {
    value: { type: Array, default: () => [] },
    goals: { type: Array, default: () => [] }, // the goals offered, from goals.js
    disabled: Boolean
  },
  computed: {
    // the picked goals among the offered ones, in the order they were ticked
    picked () {
      return this.value.filter(name => this.goals.some(g => g.goal === name))
    }
  },
  methods: {
    toggle (name) {
      this.$emit('input', this.picked.includes(name) ? this.picked.filter(n => n !== name) : this.picked.concat([name]))
    },
    all () {
      if (this.disabled) return
      this.$emit('input', this.picked.concat(this.goals.filter(g => !g.situational && !this.picked.includes(g.goal)).map(g => g.goal)))
    }
  }
}
</script>

<style scoped>
.goal-list { column-count: 3; column-gap: 28px; margin-top: 4px; }
.goal-list .form-check { break-inside: avoid; padding-top: 3px; padding-bottom: 3px; padding-right: 6px; }
@media (max-width: 1100px) { .goal-list { column-count: 2; } }
.goal-rank { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; border-radius: 9px; background: var(--primary-soft); color: var(--primary); font-size: 0.7rem; font-weight: 700; vertical-align: 1px; }
</style>
