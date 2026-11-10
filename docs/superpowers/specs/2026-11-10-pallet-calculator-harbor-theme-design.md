# Pallet Calculator Round 3: Harbor Theme Design

Date: 2026-11-10
Status: awaiting review
Builds on: the Round 1 and Round 2 specs. Everything in them still holds
unless this document changes it.

Source material: the "Harbor" design guide and asset package produced from
the owner's brief (kept outside the repository), the owner's mascot design
sheet.  Where this spec and the guide
disagree, this spec wins; the differences are listed in section 11.

## 1. Purpose

Give the tool one distinctive, professional look called **Harbor**: a calm,
dark-leaning theme in deep blues and teal with a small silent mascot.
Harbor replaces the current Dark theme and becomes the default. The plain
Light theme stays as the only alternative and picks up Harbor's typefaces,
square corners, motifs, and mascot.

No calculation, layout, wording, or number changes in this round. It is a
visual change only.

Success means:

- Every screen, dialog, and state is styled in Harbor with no leftover
  colours from the old Dark theme.
- Every text pairing meets WCAG 4.5:1.
- The mascot is recognisably the owner's character and appears only where
  section 7 says.
- Light looks as it does today in colour, with the shared identity added.
- Exports are unchanged apart from one small mascot on page 1 of the build
  sheet.

## 2. Scope

### In scope

Harbor colour tokens; replacing the Dark theme; typefaces; square corners
and bracket panels; three interface motifs; mascot sprites and their
placements; tab icon; the Theme control and stored-preference migration;
3D view surroundings; the build-sheet mascot; tests and documentation.

### Not in scope

Any change to the optimizer, analytics, layouts, copy, or the Basic and Full
structure; a System theme option; animated transitions between themes;
additional mascot poses or placements; advanced optimization, unused-space
overlays, and unit switching (still deferred).

## 3. Themes and preference

- The Theme control offers two choices: **Harbor** and **Light**. Harbor is
  the default.
- Stored preferences migrate on read: `dark` and `system` become `harbor`;
  `light` stays `light`; anything else falls back to `harbor`. The storage
  key stays `pc.prefs.v1`.
- The page no longer follows the computer's light or dark setting.
- The pre-paint script in `index.html` applies the Harbor class unless the
  stored preference is `light`, so there is no flash of the wrong theme.

## 4. Colour tokens

### 4.1 Harbor interface tokens

| Token | Hex | Use |
|---|---|---|
| deep | `#1E3347` | Page background; dark text on filled Sand and green badges |
| panel | `#2E4A62` | Header, panels, cards, dialogs, drawer, default table rows |
| raised | `#35546D` | Inputs, hovered controls, raised rows, selected table row |
| teal | `#3F8F96` | Non-text accents: active tab underline, block side rules |
| teal-fill | `#34767C` | Primary button, selected view-switch option, checked box (Foam text only) |
| teal-text | `#A3CACD` | Links, active tab text, keyboard-focus ticks |
| foam | `#E9F1EE` | Main text, values, control text, 1 px outlines |
| mist | `#B4C8CF` | Secondary text, labels, units, placeholders, disabled text |
| coral | `#E2725B` | Non-text error markers (field edge, message block rule) |
| coral-text | `#F0B5A9` | Error text |
| sand | `#D8C49A` | Caution text and rule (pallet notice); fill of the "Out of date" badge |
| green | `#7BCF80` | Success text on panels, progress, selected-row marker, fill of the "Target met" badge |
| viewport | `#284256` | 3D view background |

Permitted text pairings and their contrast ratios (all at least 4.5:1):

| Text | on deep | on panel | on raised |
|---|---|---|---|
| foam | 11.29 | 8.05 | 6.92 |
| mist | 7.47 | 5.33 | 4.58 |
| teal-text | 7.34 | 5.23 | 4.50 |
| coral-text | 7.34 | 5.23 | 4.50 |
| sand | 7.58 | 5.41 | 4.65 |
| green | 6.84 | 4.88 | not allowed as text |

Also permitted: foam on teal-fill (4.54); deep on sand (7.58); deep on green
(6.84); foam and mist on viewport (9.12 and 6.04).

Rules:

- No other hues. No pure black. No purple, magenta, or pink.
- Text is never made quieter with opacity; use mist.
- Coral marks errors only and is never a button colour.
- The selected table row is not a success state: it gets a 3 px green left
  marker and SemiBold foam values, never a green fill.

### 4.2 Fixed 3D load colours

Cartons `#D9A066` and `#C68642`, pallet wood `#B08A5A`, limit envelope
`#3B82F6`, product and selection colours: unchanged in both themes.

### 4.3 Light

Light keeps its current white, grey, and blue colours exactly. It is not
recoloured.

## 5. Shape and type (both themes)

- **Corners:** square everywhere. No rounded corners, shadows, gradients,
  glow, blur, or bevels.
- **Panels:** Harbor panels use a bracket frame: a 1 px foam rule along the
  top and one side with a 6 px corner tick. Inputs, menus, and dialogs are
  fully outlined in 1 px foam so their boundaries are unmistakable. Light
  uses the same geometry in its existing gray-200 border grey.
- **Headings:** Exo 2 Light, displayed in capitals with about 0.12em letter
  spacing. Capitals are a display treatment only; the underlying text and
  accessible names are unchanged.
- **Body and numbers:** Barlow Medium, SemiBold for emphasis, with tabular
  figures on every numeric value.
- **Fonts are bundled with the site** (no request to an outside font
  service), limited to the weights used, and text stays visible in a system
  font while they load.

## 6. Interface motifs (both themes)

1. **Sprout: calculation progress only.** A 1 px line, 96 px long, ending in
   two small leaf tips at unequal heights, shown beside "Calculating…". It
   sweeps gently while a calculation runs and is static when the user
   prefers reduced motion. Green in Harbor; in Light it keeps green on a
   slim dark carrier so it stays visible.
2. **Hollow ring: focus ticks only.** Keyboard focus is shown by four 6 × 6
   px open corner fragments 2 px outside the control, in teal-text (Harbor)
   or the existing focus blue (Light), in addition to the control's own
   outline. No glow. On tabs, menu items and table rows the ticks are drawn
   2 px inside, because their scrolling parents would clip outside ticks;
   selects and plain inputs carry them on a wrapper.
3. **Root line: major section boundaries only.** A 1 px rule at 22% opacity
   spanning the content width with a single 7 px fork near one end, between
   major input groups, analytics groups, and the sections of the "What to
   build" card. The counts are whatever the layout gives: inputs 2 in Basic and
   4 in Full, analytics 3, the card 2. Never between rows, around controls, or behind text.

A single faint wave line may sit in a page footer if one is ever added; no
footer is added in this round. No other decoration.

## 7. Mascot

### 7.1 Artwork

The mascot is the owner's character as drawn in the "existing key" on the
mascot design sheet: a 17 × 27 pixel figure (the sheet's footer says
17 × 22, but its drawing is 17 × 27, and the drawing is what is traced) with a
hollow ring head open through and two eye marks, a triangular bandana at the
neck (4, 4 and 2 pixels wide on its three rows), two arms and two
legs ending bluntly on one ground line, a stem with two leaf tips at unequal
heights, and one shoot outside the left shoulder. (The mod's in-game sprite
is a different, more compact drawing and is not used.)

- **Idle** is that key drawing traced pixel for pixel onto a 32 × 32 grid, at
  the drawing's own proportions.
- **Working** (three frames), **concerned**, the **header mark**, and the
  **tab icon** are derived from it by changing only the leaves, the shoulder
  shoot, and the head's tilt, following the poses in the design guide. Raised
  leaves grow by one pixel upward so they stay joined to the stem.
- The **print illustration** is a clean flat version of the idle pose with
  leaves perked.
- Colours are limited to the sheet's five: `#945743`, `#79432F`, `#35403A`,
  `#7BCF80`, `#99E550`.
- Sprites are 32 × 32 pixel drawings shown only at whole-number scales with
  hard edges.
- The guide's "pleased" pose is not used anywhere.
- The owner reviews the finished sprite set before it is merged.

### 7.2 Placements (both themes)

| Where | Pose | Size |
|---|---|---|
| Header, left of the product name | Header mark | 2×, transparent margins cropped (about 26 px tall) |
| "What to build" card, empty state | Idle | 96 px (3×), beside the hint |
| Beside "Calculating…" | Working, 3 frames in the order 1-2-3-2 at 180 ms | 64 px (2×) |
| Beside an error or "nothing fits" message | Concerned | 64 px (2×) |
| Browser tab | Tab icon | 16 × 16 drawing |
| Build sheet, page 1, top right | Print illustration, cropped to the figure | 0.55 in tall |

The art does not fill its 32 × 32 cell, so these sizes are larger than the
cell scale alone would give; they keep the figure legible at whole-number
scales.

Rules: the mascot is decorative and hidden from screen readers; it has no
name, caption, or speech; with reduced motion the working pose shows one
static frame; it never appears in the 3D view, the table, the inputs, the
summary bar, a populated "What to build" card, dialogs, or PNG exports.

## 8. Component styling (Harbor)

- **Header:** panel background, foam title and controls, mist labels, 1 px
  foam bottom rule.
- **View switch and Theme selector:** raised background, foam labels, 1 px
  foam outline; the selected view option uses teal-fill with foam text.
- **Summary tiles:** panel background, mist labels, SemiBold foam values; an
  out-of-date summary shows its values in mist with the "Out of date" badge
  and is not faded by opacity;
  "Total boxes per pallet" is foam like the others, not coloured.
- **Inputs:** raised fill, foam values, mist label, placeholder, and suffix,
  1 px foam outline. An invalid field gets a coral edge and its own message
  in coral-text beside it; every invalid field shows its message.
- **Pallet notice:** panel fill with sand text and a sand top-and-side rule.
- **Buttons:** normal is raised fill, foam text, foam outline; primary is
  teal-fill with foam text. Hover underlines the label. Disabled keeps mist
  text and a broken outline.
- **Export menu:** panel fill with a complete foam outline; hover uses
  raised; disabled items stay mist.
- **Comparison table:** panel rows, raised header, mist column labels, foam
  numbers; hover uses raised; the selected row is raised with the green
  marker.
- **Tabs:** mist inactive labels; the active tab is teal-text with a 2 px
  teal underline.
- **Badges:** "Out of date" is sand fill with deep text; "Target met" and
  "Target exceeded" are green fill with deep text; "Target not achievable"
  is raised fill with foam text and a coral edge.
- **Status messages:** panel background with a foam bracket; default text
  foam; an error is one coral-ruled block with coral-text.
- **"What to build" card:** panel background and foam bracket; step blocks
  use raised fill with a thin teal side rule.
- **Dialogs and drawer:** panel fill; dialogs fully outlined in foam; the
  drawer has a foam leading edge; the backdrop is deep at partial opacity
  with no blur.
- **3D view:** toolbar is a panel strip with a foam rule; checked boxes use
  teal-fill with a foam check. The view background is viewport; the floor
  grid uses pre-blended colours, `#395265` for cells and `#526A7A` for
  sections, because the grid component has no opacity control. Labels and measurement chips use deep with
  foam text. No mascot or motif inside the view.

Light keeps its current component colours and takes only the shape, type,
motif, and mascot changes.

## 9. Exports

- PNG: unchanged, always light, no mascot.
- PDF build sheet: unchanged except the print illustration once at the top
  right of page 1. The sheet stays black on white with its current fonts.
- CSV and JSON: unchanged.

## 10. Architecture

- Tailwind's theme gains the Harbor tokens as named colours. The existing
  `dark:` variants are re-pointed at a `harbor` root class and their colour
  values replaced with tokens, so every component already has the right
  hooks.
- `rounded-*` and `shadow-*` utilities are removed from components.
- A small set of shared pieces carries the identity: `Mascot` (pose prop),
  `SproutProgress`, a `root-divider` and `bracket` class, and the focus-tick
  style. Components use these and do not restyle them.
- Mascot sprites are small PNG files in `src/assets/mascot/`, produced from
  a pixel map of the key drawing by a script kept in the repository
  (`tools/mascot/`) so they can be regenerated; the script and its source
  frame are the record of how each pose was derived.
- Fonts come from bundled font packages; only the needed weights are
  imported.
- `sceneTheme` gains the Harbor values and drops the old dark ones.

## 11. Decisions that differ from the design guide

| Guide | This spec | Why |
|---|---|---|
| Mascot sprites generated from the sheet | Traced from the sheet's key drawing, poses derived from it | The generated set drifted from the key (ring thickness, legs) |
| "Pleased" pose with cartons delivered | Not used | No placement was ever authorised for it; the print version covers the build sheet |
| Light recoloured to grey and charcoal | Light keeps current colours | Owner decision |
| One coral element per view; neutral field messages plus a summary block | Every invalid field shows a coral-text message with a coral edge | Owner decision; clearer when several fields are wrong |
| Hollow-ring loading spinner | Not built | The tool has no spinner; calculation uses the sprout |
| Optional footer wave | Not built | There is no footer |
| Mascot sizes 32 / 64 / 24 px | 64 px working and concerned, 96 px empty-state idle, header mark at 2× cropped (about 26 px) | The art does not fill its cell |
| Floor grid in mist at low opacity | Pre-blended `#395265` (cells) and `#526A7A` (sections) | The grid component has no opacity control |

## 12. Testing

- **Tokens:** a test computes the WCAG ratio for every pairing in 4.1 from
  the token values and fails below 4.5:1.
- **Preference migration:** `dark`, `system`, `light`, missing, and invalid
  stored values; the pre-paint script agrees with the store for each.
- **Mascot assets:** every sprite is on its pixel grid, uses only the
  allowed colours, has fully opaque or fully transparent pixels, and the
  idle sprite occupies 17 × 27 pixels with the features of the key drawing.
- **Placements:** each pose appears in its state and nowhere else; hidden
  from the accessibility tree; reduced motion shows a static frame.
- **No leftovers:** a check over the source finds no `rounded-`, `shadow-`,
  or old dark-theme colour utilities.
- **Existing suites** stay green with only theme names and class names
  updated.
- **End to end:** a fresh visit is Harbor; switching to Light and reloading
  keeps Light; a stored `dark` opens as Harbor; the build sheet still
  downloads.
- **By eye:** Basic and Full in both themes at 1440 × 900 and 1280 × 720,
  every dialog, the drawer, the Export menu, error, "nothing fits",
  calculating, and out-of-date states, compared against the guide's two
  mockups; a build sheet rendered to images; a PNG export from Harbor
  confirmed light.

## 13. Known limitations

- Two themes only; no System option.
- The mascot has four poses and one print illustration.
- Fonts add a download of roughly 100 to 150 kB on first visit.
