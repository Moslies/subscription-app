import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const SELLING_PLAN_GROUPS_QUERY = `#graphql
  query SellingPlanGroups {
    sellingPlanGroups(first: 50) {
      nodes {
        id
        name
        merchantCode
        description
        summary
        options
        sellingPlans(first: 10) {
          nodes {
            id
            name
          }
        }
        productsCount {
          count
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(SELLING_PLAN_GROUPS_QUERY);
  const responseJson = await response.json();

  const groups =
    (responseJson.data as { sellingPlanGroups: { nodes: unknown[] } })
      ?.sellingPlanGroups?.nodes ?? [];

  return { groups };
};

export default function SubscriptionsIndex() {
  const { groups } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <s-page heading="Subscription Groups">
      <s-button
        slot="primary-action"
        onClick={() => navigate("/app/subscriptions/new")}
      >
        Create subscription group
      </s-button>
      {groups.length === 0 ? (
        <s-section heading="No subscription groups yet">
          <s-paragraph>
            Create your first subscription group to offer subscription purchase
            options to your customers.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading={`${groups.length} subscription groups`}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Code</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Plans</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Products</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Options</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group: any) => (
                <tr key={group.id}>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    <Link to={`/app/subscriptions/${encodeURIComponent(group.id)}`}>
                      {group.name}
                    </Link>
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    <code>{group.merchantCode}</code>
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {group.sellingPlans.nodes.length}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {group.productsCount.count}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {group.options?.join(", ") ?? ""}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    <s-button
                      variant="secondary"
                      onClick={() => navigate(`/app/subscriptions/${encodeURIComponent(group.id)}/edit`)}
                    >
                      Edit
                    </s-button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
