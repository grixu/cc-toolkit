<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import { ref } from 'vue';

const props = withDefaults(defineProps<{ trigger?: 'hover' | 'click' }>(), { trigger: 'hover' });
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function onTriggerClick() {
  if (props.trigger === 'click') open.value = !open.value;
}

function onLeave() {
  if (props.trigger === 'hover') open.value = false;
}

onClickOutside(root, () => {
  open.value = false;
});
onKeyStroke('Escape', () => {
  open.value = false;
});
</script>

<template>
  <div ref="root" class="popover" @mouseenter="trigger === 'hover' && (open = true)" @mouseleave="onLeave">
    <span @click="onTriggerClick"><slot name="trigger" /></span>
    <div v-if="open" class="popover__panel"><slot /></div>
  </div>
</template>
