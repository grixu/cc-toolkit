# Order CSV export

Finance wants a plain CSV of orders for the monthly close; today they copy rows out of the admin table by hand.

1. `exportOrders` writes one row per order with the columns `id`, `total`, `created_at`, in that order, after a header row.
2. `created_at` is rendered as an ISO-8601 timestamp (`toISOString()`).
3. Orders whose status is `cancelled` are excluded from the export.
4. Rows are sorted by `created_at`, oldest first.
5. When `exportOrders` is called with an empty list, it returns an empty string with no header row.
