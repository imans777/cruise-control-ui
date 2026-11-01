<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- A name (topic, host, rack ...) with the parts a table filter matches marked; filter: a parseFilter() result; rack: a
     number of the filter equal to the name marks all of it -->
<script>
import { hitParts } from '@/brokerFilter'

export default {
  name: 'HitText',
  functional: true,
  props: {
    text: [String, Number],
    filter: Object,
    rack: Boolean
  },
  render (h, { props }) {
    return h('span', hitParts(props.filter, props.text, props.rack).map(p => p.hit ? h('mark', { class: 'hit' }, p.text) : p.text))
  }
}
</script>
