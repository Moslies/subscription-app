import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const GET_GROUP_QUERY = `
  query SellingPlanGroup($id: ID!) {
    sellingPlanGroup(id: $id) {
      id
      name
      merchantCode
      description
      summary
      options
      position
      createdAt
      sellingPlans(first: 50) {
        nodes {
          id
          name
          description
          options
        }
      }
      products(first: 50) {
        nodes {
          id
          title
          handle
        }
      }
      productsCount {
        count
      }
    }
  }
`;

const UPDATE_MUTATION = `
  mutation SellingPlanGroupUpdate($id: ID!, $input: SellingPlanGroupInput!) {
    sellingPlanGroupUpdate(id: $id, input: $input) {
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

const DELETE_MUTATION = `
  mutation SellingPlanGroupDelete($id: ID!) {
    sellingPlanGroupDelete(id: $id) {
      userErrors {
        field
        message
      }
    }
  }
`;

const ADD_PRODUCTS_MUTATION = `
  mutation SellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
    sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
      sellingPlanGroup {
        id
        productsCount {
          count
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const REMOVE_PRODUCTS_MUTATION = `
  mutation SellingPlanGroupRemoveProducts($id: ID!, $productIds: [ID!]!) {
    sellingPlanGroupRemoveProducts(id: $id, productIds: $productIds) {
      removedProductIds
      userErrors {
        field
        message
      }
    }
  }
`;

const ALL_PRODUCTS_QUERY = `
  query Products {
    products(first: 100) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = params.id!;

  const [groupResponse, productsResponse] = await Promise.all([
    admin.graphql(GET_GROUP_QUERY, { variables: { id } }),
    admin.graphql(ALL_PRODUCTS_QUERY),
  ]);

  const groupJson = await groupResponse.json();
  const productsJson = await productsResponse.json();

  const group = (groupJson.data as { sellingPlanGroup: unknown }).sellingPlanGroup;
  const allProducts = (productsJson.data as { products: { nodes: unknown[] } }).products.nodes;

  return { group, allProducts };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    const name = formData.get("name") as string;
    const merchantCode = formData.get("merchantCode") as string;
    const description = formData.get("description") as string;
    const optionsRaw = formData.get("options") as string;
    const options = optionsRaw ? optionsRaw.split(",").map((o: string) => o.trim()).filter(Boolean) : [];

    const response = await admin.graphql(UPDATE_MUTATION, {
      variables: {
        id,
        input: {
          name,
          merchantCode,
          ...(description ? { description } : {}),
          options,
        },
      },
    });
    const json = await response.json();
    const userErrors =
      (json.data as { sellingPlanGroupUpdate: { userErrors: { field: string; message: string }[] } })
        ?.sellingPlanGroupUpdate?.userErrors ?? [];
    return userErrors.length > 0 ? { errors: userErrors } : { success: true };
  }

  if (intent === "delete") {
    const response = await admin.graphql(DELETE_MUTATION, { variables: { id } });

    if (!response.ok) {
      let message = `HTTP ${response.status}: Failed to delete subscription group`;
      try {
        const errorBody = (await response.json()) as Record<string, unknown>;
        const errors = errorBody?.errors;
        if (errors) {
          message = Array.isArray(errors)
            ? errors.map((e: unknown) => (typeof e === "object" && e && "message" in e ? (e as { message: string }).message : String(e))).join(", ")
            : String(errors);
        }
      } catch {
        // ignore JSON parse errors
      }
      return { errors: [{ message }] };
    }

    const json = await response.json();
    const userErrors =
      (json.data as { sellingPlanGroupDelete: { userErrors: { field: string; message: string }[] } })
        ?.sellingPlanGroupDelete?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { errors: userErrors };
    }
    return { deleted: true };
  }

  if (intent === "addProducts") {
    const productIds = (formData.get("productIds") as string).split(",").filter(Boolean);
    const response = await admin.graphql(ADD_PRODUCTS_MUTATION, {
      variables: { id, productIds },
    });
    const json = await response.json();
    const userErrors =
      (json.data as { sellingPlanGroupAddProducts: { userErrors: { field: string; message: string }[] } })
        ?.sellingPlanGroupAddProducts?.userErrors ?? [];
    return userErrors.length > 0 ? { errors: userErrors } : { success: true };
  }

  if (intent === "removeProducts") {
    const productIds = (formData.get("productIds") as string).split(",").filter(Boolean);
    const response = await admin.graphql(REMOVE_PRODUCTS_MUTATION, {
      variables: { id, productIds },
    });
    const json = await response.json();
    const userErrors =
      (json.data as { sellingPlanGroupRemoveProducts: { userErrors: { field: string; message: string }[] } })
        ?.sellingPlanGroupRemoveProducts?.userErrors ?? [];
    return userErrors.length > 0 ? { errors: userErrors } : { success: true };
  }

  return null;
};

export default function SubscriptionDetail() {
  const { group, allProducts } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher();

  const g = group as any;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description ?? "");

  const linkedIds: string[] = (g.products?.nodes ?? []).map((p: any) => p.id);
  const availableProducts = (allProducts as any[]).filter((p: any) => !linkedIds.includes(p.id));
  const [addProductId, setAddProductId] = useState("");

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.deleted) {
      shopify.toast.show("Subscription group deleted");
      window.location.href = "/app/subscriptions";
    } else if (fetcher.data?.success) {
      shopify.toast.show("Updated successfully");
    }
    if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.map((e: any) => e.message).join(", "));
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading={g.name || "Subscription Group"}>
      <s-button
        slot="primary-action"
        onClick={() => setEditing(!editing)}
        variant={editing ? "primary" : "secondary"}
      >
        {editing ? "Cancel" : "Edit"}
      </s-button>

      <s-section heading="Details">
        {editing ? (
          <div>
            <input type="hidden" name="intent" value="update" id="edit-intent" />
            <input type="hidden" name="options" value={g.options?.join(",") ?? ""} id="edit-options" />
            <input type="hidden" name="merchantCode" value={g.merchantCode ?? ""} id="edit-merchant" />

            <label>
              Name<br />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                id="edit-name"
                style={{ width: "100%", marginBottom: "8px" }}
              />
            </label>
            <label>
              Description<br />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                id="edit-desc"
                rows={3}
                style={{ width: "100%", marginBottom: "8px" }}
              />
            </label>
            <s-button
              onClick={() => {
                const form = new FormData();
                form.set("intent", "update");
                form.set("name", (document.getElementById("edit-name") as HTMLInputElement)?.value ?? name);
                form.set("merchantCode", (document.getElementById("edit-merchant") as HTMLInputElement)?.value ?? g.merchantCode);
                form.set("description", (document.getElementById("edit-desc") as HTMLTextAreaElement)?.value ?? description);
                form.set("options", (document.getElementById("edit-options") as HTMLInputElement)?.value ?? "");
                fetcher.submit(form, { method: "POST" });
              }}
              {...(isLoading ? { loading: true } : {})}
            >
              Save
            </s-button>
          </div>
        ) : (
          <s-stack direction="block" gap="base">
            <p><strong>Merchant code:</strong> <code>{g.merchantCode}</code></p>
            {g.description && <p><strong>Description:</strong> {g.description}</p>}
            {g.summary && <p><strong>Summary:</strong> {g.summary}</p>}
            {g.options?.length > 0 && <p><strong>Options:</strong> {g.options.join(", ")}</p>}
            {g.createdAt && <p><strong>Created:</strong> {new Date(g.createdAt).toLocaleDateString()}</p>}
          </s-stack>
        )}
      </s-section>

      <s-section heading={`Selling plans (${g.sellingPlans?.nodes?.length ?? 0})`}>
        {(!g.sellingPlans?.nodes || g.sellingPlans.nodes.length === 0) ? (
          <s-paragraph>No selling plans in this group.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Options</th>
              </tr>
            </thead>
            <tbody>
              {g.sellingPlans.nodes.map((plan: { id: string; name: string; options?: string[] }) => (
                <tr key={plan.id}>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{plan.name}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{plan.options?.join(", ") ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading={`Linked products (${g.productsCount?.count ?? 0})`}>
        {(!g.products?.nodes || g.products.nodes.length === 0) ? (
          <s-paragraph>No products linked to this group.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Product</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Handle</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }} />
              </tr>
            </thead>
            <tbody>
              {g.products.nodes.map((product: { id: string; title: string; handle: string }) => (
                <tr key={product.id}>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{product.title}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{product.handle}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    <s-button
                      onClick={() => {
                        const form = new FormData();
                        form.set("intent", "removeProducts");
                        form.set("productIds", product.id);
                        fetcher.submit(form, { method: "POST" });
                      }}
                      variant="tertiary"
                    >
                      Remove
                    </s-button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      {availableProducts.length > 0 && (
        <s-section padding="base" heading="Add product">
          <div>
            <s-select
              value={addProductId}
              onChange={(e) => setAddProductId(e.currentTarget.value)}
            >
              <s-option value="">-- Select a product --</s-option>
              {availableProducts.map((p: { id: string; title: string }) => (
                <s-option key={p.id} value={p.id}>{p.title}</s-option>
              ))}
            </s-select>
            <s-box paddingBlockStart="base">
              <s-button
                onClick={() => {
                  if (!addProductId) return;
                  const form = new FormData();
                  form.set("intent", "addProducts");
                  form.set("productIds", addProductId);
                  fetcher.submit(form, { method: "POST" });
                  setAddProductId("");
                }}
              >
                Add product
              </s-button>
            </s-box>
          </div>
        </s-section>
      )}

      <s-section heading="Danger zone">
        <s-button
          onClick={() => {
            const form = new FormData();
            form.set("intent", "delete");
            fetcher.submit(form, { method: "POST" });
          }}
          variant="secondary"
          {...(isLoading ? { loading: true } : {})}
        >
          Delete subscription group
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
