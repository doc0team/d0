# Webhooks

Subscribe to events by registering an HTTPS endpoint.

## Verification

Validate the `Example-Signature` header with your signing secret. Reject requests older than five minutes.

## Events

Common events: `payment.completed`, `subscription.updated`, `customer.deleted`.
