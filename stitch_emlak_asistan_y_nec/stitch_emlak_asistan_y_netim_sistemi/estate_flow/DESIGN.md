# Design System Document: The Architectural Concierge

## 1. Overview & Creative North Star
**Creative North Star: "The Editorial Blueprint"**
This design system moves away from the cluttered, "utility-first" look of traditional real estate apps. Instead, it adopts the persona of a high-end architectural journal. We are not just building a tool; we are curate a high-stakes journey. The system focuses on **Atmospheric Clarity**—using expansive whitespace, intentional asymmetry, and tonal depth to create a sense of calm authority. By breaking the standard grid with overlapping elements and shifting containers, we signal to the user that their real estate journey is bespoke, professional, and effortless.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the "Trustworthy Deep Blue," but its application is nuanced. We avoid flat, heavy blocks of color in favor of "Tonal Weighting."

### The "No-Line" Rule
**Borders are forbidden for sectioning.** To create a premium feel, boundaries must be defined solely through background shifts. For example, a `surface-container-low` (#f4f3fa) section should sit on a `surface` (#faf8ff) background. This creates a "soft-edge" layout that feels modern and airy.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine paper. 
*   **Base:** `surface` (#faf8ff)
*   **Structural Sections:** `surface-container-low` (#f4f3fa)
*   **Interactive Cards:** `surface-container-lowest` (#ffffff)
*   **Overlays/Modals:** `surface-bright` (#faf8ff)

### The "Glass & Gradient" Rule
To inject "soul" into the professional blue, use subtle radial gradients on hero sections (transitioning from `primary` #00236f to `primary_container` #1e3a8a). For floating navigation or property headers, use **Glassmorphism**: 
*   **Fill:** `surface` at 70% opacity.
*   **Effect:** 20px Backdrop Blur.
*   **Result:** The UI feels integrated into the property imagery, not sitting on top of it.

---

## 3. Typography: The Editorial Voice
We use **Inter** for its mathematical precision and neutral warmth. The hierarchy is designed to feel like a high-end magazine layout.

*   **The Hero Statement (`display-lg`):** Use for property prices or key value propositions. Letter-spacing should be -0.02em to feel tight and custom.
*   **The Narrative (`body-lg`):** High line-height (1.6) is required for property descriptions to ensure the "airy" feel isn't lost in text-heavy sections.
*   **Functional Labels (`label-md`):** Use `on_surface_variant` (#444651) in all-caps with +0.05em tracking for metadata like "SQUARE FOOTAGE" or "ZONING."

---

## 4. Elevation & Depth
In this design system, shadows are an admission of failure in tonal layering. Use them sparingly.

*   **Tonal Layering:** Achieve "lift" by placing a `surface-container-lowest` (pure white) card against a `surface-dim` background. This is the preferred method for property listings.
*   **Ambient Shadows:** For "floating" CTA buttons or map markers, use a 15% opacity shadow of the `primary` color (not black) with a 30px blur and 10px Y-offset. It should look like a soft glow, not a hard drop.
*   **The Ghost Border:** For input fields or secondary buttons, if a boundary is required, use `outline_variant` (#c5c5d3) at **20% opacity**. It should be felt, not seen.

---

## 5. Component Guidelines

### Buttons: The Kinetic Anchor
*   **Primary (Action):** Uses `secondary` (#9d4300) to `secondary_container` (#fd761a) linear gradient. This "Energetic Orange" must be the only vibrant element on the screen to draw immediate focus.
*   **Shape:** `full` (pill-shaped) to lean into the "friendly" and "modern" requirement.

### Cards & Property Listings
*   **Rule:** Forbid divider lines. Use `md` (0.75rem) or `lg` (1rem) spacing scales to separate content. 
*   **Structure:** Images should use `xl` (1.5rem) rounded corners. Text should "bleed" into the white space below the image without a containing box whenever possible.

### Inputs & Search
*   **Style:** Minimalist. No heavy borders. Use a `surface-container-high` (#e9e7ef) background with a "Ghost Border."
*   **States:** On focus, the background shifts to `surface-container-lowest` and the border becomes a 2px `primary` line.

### Property Type Chips
*   **Selection:** Use `primary_fixed` (#dce1ff) with `on_primary_fixed` (#00164e) text. The soft blue provides a professional "filtered" look without the aggression of a dark button.

---

## 6. Do’s and Don’ts

### Do:
*   **Use Asymmetry:** Offset property images or pull-quotes to break the "Bootstrap" look.
*   **Embrace the White:** If you think a section needs more content, it probably needs more whitespace instead.
*   **Tint Your Neutrals:** Always use the blue-tinted surfaces (`surface-container`) rather than pure greys to maintain the "Trustworthy" brand soul.

### Don’t:
*   **Don't use 1px solid dividers:** Use background color shifts or 24px of empty space.
*   **Don't use pure black text:** Always use `on_surface` (#1a1b21) to keep the interface "Light and Airy."
*   **Don't use standard icons:** Use "High-Quality" thin-stroke (1.5px) icons. Avoid filled icons unless they represent an active/selected state.
*   **Don't crowd the edges:** Maintain a minimum 24px (1.5rem) padding on all screen edges to ensure the "Editorial" feel.