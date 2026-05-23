# Example Doc-Plan Queue

This folder is a small Ralph plan queue you can copy and adapt for a real target repository.

```bash
cp -R examples/doc-plan ~/plans/my-project
ralph --repo ~/work/my-project --plans ~/plans/my-project --dry-run
```

Edit the copied `*.plan.md` files before running them. Ralph treats direct `*.plan.md` and `*-plan.md` children as active queue items.
