import { test, expect } from '@playwright/test'

test('a signed-in shopper can pay for a basket', async ({ page }) => {
  await page.goto('/basket')
  await page.getByRole('button', { name: 'Checkout' }).click()
  expect(await page.getByTestId('step').textContent()).toBe('payment')
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByLabel('Expiry').fill('12/30')
  expect(await page.getByRole('button', { name: 'Pay' }).isEnabled()).toBe(true)
  await page.getByRole('button', { name: 'Pay' }).click()
  await expect(page.getByTestId('receipt')).toBeVisible()
})
