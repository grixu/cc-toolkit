---
type: regex
target: { source: file, path: .published/body.md }
pattern: '^(?=[\s\S]*\*\*Testing:\*\*)(?=[\s\S]*\*\*Reviewer notes:\*\*)(?=[\s\S]*CartService\.updateQuantity)(?=[\s\S]*couponCode)(?=[\s\S]*pnpm test --filter cart)(?=[\s\S]*browser)'
weight: 2
---
