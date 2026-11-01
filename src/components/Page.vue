<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <!-- no cluster picked yet: the clusters of config.csv -->
  <div v-if="!group || !cluster || (group === 'a' && cluster === 'b')" class="welcome">
    <h4 class="page-title"><i class="bi bi-hdd-network"></i> Pick a cluster</h4>
    <loading-state v-if="!configloaded" label="Loading config.csv ..." />
    <template v-else>
      <div v-for="(clusters, g) in $store.state.config" :key="g" class="welcome-group">
        <div class="group-label">{{ g }}</div>
        <div class="welcome-grid">
          <router-link v-for="(url, c) in clusters" :key="c" class="welcome-card" :to="'/' + g + '/' + c + '/kafka_cluster_state'">
            <i class="bi bi-hdd-stack"></i>
            <span><b>{{ c }}</b><small>{{ url }}</small></span>
            <i class="bi bi-arrow-right go"></i>
          </router-link>
        </div>
      </div>
      <p class="small text-muted mt-3">The clusters come from <code>config.csv</code>: see UI Administration › config.csv Insights. The Summary shows them all at once.</p>
    </template>
  </div>
  <div v-else-if='!configloaded'>
    <loading-state label="Loading config.csv ..." />
  </div>
  <div v-else>
    <offline></offline>
    <div class="page-head">
      <span class="text-muted"><i class="bi bi-hdd-network"></i> {{ group }}</span> <span class="text-muted">›</span> <b>{{ cluster }}</b>
    </div>
    <!-- the pages of a cluster; a dot marks the ones heavier on Cruise Control -->
    <nav class="pill-tabs">
      <router-link v-if='modules.kafkaclusterstate' class="pill" :to='{"name": "page.kafkaclusterstate", params: { group: group, cluster: cluster } }'><i class="bi bi-diagram-3"></i> Cluster State</router-link>
      <router-link v-if='modules.load' class="pill" :to='{"name": "page.load", params: { group: group, cluster: cluster } }' title="Builds the cluster model: heavier on Cruise Control"><i class="bi bi-speedometer2"></i> Cluster Load<span class="heavy"></span></router-link>
      <router-link v-if='modules.replicaload' class="pill" :to='{"name": "page.replicaload", params: { group: group, cluster: cluster } }' title="Builds the cluster model: heavier on Cruise Control"><i class="bi bi-layers"></i> Replica Load<span class="heavy"></span></router-link>
      <router-link v-if='modules.partitionload' class="pill" :to='{"name": "page.partitionload", params: { group: group, cluster: cluster } }' title="Builds the cluster model: heavier on Cruise Control"><i class="bi bi-grid-3x3-gap"></i> Partition Load<span class="heavy"></span></router-link>
      <router-link v-if='modules.state' :class="['pill', { active: inState }]" :to='{"name": "page.state", params: { group: group, cluster: cluster } }'><i class="bi bi-activity"></i> Cruise Control State</router-link>
      <router-link v-if='modules.proposals' class="pill" :to='{"name": "page.proposals", params: { group: group, cluster: cluster } }' title="Builds the cluster model: heavier on Cruise Control"><i class="bi bi-stars"></i> Proposals<span class="heavy"></span></router-link>
      <router-link v-if='modules.user_tasks' class="pill" :to='{"name": "page.user_tasks", params: { group: group, cluster: cluster } }'><i class="bi bi-list-task"></i> Tasks</router-link>
      <router-link v-if='modules.chart_page' class="pill" :to='{"name": "page.resource_distributions", params: { group: group, cluster: cluster } }'><i class="bi bi-bar-chart"></i> Resource Distributions</router-link>
      <router-link v-if='modules.review' class="pill" :to='{"name": "page.review", params: { group: group, cluster: cluster } }'><i class="bi bi-people"></i> Peer Reviews</router-link>
      <router-link v-if='modules.admin_broker' class="pill" :to='{"name": "page.admin_broker", params: { group: group, cluster: cluster } }'><i class="bi bi-sliders"></i> Cluster Administration</router-link>
    </nav>
    <transition name="fade" mode="out-in">
      <router-view></router-view><!-- this will render child components -->
    </transition>
  </div>
</template>

<script>
import Offline from '@/components/Offline'
export default {
  name: 'Page',
  props: {
    group: String,
    cluster: String
  },
  computed: {
    modules () {
      return this.$store.state.modules
    },
    // the State pill links to page.state, which redirects to one of its tabs: an exact match never happens
    inState () {
      return String(this.$route.name || '').startsWith('page.state')
    },
    configloaded () {
      return Object.keys(this.$store.state.config).length > 0
    }
  },
  components: {
    offline: Offline
  }
}
</script>

<style scoped>
.welcome-group { margin-bottom: 1.2rem; }
.group-label { margin: 0 0 7px 4px; color: var(--muted); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; }
.welcome-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.welcome-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border: 1px solid var(--glass-border); border-radius: var(--radius); background: var(--glass); color: var(--text); transition: border-color 0.15s, transform 0.1s; }
.welcome-card:hover { border-color: var(--primary); color: var(--text); text-decoration: none; transform: translateY(-1px); }
.welcome-card > .bi:first-child { color: var(--primary); font-size: 1.4rem; }
.welcome-card span { display: flex; flex-direction: column; min-width: 0; }
.welcome-card b { color: var(--text-strong); }
.welcome-card small { overflow: hidden; color: var(--muted); font-family: var(--mono); text-overflow: ellipsis; white-space: nowrap; }
.welcome-card .go { margin-left: auto; color: var(--muted); }
.page-head { font-size: 1.05rem; margin: 4px 4px 12px; }
.heavy { width: 6px; height: 6px; border-radius: 50%; background: var(--warning); opacity: 0.8; margin-left: 2px; }
</style>
