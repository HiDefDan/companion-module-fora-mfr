# Changelog

## v2.0.0

Rewritten in TypeScript for Companion 5 (`@companion-module/base` 2.x, Node 22). Action, feedback, option, config and variable ids are unchanged, so existing buttons keep working.

- Commands are now sent one at a time, waiting for the router's echo as its protocol requires. Operator actions go ahead of startup reads.
- Incoming data is framed per line across packets; the receive buffer is no longer shared between instances or kept across reconnects.
- Responses are parsed by a single typed parser instead of substring checks, with unit tests.
- Port names and sizes now rebuild dropdowns, variables and presets once per batch rather than on every received line. Duplicate variable definitions are gone.
- Dropdowns list every port as soon as the router's size is known, labelled `n: name`.
- Lock status is requested once the router size is known (on a first connection it was requested before the size was known, so no locks were read).
- The crosspoint lookup used when selecting a destination no longer has an off by one.
- Selecting a port outside the router's size, cutting without both ends selected, or locking before the unit ID is known now logs a warning instead of sending a malformed command.
- The selection blink timer only runs while a source and destination are both selected, and is cleaned up on destroy.
- The default rename text is `New name` (it was an object), and the lock feedback treats any non-zero lock mode as locked.

## v1.0.2 - 2025-01-12

- Improved decoding of source and destination names from the hex values returned by the MFR. This fixes the module for Companion 3.4.x.
- Moved the button image to an images/ directory.
- Updated the label text for "Preset Crosspoint" and "Switch Crosspoint" actions for clarity.
- Upgraded module-base and module-tools.
