# ACCEPTANCE

# TESTING REQUIREMENTS

Write tests for critical financial calculations.

Examples:

market value

cost basis

gain/loss

allocation

net worth

future value

goal progress

percentage change

Test edge cases:

zero cost basis

zero portfolio value

fractional shares

negative liabilities

missing quote

stale quote

API failure

---

# SECURITY TESTS

Test RLS.

Explicitly prove:

User A can access User A data.

User A cannot access User B data.

Anonymous users cannot access private portfolios.

A user cannot insert another user's user_id.

A user cannot update another user's snapshot.

Public demo data cannot access private data.

These are critical.

Assert that the anonymous role has no privileges on application tables, sequences, functions, and views so a future migration cannot quietly widen it.

---

# E2E TESTS

At minimum eventually test:

Create account / login.

Create portfolio.

Add position.

Edit shares.

Reload application.

Confirm persistence.

Create historical snapshot.

View Time Machine.

Log out.

Confirm private route protection.

Log into another test user.

Confirm original user's portfolio is inaccessible.

---

# ACCEPTANCE CRITERIA FOR V1

A new user should be able to:

Open the public URL.

Explore a fictional demo.

Create/sign into an authorized account.

Create a portfolio.

Add QQQ.

Enter 20.5 shares.

Enter average cost.

Have the application retrieve a current/latest supported market price.

See the calculated market value.

Add VOO.

See portfolio allocation.

Edit QQQ from 20.5 shares to 24.5.

Have that change preserved historically.

Return later.

See the updated portfolio.

Open History.

Select a prior stored date.

See that QQQ previously had 20.5 shares.

Compare that historical state with today.

Create a historical portfolio snapshot from before account creation.

See net worth history.

Create a $1M goal.

Run a future projection.

Log out.

Log in as another user.

Be completely unable to retrieve the first user's financial records.