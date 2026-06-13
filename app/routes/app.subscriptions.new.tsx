import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const PRODUCTS_QUERY = `#graphql
  query Products {
    products(first: 50) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

const CREATE_MUTATION = `#graphql
  mutation SellingPlanGroupCreate($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
    sellingPlanGroupCreate(input: $input, resources: $resources) {
      sellingPlanGroup {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(PRODUCTS_QUERY);
  const responseJson = await response.json();
  const products =
    (responseJson.data as { products: { nodes: unknown[] } })?.products?.nodes ?? [];
  return { products };
};

function getIntervalLabel(timeType, count) {
  const unit = timeType === 'year' ? 'year' : timeType === 'month' ? 'month' : timeType === 'week' ? 'week' : 'day';
  return `${count === 1 ? '' : `${count} `} ${count === 1 ? unit : `${unit}s`}`;
}
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = formData.get("name") as string;
  const merchantCode = formData.get("merchantCode") as string;
  const description = formData.get("description") as string;
  const optionsRaw = formData.get("options") as string;
  const productIdsRaw = formData.get("productIds") as string;
  const productIds = productIdsRaw ? productIdsRaw.split(",").filter(Boolean) : [];

  const options = optionsRaw.split(",").map((o) => o.trim()).filter(Boolean);

  const intervals = formData.getAll("interval") as string[];
  const intervalCounts = formData.getAll("intervalCount") as string[];
  const discounts = formData.getAll("discount") as string[];

  const sellingPlansToCreate = intervals.map((interval, index) => {
    const intervalCount = parseInt(intervalCounts[index] || "1", 10);
    const discount = Math.min(parseFloat(discounts[index] || "0"), 100);
    const intervalLabel = getIntervalLabel(interval.toLowerCase(), intervalCount);

    
    return {
      name: `Delivery: every ${intervalLabel}${discount ? ` | ${discount}% off` : ''}`,
      options: `${intervalCount} ${intervalCount == 1 ? intervalLabel : intervalLabel + "s"}`,
      category: "SUBSCRIPTION" as const,
      billingPolicy: {
        recurring: { interval, intervalCount },
      },
      deliveryPolicy: {
        recurring: { interval, intervalCount },
      },
      pricingPolicies:
        discount > 0
          ? [{ fixed: { adjustmentType: "PERCENTAGE" as const, adjustmentValue: { percentage: discount } } }]
          : [],
    };
  });

  const input = {
    name,
    merchantCode,
    ...(description ? { description } : {}),
    options,
    sellingPlansToCreate,
  };

  const resources = productIds.length > 0 ? { productIds } : {};

  const response = await admin.graphql(CREATE_MUTATION, {
    variables: { input, resources },
  });
  const responseJson = await response.json();

  const userErrors =
    (responseJson.data as {
      sellingPlanGroupCreate: { userErrors: { field: string; message: string }[] };
    })?.sellingPlanGroupCreate?.userErrors ?? [];

  return userErrors.length > 0 ? { errors: userErrors } : { success: true };
};

export default function NewSubscription() {
  const { products } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [plans, setPlans] = useState([
    { interval: "WEEK", intervalCount: "1", discount: "0" },
  ]);

  const addPlan = () => {
    setPlans([...plans, { interval: "WEEK", intervalCount: "1", discount: "0" }]);
  };

  const removePlan = (index: number) => {
    if (plans.length > 1) {
      setPlans(plans.filter((_, i) => i !== index));
    }
  };

  const updatePlan = (
    index: number,
    field: "interval" | "intervalCount" | "discount",
    value: string,
  ) => {
    setPlans(plans.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Subscription group created");
      window.location.href = "/app/subscriptions";
    }
    if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.map((e: any) => e.message).join(", "));
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Create subscription group">
      <fetcher.Form method="POST" ref={formRef}>
        <input type="hidden" name="productIds" value={selectedProductIds.join(",")} />
        <s-box paddingBlockEnd="small">
          <s-section heading="Group details">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Name"
                name="name"
                required
                help-text="Buyer-facing name for the subscription group"
              />
            <s-text-field
              label="Merchant code"
              name="merchantCode"
              required
              help-text="Merchant-facing identifier"
            />
            <s-text-area
              label="Description"
              value="Optional description"
              rows={3}
            ></s-text-area>
            <s-text-field
              label="Options (comma-separated)"
              name="options"
              value="Delivery every"
            />
          </s-stack>
        </s-section>
        </s-box>

        <s-box paddingBlockEnd="small">
          <s-section heading="Selling plans">
            <s-stack direction="block" gap="base">
            {plans.map((plan, index) => (
              <div
                key={index}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <div style={{ display: "grid", gap: "12px" }}>
                  <s-select
                    label="Interval"
                    name="interval"
                    value={plan.interval}
                    onChange={(e) => updatePlan(index, "interval", e.currentTarget.value)}
                  >
                    <s-option value="WEEK">Week</s-option>
                    <s-option value="MONTH">Month</s-option>
                  </s-select>
                  <s-number-field
                    label="Interval count"
                    name="intervalCount"
                    value={plan.intervalCount}
                    onChange={(e) => updatePlan(index, "intervalCount", e.currentTarget.value)}
                    placeholder="0"
                    min={1}
                    max={100}
                    inputMode="numeric"
                  ></s-number-field>
                  <s-number-field
                    label="Discount (%)"
                    name="discount"
                    value={plan.discount}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      const num = parseInt(val, 10);
                      if (val === "" || val === "0") {
                        updatePlan(index, "discount", "0");
                      } else if (num > 100) {
                        updatePlan(index, "discount", "100");
                      } else {
                        updatePlan(index, "discount", val);
                      }
                    }}
                    placeholder="0"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    suffix="%"
                  ></s-number-field>
                  {plans.length > 1 && (
                    <s-button
                      variant="secondary"
                      onClick={() => removePlan(index)}
                    >
                      Remove
                    </s-button>
                  )}
                </div>
              </div>
            ))}
            <s-button onClick={addPlan}>
              + Add another plan
            </s-button>
          </s-stack>
          </s-section>
        </s-box>

        <s-box paddingBlockEnd="small">
          <s-section heading="Link products (optional)">
            {products.length === 0 ? (
              <s-paragraph>No products available.</s-paragraph>
          ) : (
              <div>
                <s-select 
                    value={selectedId}
                    onChange={(e) => {
                      const id = e.currentTarget.value;
                      if (id && !selectedProductIds.includes(id)) {
                        setSelectedProductIds([...selectedProductIds, id]);
                      }
                      setSelectedId("");
                    }}
                  >
                    {(products as any[]).map((p: any) => (
                    <s-option key={p.id} value={p.id}>{p.title}</s-option>
                  ))}
                </s-select>
              {selectedProductIds.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "12px" }}>
                  {selectedProductIds.map((id) => {
                    const p = (products as any[]).find((x: any) => x.id === id);
                    return (
                      <li
                        key={id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          border: "1px solid #dfe3eb",
                          borderRadius: "12px",
                          padding: "12px 16px",
                          background: "#fafbff",
                          marginTop: "12px",
                        }}
                      >
                        <span>{p?.title || id}</span>
                        <s-button
                          variant="tertiary"
                          onClick={() => setSelectedProductIds(selectedProductIds.filter((x) => x !== id))}
                        >
                          Remove
                        </s-button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          </s-section>
        </s-box>

        <s-box>
          <s-button
            onClick={() => {
              fetcher.submit(new FormData(formRef.current!), { method: "POST" });
            }}
            variant="primary"
            {...(isLoading ? { loading: true } : {})}
          >
            Create subscription group
          </s-button>
        </s-box>
      </fetcher.Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
