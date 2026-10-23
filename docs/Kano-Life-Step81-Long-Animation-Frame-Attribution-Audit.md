# Step 81 — Long Animation Frame attribution audit

## Reason

Earlier diagnostics recorded uncaught runtime errors and main-thread tasks over 250 ms. That can demonstrate a stall but often cannot name the script that contributed most. The Long Animation Frames API, where supported, can report the delayed frame plus script entrypoint attribution.

## Runtime behavior

- The observer is optional and feature-detected.
- Individual LoAF records below 100 ms are ignored to keep the report focused on conspicuous delays.
- At most 30 LoAF records are kept; at most 8 script attribution records are retained per frame.
- Recorded source URLs are reduced to their pathname, excluding origin, query and fragment.
- No `fetch`, beacon, analytics endpoint, remote logging or persistent storage is added.
- Existing errors, resource failures, unhandled rejections and Long Tasks entries remain available.

## Test coverage

The new tests emulate a browser `PerformanceObserver` to verify script attribution capture, query-string removal, graceful fallback where `long-animation-frame` is unsupported, and strict bounds on frame and script history.

## Reference

Chrome for Developers, “The Long Animation Frames API”: https://developer.chrome.com/docs/web-platform/long-animation-frames. The API has limited browser availability, and attribution refers to the script entrypoint rather than a complete call stack. The implementation therefore reports availability explicitly and does not depend on attribution for application startup.
