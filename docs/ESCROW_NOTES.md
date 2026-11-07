# Escrow notes: what ArbiterAI does and doesn't do

> **Short version:** ArbiterAI runs a **sandbox escrow simulation**. Funds are captured into the platform's PayPal sandbox account and released to the contractor with PayPal Payouts. That is fine for showing the flow. It is **not** a licensed escrow arrangement, and no real money moves.

## The two implemented modes (`ESCROW_MODE`)

### `capture_then_payout` (default, fully implemented)

1. On Fund, the app calls `POST /v2/checkout/orders` with `intent: CAPTURE`. The buyer approves via the `payer-action` link.
2. On return (or on the `CHECKOUT.ORDER.APPROVED` webhook as a safety net), it calls `POST /v2/checkout/orders/{id}/capture` and the milestone becomes `FUNDED`.
3. On release, the policy grant is consumed and the app calls `POST /v1/payments/payouts` to pay the contractor.
4. If the buyer is refunded, it calls `POST /v2/payments/captures/{id}/refund`.

The platform holds the balance between capture and payout. That works in sandbox. In production it would make the platform a money transmitter holding customer funds.

### `authorize_then_capture` (implemented, best for short milestones)

1. The order is created with `intent: AUTHORIZE`. On return the app calls `POST /v2/checkout/orders/{id}/authorize`.
2. On release it calls `POST /v2/payments/authorizations/{id}/capture`, then pays out with Payouts.
3. A refund before release becomes `POST /v2/payments/authorizations/{id}/void`.

**Why this isn't durable escrow:** PayPal authorizations have a short *honor period* (documented as 3 days) and expire after about 29 days. Reauthorization is limited. A milestone that runs longer than that can't rely on the authorization. *Check these figures against the current Payments v2 documentation before relying on them.*

## Investigated: delayed disbursement, multiparty and referenced payouts

- PayPal's **multiparty / marketplace** offering (PayPal Commerce Platform for partners) supports **delayed disbursement**. You create the order with `payment_instruction.disbursement_mode = "DELAYED"` for a connected seller, then release funds later through the *Referenced Payouts* API (`/v1/payments/referenced-payouts-items`). That is the right production shape: money goes to the seller's account but stays on hold until the platform releases it.
- It requires a **PayPal partner/marketplace account and seller onboarding** (Partner Referrals). That isn't available to an ordinary sandbox REST app without PayPal approval. Sellers also need to be onboarded PayPal merchants, which most individual freelancers are not.
- **Conclusion:** not used in this prototype, and the project doesn't depend on it. The tool layer (`create_payout`, `capture_order`) is the seam where a production build would swap in delayed disbursement plus referenced payouts. The policy engine, grants and decision log would not change.
- *Endpoint and field names above are from PayPal's public partner docs as understood at the time of writing. Verify them before implementing.*

## What production would need

- A licensed escrow or payments partner, or PayPal's multiparty delayed-disbursement capability with proper onboarding.
- KYC/KYB for both parties, sanctions screening, tax forms, and dispute SLAs backed by terms of service.
- Real authentication in place of the demo persona switcher.
- Multi-currency handling (currency is stored per milestone today, but there is no FX).
