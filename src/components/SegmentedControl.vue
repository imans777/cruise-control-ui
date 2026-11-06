<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- One choice out of a few, all visible: v-model is the value of the pressed option; options: [{ value, label, title? }] -->
<template>
  <div class="segmented" role="radiogroup" :aria-label="ariaLabel">
    <span v-if="$slots.default" class="seg-label"><slot></slot></span>
    <button v-for="o in options" :key="String(o.value)" type="button" role="radio" :aria-checked="value === o.value ? 'true' : 'false'"
      :class="['seg', { active: value === o.value }]" :title="o.title" :disabled="disabled" @click="$emit('input', o.value)">{{ o.label }}</button>
  </div>
</template>

<script>
export default {
  name: 'SegmentedControl',
  props: {
    value: [String, Number, Boolean],
    options: { type: Array, required: true },
    ariaLabel: String,
    disabled: Boolean
  }
}
</script>

<style scoped>
.segmented { display: inline-flex; justify-self: start; width: max-content; max-width: 100%; padding: 3px; gap: 2px; border: 1px solid var(--input-border); border-radius: 10px; background: var(--input-bg); }
.seg { padding: 4px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font-size: 0.84rem; font-weight: 500; white-space: nowrap; transition: background 0.12s, color 0.12s; }
.seg:hover:not(:disabled) { color: var(--text-strong); background: var(--row-hover); }
.seg:focus { outline: none; box-shadow: 0 0 0 2px var(--primary-soft); }
.seg.active { background: linear-gradient(135deg, var(--primary-strong), #8b5cf6); color: #fff; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35); }
.seg:disabled { opacity: 0.5; cursor: not-allowed; }
.seg-label { display: inline-flex; align-items: center; gap: 5px; padding: 0 8px 0 6px; color: var(--muted); font-size: 0.8rem; }
</style>
