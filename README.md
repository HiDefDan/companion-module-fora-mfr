# companion-module-fora-mfr

Bitfocus Companion module for For.A MFR routing switchers.

See [companion/HELP.md](./companion/HELP.md) for setup and usage, and [LICENSE](./LICENSE).

## Development

Requires Node 22 and Yarn 4 (`corepack enable`).

```bash
yarn install
yarn test        # unit tests, no router needed
yarn typecheck
yarn lint
yarn package     # builds fora-mfr-<version>.tgz for loading into Companion
```

Source layout:

- `src/protocol.ts` parses router responses and builds commands
- `src/queue.ts` sends one command at a time, waiting for the router's echo
- `src/state.ts` router names, crosspoints, locks and the operator's selection
- `src/main.ts` connects the above to Companion
- `src/actions.ts`, `feedbacks.ts`, `variables.ts`, `presets.ts` Companion definitions
