<script>
import { Bar, mixins } from 'vue-chartjs'
import Chart from 'chart.js'
const { reactiveProp } = mixins

// the theme's text and grid colors (assets/styles/glass.css), read when a chart renders
function applyThemeColors () {
  const css = window.getComputedStyle(document.documentElement)
  const v = (name) => css.getPropertyValue(name).trim()
  Chart.defaults.global.defaultFontColor = v('--muted') || '#666'
  Chart.defaults.global.defaultFontFamily = v('--font') || Chart.defaults.global.defaultFontFamily
  Chart.defaults.scale.gridLines.color = v('--line') || 'rgba(0, 0, 0, 0.1)'
  Chart.defaults.scale.gridLines.zeroLineColor = v('--line') || 'rgba(0, 0, 0, 0.25)'
}

export default {
  extends: Bar,
  mixins: [reactiveProp],
  props: ['chartData', 'options'],
  mounted () {
    // Overwriting base render method with actual data.
    applyThemeColors()
    this.renderChart(this.chartData, this.options)
  },
  watch: {
    options: function () {
      this.$data._chart.options = this.options
      this.$data._chart.update()
    }
  }
}
</script>
