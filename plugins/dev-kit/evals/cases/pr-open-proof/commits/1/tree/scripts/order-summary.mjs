import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { cart: { type: 'string' } } });
const cart = JSON.parse(fs.readFileSync(values.cart, 'utf8'));

const round = (n) => Math.round(n * 100) / 100;
const subtotal = round(cart.lines.reduce((sum, l) => sum + l.qty * l.unit, 0));
const discount = round(subtotal * (cart.discountPercent ?? 0) / 100);
const total = round(subtotal - discount + cart.shipping);
const vat = round(total * cart.vatPercent / (100 + cart.vatPercent));

console.log('Order summary');
for (const l of cart.lines) console.log(`${l.name.padEnd(28)} ${String(l.qty).padStart(2)} ${l.unit.toFixed(2).padStart(7)} ${(l.qty * l.unit).toFixed(2).padStart(8)}`);
console.log(`Subtotal ${subtotal.toFixed(2)}`);
console.log(`Discount ${(-discount).toFixed(2)}`);
console.log(`Shipping ${cart.shipping.toFixed(2)}`);
console.log(`VAT ${cart.vatPercent}%, included ${vat.toFixed(2)}`);
console.log(`Total ${total.toFixed(2)}`);
console.log(`Currency ${cart.currency}`);
