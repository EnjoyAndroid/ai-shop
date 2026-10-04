# AI Shop

[简体中文](README.md) | **English**

A self-hosted digital goods storefront with product listings, self-service purchases, automatic delivery, protected order lookup, and an administration dashboard. Built with Next.js, TypeScript, PostgreSQL, Prisma, and Redis, with responsive layouts for desktop and mobile.

## Preview

![AI Shop storefront](docs/screenshots/01-storefront.png)

From customer purchases to store operations: products, memberships, account balances, orders, digital keys, and settings. These screenshots use an isolated demo environment with synthetic accounts, orders, amounts, and digital keys. The current interface and the shared video captions are in Simplified Chinese.

[Download the 86-second feature tour (1080p MP4)](docs/showcase/ai-shop-feature-tour.mp4) · [Browse all 19 screenshots](docs/showcase/README.md)

https://github.com/user-attachments/assets/5f4e285b-39c4-4d1d-bfe6-f762d8f530ca

The tour combines real page screenshots, captions, and transitions; it is not a continuous screen recording. The demo completed a purchase using a test account balance and delivered a test key. No external payments, email, or Telegram notifications were sent during capture.

<details>
<summary>Customer features: purchases, order lookup, delivery, memberships, and balances</summary>

### Product details and direct purchase

![Product details and purchase form](docs/screenshots/02-product.png)

### Order lookup and verification

![Order lookup](docs/screenshots/05-order-search.png)

![Slider verification](docs/screenshots/06-slider-verification.png)

![Order list](docs/screenshots/07-order-list.png)

### Automatic delivery and digital keys

![Delivered order](docs/screenshots/04-delivery.png)

### Member center and balance history

![Member center](docs/screenshots/08-member-center.png)

![Balance history](docs/screenshots/09-balance.png)

</details>

<details>
<summary>Administration: statistics, products, orders, digital keys, and settings</summary>

### Operations dashboard

![Operations dashboard](docs/screenshots/10-admin-dashboard.png)

### Products and digital key inventory

![Product management](docs/screenshots/11-admin-products.png)

![Digital key import](docs/screenshots/12-admin-cardkeys.png)

### Orders and settings

![Order management](docs/screenshots/13-admin-orders.png)

![System settings](docs/screenshots/14-admin-settings.png)

</details>

## Features

### Customer experience

- **Direct purchases:** choose a quantity on the product page, enter an email address, and set an order lookup password. Guest purchases are supported; there is no shopping cart.
- **Automatic delivery:** view, copy, or download delivered keys from the order details. Members can pay with their account balance and receive membership discounts.
- **Email and order number lookup:** complete slider verification to open a separate order list with status filters and pagination. Viewing an order's details requires its lookup password.
- **Recent email history:** successful searches save up to three recent email addresses in the current browser. Click an address to fill the field or remove it; order numbers are not saved.
- **Member center:** view account details, recent orders, and balance history. Navigation stays visible when switching between the dashboard, orders, and balance pages.
- **Mobile layouts:** responsive product pages, order cards, navigation, and touch support for slider verification.

Purchase flow: **Choose a product → Enter email and lookup password → Pay → Automatic delivery → View order details**.

### Administration and operations

- **Dashboard:** order and revenue statistics, user counts, pending orders, and low-stock alerts.
- **Products and categories:** product descriptions, cover images, prices, quantity limits, sorting, and listing status.
- **Digital key inventory:** batch imports, batch identifiers, encrypted storage, and stock reservations when orders are created.
- **Orders and users:** order details, delivery, cancellation, refunds, membership levels, account status, and balance adjustments.
- **Announcements and settings:** announcements, site information, order expiry, payment switches, and Telegram support links.
- **Admin roles:** OPERATOR handles products and delivery; ADMIN manages users and finances; SUPER_ADMIN manages system settings.

### Payments and notifications

Supported payment methods are Alipay and WeChat Pay through XunhuPay, USDT TRC20, and member account balances. External payment methods require configured credentials and an enabled channel. Automatic ERC20 collection is not available.

Email addresses are used for order lookup and optional notifications. Email and Telegram notifications require separate configuration; customers can still retrieve keys from order details without them. Balance refunds return funds to the customer's account balance. External refunds must be processed manually through the payment provider before being recorded in the admin panel.

### Order and data protection

Orders use cryptographically random identifiers. Lookup passwords are hashed, and digital keys are encrypted with AES-256-GCM. Public lookup shows order summaries first and requires password verification before accessing delivery details. Signed-in members can only access their own orders; balance top-up orders always require the owner's login. Database transactions protect balance changes, inventory, and fulfillment. Duplicate payment callbacks do not credit accounts twice.

See [Security mechanisms and deployment boundaries](docs/security.md) (Chinese) for password policies, access tokens, and rate limits.

## Requirements

- Node.js 22.14+; Node.js 22 LTS is recommended.
- PostgreSQL 15+ and Redis 7+; both are required.
- Docker Compose 2.24.4+; the local override file uses `!override`.

## Local deployment

```bash
npm ci
cp .env.example .env
```

Configure `.env`. Generate separate random values for the database password, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, and `CRON_SECRET`. The initial `ADMIN_PASSWORD` must be 12–72 characters. To generate one random value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The password in `DATABASE_URL` must match `DB_PASSWORD`. The template uses `localhost:55439` for PostgreSQL, `localhost:16379/1` for Redis, and `http://localhost:3010` for the storefront. Do not commit the actual `.env` file.

```bash
# Start the required services.
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres redis

# Generate the client, prepare the schema, and seed demo products and the admin account.
npm run db:generate
npm run db:prepare
npm run db:seed

# Build and deploy.
npm run build
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open:

- Storefront: http://localhost:3010
- Admin login: http://localhost:3010/admin/login
- Admin username: `admin`. Its password is the `ADMIN_PASSWORD` supplied during initialization; there is no built-in default. Running the seed again does not reset an existing admin password.

If your local `.env.local` already links to `.env`, you can keep that link. The Node seed script reads `.env`, while Next.js also reads `.env.local`; avoid conflicting configuration in the two files.

```bash
# Check status, inspect logs, or stop services while keeping volumes.
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f app
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

## Server deployment

1. Copy `.env.production.example` to `.env`. Configure separate random secrets, the actual database password, and your HTTPS domain.
2. Install Docker and Compose, and configure DNS and TLS termination. The included Nginx configuration listens on HTTP port 80 and expects a trusted reverse proxy with TLS; it does not provide a complete public HTTPS setup by itself.
3. When using Cloudflare, configure a TLS certificate on the origin and use **Full (strict)**. Restrict access to the origin; do not use Flexible mode. If preserving client IPs, configure trusted proxy ranges with Nginx `set_real_ip_from` and `real_ip_header`. Do not trust arbitrary incoming IP headers.
4. Run `docker compose up -d --build`. The app container applies database migrations before starting the server. App, database, and Redis ports remain on the internal network.
5. Initialize the admin account and demo products:

```bash
# Pass ADMIN_PASSWORD from .env to the initialization process, not as a literal argument.
# The app container does not retain the initial admin password in its runtime environment.
set -a
. ./.env
set +a
docker compose exec -e ADMIN_PASSWORD app node seed.cjs
unset ADMIN_PASSWORD
```

Only source a trusted `.env` file containing plain assignments. You can also run `npm run db:seed` on the host if its `DATABASE_URL` can reach PostgreSQL.

The seed enables only balance payments by default. External payments require both server credentials and the admin payment switch. Missing credentials cause payment creation and callback handling to reject requests.

| Integration | Configuration |
|---|---|
| Alipay | `XUNHU_ALIPAY_APPID`, `XUNHU_ALIPAY_APPSECRET` |
| WeChat Pay | `XUNHU_WECHAT_APPID`, `XUNHU_WECHAT_APPSECRET` |
| USDT TRC20 | `USDT_TRC20_ADDRESS`, optional `TRONGRID_API_KEY` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| Telegram notifications | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Image uploads | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Public support email | `NEXT_PUBLIC_CONTACT_EMAIL` |
| Telegram support link | Admin panel → System settings → Support settings; leave blank to hide. |
| External scheduled calls | `CRON_SECRET`; send `Authorization: Bearer ...`. |

`NEXT_PUBLIC_*` values are embedded in the frontend during the build. Rebuild the image after changing them. Configure Telegram support in the admin panel with `@username` or an official Telegram link; saving and refreshing the storefront is enough. The app no longer reads `NEXT_PUBLIC_TELEGRAM_URL`. Telegram links are hidden when unset, and the support email defaults to empty. Cloudinary is allowed by default for remote images; explicitly add other storage domains to `next.config.mjs`.

## Upgrades, backups, and migrations

**Order schema change:** migration `20261003000000_order_query` requires an empty order table. It removes the old plaintext lookup password column without converting historical orders. A deployment with real orders cannot directly apply this migration, and deleting real orders to bypass it is not supported. Demo or test deployments may remove specifically verified test orders and their related records after backing up. Startup scripts do not automatically delete orders.

Back up the database and `.env` before an upgrade. Keep backup directories private:

```bash
mkdir -p backups
chmod 700 backups
docker compose exec -T postgres pg_dump -U aishop -d ai_shop > backups/ai-shop.sql
chmod 600 backups/ai-shop.sql
```

`npm run db:prepare` supports new databases and databases originally created with `db push`. An existing database must match the saved baseline schema before it can be baselined and migrated. Schema differences stop the process for review. Do not reset the database or delete volumes to bypass migration failures.

The payment integrity migration creates unique receipts for historical paid orders. Duplicate transactions or negative balances cause it to fail. Reconcile the records before retrying. Historical pending USDT orders without stored quotes are not automatically assigned a guessed amount.

Session versioning requires users and admins to sign in again after upgrading from versions that did not support it. Do not roll back only the image while ignoring schema changes. Keep the encryption key unchanged unless you have re-encrypted existing digital keys first.

Financial records, payment receipts used to prevent replay, and sold keys are retained. Expiry checks run every minute and release reserved stock. Historical cancellation cleanup only removes qualifying orders without sensitive related records. Default order expiry is 10 minutes; the cleanup threshold is 90 days.

## Verification and maintenance

```bash
npm test
npm run test:integration
npm run build
npm run test:http
npm run check:secrets
npm audit
```

Integration tests require a separate `ai_shop_order_query_test` database, or a database configured through `TEST_DATABASE_URL` whose name ends in `_test`, and Redis database 15. They do not call real payment providers or send notifications. See [Contributing](CONTRIBUTING.md) (Chinese) for details. CI covers builds, balance and inventory concurrency regressions, scans of current publishable files, and dependency audits. Current-file scans do not verify every historical object or cached copy held by the hosting service.

- [Security policy and private vulnerability reports](SECURITY.md) (Chinese)
- [Contributing](CONTRIBUTING.md) (Chinese)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [MIT License](LICENSE)

## License

Project code is licensed under MIT. Product and brand names describe demo content and compatible services; they do not imply authorization to resell third-party accounts. Operators are responsible for payment integration testing, data protection, and rights to the products they offer.
