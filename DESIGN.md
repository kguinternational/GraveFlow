Created At: 2026-07-22T14:34:58Z
Completed At: 2026-07-22T14:35:02Z
# GraveFlow Design System (Stitch & Agent Specs)

This file defines the unified visual design system rules for GraveFlow. All generated components, containers, and layouts must adhere strictly to these definitions.

---

## 1. Color Palette

*   **Background (Primary):** Deep Obsidian (`#08080a`)
*   **Surface (Cards & Modals):** Charcoal Glass (`#0d0e12`)
*   **Border:** Muted Gold Line (`rgba(201, 168, 76, 0.15)`)
*   **Accent (Gold):** GraveFlow Gold (`#c9a84c`)
*   **Accent (Rider/Families):** Electric Cyan (`#00bcff`)
*   **Accent (Driver/Operatives):** Mint Green (`#00e676`)
*   **Text (Primary):** Soft Off-White (`#f5f5f7`)
*   **Text (Secondary/Muted):** Muted Silver (`#a0a0b0`)

---

## 2. Typography & Fonts

*   **Headings (Headers & Titles):** Georgia, Garamond, or system serif. Elegant, respectful, and classic.
*   **Body Text:** Inter, -system-ui, sans-serif. Clean, modern, high legibility.
*   **Monospace/Data:** Courier New, monospace (for hashes, wallet addresses, and GPS tokens).

---

## 3. UI Patterns & Styling

*   **Glassmorphism:** Use container backdrops with subtle blur:
    ```css
    background: rgba(13, 14, 18, 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(201, 168, 76, 0.15);
    ```
*   **Buttons:** Standard CTA styles with hover glow transitions:
    ```css
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 10px rgba(201, 168, 76, 0.1);
    ```
*   **Badges:** Small uppercase text with light borders and matching opacity backgrounds.

---

## 4. Accessibility & Inclusion (No Human Left Behind)

*   **Font Sizes:** Ensure readable body copy (minimum 14px).
*   **Contrast:** High legibility contrast ratios between text and dark backdrops.
*   **ARIA Roles:** Semantic markup, buttons have roles, images have descriptives.

