export const SELLING_PLAN_GROUP_UPDATE = `#graphql
  mutation SellingPlanGroupUpdate(
    $id: ID!
    $input: SellingPlanGroupInput!
  ) {
    sellingPlanGroupUpdate(
      id: $id
      input: $input
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

export const GET_SELLING_PLAN_GROUP_FOR_PLAN = `#graphql
  query SellingPlanGroupForPlan($id: ID!) {
    node(id: $id) {
      ... on SellingPlan {
        sellingPlanGroup {
          id
        }
      }
    }
  }
`;

export const GET_SELLING_PLAN_GROUP = `#graphql
  query GetSellingPlanGroup($id: ID!) {
    sellingPlanGroup(id: $id) {
      id
      name
      merchantCode
      sellingPlans(first: 50) {
        nodes {
          id
          deliveryPolicy {
            ... on SellingPlanRecurringDeliveryPolicy {
              interval
              intervalCount
            }
          }
          billingPolicy {
            ... on SellingPlanRecurringBillingPolicy {
              interval
              intervalCount
            }
          }
          pricingPolicies {
            ... on SellingPlanPricingPolicyBase {
              adjustmentType
              adjustmentValue {
                ... on SellingPlanPricingPolicyPercentageValue {
                  percentage
                }
                ... on MoneyV2 {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;
