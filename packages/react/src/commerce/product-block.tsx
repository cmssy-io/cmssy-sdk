"use client";

import { useEffect, useMemo, useState } from "react";

import { defineBlock } from "../registry";
import { fields } from "../fields";
import { useCart } from "./commerce-provider";
import { formatPrice, toMinorUnits } from "./money";
import type { CmssyProduct, CmssyProductVariant } from "./commerce-queries";

interface ProductContent {
  modelSlug?: string;
  slugField?: string;
  slug?: string;
  nameField?: string;
  priceField?: string;
  imageField?: string;
  product?: CmssyProduct;
}

function deriveAxes(
  variants: CmssyProductVariant[],
): Array<{ name: string; values: string[] }> {
  const axes = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const option of variant.selectedOptions) {
      if (!axes.has(option.name)) axes.set(option.name, new Set());
      axes.get(option.name)!.add(option.value);
    }
  }
  return [...axes.entries()].map(([name, values]) => ({
    name,
    values: [...values],
  }));
}

function matchVariant(
  variants: CmssyProductVariant[],
  selections: Record<string, string>,
): CmssyProductVariant | null {
  return (
    variants.find((variant) =>
      variant.selectedOptions.every(
        (opt) => selections[opt.name] === opt.value,
      ),
    ) ?? null
  );
}

function ProductComponent({ content }: { content: Record<string, unknown> }) {
  const c = content as ProductContent;
  const { fetchProduct, addToCart } = useCart();
  const injected = c.product ?? null;
  const [product, setProduct] = useState<CmssyProduct | null>(injected);
  const [loading, setLoading] = useState(!injected && Boolean(c.slug));
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const modelSlug = c.modelSlug ?? "products";
  const slugField = c.slugField ?? "slug";
  const slug = c.slug ?? "";

  useEffect(() => {
    if (injected || !slug) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchProduct(modelSlug, { [slugField]: slug });
        if (active) setProduct(result);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [injected, fetchProduct, modelSlug, slugField, slug]);

  const axes = useMemo(
    () => (product ? deriveAxes(product.variants) : []),
    [product],
  );
  const variant = useMemo(
    () => (product ? matchVariant(product.variants, selections) : null),
    [product, selections],
  );

  if (loading) {
    return <div data-cmssy-product="loading">Loading…</div>;
  }
  if (!product) {
    return <div data-cmssy-product="not-found">Product not found</div>;
  }

  const data = product.data;
  const name = String(data[c.nameField ?? "name"] ?? "");
  const imageUrl = c.imageField ? (data[c.imageField] as string) : null;
  const hasVariants = product.variants.length > 0;
  const currency = (data.currency as string | undefined) ?? "USD";
  const priceMinor = hasVariants
    ? variant?.price
    : toMinorUnits(Number(data[c.priceField ?? "price"] ?? 0), currency);
  const showPrice = priceMinor != null && Number.isFinite(priceMinor);
  const allAxesSelected = axes.every((axis) => selections[axis.name]);
  const outOfStock =
    variant != null && variant.inventory != null && variant.inventory <= 0;
  const canAdd = hasVariants ? Boolean(variant) && !outOfStock : true;

  async function onAdd() {
    if (!product) return;
    setAdding(true);
    setAdded(false);
    setAddError(null);
    try {
      await addToCart(
        product.id,
        1,
        hasVariants ? { variantSelections: selections } : undefined,
      );
      setAdded(true);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add to cart");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div data-cmssy-product={product.id}>
      {imageUrl ? <img src={imageUrl} alt={name} /> : null}
      <h3 data-cmssy-product-name>{name}</h3>
      {showPrice ? (
        <p data-cmssy-product-price>{formatPrice(priceMinor!, currency)}</p>
      ) : null}
      {axes.map((axis) => (
        <label key={axis.name} data-cmssy-variant-axis={axis.name}>
          <span>{axis.name}</span>
          <select
            value={selections[axis.name] ?? ""}
            onChange={(e) =>
              setSelections((prev) => ({
                ...prev,
                [axis.name]: e.target.value,
              }))
            }
          >
            <option value="">—</option>
            {axis.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="button"
        onClick={onAdd}
        disabled={adding || !canAdd || (hasVariants && !allAxesSelected)}
        data-cmssy-add-to-cart
      >
        {adding
          ? "Adding…"
          : outOfStock
            ? "Out of stock"
            : added
              ? "Added"
              : "Add to cart"}
      </button>
      {addError ? <p data-cmssy-product-error>{addError}</p> : null}
    </div>
  );
}

export const productBlock = defineBlock({
  type: "product",
  label: "Product",
  category: "Commerce",
  props: {
    modelSlug: fields.text({ label: "Model slug" }),
    slugField: fields.text({ label: "Slug field" }),
    slug: fields.text({ label: "Product slug" }),
    nameField: fields.text({ label: "Name field" }),
    priceField: fields.text({ label: "Price field" }),
    imageField: fields.text({ label: "Image field" }),
  },
  component: ProductComponent,
});
