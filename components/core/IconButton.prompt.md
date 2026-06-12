Square icon-only control for toolbars, list rows and the titlebar. Always pass `aria-label`.

```jsx
<IconButton aria-label="Settings"><SettingsIcon /></IconButton>
<IconButton variant="solid" aria-label="Open folder"><FolderIcon /></IconButton>
<IconButton active aria-label="Pin"><PinIcon /></IconButton>
<IconButton danger aria-label="Remove"><TrashIcon /></IconButton>
```

Sizes `sm` `md` `lg`. Variants `ghost` (default) / `solid`. Flags: `active`, `danger`.
