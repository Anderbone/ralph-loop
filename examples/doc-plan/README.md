# Example Doc-Plan Queue

This folder is a small Ralph plan queue you can copy and adapt for a real target repository. It shows a three-step dependency chain:

1. `01-add-health-endpoint.plan.md` can run immediately.
2. `02-add-smoke-test.plan.md` waits for the health endpoint plan.
3. `03-document-health-check.plan.md` waits for the smoke test plan.

```bash
cp -R examples/doc-plan ~/plans/my-project
ralph --repo ~/work/my-project --plans ~/plans/my-project --dry-run
```

Edit the copied `*.plan.md` files before running them. The examples intentionally use generic web-application language, so they should be treated as templates rather than ready-to-run instructions.

For new queues, start from the authoring template in `../templates/implementation-plan.template.md` or use the optional Codex skill in `../skills/implementation-plan/SKILL.md` to generate Ralph-ready plans.

Ralph treats direct `*.plan.md` and `*-plan.md` children as active queue items. Completed plans are moved into `done/`.
