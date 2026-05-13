# Bug Check

Run automated tests and type checks FIRST, then review code for AI-specific regression patterns.

## Step 1: Automated Tests (mandatory, cannot skip)

Run these commands FIRST before any code review:

    cd growplan-web && npm run test
    cd growplan-api && python -m pytest tests/ -x -q
    cd growplan-web && npx tsc --noEmit

- If tests fail → report as highest priority bug
- If build fails → report type errors as highest priority
- Only proceed to Step 2 if all pass

## Step 2: AI Regression Pattern Audit

Check for these known AI blind spots:

### High Priority
1. **Field omission**: New field added to solver but not API response, or API response but not frontend transform
2. **Path inconsistency**: Fix applied to production path but not test/sandbox path (or vice versa)
3. **Allocation normalization**: Backend returns field X, frontend normalizer drops it

### Medium Priority
4. **Null safety**: `.toFixed()`, `.map()`, `.reduce()` called on potentially null/undefined values
5. **Type narrowing**: Non-null assertion (`!`) used where runtime null is possible
6. **Error state leakage**: Error state set but stale data not cleared

## Step 3: Regression Test Proposal

For each bug found or fix applied, propose a regression test:
- Use `assertHasAllFields()` or `assert_same_shape()` from test helpers
- Name it after the bug (e.g., `BUG-R36: ...`)
- Place it in the appropriate `*.test.ts` or `test_*.py` file

## Step 4: Report

Summarize:
- Tests/build: PASS or FAIL with details
- Patterns found: list with severity
- Regression tests proposed: list with file locations
