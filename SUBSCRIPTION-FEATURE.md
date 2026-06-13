# 订阅功能开发文档 (Subscription Feature)

## 概述

本项目基于 Shopify App 模板（React Router），实现了完整的订阅（Selling Plan）功能。商家可以通过 **Admin UI 扩展**直接在产品和变体页面上创建/编辑订阅计划，也可以通过 **管理后台页面** 统一管理所有订阅计划。

---

## 新增/修改的文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `extensions/admin-purchase-options-action/src/PurchaseOptionsActionExtension.jsx` | ✅ **重写** | 核心 Admin UI 扩展组件 |
| `app/routes/app.subscriptions.tsx` | 🆕 **新增** | 订阅管理后台页面 |
| `app/routes/api.selling-plans.tsx` | 🆕 **新增** | 后端 GraphQL API 代理路由 |
| `app/routes/app.tsx` | ✏️ **修改** | 导航菜单增加 "Subscriptions" 链接 |
| `shopify.app.toml` | ✏️ **修改** | 扩展 OAuth 权限范围 |
| `extensions/admin-purchase-options-action/locales/en.default.json` | ✏️ **修改** | 补充英文翻译键值 |
| `extensions/admin-purchase-options-action/locales/fr.json` | ✏️ **修改** | 补充法文翻译键值 |

---

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│                  Shopify Admin                       │
│  ┌──────────────────────────────────────────────┐   │
│  │  产品/变体页面 → "购买选项" → Admin 扩展     │   │
│  │  (PurchaseOptionsActionExtension.jsx)         │   │
│  │  通过 shopify.query() 直接调用 Admin API      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  App 导航 → Subscriptions 管理页面            │   │
│  │  (app.subscriptions.tsx)                      │   │
│  │  通过 fetcher → App Server Side GraphQL       │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  API 路由 (api.selling-plans.tsx)             │   │
│  │  用于外部/第三方集成调用                      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
              Shopify Admin GraphQL API
         (sellingPlanGroupCreate / Update / Delete)
```

### 三种使用路径

1. **Admin 扩展路径** — 商家在产品/变体页面直接操作
2. **App 管理后台路径** — 商家在 App 中统一管理所有计划
3. **API 代理路径** — 后端程序化调用（REST → GraphQL）

---

## 核心功能详解

### 1. Admin UI 扩展 (`PurchaseOptionsActionExtension.jsx`)

**触发位置：** Shopify Admin → 产品/变体详情页 → "购买选项" → 操作按钮

**功能流程：**

```
用户打开产品/变体的购买选项
        │
        ▼
  加载该产品已有的 Selling Plan Groups
        │
        ▼
  ┌─── 是否存在已有计划？ ───┐
  │          │               │
  │  是      ▼               │  否
  │  ┌──────────────┐       │
  │  │显示计划列表   │       │
  │  │+ "Create New"│       │
  │  └──────┬───────┘       │
  │         ▼               ▼
  │    选择/创建计划        创建新计划
  └─────────────────────────┘
        │
        ▼
  填写表单：
  · 计划名称 / 内部编码 / 描述
  · 折扣类型（百分比/固定金额/设置价格）
  · 配送频率（隔 N 天/周/月/年）
  · Cutoff 日（提前下单天数）
  · 最大周期数（订阅结束期数）
        │
        ▼
  Save → 调用 GraphQL Mutation
  · 新建 → sellingPlanGroupCreate
  · 编辑 → sellingPlanGroupUpdate
  · 删除 → sellingPlanGroupDelete
```

**使用的 GraphQL 操作：**

| 操作 | Mutation/Query | 说明 |
|------|---------------|------|
| 查询产品已有计划 | `query GetSellingPlanGroups` | 通过 productId 查关联的 sellingPlanGroups |
| 创建计划组 | `mutation CreateSellingPlanGroup` | 创建 sellingPlanGroup + sellingPlan + pricingPolicy |
| 更新计划组 | `mutation UpdateSellingPlanGroup` | 更新指定 ID 的计划组 |
| 删除计划组 | `mutation DeleteSellingPlanGroup` | 删除指定 ID 的计划组 |

### 2. 管理后台页面 (`app.subscriptions.tsx`)

**路由：** `/app/subscriptions`

**导航：** App Shell → `<s-app-nav>` 中的 "Subscriptions" 链接

**功能流程：**

```
用户打开 /app/subscriptions
        │
        ▼
  Loader: 查询所有 Selling Plan Groups (first: 50)
        │
        ▼
  ┌─── 列表页 ────────────────────────┐
  │  · 显示所有计划组（卡片列表）      │
  │  · 每个卡片展示：名称/编码/产品数  │
  │    关联的 Selling Plans 摘要       │
  │  · 按钮：Create / Edit / Delete    │
  └───────────────────────────────────┘
        │
        ├── Create → 展开表单 → Submit → fetcher POST → action handler
        ├── Edit   → 展开表单（预填）→ Submit → fetcher POST → action handler
        └── Delete → 确认 → fetcher POST → action → 刷新列表
```

**组件结构：**

```
SubscriptionsPage (主页面)
├── CreateEditForm (创建/编辑表单)
│   ├── 计划名称 / 内部编码 / 描述
│   ├── 折扣选择 + 数值
│   ├── 配送频率 (数量 + 间隔)
│   └── Cutoff / Max Cycles
├── PlanCard (计划卡片)
│   ├── 名称 + 编码 badge + 产品数 badge
│   ├── 描述
│   ├── 计划详情预览
│   └── Edit / Delete 按钮
└── EmptyState (空状态)
    └── "Create Subscription Plan" 按钮
```

### 3. API 路由 (`api.selling-plans.tsx`)

**路由：** `/api/selling-plans`

**支持的端点：**

| 方法 | 参数 | 说明 |
|------|------|------|
| `GET` | (无) | 列出所有计划组 (first: 50) |
| `GET` | `?action=get&id=gid://...` | 获取单个计划组详情（含产品列表） |
| `GET` | `?action=product-plans&productId=gid://...` | 获取某产品的关联计划 |
| `POST` | `{_action: "create", input: {...}}` | 创建新计划组 |
| `POST` | `{_action: "update", id, input}` | 更新计划组 |
| `POST` | `{_action: "delete", id}` | 删除计划组 |
| `POST` | `{_action: "addProducts", id, productIds}` | 添加产品到计划组 |
| `POST` | `{_action: "removeProducts", id, productIds}` | 从计划组移除产品 |

---

## Selling Plan Group 数据结构

### GraphQL Input 结构

```graphql
mutation CreateSellingPlanGroup($input: SellingPlanGroupInput!) {
  sellingPlanGroupCreate(input: $input) {
    sellingPlanGroup { id name merchantCode description productCount }
    userErrors { field message }
  }
}
```

**`SellingPlanGroupInput` 构成：**

```
SellingPlanGroupInput
├── name: String!                    # 计划组名称（对客户可见）
├── merchantCode: String             # 内部编码
├── description: String              # 描述
├── productIds: [ID!]                # 关联的产品 ID 列表
└── sellingPlansToCreate: [SellingPlanInput!]
    └── SellingPlanInput
        ├── name: String!
        ├── options: [SellingPlanOptionInput!]
        │   └── { name: "Delivery Frequency", value: "Every 1 month" }
        ├── deliveryPolicy: SellingPlanDeliveryPolicyInput
        │   └── recurring: {
        │       interval: MONTH | WEEK | DAY | YEAR,
        │       intervalCount: Int,
        │       cutoff: Int               # 提前天数（可选）
        │   }
        ├── billingPolicy: SellingPlanBillingPolicyInput
        │   └── recurring: {
        │       interval: MONTH,
        │       intervalCount: 1,
        │       maxCycles: Int            # 最大期数（可选）
        │   }
        └── pricingPolicies: [SellingPlanPricingPolicyInput!]
            └── recurring: {
                adjustmentType: PERCENTAGE | FIXED_AMOUNT | PRICE,
                adjustmentValue: {
                    percentage: Float,     # 0.1 = 10%
                    OR fixedAmount: { amount: String, currencyCode: String }
                }
            }
```

---

## 配置变更

### OAuth Scopes (`shopify.app.toml`)

```diff
- scopes = "write_metaobject_definitions,write_metaobjects,write_products"
+ scopes = "write_metaobject_definitions,write_metaobjects,write_products,read_products,read_customers,write_purchase_options,read_purchase_options"
```

新增的 scope：
- `write_purchase_options` — **必需**，创建/编辑/删除 Selling Plan Groups（订阅计划组）
- `read_purchase_options` — 查询 Selling Plan Groups 列表和详情
- `read_customers` — 客户订阅数据相关

> **注意：** 修改 scope 后需要重新安装 App 或更新授权。`write_purchase_options` 和 `read_purchase_options` 是受保护 scope，需要在 Shopify Partner Dashboard 中申请才能使用。

> **注意：** 修改 scope 后需要重新安装 App 或更新授权。

### 导航菜单 (`app.tsx`)

```diff
 <s-app-nav>
   <s-link href="/app">Home</s-link>
   <s-link href="/app/additional">Additional page</s-link>
+  <s-link href="/app/subscriptions">Subscriptions</s-link>
 </s-app-nav>
```

---

## 开发与测试

### 本地运行

```bash
cd beneficial-merchandise-app
npm run dev
```

通过 Shopify CLI 启动后会打开 tunnel，在 Dev Store 中安装/更新 App。

### 测试 Admin 扩展

1. 进入 Dev Store Admin → Products → 选择任意产品
2. 找到 "Purchase Options"（购买选项）区域
3. 点击操作按钮 → 弹出扩展 UI
4. 创建/编辑/删除订阅计划

### 测试管理后台

1. 安装 App 后，在 Shopify Admin 左侧导航找到 App
2. 点击进入 → 点击 "Subscriptions" tab
3. 查看、创建、编辑、删除计划

### 测试 API

```bash
# 列出所有计划组
curl -H "Authorization: Bearer <admin-token>" \
  "https://<your-app>/api/selling-plans"

# 获取产品关联计划
curl -H "Authorization: Bearer <admin-token>" \
  "https://<your-app>/api/selling-plans?action=product-plans&productId=gid://shopify/Product/123"
```

---

## 相关文档

- [Shopify Subscriptions Overview](https://shopify.dev/docs/apps/build/purchase-options/subscriptions)
- [SellingPlanGroupCreate Mutation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/sellingPlanGroupCreate)
- [Admin Action Extensions](https://shopify.dev/docs/apps/admin/admin-actions-and-blocks)
- [Shopify App Bridge React](https://shopify.dev/docs/api/app-bridge-library)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
