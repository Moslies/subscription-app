import "@shopify/ui-extensions/preact";
import {useEffect, useState} from 'preact/hooks';

const DEFAULT_OPTION = {
  id: '',
  frequency: '1',
  timeType: 'month',
  discount: '0',
};

/** @param {any} data */
function extractPayload(data) {
  if (Array.isArray(data) && data.length) {
    return data[0];
  }
  if (data?.selected?.length) {
    return data.selected[0];
  }
  return data;
}

/** @param {any} option */
function normalizeOption(option) {
  const getValue = (obj, key, fallback) => {
    if (obj == null) return fallback;
    return obj[key] ?? fallback;
  };

  return {
    id: option?.id ?? option?.planId ?? option?.sellingPlanId ?? '',
    frequency: String(getValue(option, 'frequency', getValue(option, 'intervalCount', 1))),
    timeType: String(getValue(option, 'timeType', getValue(option, 'interval', 'month'))).toLowerCase(),
    discount: String(getValue(option, 'discount', getValue(option, 'percentage', getValue(option, 'amount', 0)))),
  };
}

/** @param {any} data */
function parseOptionsFromData(data) {
  const payload = extractPayload(data);
  if (!payload) {
    console.log('[parseOptionsFromData] payload is falsy, returning DEFAULT_OPTION');
    return [DEFAULT_OPTION];
  }

  if (typeof payload.get === 'function') {
    console.log('[parseOptionsFromData] payload is Map-like, recursing');
    const nested = payload.get('payload') ?? payload.get('sellingPlanGroup') ?? payload.get('options');
    return parseOptionsFromData(nested);
  }

  if (Array.isArray(payload)) {
    return payload.length ? payload.map(normalizeOption) : [DEFAULT_OPTION];
  }

  if (payload?.sellingPlanGroup?.sellingPlans?.nodes) {
    return payload.sellingPlanGroup.sellingPlans.nodes.map((plan) =>
      normalizeOption({
        id: plan?.id,
        interval: plan?.deliveryPolicy?.interval ?? plan?.billingPolicy?.interval,
        intervalCount: plan?.deliveryPolicy?.intervalCount ?? plan?.billingPolicy?.intervalCount,
        percentage: plan?.pricingPolicies?.[0]?.adjustmentValue?.percentage ?? 0,
        amount: plan?.pricingPolicies?.[0]?.adjustmentValue?.amount ?? 0,
      }),
    );
  }

  if (payload?.options) {
    return parseOptionsFromData(payload.options);
  }

  if (payload?.sellingPlans?.nodes) {
    return payload.sellingPlans.nodes.map((plan) =>
      normalizeOption({
        id: plan?.id,
        interval: plan?.deliveryPolicy?.interval ?? plan?.billingPolicy?.interval,
        intervalCount: plan?.deliveryPolicy?.intervalCount ?? plan?.billingPolicy?.intervalCount,
        percentage: plan?.pricingPolicies?.[0]?.adjustmentValue?.percentage ?? 0,
        amount: plan?.pricingPolicies?.[0]?.adjustmentValue?.amount ?? 0,
      }),
    );
  }

  if (payload?.plans) {
    return payload.plans.map((plan) =>
      normalizeOption({
        id: plan?.id,
        interval: plan?.deliveryPolicy?.interval ?? plan?.billingPolicy?.interval,
        intervalCount: plan?.deliveryPolicy?.intervalCount ?? plan?.billingPolicy?.intervalCount,
        percentage: plan?.pricingPolicies?.[0]?.adjustmentValue?.percentage ?? 0,
        amount: plan?.pricingPolicies?.[0]?.adjustmentValue?.amount ?? 0,
      }),
    );
  }

  return [DEFAULT_OPTION];
}

function getGroupIdFromData(data) {
  const payload = extractPayload(data);
  if (!payload) return '';
  if (typeof payload?.id === 'string' && payload.id.includes('/SellingPlanGroup/')) {
    return payload.id;
  }
  if (typeof payload?.sellingPlanGroup?.id === 'string') {
    return payload.sellingPlanGroup.id;
  }
  // sellingPlanId may actually be a group ID (name is misleading)
  if (typeof payload?.sellingPlanId === 'string' && payload.sellingPlanId.includes('/SellingPlanGroup/')) {
    return payload.sellingPlanId;
  }
  return '';
}

function getIntervalLabel(timeType, count) {
  const unit = timeType === 'year' ? 'year' : timeType === 'month' ? 'month' : timeType === 'week' ? 'week' : 'day';
  return `${count === 1 ? '' : `${count} `} ${count === 1 ? unit : `${unit}s`}`;
}

function buildPricingPolicies(discountType, discountValue) {
  if (!discountValue || isNaN(discountValue)) {
    return [];
  }

  const adjustmentType = discountType === 'percentageOff'
    ? 'PERCENTAGE'
    : discountType === 'amountOff'
      ? 'FIXED_AMOUNT'
      : 'PRICE';

  const adjustmentValue = discountType === 'percentageOff'
    ? { percentage: discountValue }
    : { fixedValue: discountValue };

  return [{
    fixed: {
      adjustmentType,
      adjustmentValue,
    },
  }];
}

function buildSellingPlanInput(option, discountType, isCreate) {
  const interval = String(option.timeType || 'month').toUpperCase();
  const intervalCount = Number(option.frequency) || 1;
  const discountValue = parseFloat(option.discount) || 0;
  const intervalLabel = getIntervalLabel(option.timeType, intervalCount);
  const discountLabel = discountValue > 0
    ? discountType === 'percentageOff'
      ? `${discountValue}% off`
      : discountType === 'amountOff'
        ? `${discountValue} off`
        : `flat rate ${discountValue}`
    : '';

  const plan = {
    ...(option.id ? { id: option.id } : {}),
    name: `Delivery: every ${intervalLabel}${discountLabel ? ` | ${discountLabel}` : ''}`,
    options: [intervalLabel],
    billingPolicy: { recurring: { interval, intervalCount } },
    deliveryPolicy: { recurring: { interval, intervalCount } },
    ...(discountValue > 0 ? { pricingPolicies: buildPricingPolicies(discountType, discountValue) } : {}),
  };

  if (isCreate) {
    return {
      ...plan,
      category: 'SUBSCRIPTION',
    };
  }

  return plan;
}

const SELLING_PLAN_GROUP_UPDATE = `#graphql
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

const GET_SELLING_PLAN_GROUP_FOR_PLAN = `#graphql
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

const GET_SELLING_PLAN_GROUP = `#graphql
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

export default function PurchaseOptionsActionExtension() {
  const {i18n, extension: {target}, close, data} = shopify;
  const [merchantCode, setMerchantCode] = useState('');
  const [planName, setPlanName] = useState('');
  const [options, setOptions] = useState([DEFAULT_OPTION]);
  const [deletedPlanIds, setDeletedPlanIds] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sellingPlanGroupId, setSellingPlanGroupId] = useState('');

  useEffect(() => {
    console.log('[PurchaseOptionsAction] raw data:', JSON.stringify(data, null, 2));
    const payload = extractPayload(data);
    console.log('[PurchaseOptionsAction] extracted payload:', JSON.stringify(payload, null, 2));

    const hasFullData = !!(payload?.sellingPlans?.nodes || payload?.sellingPlanGroup?.sellingPlans?.nodes);

    if (hasFullData) {
      setOptions(parseOptionsFromData(payload));
      setPlanName(payload?.sellingPlanGroup?.name ?? payload?.name ?? '');
      setMerchantCode(payload?.sellingPlanGroup?.merchantCode ?? payload?.merchantCode ?? '');
      setSellingPlanGroupId(getGroupIdFromData(payload));
      setIsLoading(false);
      return;
    }

    // Only reference IDs — query the full data
    const groupId = getGroupIdFromData(payload);
    const sellingPlanId = payload?.sellingPlanId;
    if (!groupId && !sellingPlanId) {
      console.log('[PurchaseOptionsAction] no group or selling plan ID to query');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    (async () => {
      let targetGroupId = groupId;

      // If it's a SellingPlan ID (not a group), resolve to group first
      if (!targetGroupId && typeof sellingPlanId === 'string' && sellingPlanId.includes('/SellingPlan/')) {
        try {
          const resolveResp = await shopify.query(GET_SELLING_PLAN_GROUP_FOR_PLAN, {
            variables: { id: sellingPlanId },
          });
          targetGroupId = resolveResp?.data?.node?.sellingPlanGroup?.id;
          if (!targetGroupId) {
            console.log('[PurchaseOptionsAction] could not resolve selling plan to group');
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('[PurchaseOptionsAction] error resolving selling plan:', err);
          setIsLoading(false);
          return;
        }
      }

      // If groupId came from sellingPlanId (already a group ID), use it directly
      if (!targetGroupId && typeof sellingPlanId === 'string') {
        targetGroupId = sellingPlanId;
      }

      if (!targetGroupId) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('[PurchaseOptionsAction] fetching group:', targetGroupId);
        const resp = await shopify.query(GET_SELLING_PLAN_GROUP, {
          variables: { id: targetGroupId },
        });
        const group = resp?.data?.sellingPlanGroup;
        console.log('[PurchaseOptionsAction] fetched group:', JSON.stringify(group, null, 2));

        if (!group) {
          setIsLoading(false);
          return;
        }

        setSellingPlanGroupId(group.id);
        setPlanName(group.name ?? '');
        setMerchantCode(group.merchantCode ?? '');
        setOptions(parseOptionsFromData({ sellingPlanGroup: group }));
      } catch (err) {
        console.error('[PurchaseOptionsAction] error fetching group:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [data]);

  const updateOption = (index, field, value) => {
    setOptions((prevOptions) => prevOptions.map((option, optionIndex) => (
      optionIndex === index ? { ...option, [field]: value } : option
    )));
  };

  const addOption = () => {
    setOptions((prevOptions) => [...prevOptions, { ...DEFAULT_OPTION }]);
  };

  const removeOption = (index) => {
    setOptions((prevOptions) => {
      const optionToRemove = prevOptions[index];
      if (optionToRemove?.id) {
        setDeletedPlanIds((current) => [...current, optionToRemove.id]);
      }
      return prevOptions.filter((_, optionIndex) => optionIndex !== index);
    });
  };

  const resolveGroupId = async () => {
    if (sellingPlanGroupId) return sellingPlanGroupId;
    const payload = extractPayload(data);

    // First check if sellingPlanId itself is already a group ID
    if (typeof payload?.sellingPlanId === 'string' && payload.sellingPlanId.includes('/SellingPlanGroup/')) {
      return payload.sellingPlanId;
    }

    // Check if payload.id is a SellingPlan ID, resolve to group
    const candidateId = typeof payload?.id === 'string' && payload.id.includes('/SellingPlan/')
      ? payload.id
      : payload?.sellingPlanId;

    if (!candidateId) {
      return '';
    }

    try {
      const response = await shopify.query(GET_SELLING_PLAN_GROUP_FOR_PLAN, {
        variables: { id: candidateId },
      });
      return response?.data?.node?.sellingPlanGroup?.id ?? '';
    } catch (error) {
      console.error('Failed to resolve selling plan group id', error);
      return '';
    }
  };

  const handleSave = async () => {
    if (!planName.trim()) {
      setErrorMessage('Please enter a title for this subscription plan.');
      return;
    }

    if (!options.length) {
      setErrorMessage('Please add at least one delivery option.');
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    const resolvedGroupId = await resolveGroupId();
    if (!resolvedGroupId) {
      setErrorMessage('Unable to find the subscription group to update.');
      setIsSaving(false);
      return;
    }

    const plansToUpdate = options
      .filter((option) => option.id)
      .map((option) => buildSellingPlanInput(option, 'percentageOff', false));

    const plansToCreate = options
      .filter((option) => !option.id)
      .map((option) => buildSellingPlanInput(option, 'percentageOff', true));

    try {
      console.log('[PurchaseOptionsAction] saving with variables:', JSON.stringify({
        id: resolvedGroupId,
        input: {
          name: planName.trim(),
          merchantCode: merchantCode.trim(),
          sellingPlansToCreate: plansToCreate,
          sellingPlansToUpdate: plansToUpdate,
          sellingPlansToDelete: deletedPlanIds,
        },
      }, null, 2));

      const response = await shopify.query(SELLING_PLAN_GROUP_UPDATE, {
        variables: {
          id: resolvedGroupId,
          input: {
            name: planName.trim(),
            merchantCode: merchantCode.trim(),
            sellingPlansToCreate: plansToCreate,
            sellingPlansToUpdate: plansToUpdate,
            sellingPlansToDelete: deletedPlanIds,
          },
        },
      });
      console.log('[PurchaseOptionsAction] save response:', JSON.stringify(response, null, 2));

      const userErrors = response?.data?.sellingPlanGroupUpdate?.userErrors ?? [];

      if (userErrors.length) {
        setErrorMessage(userErrors.map((error) => error.message).join(', '));
        setIsSaving(false);
        return;
      }

      close();
    } catch (error) {
      console.error('Failed to save subscription group:', error);
      setErrorMessage('Unable to save the subscription group. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <s-admin-action>
      <s-button slot="primary-action" onClick={handleSave} disabled={isSaving || isLoading}>
        {isSaving ? 'Saving…' : 'Save'}
      </s-button>
      <s-button slot="secondary-actions" onClick={close} disabled={isSaving}>
        Cancel
      </s-button>

      {isLoading ? (
        <s-box padding="base" textAlign="center">
          <s-spinner />
        </s-box>
      ) : (
      <s-stack direction="block" gap="large">
        <s-text-field
          label="Title"
          placeholder="Subscribe and save"
          value={planName}
          disabled={isSaving}
          onChange={(event) => setPlanName(event.currentTarget.value)}
        />

        <s-text-field
          label="Internal description"
          value={merchantCode}
          disabled={isSaving}
          onChange={(event) => setMerchantCode(event.currentTarget.value)}
        />
      
        <s-box paddingBlockEnd="small">
          <s-section heading="Selling plans">
            
            <s-stack direction="block" gap="base">
              {options.map((option, index) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                >
                  <div
                    key={index}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      padding: "12px",
                    }}
                  >
                  <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base">
                    <s-grid-item gridColumn="span 4" gridRow="span 1">
                      <s-number-field
                        label="Delivery frequency"
                        min={1}
                        value={option.frequency}
                        disabled={isSaving}
                        onChange={(event) => updateOption(index, 'frequency', event.currentTarget.value)}
                      />
                    </s-grid-item>
                    <s-grid-item gridColumn="span 4" gridRow="span 1">
                      <s-select
                        label="Delivery interval"
                        value={option.timeType}
                        disabled={isSaving}
                        onChange={(event) => updateOption(index, 'timeType', event.currentTarget.value)}
                      >
                        <s-option value="week">Week</s-option>
                        <s-option value="month">Month</s-option>
                        <s-option value="year">Year</s-option>
                      </s-select>
                    </s-grid-item>
                    <s-grid-item gridColumn="span 4" gridRow="span 1">
                      <s-number-field
                        label="Discount (%)"
                        min={0}
                        value={option.discount}
                        disabled={isSaving}
                        onChange={(event) => updateOption(index, 'discount', event.currentTarget.value)}
                      />
                    </s-grid-item>
                  </s-grid>
                  </div>

                  {options.length > 1 && (
                    <s-button
                      variant="secondary"
                      onClick={() => removeOption(index)}
                      disabled={isSaving}
                    >
                      🗑️
                    </s-button>
                  )}
                </div>
              ))}
              <s-button variant="secondary" onClick={addOption} disabled={isSaving}>
                + Add delivery option
              </s-button>
            </s-stack>
          </s-section>
        </s-box>

        {errorMessage ? (
          <s-box border="base" borderRadius="base" padding="base">
            {errorMessage}
          </s-box>
        ) : null}
      </s-stack>
      )} {/* end loading ternary */}
    </s-admin-action>
  );
}
