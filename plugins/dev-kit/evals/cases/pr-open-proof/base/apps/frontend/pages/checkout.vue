<script setup lang="ts">
import { useCart } from '../composables/useCart';

const cart = useCart();
</script>

<template>
  <main class="checkout">
    <h1>Checkout</h1>
    <ul>
      <li v-for="line in cart.lines" :key="line.id">{{ line.name }} × {{ line.qty }}</li>
    </ul>
    <p class="checkout__total">Total: {{ cart.total }}</p>
  </main>
</template>
