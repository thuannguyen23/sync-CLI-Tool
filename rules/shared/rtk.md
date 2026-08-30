# RTK - Rust Token Killer

Always prefix shell commands with `rtk` to minimize token consumption.

Examples:

```bash
rtk git status
rtk cargo test
rtk ls src/
rtk grep "pattern" src/
rtk find "*.rs" .
rtk docker ps
rtk gh pr list
```

Meta commands:

```bash
rtk gain
rtk gain --history
rtk discover
rtk proxy <cmd>
```

# Math Formatting Rule

Do not use LaTeX delimiters. Format mathematical formulas as plain text or code, for example `x^2` and `sqrt(x)`.
