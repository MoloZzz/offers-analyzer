# Quickstart: Portable AI Infrastructure Kit

```powershell
# Inspect the target without writing.
node ai-infra/bin/ai-infra.mjs init --target C:\work\my-project --dry-run

# Create the neutral kit only after reviewing the plan.
node ai-infra/bin/ai-infra.mjs init --target C:\work\my-project --apply --project-name "My Project"

# From the target project, fill template placeholders, then run the copied engine.
node ai-infra/engine/v.mjs build
node ai-infra/engine/v.mjs check --strict

# Check kit/version/config health.
node ai-infra/bin/ai-infra.mjs doctor --target C:\work\my-project
```

The default installation has no source adapter, CI, hook, or evidence connection. Add each only
after the project has a clean baseline and an explicit owner.
