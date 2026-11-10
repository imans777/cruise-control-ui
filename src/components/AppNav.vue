<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <nav class="topbar">
    <a href="#" target="_self" class="brand">
      <img height=30 :src="cclogo" alt="LinkedIn Kafka Cruise Control Frontend" />
    </a>
    <router-link class="topbar-link" :to='{name: "summary"}'><i class="bi bi-grid-1x2"></i> Summary</router-link>
    <!-- the clusters of config.csv, one menu per group -->
    <div class="dropdown" v-for="(groupm, forgroup) in groups" :key="forgroup">
      <a href="#" :class="['topbar-link', 'dropdown-toggle', { current: currentGroup === forgroup }]" data-toggle='dropdown' @click.prevent>
        <i class="bi bi-hdd-network"></i> {{ forgroup }}<template v-if="currentGroup === forgroup"> <span class="sep">›</span> <b>{{ currentCluster }}</b></template>
      </a>
      <div class="dropdown-menu">
        <router-link class='dropdown-item' :key="c.label" v-for="c in groupm" :to='{"name": "page.kafkaclusterstate", "params": { "group": forgroup, "cluster": c.label } }'>{{ c.label }}</router-link>
      </div>
    </div>
    <div class="ml-auto d-flex align-items-center">
      <!-- one click: the other theme (the icon: the one a click gives); it follows the OS again when the OS next switches -->
      <button type="button" class="theme-toggle" :data-mode="themeMode" :data-theme-shown="theme" :title="themeTitle" :aria-label="themeTitle" @click="toggleTheme">
        <i :class="['bi', theme === 'dark' ? 'bi-sun' : 'bi-moon-stars']"></i>
      </button>
      <div class="dropdown">
        <a href="#" class="topbar-link dropdown-toggle" data-toggle='dropdown' @click.prevent><i class="bi bi-gear"></i> UI Administration</a>
        <div class="dropdown-menu dropdown-menu-right">
          <router-link :to='{"name": "preferences"}' class="dropdown-item" target="_self"><i class="bi bi-sliders"></i> Preferences</router-link>
          <a class='dropdown-item' href='#' @click.prevent='refresh()'><i class="bi bi-arrow-clockwise"></i> Refresh Config</a>
          <router-link :to='{"name": "configInsights"}' class="dropdown-item" target="_self"><i class="bi bi-file-earmark-spreadsheet"></i> config.csv Insights</router-link>
        </div>
      </div>
    </div>
  </nav>
</template>

<script>
import xssFilters from 'xss-filters'
import cclogo from '../assets/images/cc-logo.png'
import { loadThemeMode, applyThemeMode, resolveTheme, toggleThemeMode, onSystemThemeChange } from '@/theme'

export default {
  name: 'AppNav',
  props: {
    group: String,
    cluster: String
  },
  data () {
    return {
      groups: {},
      active: {
        group: null,
        cluster: null,
        url: null
      },
      csvTimer: null,
      cclogo,
      // 'system' (the OS appearance) or the theme picked; theme: the one shown
      themeMode: loadThemeMode(),
      theme: resolveTheme(loadThemeMode())
    }
  },
  computed: {
    themeTitle () {
      const other = this.theme === 'dark' ? 'light' : 'dark'
      return this.themeMode === 'system'
        ? 'Switch to the ' + other + ' theme (now ' + this.theme + ', as the system: it follows the system\'s appearance)'
        : 'Switch back to the ' + other + ' theme of the system (' + this.theme + ' picked until the system next switches between light and dark)'
    },
    // the cluster of the page shown (from the route)
    currentGroup () {
      return this.$route.params.group
    },
    currentCluster () {
      return this.$route.params.cluster
    }
  },
  methods: {
    toggleTheme () {
      this.themeMode = toggleThemeMode(this.themeMode)
      applyThemeMode(this.themeMode)
      this.theme = resolveTheme(this.themeMode)
    },
    configFetch () {
      const vm = this
      let notselected = true
      const url = vm.$store.state.configurl + '?_t=' + (new Date() / 1)
      // download the cluster information csv file
      vm.$http.get(url, { withCredentials: true }).then((r) => {
        const lines = r.data.split(/\n/)
        const groups = {}
        const config = {}
        for (let i = 0; i < lines.length; i++) {
          const csv = lines[i].split(/,/)
          if (csv.length === 3) {
            const group = xssFilters.inHTMLData(csv[0])
            const label = xssFilters.inHTMLData(csv[1])
            const url = xssFilters.uriInHTMLData(csv[2])
            if (!groups[group]) {
              groups[group] = []
            }
            if (!config[group]) {
              config[group] = {}
            }
            if (!config[group][label]) {
              config[group][label] = csv[2]
            }
            groups[group].push({ label, url })
            // set the initial selected things
            if (notselected) {
              vm.$set(vm.active, 'group', group)
              vm.$set(vm.active, 'cluster', label)
              vm.$set(vm.active, 'url', url)
              notselected = false
            }
          }
        }
        vm.groups = groups
        vm.$store.commit('config', config)
        if (Object.keys(groups).length === 0) {
          vm.$store.commit('configError', true)
          vm.$store.commit('configErrorMessage', 'No Cruise-Control REST End point information found found in the : ' + vm.$store.state.configurl)
        } else {
          vm.$store.commit('configError', false)
          vm.$store.commit('configErrorMessage', null)
        }
      }, (e) => {
        vm.$store.commit('configError', true)
        vm.$store.commit('configErrorMessage', 'Error encountered while fetching :' + vm.$store.state.configurl)
      })
    },
    refresh () {
      this.configFetch()
    },
    reloadForever () {
      const vm = this
      vm.csvTimer = window.setInterval(function () {
        // console.log('calling ...', vm.$store.state.configFileReloadInterval)
        if (vm.$store.state.enableConfigFileReload) {
          vm.configFetch()
        }
      }, vm.$store.state.configFileReloadInterval)
    }
  },
  created () {
    // the OS switching: the theme follows it again (a pick ends)
    onSystemThemeChange((mode) => {
      this.themeMode = mode
      this.theme = resolveTheme(mode)
    })
    this.configFetch()
    if (this.$store.state.enableConfigFileReload) {
      this.reloadForever()
    }
  },
  beforeDestroy () {
    if (this.csvTimer) {
      window.clearInterval(this.csvTimer)
    }
  }
}
</script>

<style scoped>
.topbar {
  /* scrolls away with the page: what floats is the panel in use (v-sticky) */
  position: relative; z-index: 1030; margin: 12px 16px 0;
  display: flex; align-items: center; gap: 4px; padding: 6px 10px;
  border-radius: 16px; background: var(--glass-strong); border: 1px solid var(--glass-border);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(150%); backdrop-filter: blur(var(--blur)) saturate(150%);
  box-shadow: var(--shadow);
}
.brand { display: flex; align-items: center; margin-right: 10px; padding: 2px 6px; }
.topbar-link { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 10px; color: var(--muted); font-weight: 500; text-decoration: none; }
.topbar-link:hover, .topbar-link.router-link-active, .topbar-link.active, .topbar-link.current { color: var(--text-strong); background: var(--row-hover); text-decoration: none; }
.sep { color: var(--muted); }
.theme-toggle { border: 1px solid var(--glass-border); background: var(--glass); color: var(--text); width: 36px; height: 36px; border-radius: 10px; margin-right: 6px; }
.theme-toggle:hover { background: var(--row-hover); color: var(--text-strong); }
</style>
