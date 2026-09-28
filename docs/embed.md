# Embedding the network

For the marketing site, or any page: the live network of who sends work to whom, as an iframe.

```html
<iframe src="https://fleet.urbalurba.com/embed/network?window=7d"
        title="Who sends work to whom in the Urbalurba agent fleet"
        width="100%" height="560" style="border:0" loading="lazy"></iframe>
```

- `window` is `24h` (the default), `7d` or `30d`.
- The embed refreshes itself every minute. Its links open the full page (`fleet.<domain>`) at the
  top level, not inside the frame.
- It follows the reader's light or dark setting. The background is transparent, so it takes the
  host page's.
- The same data as JSON, for drawing it yourself: `GET https://api-fleet.urbalurba.com/v1/network?window=7d`
  (described at `/v1/openapi.json`, OpenAPI 3.1, public and CORS-open).

Only agents on the console's public list are named. Everyone else is `others`.
