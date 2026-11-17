<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{ trigger?: 'hover' | 'click' }>(), { trigger: 'hover' });
const open = ref(false);

function onTriggerClick() {
  if (props.trigger === 'click') open.value = true;
}
</script>

<template>
  <div class="popover" @mouseenter="open = true" @mouseleave="open = false">
    <span @click="onTriggerClick"><slot name="trigger" /></span>
    <div v-if="open" class="popover__panel"><slot /></div>
  </div>
</template>
