# Claude 开发规范

## 提交前必须执行

在提交代码和推送到远程仓库之前，**必须**先在本地运行生产构建：

```bash
npm run build
```

只有构建成功后才能提交代码。这可以避免：
- TypeScript 类型错误
- 缺少依赖包
- 客户端/服务端模块引用错误
- 其他生产环境才会暴露的问题

## 常见类型错误

### 1. 数字/字符串类型不匹配
```typescript
// 错误：parseInt 期望 string，但变量已经是 number
parseInt(amount)

// 正确：使用 Number() 兼容两种类型
Number(amount)
```

### 2. 可能为 null 的值
```typescript
// 错误：order.paymentMethod 可能为 null
getPaymentProvider(order.paymentMethod)

// 正确：先检查空值
if (!order.paymentMethod) {
  return NextResponse.json({ error: "支付方式无效" }, { status: 400 });
}
getPaymentProvider(order.paymentMethod)
```

### 3. 服务端模块在客户端使用
如果遇到 `Module not found: Can't resolve 'net'/'dns'/'fs'` 等错误，需要在 `next.config.mjs` 添加：

```javascript
webpack: (config, { isServer }) => {
  if (!isServer) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      dns: false,
      fs: false,
      child_process: false,
    };
  }
  return config;
},
```

## 项目特定配置

### 联系方式
- Telegram: https://t.me/ai_pro_labs
- 邮箱: komarkonde@gmail.com

### 系统默认值
- 订单过期时间: 10 分钟
- 订单自动删除: 90 天

### 已移除功能
- 手机号注册/登录（仅保留邮箱）
