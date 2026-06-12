Vela's action button — teal **primary** for the main download action, neutral/ghost for secondary, soft for toolbar chips, danger for destructive.

```jsx
<Button variant="primary" iconLeft={<DownloadIcon />}>Download</Button>
<Button variant="neutral" size="sm">Cancel</Button>
<Button variant="soft">Paste</Button>
<Button variant="primary" loading>Working…</Button>
<Button variant="ghost" iconOnly aria-label="More"><MoreIcon /></Button>
```

Variants: `primary` (teal, glows), `secondary` (indigo), `neutral` (outline), `ghost`, `soft` (tinted), `danger`. Sizes: `sm` `md` `lg`. Props: `block`, `loading`, `iconLeft`, `iconRight`, `iconOnly`.
