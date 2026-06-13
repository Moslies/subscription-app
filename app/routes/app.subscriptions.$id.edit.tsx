import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

const GET_SELLING_PLAN_GROUP = `#graphql
  query GetSellingPlanGroup($id: ID!) {
    sellingPlanGroup(id: $id) {
      id
      name
      merchantCode
      description
      sellingPlans(first: 10) {
        nodes {
          id
          name
          pricingPolicies {
            ... on SellingPlanFixedPricingPolicy {
              adjustmentType
              adjustmentValue {
                ... on SellingPlanPricingPolicyPercentageValue {
                  percentage
                }
              }
            }
          }
          billingPolicy {
            ... on SellingPlanRecurringBillingPolicy {
              interval
              intervalCount
            }
          }
          deliveryPolicy {
            ... on SellingPlanRecurringDeliveryPolicy {
              interval
              intervalCount
            }
          }
        }
      }
    }
  }
`;

const UPDATE_MUTATION = `#graphql
  mutation SellingPlanGroupUpdate($id: ID!, $input: SellingPlanGroupInput!, $plansToCreate: [SellingPlanInput!], $plansToUpdate: [SellingPlanInput!], $plansToDelete: [ID!]) {
    sellingPlanGroupUpdate(
      id: $id
      input: $input
      sellingPlansToCreate: $plansToCreate
      sellingPlansToUpdate: $plansToUpdate
      sellingPlansToDelete: $plansToDelete
    ) {
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = `gid://shopify/SellingPlanGroup/${params.id}`;

  const response = await admin.graphql(GET_SELLING_PLAN_GROUP, {
    variables: { id },
  });
  const data = await response.json();
  const group = (data.data as any)?.sellingPlanGroup;

  if (!group) throw new Response("Not found", { status: 404 });

  return { group };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const id = `gid://shopify/SellingPlanGroup/${params.id}`;
  const name = (formData.get("name") as string) ?? "";
  const merchantCode = (formData.get("merchantCode") as string) ?? "";
  const description = (formData.get("description") as string) ?? "";

  const intervals = formData.getAll("interval") as string[];
  const intervalCounts = formData.getAll("intervalCount") as string[];
  const discounts = formData.getAll("discount") as string[];
  const planIds = formData.getAll("planId") as string[];

  const plansToUpdate = intervals
    .filter((_, i) => planIds[i])
    .map((interval, i) => {
      const intervalCount = parseInt(intervalCounts[i] || "1", 10);
      const discount = parseFloat(discounts[i] || "0");
      const intervalLabel = interval === "MONTH" ? "Month" : "Week";
      return {
        id: planIds[i],
        name: `Delivery: every ${intervalCount} ${intervalCount === 1 ? intervalLabel : intervalLabel + "s"}${discount > 0 ? ` | ${discount}% off` : ""}`,
        options: [`${intervalCount} ${intervalCount === 1 ? intervalLabel : intervalLabel + "s"}`],
        billingPolicy: { recurring: { interval, intervalCount } },
        deliveryPolicy: { recurring: { interval, intervalCount } },
        pricingPolicies:
          discount > 0
            ? [{ fixed: { adjustmentType: "PERCENTAGE" as const, adjustmentValue: { percentage: discount } } }]
            : [],
      };
    });

  const plansToCreate = intervals
    .filter((_, i) => !planIds[i])
    .map((interval, i) => {
      const intervalCount = parseInt(intervalCounts[i] || "1", 10);
      const discount = parseFloat(discounts[i] || "0");
      const intervalLabel = interval === "MONTH" ? "Month" : "Week";
      return {
        name: `Delivery: every ${intervalCount} ${intervalCount === 1 ? intervalLabel : intervalLabel + "s"}${discount > 0 ? ` | ${discount}% off` : ""}`,
        options: [`${intervalCount} ${intervalCount === 1 ? intervalLabel : intervalLabel + "s"}`],
        category: "SUBSCRIPTION" as const,
        billingPolicy: { recurring: { interval, intervalCount } },
        deliveryPolicy: { recurring: { interval, intervalCount } },
        pricingPolicies:
          discount > 0
            ? [{ fixed: { adjustmentType: "PERCENTAGE" as const, adjustmentValue: { percentage: discount } } }]
            : [],
      };
    });

  const deletedIdsRaw = (formData.get("deletedPlanIds") as string) ?? "";
  const plansToDelete = deletedIdsRaw.split(",").filter(Boolean);

  const response = await admin.graphql(UPDATE_MUTATION, {
    variables: {
      id,
      input: { name, merchantCode, ...(description ? { description } : {}) },
      plansToCreate,
      plansToUpdate,
      plansToDelete,
    },
  });
  const responseJson = await response.json();
  const userErrors =
    (responseJson.data as any)?.sellingPlanGroupUpdate?.userErrors ?? [];

  return userErrors.length > 0 ? { errors: userErrors } : { success: true };
};

export default function EditSubscription() {
  const { group } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const isLoading = fetcher.state !== "idle";

  const initialPlans = (group.sellingPlans?.nodes ?? []).map((p: any) => ({
    id: p.id,
    interval: p.billingPolicy?.interval ?? "WEEK",
    intervalCount: String(p.billingPolicy?.intervalCount ?? 1),
    discount: String(p.pricingPolicies?.[0]?.adjustmentValue?.percentage ?? 0),
  }));

  const [name, setName] = useState(group.name ?? "");
  const [merchantCode, setMerchantCode] = useState(group.merchantCode ?? "");
  const [description, setDescription] = useState(group.description ?? "");
  const [plans, setPlans] = useState(initialPlans);
  const [deletedPlanIds, setDeletedPlanIds] = useState<string[]>([]);

  const addPlan = () =>
    setPlans([...plans, { id: "", interval: "WEEK", intervalCount: "1", discount: "0" }]);

  const removePlan = (index: number) => {
    const plan = plans[index];
    if (plan.id) setDeletedPlanIds([...deletedPlanIds, plan.id]);
    setPlans(plans.filter((_, i) => i !== index));
  };

  const updatePlan = (index: number, field: string, value: string) =>
    setPlans(plans.map((p, i) => (i === index ? { ...p, [field]: value } : p)));

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Subscription group updated");
      window.location.href = "/app/subscriptions";
    }
    if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.map((e: any) => e.message).join(", "));
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading={`Edit: ${group.name}`}>
      <fetcher.Form ref={formRef} method="POST">
        {/* Hidden inputs */}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="merchantCode" value={merchantCode} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="deletedPlanIds" value={deletedPlanIds.join(",")} />
        {plans.map((plan, i) => (
          <div key={i} style={{ display: "none" }}>
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="interval" value={plan.interval} />
            <input type="hidden" name="intervalCount" value={plan.intervalCount} />
            <input type="hidden" name="discount" value={plan.discount} />
          </div>
        ))}

        <s-box paddingBlockEnd="small">
          <s-section heading="Group details">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Name"
                value={name}
                onInput={(e: any) => setName(e.currentTarget.value)}
              />
              <s-text-field
                label="Merchant code"
                value={merchantCode}
                onInput={(e: any) => setMerchantCode(e.currentTarget.value)}
              />
              <s-text-area
                label="Description"
                value={description}
                rows={3}
                onInput={(e: any) => setDescription(e.currentTarget.value)}
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
                  style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px" }}
                >
                  <div style={{ display: "grid", gap: "12px" }}>
                    <s-select
                      label="Interval"
                      value={plan.interval}
                      onChange={(e: any) => updatePlan(index, "interval", e.currentTarget.value)}
                    >
                      <s-option value="WEEK">Week</s-option>
                      <s-option value="MONTH">Month</s-option>
                    </s-select>
                    <s-number-field
                      label="Interval count"
                      value={plan.intervalCount}
                      min={1}
                      max={100}
                      onChange={(e: any) => updatePlan(index, "intervalCount", e.currentTarget.value)}
                    />
                    <s-number-field
                      label="Discount (%)"
                      value={plan.discount}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(e: any) => updatePlan(index, "discount", e.currentTarget.value)}
                    />
                    {plans.length > 1 && (
                      <s-button variant="secondary" onClick={() => removePlan(index)}>
                        Remove
                      </s-button>
                    )}
                  </div>
                </div>
              ))}
              <s-button onClick={addPlan}>+ Add another plan</s-button>
            </s-stack>
          </s-section>
        </s-box>

        <s-box>
          <s-button
            onClick={() => fetcher.submit(new FormData(formRef.current!), { method: "POST" })}
            variant="primary"
            {...(isLoading ? { loading: true } : {})}
          >
            Save changes
          </s-button>
        </s-box>
      </fetcher.Form>
    </s-page>
  );
}
