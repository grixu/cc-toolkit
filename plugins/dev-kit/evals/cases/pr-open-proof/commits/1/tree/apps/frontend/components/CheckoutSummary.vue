<script setup lang="ts">
defineProps<{
  subtotal: number;
  discount: number;
  shipping: number;
  vat: number;
  total: number;
  currency: string;
}>();

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(value);
</script>

<template>
  <dl class="checkout-summary">
    <dt>Subtotal</dt>
    <dd>{{ money(subtotal, currency) }}</dd>
    <dt>Discount</dt>
    <dd>{{ money(-discount, currency) }}</dd>
    <dt>Shipping</dt>
    <dd>{{ money(shipping, currency) }}</dd>
    <dt>VAT, included</dt>
    <dd>{{ money(vat, currency) }}</dd>
    <dt class="checkout-summary__total">Total</dt>
    <dd class="checkout-summary__total">{{ money(total, currency) }}</dd>
  </dl>
</template>
