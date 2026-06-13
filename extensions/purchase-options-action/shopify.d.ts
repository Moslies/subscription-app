import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/ProductExtension.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.product-purchase-option.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/ProductVariantExtension.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.product-variant-purchase-option.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/PurchaseOptionsActionExtension.jsx' {
  const shopify:
    | import('@shopify/ui-extensions/admin.product-purchase-option.action.render').Api
    | import('@shopify/ui-extensions/admin.product-variant-purchase-option.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
