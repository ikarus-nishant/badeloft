# Shopify integration contract

## Page configuration

Place this block before the configurator's JavaScript bundle:

```html
<script id="badeloft-sink-config" type="application/json">
  {
    "assetBaseUrl": "https://cdn.example.com/sink-configurator",
    "modelBaseUrl": "https://cdn.example.com/sink-configurator/models",
    "productHandle": "custom-undermount-sink",
    "currency": "USD"
  }
</script>
```

`assetBaseUrl` is used for images and the HDR environment. `modelBaseUrl` is
used for GLB files. Relative and absolute base URLs are supported.

## Add to cart handoff

Both Add to Cart buttons dispatch this browser event:

```js
window.addEventListener("badeloft:sink:add-to-cart", (event) => {
  const payload = event.detail;
  // Existing Shopify variant/cart integration receives payload here.
});
```

The payload contains:

- `productHandle`, `currency`, and numeric price totals.
- Bowl model ID/name, numeric bowl count, quantity ID, shape, and size.
- Installation ID/label and the fixed `undermount` sink mount.
- Color ID/label/hex, surface finish, drain cap finish, and drain edge.
- Numeric inch measurements under `selection.dimensionsInches`.
- Overall, bowl, inner bowl, and offset measurements.
- Dimension codes `L`, `L1`, `L2`, `L3`, `D`, `D1`, `D2`, `D3`, `H`, and
  `bowlSpacing` for direct Shopify line-item property mapping.
- Special instructions.

The event dispatch is isolated in `handoffAddToCart()` in
`src/integrations/storefront.ts`. Replace its single `dispatchEvent` line with
the client's final function call when its name and payload shape are supplied.
