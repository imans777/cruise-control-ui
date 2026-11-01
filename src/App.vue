<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div id="app">
    <app-nav></app-nav>
    <div class="container-fluid" id="page">
      <transition mode="out-in">
        <router-view></router-view>
      </transition>
    </div>
    <p class="footer text-center text-muted small">&copy; 2017-2019 <a href="https://linkedin.com">LinkedIn</a>.</p>
    <transition name="fade">
      <button v-if="showTop" type="button" class="back-to-top" title="Back to top" aria-label="Back to top" @click="toTop"><i class="bi bi-arrow-up"></i></button>
    </transition>
  </div>
</template>

<script>
import AppNav from '@/components/AppNav'
// the browser tab title of each page
const TITLES = {
  summary: 'Summary',
  preferences: 'Preferences',
  configInsights: 'Config Insights',
  'page.state.executor': 'Executor',
  'page.state.monitor': 'Monitor',
  'page.state.analyzer': 'Analyzer',
  'page.state.anomaly_detector': 'Anomaly Detector',
  'page.kafkaclusterstate': 'Cluster State',
  'page.load': 'Cluster Load',
  'page.replicaload': 'Replica Load',
  'page.proposals': 'Proposals',
  'page.partitionload': 'Partition Load',
  'page.user_tasks': 'Tasks',
  'page.admin_state': 'Cruise Control State',
  'page.resource_distributions': 'Resource Distributions',
  'page.admin_broker': 'Cluster Administration',
  'page.review': 'Peer Reviews'
}

export default {
  name: 'app',
  components: {
    AppNav
  },
  data () {
    return {
      showTop: false
    }
  },
  watch: {
    $route: {
      immediate: true,
      handler (r) {
        const where = r.params.group && r.params.cluster ? r.params.group + '/' + r.params.cluster : null
        document.title = [TITLES[r.name], where, 'Cruise Control'].filter(x => x).join(' · ')
      }
    }
  },
  mounted () {
    window.addEventListener('scroll', this.onScroll, { passive: true })
  },
  beforeDestroy () {
    window.removeEventListener('scroll', this.onScroll)
  },
  methods: {
    onScroll () {
      this.showTop = window.scrollY > 700
    },
    toTop () {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
}
</script>

<style>
#page { margin-top: 18px; padding: 0 22px; }
.footer { margin: 28px 0 16px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter, .fade-leave-to { opacity: 0; }
</style>
