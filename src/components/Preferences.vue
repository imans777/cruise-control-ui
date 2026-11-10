<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <!-- settings of this UI (not of Cruise Control), by topic -->
  <div class="prefs">
    <h4 class="page-title"><i class="bi bi-sliders"></i> Preferences</h4>
    <div class="card mb-3">
      <div class="card-header">Pages <small class="text-muted font-weight-normal ml-2">the tabs of a cluster</small></div>
      <div class="card-body p-0">
        <label v-for="(v, k) in $store.state.modules" :key='k' class="pref-row">
          <span><b>{{ moduleLabels[k] || $options.filters.camelCase(k) }}</b></span>
          <input type="checkbox" class="switch" v-model="$store.state.modules[k]">
        </label>
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-header">Help</div>
      <div class="card-body p-0">
        <label class="pref-row">
          <span><b>Hide the REST calls</b><small>The URL a page calls, shown above it (with a copy button) when this is off</small></span>
          <input type="checkbox" class="switch" v-model="$store.state.hideHelperURL">
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Errors</div>
      <div class="card-body p-0">
        <label class="pref-row">
          <span><b>Open the details of errors</b><small>Cruise Control's stack trace, otherwise behind "Show details"</small></span>
          <input type="checkbox" class="switch" v-model="$store.state.showFullStackTrace">
        </label>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Preferences',
  data () {
    return {
      store: this.$store,
      moduleLabels: {
        kafkaclusterstate: 'Cluster State',
        load: 'Cluster Load',
        replicaload: 'Replica Load',
        partitionload: 'Partition Load',
        state: 'Cruise Control State',
        proposals: 'Proposals',
        user_tasks: 'Tasks',
        chart_page: 'Resource Distributions',
        review: 'Peer Reviews',
        admin_broker: 'Cluster Administration'
      }
    }
  }
}
</script>

<style scoped>
.prefs { max-width: 760px; }
.pref-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0; padding: 11px 18px; cursor: pointer; }
.pref-row + .pref-row { border-top: 1px solid var(--line); }
.pref-row:hover { background: var(--row-hover); }
.pref-row span { display: flex; flex-direction: column; }
.pref-row b { color: var(--text-strong); font-weight: 500; }
.pref-row small { color: var(--muted); }
</style>
